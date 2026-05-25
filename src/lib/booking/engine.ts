/**
 * Booking engine. Creation runs inside a Serializable transaction that inserts one
 * BookingRoom row per night; the @@unique([roomId, date]) constraint is the durable
 * double-booking guarantee even under concurrent writers (§B.3). SQLite's WAL
 * single-writer model serializes the writes; the constraint catches the rest.
 */
import { Prisma, type BookingStatus } from "@prisma/client";
import { prisma } from "../db";
import { computeTax } from "../tax";
import { eachNight, nightsBetween, utcMidnight } from "../dates";
import { quoteStay, type RatePlanLike } from "./rates";
import { generateBookingRef } from "./ref";
import { writeAudit } from "../audit";
import { normalizePhone } from "../phone";
import { enqueueNotification } from "../notify/dispatch";

/** Build the template scope shared by booking-lifecycle notifications. */
function bookingScope(
  booking: { ref: string; checkIn: Date; checkOut: Date; totalAmount: number; amountPaid: number },
  guest: { name: string },
  property: { name: string; checkInTime: string },
): Record<string, unknown> {
  return {
    guest: { name: guest.name },
    booking: {
      ref: booking.ref,
      checkIn: booking.checkIn.toISOString(),
      checkOut: booking.checkOut.toISOString(),
    },
    property: { name: property.name, checkInTime: property.checkInTime },
    amount: { due: booking.totalAmount - booking.amountPaid, total: booking.totalAmount },
  };
}

export class DoubleBookingError extends Error {
  readonly code = "DOUBLE_BOOKING";
  constructor(message = "One or more nights are already booked for this room.") {
    super(message);
    this.name = "DoubleBookingError";
  }
}

export class BookingValidationError extends Error {
  readonly code = "INVALID";
  constructor(message: string) {
    super(message);
    this.name = "BookingValidationError";
  }
}

export interface CreateBookingInput {
  ownerId: string;
  propertyId: string;
  /** Single room (back-compat). For a group/family booking, use `roomIds` instead. */
  roomId?: string;
  /** Multiple rooms in one booking (audit P1 #9). Falls back to `[roomId]`. */
  roomIds?: string[];
  channelKey: string;
  checkIn: string | Date;
  checkOut: string | Date;
  guest: {
    name: string;
    phone: string;
    email?: string | null;
    isForeign?: boolean;
    city?: string | null;
    state?: string | null;
  };
  adults?: number;
  children?: number;
  /** Per-night rate in paise. If omitted, derived from rate plans / base rate. */
  nightlyRatePaise?: number;
  status?: BookingStatus;
  notes?: string | null;
  createdViaMcp?: boolean;
  createdById?: string | null;
  actorName?: string;
  actorType?: "USER" | "MCP" | "SYSTEM" | "GUEST";
}

export async function createBooking(input: CreateBookingInput) {
  const checkIn = utcMidnight(input.checkIn);
  const checkOut = utcMidnight(input.checkOut);
  const nights = nightsBetween(checkIn, checkOut);
  if (nights < 1) throw new BookingValidationError("Check-out must be after check-in.");

  const roomIds = input.roomIds?.length ? input.roomIds : input.roomId ? [input.roomId] : [];
  if (roomIds.length === 0) throw new BookingValidationError("Pick at least one room.");
  const uniqueRoomIds = [...new Set(roomIds)];

  const rooms = await prisma.room.findMany({
    where: { id: { in: uniqueRoomIds }, propertyId: input.propertyId },
    include: { roomType: true, property: true },
  });
  if (rooms.length !== uniqueRoomIds.length) {
    throw new BookingValidationError("One or more rooms don't belong to this property.");
  }

  // Occupancy guard (audit P1 #15): don't silently overfill. For a multi-room booking the
  // capacity is the sum across the rooms. To allow an extra bed, raise a room type's max.
  const occupants = (input.adults ?? 1) + (input.children ?? 0);
  const totalCapacity = rooms.reduce((s, r) => s + r.roomType.maxOccupancy, 0);
  if (occupants > totalCapacity) {
    throw new BookingValidationError(
      `${occupants} guests exceed the capacity of the selected room(s) (${totalCapacity}). Add a room or split the booking.`,
    );
  }

  const channel = await prisma.channelSource.findFirst({
    where: { ownerId: input.ownerId, key: input.channelKey },
  });
  if (!channel) throw new BookingValidationError(`Unknown channel "${input.channelKey}".`);

  // Resolve nightly rates per room. A manual rate (if given) applies to every room;
  // otherwise each room is priced from its own type's rate plans.
  const nightDates = eachNight(checkIn, checkOut);
  const plans = input.nightlyRatePaise != null ? [] : await loadRatePlans(input.propertyId);
  const perRoom = rooms.map((r) => {
    const nights =
      input.nightlyRatePaise != null
        ? nightDates.map((date) => ({ date, rate: input.nightlyRatePaise! }))
        : quoteStay(nightDates, r.roomTypeId, r.roomType.baseRate, plans).perNight;
    return { roomId: r.id, perNight: nights };
  });

  // GST across every room-night (per-night transaction value drives the 5%/18% band).
  const hasGstin = !!rooms[0].property.gstin;
  const tax = computeTax(
    perRoom.flatMap((pr) => pr.perNight.map((n) => ({ nightlyRatePaise: n.rate, nights: 1 }))),
    hasGstin,
  );

  const ref = generateBookingRef();
  // The phone is the guest's identity, so normalise it first — "+91-98765 43210" and
  // "9876543210" must resolve to the same record rather than creating a duplicate.
  const phone = normalizePhone(input.guest.phone);

  // "Do not book" guard (audit P2 #25): refuse a booking for a blacklisted guest.
  const existingGuest = await prisma.guest.findUnique({
    where: { ownerId_phone: { ownerId: input.ownerId, phone } },
    select: { blacklisted: true, name: true },
  });
  if (existingGuest?.blacklisted) {
    throw new BookingValidationError(
      `${existingGuest.name} is marked "do not book". Remove the flag on their guest profile to proceed.`,
    );
  }

  try {
    const booking = await prisma.$transaction(
      async (tx) => {
        // 1. Upsert the guest (unique per owner+phone).
        const guest = await tx.guest.upsert({
          where: { ownerId_phone: { ownerId: input.ownerId, phone } },
          update: {
            name: input.guest.name,
            email: input.guest.email ?? undefined,
            isForeign: input.guest.isForeign ?? undefined,
            city: input.guest.city ?? undefined,
            state: input.guest.state ?? undefined,
          },
          create: {
            ownerId: input.ownerId,
            name: input.guest.name,
            phone,
            email: input.guest.email ?? null,
            isForeign: input.guest.isForeign ?? false,
            city: input.guest.city ?? null,
            state: input.guest.state ?? null,
          },
        });

        // 2. The Booking row.
        const created = await tx.booking.create({
          data: {
            ref,
            propertyId: input.propertyId,
            channelId: channel.id,
            status: input.status ?? "CONFIRMED",
            checkIn,
            checkOut,
            adults: input.adults ?? 1,
            children: input.children ?? 0,
            subtotal: tax.subtotalPaise,
            taxAmount: tax.taxAmountPaise,
            totalAmount: tax.totalPaise,
            notes: input.notes ?? null,
            createdViaMcp: input.createdViaMcp ?? false,
            createdById: input.createdById ?? null,
            guests: { create: { guestId: guest.id, isPrimary: true } },
          },
        });

        // 3. One BookingRoom row per (room, night) — the conflict-prevention insert.
        await tx.bookingRoom.createMany({
          data: perRoom.flatMap((pr) =>
            pr.perNight.map((n) => ({
              bookingId: created.id,
              roomId: pr.roomId,
              date: n.date,
              rateApplied: n.rate,
            })),
          ),
        });

        return created;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );

    await writeAudit({
      ownerId: input.ownerId,
      actorType: input.actorType ?? (input.createdViaMcp ? "MCP" : "USER"),
      actorId: input.createdById ?? null,
      actorName: input.actorName ?? (input.createdViaMcp ? "Claude (AI)" : "Staff"),
      action: "BOOKING_CREATED",
      entityType: "Booking",
      entityId: booking.id,
      summary: `created booking ${booking.ref} for ${input.guest.name}`,
    });

    // Fire the guest's booking notification (best-effort; no-op when no templates exist).
    await enqueueNotification({
      ownerId: input.ownerId,
      triggerKey: booking.status === "TENTATIVE" ? "BOOKING_TENTATIVE" : "BOOKING_CONFIRMED",
      to: phone,
      email: input.guest.email ?? null,
      bookingId: booking.id,
      scope: bookingScope(booking, { name: input.guest.name }, rooms[0].property),
    }).catch(() => {});

    return booking;
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      throw new DoubleBookingError();
    }
    throw e;
  }
}

export interface MoveBookingInput {
  bookingId: string;
  ownerId: string;
  roomId?: string;
  checkIn?: string | Date;
  checkOut?: string | Date;
  actorName: string;
  actorType?: "USER" | "MCP";
}

/**
 * Move a booking to a different room and/or different dates. Recomputes nights, rates
 * and GST, and re-runs the double-booking guarantee: the old BookingRoom rows are
 * dropped and new ones inserted inside one Serializable transaction, so the
 * (roomId, date) unique constraint rejects any clash with *other* bookings.
 */
export async function moveBooking(input: MoveBookingInput) {
  const booking = await prisma.booking.findFirst({
    where: { id: input.bookingId, property: { ownerId: input.ownerId } },
    include: { rooms: true },
  });
  if (!booking) throw new BookingValidationError("Booking not found.");
  if (booking.status === "CANCELLED" || booking.status === "CHECKED_OUT") {
    throw new BookingValidationError("This booking can no longer be moved.");
  }

  const roomId = input.roomId ?? booking.rooms[0]?.roomId;
  if (!roomId) throw new BookingValidationError("Booking has no room to move.");
  const checkIn = utcMidnight(input.checkIn ?? booking.checkIn);
  const checkOut = utcMidnight(input.checkOut ?? booking.checkOut);
  if (nightsBetween(checkIn, checkOut) < 1) {
    throw new BookingValidationError("Check-out must be after check-in.");
  }

  const room = await prisma.room.findFirst({
    where: { id: roomId, propertyId: booking.propertyId },
    include: { roomType: true, property: true },
  });
  if (!room) throw new BookingValidationError("Room not found for this property.");

  const nightDates = eachNight(checkIn, checkOut);
  const plans = await loadRatePlans(booking.propertyId);
  const perNight = quoteStay(nightDates, room.roomTypeId, room.roomType.baseRate, plans).perNight;
  const tax = computeTax(
    perNight.map((n) => ({ nightlyRatePaise: n.rate, nights: 1 })),
    !!room.property.gstin,
  );

  try {
    const updated = await prisma.$transaction(
      async (tx) => {
        await tx.bookingRoom.deleteMany({ where: { bookingId: booking.id } });
        await tx.bookingRoom.createMany({
          data: perNight.map((n) => ({
            bookingId: booking.id,
            roomId,
            date: n.date,
            rateApplied: n.rate,
          })),
        });
        return tx.booking.update({
          where: { id: booking.id },
          data: {
            checkIn,
            checkOut,
            subtotal: tax.subtotalPaise,
            taxAmount: tax.taxAmountPaise,
            totalAmount: tax.totalPaise,
          },
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );

    await writeAudit({
      ownerId: input.ownerId,
      actorType: input.actorType ?? "USER",
      actorName: input.actorName,
      action: "BOOKING_MOVED",
      entityType: "Booking",
      entityId: booking.id,
      summary: `moved booking ${booking.ref} to ${room.name}`,
    });
    return updated;
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      throw new DoubleBookingError();
    }
    throw e;
  }
}

async function loadRatePlans(propertyId: string): Promise<RatePlanLike[]> {
  const plans = await prisma.ratePlan.findMany({
    where: { propertyId },
    include: { overrides: true },
  });
  return plans.map((p) => ({
    id: p.id,
    priority: p.priority,
    startDate: p.startDate,
    endDate: p.endDate,
    daysOfWeek: p.daysOfWeek,
    overrides: p.overrides.map((o) => ({ roomTypeId: o.roomTypeId, amount: o.amount })),
  }));
}

export async function checkInBooking(bookingId: string, ownerId: string, actorName: string) {
  const b = await prisma.booking.update({
    where: { id: bookingId },
    data: { status: "CHECKED_IN", checkedInAt: new Date() },
    include: { rooms: true },
  });
  // Mark occupied rooms as DIRTY-on-occupancy is owner's call; leave cleanliness.
  await writeAudit({
    ownerId,
    actorType: "USER",
    actorName,
    action: "CHECKED_IN",
    entityType: "Booking",
    entityId: bookingId,
    summary: `checked in booking ${b.ref}`,
  });
  return b;
}

export async function checkOutBooking(bookingId: string, ownerId: string, actorName: string) {
  const b = await prisma.booking.update({
    where: { id: bookingId },
    data: { status: "CHECKED_OUT", checkedOutAt: new Date() },
    include: {
      rooms: true,
      property: true,
      guests: { where: { isPrimary: true }, include: { guest: true } },
    },
  });
  // Free rooms get marked dirty for housekeeping.
  const roomIds = [...new Set(b.rooms.map((r) => r.roomId))];
  await prisma.room.updateMany({
    where: { id: { in: roomIds } },
    data: { cleanliness: "DIRTY" },
  });
  await writeAudit({
    ownerId,
    actorType: "USER",
    actorName,
    action: "CHECKED_OUT",
    entityType: "Booking",
    entityId: bookingId,
    summary: `checked out booking ${b.ref}`,
  });
  const g = b.guests[0]?.guest;
  if (g) {
    await enqueueNotification({
      ownerId,
      triggerKey: "POST_CHECKOUT_THANKS",
      to: g.phone,
      email: g.email,
      bookingId,
      scope: bookingScope(b, g, b.property),
    }).catch(() => {});
  }
  return b;
}

/**
 * Confirm a tentative hold without taking payment (audit P1 #7) — the "confirm, collect
 * later" path so staff don't have to fake a cash payment to firm up a room.
 */
export async function confirmBookingHold(bookingId: string, ownerId: string, actorName: string) {
  const existing = await prisma.booking.findUnique({ where: { id: bookingId } });
  if (!existing) throw new BookingValidationError("Booking not found.");
  if (existing.status !== "TENTATIVE") {
    throw new BookingValidationError("Only a tentative hold can be confirmed this way.");
  }
  const b = await prisma.booking.update({
    where: { id: bookingId },
    data: { status: "CONFIRMED" },
    include: {
      property: true,
      guests: { where: { isPrimary: true }, include: { guest: true } },
    },
  });
  await writeAudit({
    ownerId,
    actorType: "USER",
    actorName,
    action: "BOOKING_CONFIRMED",
    entityType: "Booking",
    entityId: bookingId,
    summary: `confirmed booking ${b.ref} (collect payment later)`,
  });
  const g = b.guests[0]?.guest;
  if (g) {
    await enqueueNotification({
      ownerId,
      triggerKey: "BOOKING_CONFIRMED",
      to: g.phone,
      email: g.email,
      bookingId,
      scope: bookingScope(b, g, b.property),
    }).catch(() => {});
  }
  return b;
}

/**
 * Record a no-show (audit P1 #6): the guest never arrived. Keeps the booking history
 * but the NO_SHOW status excludes it from occupancy/revenue. Only valid before check-in.
 */
export async function markNoShow(bookingId: string, ownerId: string, actorName: string) {
  const existing = await prisma.booking.findUnique({ where: { id: bookingId } });
  if (!existing) throw new BookingValidationError("Booking not found.");
  if (!["TENTATIVE", "CONFIRMED"].includes(existing.status)) {
    throw new BookingValidationError("Only an upcoming booking can be marked no-show.");
  }
  const b = await prisma.$transaction(async (tx) => {
    const updated = await tx.booking.update({
      where: { id: bookingId },
      data: { status: "NO_SHOW" },
      include: {
        property: true,
        guests: { where: { isPrimary: true }, include: { guest: true } },
      },
    });
    // Free the room nights so the dates are bookable again.
    await tx.bookingRoom.deleteMany({ where: { bookingId } });
    return updated;
  });
  await writeAudit({
    ownerId,
    actorType: "USER",
    actorName,
    action: "BOOKING_NO_SHOW",
    entityType: "Booking",
    entityId: bookingId,
    summary: `marked booking ${b.ref} as no-show`,
  });
  const g = b.guests[0]?.guest;
  if (g) {
    await enqueueNotification({
      ownerId,
      triggerKey: "NO_SHOW",
      to: g.phone,
      email: g.email,
      bookingId,
      scope: bookingScope(b, g, b.property),
    }).catch(() => {});
  }
  return b;
}

export async function cancelBooking(
  bookingId: string,
  ownerId: string,
  reason: string,
  actorName: string,
) {
  const b = await prisma.$transaction(async (tx) => {
    const updated = await tx.booking.update({
      where: { id: bookingId },
      data: { status: "CANCELLED", cancelledAt: new Date(), cancellationReason: reason },
      include: {
        property: true,
        guests: { where: { isPrimary: true }, include: { guest: true } },
      },
    });
    // Releasing the nights frees the room for rebooking.
    await tx.bookingRoom.deleteMany({ where: { bookingId } });
    return updated;
  });
  await writeAudit({
    ownerId,
    actorType: "USER",
    actorName,
    action: "BOOKING_CANCELLED",
    entityType: "Booking",
    entityId: bookingId,
    summary: `cancelled booking ${b.ref} (${reason})`,
  });
  const g = b.guests[0]?.guest;
  if (g) {
    await enqueueNotification({
      ownerId,
      triggerKey: "CANCELLED",
      to: g.phone,
      email: g.email,
      bookingId,
      scope: bookingScope(b, g, b.property),
    }).catch(() => {});
  }
  return b;
}
