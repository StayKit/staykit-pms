/**
 * Time-based task bodies run by the worker's daily cron tick (§B.10). Each is pure
 * enough to unit-test against the test DB: pass an explicit `now` where time matters.
 */
import { prisma } from "../db";
import { writeAudit } from "../audit";
import { addDays, utcMidnight } from "../dates";
import { RETENTION } from "../config";
import { deleteStoredFile } from "../storage";

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

/** Run all daily cron task bodies; called once per day by the worker after 03:00 IST. */
export async function runDailyTasks(now = new Date()) {
  return {
    occupancy: await occupancySnapshot(addDays(now, -1)),
    cleanup: await nightlyCleanup(now),
    formC: await formCReminder(now),
    guestIds: await purgeExpiredGuestIds(now),
  };
}
