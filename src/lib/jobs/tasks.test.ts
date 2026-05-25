import { describe, it, expect, beforeEach } from "vitest";
import {
  occupancySnapshot,
  nightlyCleanup,
  formCReminder,
  runDailyTasks,
  dispatchScheduledReminders,
  expireStalePaymentLinks,
} from "./tasks";
import { createBooking } from "../booking/engine";
import { parseYmd, addDays } from "../dates";
import { prisma } from "@/lib/db";
import { resetDb, seedBasic, type Fixture } from "../../../test/factories";

let fx: Fixture;
beforeEach(async () => {
  await resetDb();
  fx = await seedBasic();
});

async function book(opts: {
  checkIn: string;
  checkOut: string;
  foreign?: boolean;
  phone?: string;
}) {
  return createBooking({
    ownerId: fx.owner.id,
    propertyId: fx.property.id,
    roomId: fx.room.id,
    channelKey: "direct",
    checkIn: opts.checkIn,
    checkOut: opts.checkOut,
    guest: { name: "Sameer", phone: opts.phone ?? "+919812300000", isForeign: opts.foreign },
  });
}

describe("occupancySnapshot", () => {
  it("writes one row per property with sold nights and revenue", async () => {
    await book({ checkIn: "2026-06-10", checkOut: "2026-06-11" });
    const res = await occupancySnapshot(parseYmd("2026-06-10"));
    expect(res.written).toBe(1);
    const row = await prisma.dailyOccupancy.findFirst({ where: { propertyId: fx.property.id } });
    expect(row?.roomsTotal).toBe(1);
    expect(row?.roomsSold).toBe(1);
    expect(row?.revenue).toBe(6300_00);
  });

  it("is idempotent (upsert) for the same night", async () => {
    await book({ checkIn: "2026-06-10", checkOut: "2026-06-11" });
    await occupancySnapshot(parseYmd("2026-06-10"));
    await occupancySnapshot(parseYmd("2026-06-10"));
    expect(await prisma.dailyOccupancy.count()).toBe(1);
  });

  it("records zero sold for an empty night", async () => {
    const res = await occupancySnapshot(parseYmd("2026-01-01"));
    expect(res.written).toBe(1);
    const row = await prisma.dailyOccupancy.findFirst();
    expect(row?.roomsSold).toBe(0);
    expect(row?.revenue).toBe(0);
  });
});

describe("nightlyCleanup", () => {
  it("purges expired OTPs and dead sessions", async () => {
    await prisma.otpRequest.create({
      data: {
        contact: "+91",
        purpose: "STAFF_LOGIN",
        codeHash: "x",
        expiresAt: new Date(Date.now() - 1000),
      },
    });
    await prisma.otpRequest.create({
      data: {
        contact: "+91",
        purpose: "STAFF_LOGIN",
        codeHash: "y",
        expiresAt: new Date(Date.now() + 60_000),
      },
    });
    await prisma.session.create({
      data: { token: "expired", scope: "staff", expiresAt: new Date(Date.now() - 1000) },
    });
    await prisma.session.create({
      data: {
        token: "revoked",
        scope: "staff",
        expiresAt: new Date(Date.now() + 60_000),
        revokedAt: new Date(),
      },
    });
    await prisma.session.create({
      data: { token: "live", scope: "staff", expiresAt: new Date(Date.now() + 60_000) },
    });

    const res = await nightlyCleanup();
    expect(res.otpsPurged).toBe(1);
    expect(res.sessionsPurged).toBe(2);
    expect(await prisma.session.count()).toBe(1);
    expect(await prisma.otpRequest.count()).toBe(1);
  });
});

describe("formCReminder", () => {
  it("nudges once per foreign guest checked in within 24h", async () => {
    const b = await book({ checkIn: "2026-06-10", checkOut: "2026-06-11", foreign: true });
    await prisma.booking.update({
      where: { id: b.id },
      data: { status: "CHECKED_IN", checkedInAt: new Date() },
    });

    const first = await formCReminder();
    expect(first.reminded).toBe(1);
    const audit = await prisma.auditLog.findFirst({
      where: { action: "FORM_C_REMINDER", entityId: b.id },
    });
    expect(audit).toBeTruthy();

    // De-duplicates on a second run.
    const second = await formCReminder();
    expect(second.reminded).toBe(0);
  });

  it("ignores domestic guests and already-filed bookings", async () => {
    const dom = await book({
      checkIn: "2026-07-10",
      checkOut: "2026-07-11",
      foreign: false,
      phone: "+919812300001",
    });
    await prisma.booking.update({
      where: { id: dom.id },
      data: { status: "CHECKED_IN", checkedInAt: new Date() },
    });
    const filed = await book({
      checkIn: "2026-07-20",
      checkOut: "2026-07-21",
      foreign: true,
      phone: "+919812300002",
    });
    await prisma.booking.update({
      where: { id: filed.id },
      data: { status: "CHECKED_IN", checkedInAt: new Date(), formCFiledAt: new Date() },
    });
    const res = await formCReminder();
    expect(res.reminded).toBe(0);
  });
});

describe("runDailyTasks", () => {
  it("runs all three task bodies", async () => {
    const res = await runDailyTasks(new Date());
    expect(res.occupancy.written).toBe(1);
    expect(res.cleanup).toHaveProperty("otpsPurged");
    expect(res.formC).toHaveProperty("reminded");
  });
});

describe("dispatchScheduledReminders (P1 #10)", () => {
  async function arrivalAutomation(delayMinutes: number) {
    const tpl = await prisma.notificationTemplate.create({
      data: {
        ownerId: fx.owner.id,
        channel: "SMS",
        triggerKey: "PRE_ARRIVAL_24H",
        name: "Day before",
        body: "Hi {{guest.name}}, see you {{booking.checkIn}}",
      },
    });
    await prisma.notificationAutomation.create({
      data: {
        ownerId: fx.owner.id,
        triggerKey: "PRE_ARRIVAL_24H",
        templateId: tpl.id,
        delayMinutes,
        active: true,
      },
    });
    return tpl;
  }

  it("queues a reminder 24h before check-in and dedupes on re-run", async () => {
    const now = new Date();
    const checkIn = addDays(now, 1); // tomorrow
    await book({
      checkIn: checkIn.toISOString().slice(0, 10),
      checkOut: addDays(checkIn, 1).toISOString().slice(0, 10),
    });
    await arrivalAutomation(-1440); // 24h before

    const first = await dispatchScheduledReminders(now);
    expect(first.queued).toBe(1);
    const log = await prisma.notificationLog.findFirst({
      where: { triggerKey: "PRE_ARRIVAL_24H" },
    });
    expect(log?.status).toBe("QUEUED");

    // Running again must not duplicate.
    const second = await dispatchScheduledReminders(now);
    expect(second.queued).toBe(0);
  });

  it("does not queue before the reminder window opens", async () => {
    const now = new Date();
    const checkIn = addDays(now, 10);
    await book({
      checkIn: checkIn.toISOString().slice(0, 10),
      checkOut: addDays(checkIn, 1).toISOString().slice(0, 10),
    });
    await arrivalAutomation(-1440); // due 24h before → not yet
    const res = await dispatchScheduledReminders(now);
    expect(res.queued).toBe(0);
  });
});

describe("expireStalePaymentLinks (P1 #12)", () => {
  it("marks past-expiry links EXPIRED", async () => {
    const b = await book({ checkIn: "2026-06-10", checkOut: "2026-06-11" });
    await prisma.paymentLink.create({
      data: {
        bookingId: b.id,
        razorpayLinkId: "plink_x",
        shortUrl: "http://x",
        amount: 1000_00,
        status: "CREATED",
        expiresAt: new Date(Date.now() - 1000),
      },
    });
    const res = await expireStalePaymentLinks(new Date());
    expect(res.expired).toBe(1);
    const link = await prisma.paymentLink.findFirst({ where: { bookingId: b.id } });
    expect(link?.status).toBe("EXPIRED");
  });
});
