import { describe, it, expect, beforeEach, vi, type Mock } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/context", () => ({ requireContext: vi.fn() }));

import { requireContext } from "@/lib/auth/context";
import { recordPaymentAction, createBookingAction } from "./bookings";
import { prisma } from "@/lib/db";
import { today, addDays, ymd } from "../dates";
import { resetDb, seedBasic, type Fixture } from "../../../test/factories";

const mockCtx = requireContext as unknown as Mock;
let fx: Fixture;

beforeEach(async () => {
  await resetDb();
  fx = await seedBasic({ gstin: null });
  mockCtx.mockResolvedValue({
    ownerId: fx.owner.id,
    userId: fx.user.id,
    role: "OWNER",
    name: "Priya",
    propertyScopes: [],
    demo: true,
  });
});

async function aBooking() {
  // No env keys ⇒ online disabled ⇒ "link" must NOT create a payment link.
  const res = await createBookingAction({
    propertyId: fx.property.id,
    roomId: fx.room.id,
    channelKey: "direct",
    guestName: "Sameer",
    guestPhone: "+919812300000",
    checkIn: ymd(today()),
    checkOut: ymd(addDays(today(), 2)),
    payment: "link",
    nightlyRateRupees: 5000,
  });
  return res.bookingId!;
}

describe("cash-first booking creation", () => {
  it("does not create an online link when Razorpay is disabled", async () => {
    const id = await aBooking();
    expect(await prisma.paymentLink.count({ where: { bookingId: id } })).toBe(0);
    const b = await prisma.booking.findUnique({ where: { id } });
    expect(b?.amountPaid).toBe(0); // collected manually later
  });
});

describe("recordPaymentAction", () => {
  it("records a partial manual payment and audits it", async () => {
    const id = await aBooking(); // total 2×5000 = 10000
    const res = await recordPaymentAction(id, { amountRupees: 4000, method: "upi" });
    expect(res.ok).toBe(true);
    const b = await prisma.booking.findUnique({ where: { id } });
    expect(b?.amountPaid).toBe(4000_00);
    const pay = await prisma.payment.findFirst({ where: { bookingId: id } });
    expect(pay?.method).toBe("upi");
    const audit = await prisma.auditLog.findFirst({ where: { action: "PAYMENT_RECORDED" } });
    expect(audit).toBeTruthy();
  });

  it("rejects more than the balance due", async () => {
    const id = await aBooking();
    const res = await recordPaymentAction(id, { amountRupees: 99999, method: "cash" });
    expect(res.ok).toBe(false);
    expect(res.message).toMatch(/still due/);
  });

  it("rejects a non-positive amount", async () => {
    const id = await aBooking();
    expect((await recordPaymentAction(id, { amountRupees: 0, method: "cash" })).ok).toBe(false);
  });

  it("falls back to 'other' for an unknown method", async () => {
    const id = await aBooking();
    await recordPaymentAction(id, { amountRupees: 100, method: "crypto" });
    const pay = await prisma.payment.findFirst({ where: { bookingId: id } });
    expect(pay?.method).toBe("other");
  });
});
