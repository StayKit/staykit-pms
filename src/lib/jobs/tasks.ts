/**
 * Time-based task bodies run by the worker's daily cron tick (§B.10). Each is pure
 * enough to unit-test against the test DB: pass an explicit `now` where time matters.
 */
import { prisma } from "../db";
import { writeAudit } from "../audit";
import { addDays, utcMidnight } from "../dates";
import { RETENTION } from "../config";
import { deleteStoredFile } from "../storage";
import { renderTemplate } from "../notify/template";

/**
 * OCCUPANCY_SNAPSHOT — write one DailyOccupancy row per active property for `night`
 * (defaults to yesterday). Idempotent via the (propertyId, date) unique upsert.
 */
export async function occupancySnapshot(night?: Date) {
  const date = utcMidnight(night ?? addDays(new Date(), -1));
  const properties = await prisma.property.findMany({
    where: { active: true },
    include: { _count: { select: { rooms: true } } },
  });

  let written = 0;
  for (const p of properties) {
    const sold = await prisma.bookingRoom.findMany({
      where: {
        date,
        room: { propertyId: p.id },
        booking: { status: { in: ["CONFIRMED", "CHECKED_IN", "CHECKED_OUT"] } },
      },
      select: { rateApplied: true },
    });
    const revenue = sold.reduce((s, r) => s + r.rateApplied, 0);
    await prisma.dailyOccupancy.upsert({
      where: { propertyId_date: { propertyId: p.id, date } },
      update: { roomsTotal: p._count.rooms, roomsSold: sold.length, revenue },
      create: {
        propertyId: p.id,
        date,
        roomsTotal: p._count.rooms,
        roomsSold: sold.length,
        revenue,
      },
    });
    written += 1;
  }
  return { date, written };
}

/**
 * NIGHTLY_CLEANUP — purge expired OTP requests and dead sessions. (Guest-ID file
 * auto-purge after 90 days is added with the storage layer in Phase 8.)
 */
export async function nightlyCleanup(now = new Date()) {
  const otps = await prisma.otpRequest.deleteMany({ where: { expiresAt: { lt: now } } });
  const sessions = await prisma.session.deleteMany({
    where: { OR: [{ expiresAt: { lt: now } }, { revokedAt: { not: null } }] },
  });
  return { otpsPurged: otps.count, sessionsPurged: sessions.count };
}

/**
 * FORM_C_REMINDER — nudge owners about foreign-national guests checked in within the
 * last 24h whose Form C / Form III filing hasn't been acknowledged (Immigration and
 * Foreigners Act 2025, §B.14). The nudge is a SYSTEM audit row surfaced in the
 * activity feed; we de-duplicate so a booking is reminded at most once.
 */
export async function formCReminder(now = new Date()) {
  const since = addDays(now, -1);
  const bookings = await prisma.booking.findMany({
    where: {
      status: "CHECKED_IN",
      checkedInAt: { gte: since, lte: now },
      formCFiledAt: null,
      guests: { some: { guest: { isForeign: true } } },
    },
    include: { property: true, guests: { where: { isPrimary: true }, include: { guest: true } } },
  });

  let reminded = 0;
  for (const b of bookings) {
    const already = await prisma.auditLog.findFirst({
      where: { entityType: "Booking", entityId: b.id, action: "FORM_C_REMINDER" },
    });
    if (already) continue;
    await writeAudit({
      ownerId: b.property.ownerId,
      actorType: "SYSTEM",
      actorName: "System",
      action: "FORM_C_REMINDER",
      entityType: "Booking",
      entityId: b.id,
      summary: `Form C pending for ${b.guests[0]?.guest.name ?? "a foreign guest"} (${b.ref})`,
    });
    reminded += 1;
  }
  return { reminded };
}

/**
 * DPDP guest-ID auto-purge (§B.11): delete encrypted ID documents 90 days after the
 * guest's most recent checkout (or, if they never stayed, 90 days after the record was
 * created). Tax records on the booking itself are unaffected.
 */
export async function purgeExpiredGuestIds(now = new Date()) {
  const cutoff = addDays(now, -RETENTION.guestIdDaysAfterCheckout);
  const guests = await prisma.guest.findMany({
    where: { idFileId: { not: null } },
    include: { bookings: { include: { booking: { select: { checkOut: true } } } } },
  });

  let purged = 0;
  for (const g of guests) {
    const latest = g.bookings.reduce(
      (max, bg) => (bg.booking.checkOut > max ? bg.booking.checkOut : max),
      new Date(0),
    );
    const reference = g.bookings.length ? latest : g.createdAt;
    if (reference >= cutoff) continue;
    await deleteStoredFile(g.idFileId!);
    await prisma.guest.update({
      where: { id: g.id },
      data: { idFileId: null, idLast4: null, idType: null },
    });
    purged += 1;
  }
  return { purged };
}

/**
 * Mark payment links whose expiry has passed as EXPIRED (audit P1 #12) so the guest
 * portal and reports never present a dead link as payable.
 */
export async function expireStalePaymentLinks(now = new Date()) {
  const res = await prisma.paymentLink.updateMany({
    where: { status: { in: ["CREATED", "PARTIALLY_PAID"] }, expiresAt: { lt: now } },
    data: { status: "EXPIRED" },
  });
  return { expired: res.count };
}

/**
 * Triggers the scheduled dispatcher fires relative to a booking's check-in, with the
 * default offset (minutes; negative = before). An owner only needs to make the template
 * active — no separate automation row required. (Event triggers like BOOKING_CONFIRMED
 * already fire from the engine.) An explicit NotificationAutomation can override the offset.
 */
const ARRIVAL_TRIGGER_DEFAULTS: Record<string, number> = {
  PRE_ARRIVAL_24H: -1440, // 24h before check-in
  CHECK_IN_INSTRUCTIONS: 0, // morning of arrival (sent at the daily tick)
};

/**
 * Dispatch automated, time-based reminders (audit P1 #10). For each active arrival
 * template, find upcoming bookings whose `checkIn + offset` is now due and enqueue the
 * message once (deduped on bookingId+templateId). This is what makes "24h before
 * check-in" / "check-in instructions" actually send on their own — previously the
 * templates existed but nothing dispatched them.
 */
export async function dispatchScheduledReminders(now = new Date()) {
  const templates = await prisma.notificationTemplate.findMany({
    where: { active: true, triggerKey: { in: Object.keys(ARRIVAL_TRIGGER_DEFAULTS) } },
  });

  let queued = 0;
  for (const template of templates) {
    // An explicit automation (if the owner made one) overrides the default offset.
    const automation = await prisma.notificationAutomation.findFirst({
      where: { ownerId: template.ownerId, templateId: template.id, active: true },
    });
    const offset = automation?.delayMinutes ?? ARRIVAL_TRIGGER_DEFAULTS[template.triggerKey];

    // Candidate bookings: upcoming/active, not cancelled/no-show, for this owner.
    const bookings = await prisma.booking.findMany({
      where: {
        property: { ownerId: template.ownerId },
        status: { in: ["TENTATIVE", "CONFIRMED", "CHECKED_IN"] },
        // Only look a few days around now to avoid back-blasting historical bookings.
        checkIn: { gte: addDays(now, -2), lte: addDays(now, 14) },
      },
      include: {
        property: true,
        guests: { where: { isPrimary: true }, include: { guest: true } },
      },
    });

    for (const b of bookings) {
      const target = new Date(b.checkIn.getTime() + offset * 60_000);
      // Due once `target` has passed, with a 2-day grace so a missed daily tick still sends.
      if (target > now || target < addDays(now, -2)) continue;

      const already = await prisma.notificationLog.findFirst({
        where: { bookingId: b.id, templateId: template.id, triggerKey: template.triggerKey },
      });
      if (already) continue;

      const guest = b.guests[0]?.guest;
      if (!guest) continue;
      const dest = template.channel === "EMAIL" ? guest.email : guest.phone;
      if (!dest) continue;

      const scope = {
        guest: { name: guest.name },
        booking: {
          ref: b.ref,
          checkIn: b.checkIn.toISOString(),
          checkOut: b.checkOut.toISOString(),
        },
        property: { name: b.property.name, checkInTime: b.property.checkInTime },
        amount: { due: b.totalAmount - b.amountPaid, total: b.totalAmount },
      };
      await prisma.notificationLog.create({
        data: {
          bookingId: b.id,
          channel: template.channel,
          to: dest,
          templateId: template.id,
          triggerKey: template.triggerKey,
          status: "QUEUED",
          scheduledFor: now,
          payload: JSON.stringify({ body: renderTemplate(template.body, scope) }),
        },
      });
      queued += 1;
    }
  }
  return { queued };
}

/** Run all daily cron task bodies; called once per day by the worker after 03:00 IST. */
export async function runDailyTasks(now = new Date()) {
  return {
    occupancy: await occupancySnapshot(addDays(now, -1)),
    cleanup: await nightlyCleanup(now),
    formC: await formCReminder(now),
    guestIds: await purgeExpiredGuestIds(now),
    paymentLinks: await expireStalePaymentLinks(now),
    reminders: await dispatchScheduledReminders(now),
  };
}
