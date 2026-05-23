import { describe, it, expect, beforeEach } from "vitest";
import { createPaymentLinkForBooking, applyPayment } from "./service";
import { createBooking } from "../booking/engine";
import { prisma } from "@/lib/db";
import { today, addDays } from "../dates";
import { resetDb, seedBasic, type Fixture } from "../../../test/factories";

let fx: Fixture;
beforeEach(async () => {
  await resetDb();
  fx = await seedBasic({ gstin: null });
});

async function makeBooking(rate = 6300_00, nights = 2) {
  return createBooking({
    ownerId: fx.owner.id,
    propertyId: fx.property.id,
    roomId: fx.room.id,
    channelKey: "direct",
    checkIn: today(),
    checkOut: addDays(today(), nights),
    guest: { name: "Sameer", phone: "+919812300000", email: "s@k.in" },
    nightlyRatePaise: rate,
  });
}

describe("createPaymentLinkForBooking", () => {
  it("creates a PaymentLink (mock) for the outstanding balance and audits it", async () => {
    const b = await makeBooking();
    const { row, mock, shortUrl } = await createPaymentLinkForBooking(b.id, { actorName: "Priya" });
    expect(mock).toBe(true);
    expect(row.amount).toBe(b.totalAmount); // nothing paid yet → full balance
    expect(shortUrl).toContain("/pay/");
    const audit = await prisma.auditLog.findFirst({ where: { action: "PAYMENT_LINK_SENT" } });
    expect(audit?.actorName).toBe("Priya");
  });

  it("uses an explicit amount when provided", async () => {
    const b = await makeBooking();
    const { row } = await createPaymentLinkForBooking(b.id, { amountPaise: 100000 });
    expect(row.amount).toBe(100000);
  });

  it("throws when the booking does not exist", async () => {
    await expect(createPaymentLinkForBooking("missing")).rejects.toThrow(/not found/);
  });

  it("throws when the booking has no primary guest", async () => {
    const ch = await prisma.channelSource.findFirst({ where: { ownerId: fx.owner.id } });
    const bare = await prisma.booking.create({
      data: {
        ref: "SK-BARE1",
        propertyId: fx.property.id,
        channelId: ch!.id,
        checkIn: today(),
        checkOut: addDays(today(), 1),
        subtotal: 1000,
        taxAmount: 0,
        totalAmount: 1000,
      },
    });
    await expect(createPaymentLinkForBooking(bare.id)).rejects.toThrow(/no primary guest/);
  });

  it("throws when nothing is left to collect", async () => {
    const b = await makeBooking();
    await applyPayment(b.id, b.totalAmount);
    await expect(createPaymentLinkForBooking(b.id)).rejects.toThrow(/Nothing left/);
  });
});

describe("applyPayment", () => {
  it("increments amountPaid and records a captured Payment", async () => {
    const b = await makeBooking();
    await applyPayment(b.id, 5000_00, { method: "upi", razorpayPaymentId: "pay_1" });
    const updated = await prisma.booking.findUnique({ where: { id: b.id } });
    expect(updated?.amountPaid).toBe(5000_00);
    const pay = await prisma.payment.findUnique({ where: { razorpayPaymentId: "pay_1" } });
    expect(pay?.status).toBe("CAPTURED");
  });

  it("marks the linked payment link PARTIALLY_PAID then PAID", async () => {
    const b = await makeBooking();
    const { row: link } = await createPaymentLinkForBooking(b.id);
    await applyPayment(b.id, 5000_00, { paymentLinkId: link.id });
    let l = await prisma.paymentLink.findUnique({ where: { id: link.id } });
    expect(l?.status).toBe("PARTIALLY_PAID");

    await applyPayment(b.id, b.totalAmount - 5000_00, { paymentLinkId: link.id });
    l = await prisma.paymentLink.findUnique({ where: { id: link.id } });
    expect(l?.status).toBe("PAID");
  });
});
