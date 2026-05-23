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
  roomId: string;
  channelKey: string;
  checkIn: string | Date;
  checkOut: string | Date;
  guest: { name: string; phone: string; email?: string | null; isForeign?: boolean };
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

  const room = await prisma.room.findFirst({
    where: { id: input.roomId, propertyId: input.propertyId },
    include: { roomType: true, property: true },
  });
  if (!room) throw new BookingValidationError("Room not found for this property.");

  const channel = await prisma.channelSource.findFirst({
    where: { ownerId: input.ownerId, key: input.channelKey },
  });
  if (!channel) throw new BookingValidationError(`Unknown channel "${input.channelKey}".`);

  // Resolve nightly rates.
  const nightDates = eachNight(checkIn, checkOut);
  let perNight: { date: Date; rate: number }[];
  if (input.nightlyRatePaise != null) {
    perNight = nightDates.map((date) => ({ date, rate: input.nightlyRatePaise! }));
  } else {
    const plans = await loadRatePlans(input.propertyId);
    perNight = quoteStay(nightDates, room.roomTypeId, room.roomType.baseRate, plans).perNight;
  }

  // GST per the room type's per-night transaction value.
  const hasGstin = !!room.property.gstin;
  const tax = computeTax(
    perNight.map((n) => ({ nightlyRatePaise: n.rate, nights: 1 })),
    hasGstin,
  );

  const ref = generateBookingRef();

  try {
    const booking = await prisma.$transaction(
      async (tx) => {
        // 1. Upsert the guest (unique per owner+phone).
        const guest = await tx.guest.upsert({
          where: { ownerId_phone: { ownerId: input.ownerId, phone: input.guest.phone } },
          update: {
            name: input.guest.name,
            email: input.guest.email ?? undefined,
            isForeign: input.guest.isForeign ?? undefined,
          },
          create: {
            ownerId: input.ownerId,
            name: input.guest.name,
            phone: input.guest.phone,
            email: input.guest.email ?? null,
            isForeign: input.guest.isForeign ?? false,
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

        // 3. One BookingRoom row per night — the conflict-prevention insert.
        await tx.bookingRoom.createMany({
          data: perNight.map((n) => ({
            bookingId: created.id,
            roomId: input.roomId,
            date: n.date,
            rateApplied: n.rate,
          })),
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

    return booking;
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
    include: { rooms: true },
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
  return b;
}
