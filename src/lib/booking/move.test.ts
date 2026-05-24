import { describe, it, expect, beforeEach } from "vitest";
import { createBooking, moveBooking, DoubleBookingError } from "./engine";
import { addRoom } from "../../../test/factories";
import { prisma } from "@/lib/db";
import { resetDb, seedBasic, type Fixture } from "../../../test/factories";

let fx: Fixture;
beforeEach(async () => {
  await resetDb();
  fx = await seedBasic({ gstin: null });
});

async function book(roomId: string, checkIn: string, checkOut: string, phone = "+919812300000") {
  return createBooking({
    ownerId: fx.owner.id,
    propertyId: fx.property.id,
    roomId,
    channelKey: "direct",
    checkIn,
    checkOut,
    guest: { name: "G", phone },
    nightlyRatePaise: 5000_00,
  });
}

describe("moveBooking", () => {
  it("changes dates and recomputes the total", async () => {
    const b = await book(fx.room.id, "2026-06-10", "2026-06-12"); // 2 nights
    const moved = await moveBooking({
      bookingId: b.id,
      ownerId: fx.owner.id,
      checkIn: "2026-06-10",
      checkOut: "2026-06-13", // 3 nights
      actorName: "Priya",
    });
    // Rates are recomputed from the room type's base rate (₹6,300), not the original
    // manual rate: 3 × ₹6,300 = ₹18,900 (no GST — owner unregistered in this fixture).
    expect(moved.totalAmount).toBe(18900_00);
    const nights = await prisma.bookingRoom.count({ where: { bookingId: b.id } });
    expect(nights).toBe(3);
  });

  it("moves to a different room", async () => {
    const room2 = await addRoom(fx.property.id, fx.roomType.id, "Room 2", "102");
    const b = await book(fx.room.id, "2026-07-01", "2026-07-03");
    await moveBooking({
      bookingId: b.id,
      ownerId: fx.owner.id,
      roomId: room2.id,
      actorName: "Priya",
    });
    const rows = await prisma.bookingRoom.findMany({ where: { bookingId: b.id } });
    expect(rows.every((r) => r.roomId === room2.id)).toBe(true);
  });

  it("rejects a move that collides with another booking", async () => {
    const room2 = await addRoom(fx.property.id, fx.roomType.id, "Room 2", "102");
    await book(room2.id, "2026-08-01", "2026-08-03", "+919800000111");
    const b = await book(fx.room.id, "2026-08-10", "2026-08-12", "+919800000222");
    await expect(
      moveBooking({
        bookingId: b.id,
        ownerId: fx.owner.id,
        roomId: room2.id,
        checkIn: "2026-08-01",
        checkOut: "2026-08-03",
        actorName: "Priya",
      }),
    ).rejects.toThrow(DoubleBookingError);
  });

  it("refuses to move a cancelled booking", async () => {
    const b = await book(fx.room.id, "2026-09-01", "2026-09-02");
    await prisma.booking.update({ where: { id: b.id }, data: { status: "CANCELLED" } });
    await expect(
      moveBooking({
        bookingId: b.id,
        ownerId: fx.owner.id,
        checkIn: "2026-09-05",
        checkOut: "2026-09-06",
        actorName: "P",
      }),
    ).rejects.toThrow(/no longer be moved/);
  });
});
