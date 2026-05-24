import { describe, it, expect, beforeEach } from "vitest";
import {
  applyPayment,
  createRefund,
  markRefundProcessed,
  markRefundFailed,
  RefundError,
} from "./service";
import { createBooking } from "../booking/engine";
import { today, addDays } from "../dates";
import { prisma } from "@/lib/db";
import { resetDb, seedBasic, type Fixture } from "../../../test/factories";

let fx: Fixture;
beforeEach(async () => {
  await resetDb();
  fx = await seedBasic({ gstin: null });
});

async function paidBooking(rate = 5000_00) {
  const b = await createBooking({
    ownerId: fx.owner.id,
    propertyId: fx.property.id,
    roomId: fx.room.id,
    channelKey: "direct",
    checkIn: addDays(today(), 10),
    checkOut: addDays(today(), 11),
    guest: { name: "Sameer", phone: "+919812300000" },
    nightlyRatePaise: rate,
  });
  const payment = await applyPayment(b.id, b.totalAmount, { method: "cash" });
  return { b, payment };
}

describe("createRefund", () => {
  it("processes a full refund immediately in mock mode", async () => {
    const { b } = await paidBooking();
    const { mock } = await createRefund(b.id, {
      amountPaise: b.totalAmount,
      reason: "Owner cancellation",
      initiatedById: fx.user.id,
    });
    expect(mock).toBe(true);

    const after = await prisma.booking.findUnique({ where: { id: b.id } });
    expect(after?.amountPaid).toBe(0);
    const refund = await prisma.refund.findFirst({ where: { bookingId: b.id } });
    expect(refund?.status).toBe("PROCESSED");
    const payment = await prisma.payment.findFirst({ where: { bookingId: b.id } });
    expect(payment?.status).toBe("REFUNDED");
    expect(await prisma.auditLog.count({ where: { action: "REFUND_INITIATED" } })).toBe(1);
    expect(await prisma.auditLog.count({ where: { action: "REFUND_PROCESSED" } })).toBe(1);
  });

  it("leaves the payment CAPTURED on a partial refund", async () => {
    const { b } = await paidBooking();
    await createRefund(b.id, {
      amountPaise: 2000_00,
      reason: "Guest cancellation",
      initiatedById: fx.user.id,
    });
    const after = await prisma.booking.findUnique({ where: { id: b.id } });
    expect(after?.amountPaid).toBe(b.totalAmount - 2000_00);
    const payment = await prisma.payment.findFirst({ where: { bookingId: b.id } });
    expect(payment?.status).toBe("CAPTURED");
  });

  it("rejects a refund larger than the amount paid", async () => {
    const { b } = await paidBooking();
    await expect(
      createRefund(b.id, {
        amountPaise: b.totalAmount + 1,
        reason: "x",
        initiatedById: fx.user.id,
      }),
    ).rejects.toThrow(RefundError);
  });

  it("rejects a non-positive amount", async () => {
    const { b } = await paidBooking();
    await expect(createRefund(b.id, { amountPaise: 0, initiatedById: fx.user.id })).rejects.toThrow(
      /positive/,
    );
  });

  it("rejects when there is no captured payment", async () => {
    const b = await createBooking({
      ownerId: fx.owner.id,
      propertyId: fx.property.id,
      roomId: fx.room.id,
      channelKey: "direct",
      checkIn: addDays(today(), 10),
      checkOut: addDays(today(), 11),
      guest: { name: "X", phone: "+919812300099" },
      nightlyRatePaise: 1000_00,
    });
    // amountPaid set without a Payment row (edge case).
    await prisma.booking.update({ where: { id: b.id }, data: { amountPaid: 500_00 } });
    await expect(
      createRefund(b.id, { amountPaise: 100_00, initiatedById: fx.user.id }),
    ).rejects.toThrow(/No captured payment/);
  });

  it("rejects an unknown booking", async () => {
    await expect(
      createRefund("missing", { amountPaise: 100, initiatedById: fx.user.id }),
    ).rejects.toThrow(/not found/);
  });
});

describe("markRefundProcessed", () => {
  it("is idempotent — only decrements amountPaid once", async () => {
    const { b, payment } = await paidBooking();
    const refund = await prisma.refund.create({
      data: {
        bookingId: b.id,
        paymentId: payment.id,
        amount: 1000_00,
        status: "CREATED",
        initiatedById: fx.user.id,
      },
    });
    await markRefundProcessed(refund.id);
    await markRefundProcessed(refund.id);
    const after = await prisma.booking.findUnique({ where: { id: b.id } });
    expect(after?.amountPaid).toBe(b.totalAmount - 1000_00);
  });

  it("returns undefined-ish for a missing refund", async () => {
    const r = await markRefundProcessed("missing");
    expect(r).toBeFalsy();
  });
});

describe("markRefundFailed", () => {
  it("flips a CREATED refund to FAILED and is a no-op afterwards", async () => {
    const { b, payment } = await paidBooking();
    const refund = await prisma.refund.create({
      data: {
        bookingId: b.id,
        paymentId: payment.id,
        amount: 1000_00,
        status: "CREATED",
        initiatedById: fx.user.id,
      },
    });
    const failed = await markRefundFailed(refund.id, "bank declined");
    expect(failed?.status).toBe("FAILED");
    expect(failed?.reason).toBe("bank declined");
    // Second call is a no-op (status no longer CREATED).
    const again = await markRefundFailed(refund.id);
    expect(again?.status).toBe("FAILED");
  });
});
