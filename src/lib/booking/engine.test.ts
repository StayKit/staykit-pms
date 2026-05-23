import { describe, it, expect, beforeEach } from "vitest";
import {
  createBooking,
  checkInBooking,
  checkOutBooking,
  cancelBooking,
  DoubleBookingError,
  BookingValidationError,
} from "./engine";
import { prisma } from "@/lib/db";
import { resetDb, seedBasic, type Fixture } from "../../../test/factories";

let fx: Fixture;
beforeEach(async () => {
  await resetDb();
  fx = await seedBasic();
});

const guest = { name: "Sameer Khan", phone: "+919812300000", email: "s@k.in" };

function baseInput(over: Partial<Parameters<typeof createBooking>[0]> = {}) {
  return {
    ownerId: fx.owner.id,
    propertyId: fx.property.id,
    roomId: fx.room.id,
    channelKey: "direct",
    checkIn: "2026-07-01",
    checkOut: "2026-07-04",
    guest,
    ...over,
  };
}

describe("createBooking", () => {
  it("creates a booking with one BookingRoom row per night and a primary guest", async () => {
    const b = await createBooking(baseInput({ nightlyRatePaise: 6300_00 }));
    expect(b.ref).toMatch(/^SK-[A-Z0-9]{5}$/);

    const nights = await prisma.bookingRoom.findMany({ where: { bookingId: b.id } });
    expect(nights).toHaveLength(3); // 1,2,3 July (checkout day exclusive)

    const bg = await prisma.bookingGuest.findFirst({ where: { bookingId: b.id } });
    expect(bg?.isPrimary).toBe(true);
  });

  it("computes 5% GST for a sub-threshold room when the property has a GSTIN", async () => {
    const b = await createBooking(baseInput({ nightlyRatePaise: 6300_00 }));
    expect(b.subtotal).toBe(18900_00);
    expect(b.taxAmount).toBe(945_00);
    expect(b.totalAmount).toBe(19845_00);
  });

  it("charges no GST when the property has no GSTIN", async () => {
    const noGst = await seedBasic({ gstin: null });
    const b = await createBooking({
      ...baseInput({ nightlyRatePaise: 6300_00 }),
      ownerId: noGst.owner.id,
      propertyId: noGst.property.id,
      roomId: noGst.room.id,
    });
    expect(b.taxAmount).toBe(0);
    expect(b.totalAmount).toBe(18900_00);
  });

  it("derives the nightly rate from the room type base rate when none is given", async () => {
    const b = await createBooking(baseInput());
    expect(b.subtotal).toBe(6300_00 * 3); // base rate from seedBasic
  });

  it("derives the rate from a matching rate plan over the base rate", async () => {
    await prisma.ratePlan.create({
      data: {
        propertyId: fx.property.id,
        name: "Peak",
        priority: 10,
        startDate: new Date("2026-07-01T00:00:00Z"),
        endDate: new Date("2026-07-31T00:00:00Z"),
        overrides: { create: [{ roomTypeId: fx.roomType.id, amount: 8000_00 }] },
      },
    });
    const b = await createBooking(baseInput());
    expect(b.subtotal).toBe(8000_00 * 3);
  });

  it("writes an audit row attributed to the human actor by default", async () => {
    const b = await createBooking(baseInput({ actorName: "Priya" }));
    const audit = await prisma.auditLog.findFirst({ where: { entityId: b.id } });
    expect(audit?.action).toBe("BOOKING_CREATED");
    expect(audit?.actorType).toBe("USER");
    expect(audit?.actorName).toBe("Priya");
  });

  it("attributes MCP-created bookings to actorType MCP", async () => {
    const b = await createBooking(baseInput({ createdViaMcp: true }));
    expect(b.createdViaMcp).toBe(true);
    const audit = await prisma.auditLog.findFirst({ where: { entityId: b.id } });
    expect(audit?.actorType).toBe("MCP");
  });

  it("upserts a returning guest by (owner, phone) and updates their name", async () => {
    await createBooking(baseInput());
    await createBooking(
      baseInput({ checkIn: "2026-08-01", checkOut: "2026-08-02", guest: { ...guest, name: "Sameer K." } }),
    );
    const guests = await prisma.guest.findMany({ where: { ownerId: fx.owner.id } });
    expect(guests).toHaveLength(1);
    expect(guests[0].name).toBe("Sameer K.");
  });

  it("rejects a stay shorter than one night", async () => {
    await expect(createBooking(baseInput({ checkOut: "2026-07-01" }))).rejects.toThrow(
      BookingValidationError,
    );
  });

  it("rejects an unknown room for the property", async () => {
    await expect(createBooking(baseInput({ roomId: "nope" }))).rejects.toThrow(BookingValidationError);
  });

  it("rejects an unknown channel", async () => {
    await expect(createBooking(baseInput({ channelKey: "carrier-pigeon" }))).rejects.toThrow(
      /Unknown channel/,
    );
  });

  it("prevents double-booking the same room on overlapping nights", async () => {
    await createBooking(baseInput({ checkIn: "2026-07-01", checkOut: "2026-07-04" }));
    await expect(
      createBooking(baseInput({ checkIn: "2026-07-03", checkOut: "2026-07-06", guest: { ...guest, phone: "+919812399999" } })),
    ).rejects.toThrow(DoubleBookingError);
    // Exactly one booking persisted.
    expect(await prisma.booking.count()).toBe(1);
  });

  it("allows the same room starting on a previous booking's checkout day", async () => {
    await createBooking(baseInput({ checkIn: "2026-07-01", checkOut: "2026-07-04" }));
    const b2 = await createBooking(
      baseInput({ checkIn: "2026-07-04", checkOut: "2026-07-06", guest: { ...guest, phone: "+919812388888" } }),
    );
    expect(b2.id).toBeTruthy();
  });
});

describe("check-in / check-out / cancel", () => {
  it("marks a booking CHECKED_IN with a timestamp and audit", async () => {
    const b = await createBooking(baseInput());
    const r = await checkInBooking(b.id, fx.owner.id, "Rakesh");
    expect(r.status).toBe("CHECKED_IN");
    expect(r.checkedInAt).toBeInstanceOf(Date);
    expect(await prisma.auditLog.count({ where: { action: "CHECKED_IN" } })).toBe(1);
  });

  it("marks CHECKED_OUT and flags occupied rooms dirty for housekeeping", async () => {
    const b = await createBooking(baseInput());
    await checkOutBooking(b.id, fx.owner.id, "Rakesh");
    const room = await prisma.room.findUnique({ where: { id: fx.room.id } });
    expect(room?.cleanliness).toBe("DIRTY");
  });

  it("cancellation releases the room nights so the room can be rebooked", async () => {
    const b = await createBooking(baseInput());
    await cancelBooking(b.id, fx.owner.id, "Guest cancellation", "Priya");
    const updated = await prisma.booking.findUnique({ where: { id: b.id } });
    expect(updated?.status).toBe("CANCELLED");
    expect(updated?.cancellationReason).toBe("Guest cancellation");
    expect(await prisma.bookingRoom.count({ where: { bookingId: b.id } })).toBe(0);
    // The freed nights allow a fresh booking.
    const b2 = await createBooking(baseInput({ guest: { ...guest, phone: "+919800009999" } }));
    expect(b2.id).toBeTruthy();
  });
});
