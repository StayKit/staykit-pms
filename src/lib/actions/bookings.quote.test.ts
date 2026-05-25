import { describe, it, expect, beforeEach, vi, type Mock } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/context", () => ({ requireContext: vi.fn() }));

import { requireContext } from "@/lib/auth/context";
import {
  quoteBookingAction,
  createBookingAction,
  updateBookingNotesAction,
  checkOutAction,
} from "./bookings";
import { prisma } from "@/lib/db";
import { today, addDays, ymd } from "../dates";
import { resetDb, seedBasic, addRoom, type Fixture } from "../../../test/factories";

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

describe("quoteBookingAction", () => {
  it("prices a stay at the room type's base rate when no plan matches", async () => {
    const q = await quoteBookingAction({
      propertyId: fx.property.id,
      roomId: fx.room.id,
      checkIn: ymd(today()),
      checkOut: ymd(addDays(today(), 2)),
    });
    expect(q.ok).toBe(true);
    expect(q.nights).toBe(2);
    expect(q.nightlyRupees).toBe(6300); // base rate (paise → rupees)
    expect(q.subtotalRupees).toBe(12600);
    expect(q.appliedPlan).toBeNull();
  });

  it("applies a matching rate plan and reports its name", async () => {
    await prisma.ratePlan.create({
      data: {
        propertyId: fx.property.id,
        name: "Weekend special",
        priority: 10,
        startDate: addDays(today(), -1),
        endDate: addDays(today(), 10),
        daysOfWeek: "1111111",
        overrides: { create: { roomTypeId: fx.roomType.id, amount: 5000_00 } },
      },
    });
    const q = await quoteBookingAction({
      propertyId: fx.property.id,
      roomId: fx.room.id,
      checkIn: ymd(today()),
      checkOut: ymd(addDays(today(), 2)),
    });
    expect(q.appliedPlan).toBe("Weekend special");
    expect(q.nightlyRupees).toBe(5000);
    expect(q.subtotalRupees).toBe(10000);
  });

  it("reports rooms that are unavailable for the requested dates", async () => {
    const room2 = await addRoom(fx.property.id, fx.roomType.id, "Room 2", "102");
    // Book the first room for an overlapping window.
    await createBookingAction({
      propertyId: fx.property.id,
      roomId: fx.room.id,
      channelKey: "direct",
      guestName: "Sameer",
      guestPhone: "+919812300000",
      checkIn: ymd(today()),
      checkOut: ymd(addDays(today(), 2)),
      payment: "later",
    });
    const q = await quoteBookingAction({
      propertyId: fx.property.id,
      roomId: room2.id,
      checkIn: ymd(today()),
      checkOut: ymd(addDays(today(), 2)),
    });
    expect(q.unavailableRoomIds).toContain(fx.room.id);
    expect(q.unavailableRoomIds).not.toContain(room2.id);
  });

  it("returns zero GST and a clear label when the property has no GSTIN", async () => {
    // fx is seeded with gstin: null in this suite's beforeEach.
    const q = await quoteBookingAction({
      propertyId: fx.property.id,
      roomId: fx.room.id,
      checkIn: ymd(today()),
      checkOut: ymd(addDays(today(), 2)),
    });
    expect(q.taxRupees).toBe(0);
    expect(q.totalRupees).toBe(q.subtotalRupees);
    expect(q.taxLabel).toMatch(/not registered/i);
  });

  it("charges 5% GST below the threshold for a registered property", async () => {
    const owner = await prisma.owner.create({
      data: { name: "G", email: "g@test.in", phone: "+919800012345" },
    });
    const property = await prisma.property.create({
      data: {
        ownerId: owner.id,
        name: "GST Homestay",
        addressLine1: "2 Road",
        city: "Madikeri",
        state: "KA",
        pincode: "571201",
        gstin: "29ABCDE1234F1Z5",
      },
    });
    const rt = await prisma.roomType.create({
      data: { propertyId: property.id, name: "Std", baseRate: 6000_00, maxOccupancy: 2 },
    });
    const room = await prisma.room.create({
      data: { propertyId: property.id, roomTypeId: rt.id, name: "R1", number: "1" },
    });
    mockCtx.mockResolvedValue({
      ownerId: owner.id,
      userId: "u",
      role: "OWNER",
      name: "G",
      propertyScopes: [],
      demo: true,
    });
    const q = await quoteBookingAction({
      propertyId: property.id,
      roomId: room.id,
      checkIn: ymd(today()),
      checkOut: ymd(addDays(today(), 2)),
    });
    expect(q.subtotalRupees).toBe(12000);
    expect(q.taxRupees).toBe(600); // 5% of 12000
    expect(q.taxLabel).toBe("GST 5%");
  });

  it("applies 18% GST above ₹7,500/night for a manual rate", async () => {
    const owner = await prisma.owner.create({
      data: { name: "P", email: "p@test.in", phone: "+919800054321" },
    });
    const property = await prisma.property.create({
      data: {
        ownerId: owner.id,
        name: "Premium",
        addressLine1: "3 Road",
        city: "Madikeri",
        state: "KA",
        pincode: "571201",
        gstin: "29ABCDE1234F1Z5",
      },
    });
    const rt = await prisma.roomType.create({
      data: { propertyId: property.id, name: "Suite", baseRate: 5000_00, maxOccupancy: 2 },
    });
    const room = await prisma.room.create({
      data: { propertyId: property.id, roomTypeId: rt.id, name: "S1", number: "1" },
    });
    mockCtx.mockResolvedValue({
      ownerId: owner.id,
      userId: "u",
      role: "OWNER",
      name: "P",
      propertyScopes: [],
      demo: true,
    });
    const q = await quoteBookingAction({
      propertyId: property.id,
      roomId: room.id,
      checkIn: ymd(today()),
      checkOut: ymd(addDays(today(), 2)),
      nightlyRateRupees: 9000, // > ₹7,500 → 18%
    });
    expect(q.subtotalRupees).toBe(18000);
    expect(q.taxRupees).toBe(3240); // 18% of 18000
    expect(q.taxLabel).toBe("GST 18%");
    expect(q.appliedPlan).toBeNull();
  });

  it("flags a maintenance-blocked room as unavailable", async () => {
    await prisma.maintenanceBlock.create({
      data: {
        propertyId: fx.property.id,
        roomId: fx.room.id,
        startDate: today(),
        endDate: addDays(today(), 3),
        reason: "Deep clean",
        createdById: fx.user.id,
      },
    });
    const q = await quoteBookingAction({
      propertyId: fx.property.id,
      roomId: fx.room.id,
      checkIn: ymd(today()),
      checkOut: ymd(addDays(today(), 2)),
    });
    expect(q.unavailableRoomIds).toContain(fx.room.id);
  });
});

describe("lifecycle notifications", () => {
  async function smsTemplate(triggerKey: string) {
    await prisma.notificationTemplate.create({
      data: {
        ownerId: fx.owner.id,
        channel: "SMS",
        triggerKey,
        name: triggerKey,
        body: "Hi {{guest.name}}, {{booking.ref}}",
      },
    });
  }

  it("queues a BOOKING_CONFIRMED message when a template exists", async () => {
    await smsTemplate("BOOKING_CONFIRMED");
    const res = await createBookingAction({
      propertyId: fx.property.id,
      roomId: fx.room.id,
      channelKey: "direct",
      guestName: "Sameer",
      guestPhone: "+919812300000",
      checkIn: ymd(today()),
      checkOut: ymd(addDays(today(), 2)),
      payment: "later",
    });
    const log = await prisma.notificationLog.findFirst({
      where: { bookingId: res.bookingId!, triggerKey: "BOOKING_CONFIRMED" },
    });
    expect(log).not.toBeNull();
    expect(log?.to).toBe("+919812300000");
  });

  it("queues a POST_CHECKOUT_THANKS message on check-out", async () => {
    await smsTemplate("POST_CHECKOUT_THANKS");
    const res = await createBookingAction({
      propertyId: fx.property.id,
      roomId: fx.room.id,
      channelKey: "direct",
      guestName: "Asha",
      guestPhone: "+919800099999",
      checkIn: ymd(today()),
      checkOut: ymd(addDays(today(), 1)),
      payment: "later",
    });
    await checkOutAction(res.bookingId!);
    const log = await prisma.notificationLog.findFirst({
      where: { bookingId: res.bookingId!, triggerKey: "POST_CHECKOUT_THANKS" },
    });
    expect(log).not.toBeNull();
  });
});

describe("guest phone identity (dedup)", () => {
  it("reuses one guest record across formatting variants of the same number", async () => {
    const room2 = await addRoom(fx.property.id, fx.roomType.id, "Room 2", "102");
    await createBookingAction({
      propertyId: fx.property.id,
      roomId: fx.room.id,
      channelKey: "direct",
      guestName: "Asha Rao",
      guestPhone: "+91 98765 43210",
      checkIn: ymd(today()),
      checkOut: ymd(addDays(today(), 1)),
      payment: "later",
    });
    await createBookingAction({
      propertyId: fx.property.id,
      roomId: room2.id,
      channelKey: "direct",
      guestName: "Asha Rao",
      guestPhone: "9876543210", // same person, no country code / spaces
      checkIn: ymd(today()),
      checkOut: ymd(addDays(today(), 1)),
      payment: "later",
    });
    const guests = await prisma.guest.findMany({ where: { ownerId: fx.owner.id } });
    expect(guests).toHaveLength(1);
    expect(guests[0].phone).toBe("+919876543210");
  });
});

describe("updateBookingNotesAction", () => {
  it("saves notes onto an existing booking", async () => {
    const res = await createBookingAction({
      propertyId: fx.property.id,
      roomId: fx.room.id,
      channelKey: "direct",
      guestName: "Sameer",
      guestPhone: "+919812300000",
      checkIn: ymd(today()),
      checkOut: ymd(addDays(today(), 2)),
      payment: "later",
    });
    const upd = await updateBookingNotesAction(res.bookingId!, "Wants early check-in");
    expect(upd.ok).toBe(true);
    const b = await prisma.booking.findUnique({ where: { id: res.bookingId! } });
    expect(b?.notes).toBe("Wants early check-in");
  });

  it("clears notes when given an empty string", async () => {
    const res = await createBookingAction({
      propertyId: fx.property.id,
      roomId: fx.room.id,
      channelKey: "direct",
      guestName: "Sameer",
      guestPhone: "+919812300000",
      checkIn: ymd(today()),
      checkOut: ymd(addDays(today(), 2)),
      payment: "later",
      notes: "old note",
    });
    await updateBookingNotesAction(res.bookingId!, "   ");
    const b = await prisma.booking.findUnique({ where: { id: res.bookingId! } });
    expect(b?.notes).toBeNull();
  });
});
