import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { createHmac } from "node:crypto";
import { POST } from "./route";
import { createBooking } from "@/lib/booking/engine";
import { createPaymentLinkForBooking } from "@/lib/payments/service";
import { prisma } from "@/lib/db";
import { today, addDays } from "@/lib/dates";
import { resetDb, seedBasic, type Fixture } from "../../../../../test/factories";

const SECRET = "whsec";
let fx: Fixture;
let bookingId: string;

beforeEach(async () => {
  vi.stubEnv("RAZORPAY_WEBHOOK_SECRET_TEST", SECRET);
  await resetDb();
  fx = await seedBasic({ gstin: null });
  const b = await createBooking({
    ownerId: fx.owner.id,
    propertyId: fx.property.id,
    roomId: fx.room.id,
    channelKey: "direct",
    checkIn: today(),
    checkOut: addDays(today(), 2),
    guest: { name: "Sameer", phone: "+919812300000" },
    nightlyRatePaise: 6300_00,
  });
  bookingId = b.id;
  await createPaymentLinkForBooking(bookingId);
});
afterEach(() => vi.unstubAllEnvs());

function event(over: Record<string, unknown> = {}) {
  return {
    event: "payment_link.paid",
    payload: {
      payment: { entity: { id: "pay_1", amount: 12600_00, method: "upi", notes: { bookingId } } },
      payment_link: { entity: { amount: 12600_00, notes: { bookingId } } },
    },
    ...over,
  };
}

function post(raw: string, headers: Record<string, string> = {}) {
  const sig = createHmac("sha256", SECRET).update(raw).digest("hex");
  return POST(
    new Request("http://localhost:3000/api/webhooks/razorpay", {
      method: "POST",
      body: raw,
      headers: { "x-razorpay-signature": sig, "x-razorpay-event-id": "evt_1", ...headers },
    }),
  );
}

describe("POST /api/webhooks/razorpay", () => {
  it("rejects a request with no signature/event-id headers", async () => {
    const res = await POST(
      new Request("http://localhost:3000/api/webhooks/razorpay", {
        method: "POST",
        body: JSON.stringify(event()),
      }),
    );
    expect(res.status).toBe(400);
  });

  it("rejects an invalid signature with 400", async () => {
    const res = await POST(
      new Request("http://localhost:3000/api/webhooks/razorpay", {
        method: "POST",
        body: JSON.stringify(event()),
        headers: { "x-razorpay-signature": "wrong", "x-razorpay-event-id": "e" },
      }),
    );
    expect(res.status).toBe(400);
  });

  it("applies a captured payment and writes a PAYMENT_CAPTURED audit row", async () => {
    const res = await post(JSON.stringify(event()));
    expect(res.status).toBe(200);
    const b = await prisma.booking.findUnique({ where: { id: bookingId } });
    expect(b?.amountPaid).toBe(12600_00);
    const audit = await prisma.auditLog.findFirst({ where: { action: "PAYMENT_CAPTURED" } });
    expect(audit).toBeTruthy();
    const pay = await prisma.payment.findUnique({ where: { razorpayPaymentId: "pay_1" } });
    expect(pay?.status).toBe("CAPTURED");
  });

  it("de-duplicates by x-razorpay-event-id", async () => {
    const raw = JSON.stringify(event());
    await post(raw);
    const res2 = await post(raw); // same eventId
    expect((await res2.json()).duplicate).toBe(true);
    // still only one payment applied
    expect(await prisma.payment.count()).toBe(1);
  });

  it("is idempotent by razorpayPaymentId across different events", async () => {
    await post(JSON.stringify(event()), { "x-razorpay-event-id": "evt_A" });
    await post(JSON.stringify(event()), { "x-razorpay-event-id": "evt_B" });
    const b = await prisma.booking.findUnique({ where: { id: bookingId } });
    expect(b?.amountPaid).toBe(12600_00); // not doubled
    expect(await prisma.payment.count()).toBe(1);
  });

  it("returns 400 for a signed-but-unparseable body", async () => {
    const res = await post("not-json", { "x-razorpay-event-id": "evt_bad" });
    expect(res.status).toBe(400);
  });

  it("ignores unrelated events with a 2xx", async () => {
    const res = await post(JSON.stringify({ event: "subscription.charged", payload: {} }), {
      "x-razorpay-event-id": "evt_other",
    });
    expect(res.status).toBe(200);
  });

  it("reads notes/amount from the payment_link entity when no payment entity is present", async () => {
    const evt = {
      event: "payment_link.paid",
      payload: { payment_link: { entity: { amount: 12600_00, notes: { bookingId } } } },
    };
    const res = await post(JSON.stringify(evt), { "x-razorpay-event-id": "evt_link_only" });
    expect(res.status).toBe(200);
    const b = await prisma.booking.findUnique({ where: { id: bookingId } });
    expect(b?.amountPaid).toBe(12600_00);
  });

  it("skips application when the captured amount is zero", async () => {
    const evt = {
      event: "payment.captured",
      payload: { payment: { entity: { id: "pay_zero", amount: 0, notes: { bookingId } } } },
    };
    const res = await post(JSON.stringify(evt), { "x-razorpay-event-id": "evt_zero" });
    expect(res.status).toBe(200);
    const b = await prisma.booking.findUnique({ where: { id: bookingId } });
    expect(b?.amountPaid).toBe(0); // unchanged — amount must be > 0
  });

  it("settles a refund on refund.processed", async () => {
    // Capture a payment, then stage a CREATED refund the webhook will settle.
    await post(JSON.stringify(event()));
    const payment = await prisma.payment.findUnique({ where: { razorpayPaymentId: "pay_1" } });
    await prisma.refund.create({
      data: {
        bookingId,
        paymentId: payment!.id,
        amount: 2000_00,
        status: "CREATED",
        razorpayRefundId: "rfnd_1",
        initiatedById: fx.user.id,
      },
    });

    const evt = {
      event: "refund.processed",
      payload: { refund: { entity: { id: "rfnd_1", amount: 2000_00, status: "processed" } } },
    };
    const res = await post(JSON.stringify(evt), { "x-razorpay-event-id": "evt_rfnd" });
    expect(res.status).toBe(200);
    const refund = await prisma.refund.findUnique({ where: { razorpayRefundId: "rfnd_1" } });
    expect(refund?.status).toBe("PROCESSED");
    const b = await prisma.booking.findUnique({ where: { id: bookingId } });
    expect(b?.amountPaid).toBe(12600_00 - 2000_00);
  });

  it("marks a refund failed on refund.failed", async () => {
    await post(JSON.stringify(event()));
    const payment = await prisma.payment.findUnique({ where: { razorpayPaymentId: "pay_1" } });
    await prisma.refund.create({
      data: {
        bookingId,
        paymentId: payment!.id,
        amount: 1000_00,
        status: "CREATED",
        razorpayRefundId: "rfnd_2",
        initiatedById: fx.user.id,
      },
    });
    const evt = {
      event: "refund.failed",
      payload: {
        refund: { entity: { id: "rfnd_2", error_description: "bank declined" } },
      },
    };
    const res = await post(JSON.stringify(evt), { "x-razorpay-event-id": "evt_rfnd_fail" });
    expect(res.status).toBe(200);
    const refund = await prisma.refund.findUnique({ where: { razorpayRefundId: "rfnd_2" } });
    expect(refund?.status).toBe("FAILED");
  });

  it("ignores a refund event for an unknown refund id", async () => {
    const evt = {
      event: "refund.processed",
      payload: { refund: { entity: { id: "rfnd_ghost" } } },
    };
    const res = await post(JSON.stringify(evt), { "x-razorpay-event-id": "evt_rfnd_ghost" });
    expect(res.status).toBe(200);
  });

  it("recovers (still 2xx) when the handler hits an unexpected error", async () => {
    // bookingId points at a non-existent booking → applyPayment throws; the handler
    // catches it and still returns 2xx so Razorpay won't retry forever.
    const evt = {
      event: "payment.captured",
      payload: {
        payment: { entity: { id: "pay_x", amount: 1000, notes: { bookingId: "ghost" } } },
      },
    };
    const res = await post(JSON.stringify(evt), { "x-razorpay-event-id": "evt_err" });
    expect(res.status).toBe(200);
  });
});
