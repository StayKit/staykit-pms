import { describe, it, expect, beforeEach, vi, type Mock } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/session", () => ({ getGuestSession: vi.fn() }));

import { getGuestSession } from "@/lib/auth/session";
import { updateMyBookingAction, requestCancellationAction } from "./guest-portal";
import { prisma } from "@/lib/db";
import { today, addDays } from "../dates";
import { resetDb, seedBasic, type Fixture } from "../../../test/factories";

const mockSession = getGuestSession as unknown as Mock;
let fx: Fixture;
const PHONE = "+919876500000";

async function makeBooking() {
  const guest = await prisma.guest.create({
    data: { ownerId: fx.owner.id, name: "Asha", phone: PHONE },
  });
  const channel = await prisma.channelSource.findFirst({
    where: { ownerId: fx.owner.id, key: "direct" },
  });
  const booking = await prisma.booking.create({
    data: {
      ref: "SK-" + Math.random().toString(36).slice(2, 7).toUpperCase(),
      propertyId: fx.property.id,
      channelId: channel!.id,
      checkIn: addDays(today(), 3),
      checkOut: addDays(today(), 5),
      subtotal: 12600_00,
      taxAmount: 0,
      totalAmount: 12600_00,
      guests: { create: { guestId: guest.id, isPrimary: true } },
    },
  });
  return { guest, booking };
}

beforeEach(async () => {
  await resetDb();
  fx = await seedBasic({ gstin: null });
  mockSession.mockResolvedValue({ scope: "guest", phone: PHONE });
});

describe("updateMyBookingAction", () => {
  it("lets the guest set their email, arrival time and requests", async () => {
    const { booking, guest } = await makeBooking();
    const res = await updateMyBookingAction(booking.id, {
      email: "asha@example.in",
      arrivalTime: "around 6 PM",
      requests: "Please arrange an extra mattress.",
    });
    expect(res.ok).toBe(true);
    const b = await prisma.booking.findUnique({ where: { id: booking.id } });
    expect(b?.arrivalTime).toBe("around 6 PM");
    expect(b?.guestRequests).toBe("Please arrange an extra mattress.");
    const g = await prisma.guest.findUnique({ where: { id: guest.id } });
    expect(g?.email).toBe("asha@example.in");
  });

  it("rejects an invalid email", async () => {
    const { booking } = await makeBooking();
    const res = await updateMyBookingAction(booking.id, { email: "not-an-email" });
    expect(res.ok).toBe(false);
  });

  it("fails closed when the booking isn't the signed-in guest's", async () => {
    const { booking } = await makeBooking();
    mockSession.mockResolvedValue({ scope: "guest", phone: "+910000000000" });
    const res = await updateMyBookingAction(booking.id, { arrivalTime: "noon" });
    expect(res.ok).toBe(false);
  });

  it("fails closed when there is no guest session", async () => {
    const { booking } = await makeBooking();
    mockSession.mockResolvedValue(null);
    const res = await updateMyBookingAction(booking.id, { arrivalTime: "noon" });
    expect(res.ok).toBe(false);
  });
});

describe("requestCancellationAction", () => {
  it("flags the booking for cancellation without cancelling it", async () => {
    const { booking } = await makeBooking();
    const res = await requestCancellationAction(booking.id, "Plans changed");
    expect(res.ok).toBe(true);
    const b = await prisma.booking.findUnique({ where: { id: booking.id } });
    expect(b?.cancelRequestedAt).not.toBeNull();
    expect(b?.cancelRequestReason).toBe("Plans changed");
    expect(b?.status).not.toBe("CANCELLED"); // staff still actions it
  });

  it("is idempotent on a second request", async () => {
    const { booking } = await makeBooking();
    await requestCancellationAction(booking.id, "first");
    const res = await requestCancellationAction(booking.id, "second");
    expect(res.ok).toBe(true);
    const b = await prisma.booking.findUnique({ where: { id: booking.id } });
    expect(b?.cancelRequestReason).toBe("first"); // unchanged
  });
});
