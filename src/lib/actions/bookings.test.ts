import { describe, it, expect, beforeEach, vi, type Mock } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/context", () => ({ requireContext: vi.fn() }));

import { requireContext } from "@/lib/auth/context";
import {
  createBookingAction,
  checkInAction,
  checkOutAction,
  cancelAction,
  sendPaymentLinkAction,
  markPaidAction,
} from "./bookings";
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

function input(over: Record<string, unknown> = {}) {
  return {
    propertyId: fx.property.id,
    roomId: fx.room.id,
    channelKey: "direct",
    guestName: "Sameer",
    guestPhone: "+919812300000",
    checkIn: ymd(today()),
    checkOut: ymd(addDays(today(), 2)),
    payment: "later" as const,
    nightlyRateRupees: 6300,
    ...over,
  };
}

describe("createBookingAction", () => {
  it("creates a booking and returns its ref", async () => {
    const res = await createBookingAction(input());
    expect(res.ok).toBe(true);
    expect(res.ref).toMatch(/^SK-/);
  });

  it("derives the rate from the room type when no nightly rate is supplied", async () => {
    const res = await createBookingAction(input({ nightlyRateRupees: undefined }));
    expect(res.ok).toBe(true);
    const b = await prisma.booking.findUnique({ where: { id: res.bookingId } });
    expect(b?.subtotal).toBe(6300_00 * 2); // base rate × 2 nights
  });

  it("marks the booking paid when payment=paid", async () => {
    const res = await createBookingAction(input({ payment: "paid" }));
    const b = await prisma.booking.findUnique({ where: { id: res.bookingId } });
    expect(b?.amountPaid).toBe(b?.totalAmount);
  });

  it("creates a payment link when payment=link", async () => {
    const res = await createBookingAction(input({ payment: "link" }));
    const links = await prisma.paymentLink.count({ where: { bookingId: res.bookingId } });
    expect(links).toBe(1);
  });

  it("returns a friendly error on double-booking", async () => {
    await createBookingAction(input());
    const res = await createBookingAction(
      input({
        guestPhone: "+919812399999",
        checkIn: ymd(addDays(today(), 1)),
        checkOut: ymd(addDays(today(), 3)),
      }),
    );
    expect(res.ok).toBe(false);
    expect(res.message).toMatch(/already booked/i);
  });

  it("returns a validation error for missing guest details (zod)", async () => {
    const res = await createBookingAction(input({ guestName: "" }));
    expect(res.ok).toBe(false);
    expect(res.message).toBeTruthy();
  });

  it("returns a validation error for an unknown room (domain)", async () => {
    const res = await createBookingAction(input({ roomId: "missing" }));
    expect(res.ok).toBe(false);
    expect(res.message).toMatch(/room/i);
  });

  it("surfaces a generic error when something throws unexpectedly", async () => {
    mockCtx.mockRejectedValueOnce(new Error("db down"));
    const res = await createBookingAction(input());
    expect(res.ok).toBe(false);
    expect(res.message).toMatch(/something went wrong/i);
  });
});

describe("booking lifecycle actions", () => {
  async function make() {
    const r = await createBookingAction(input());
    return r.bookingId!;
  }

  it("checkInAction transitions to CHECKED_IN", async () => {
    const id = await make();
    expect((await checkInAction(id)).ok).toBe(true);
    expect((await prisma.booking.findUnique({ where: { id } }))?.status).toBe("CHECKED_IN");
  });

  it("checkOutAction transitions to CHECKED_OUT", async () => {
    const id = await make();
    await checkInAction(id);
    expect((await checkOutAction(id)).ok).toBe(true);
    expect((await prisma.booking.findUnique({ where: { id } }))?.status).toBe("CHECKED_OUT");
  });

  it("cancelAction cancels with a reason", async () => {
    const id = await make();
    expect((await cancelAction(id, "Guest cancellation")).ok).toBe(true);
    expect((await prisma.booking.findUnique({ where: { id } }))?.status).toBe("CANCELLED");
  });

  it("markPaidAction collects the outstanding balance", async () => {
    const id = await make();
    expect((await markPaidAction(id)).ok).toBe(true);
    const b = await prisma.booking.findUnique({ where: { id } });
    expect(b?.amountPaid).toBe(b?.totalAmount);
  });

  it("sendPaymentLinkAction returns the (mock) link", async () => {
    const id = await make();
    const res = await sendPaymentLinkAction(id);
    expect(res.ok).toBe(true);
    expect(res.message).toMatch(/link/i);
  });

  it("lifecycle actions 404 on unknown bookings", async () => {
    expect((await checkInAction("nope")).ok).toBe(false);
    expect((await checkOutAction("nope")).ok).toBe(false);
    expect((await cancelAction("nope", "x")).ok).toBe(false);
    expect((await sendPaymentLinkAction("nope")).ok).toBe(false);
    expect((await markPaidAction("nope")).ok).toBe(false);
  });

  it("sendPaymentLinkAction reports the error when nothing is left to collect", async () => {
    const id = await make();
    await markPaidAction(id);
    const res = await sendPaymentLinkAction(id);
    expect(res.ok).toBe(false);
    expect(res.message).toMatch(/nothing left/i);
  });

  it("reports a live (non-mock) link when Razorpay is configured", async () => {
    vi.stubEnv("RAZORPAY_KEY_ID_TEST", "rzp_test_x");
    vi.stubEnv("RAZORPAY_KEY_SECRET_TEST", "secret");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ id: "plink_live", short_url: "https://rzp.io/i/live" }),
      }),
    );
    const id = await make();
    const res = await sendPaymentLinkAction(id);
    expect(res.ok).toBe(true);
    expect(res.message).toMatch(/Link sent/);
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });
});
