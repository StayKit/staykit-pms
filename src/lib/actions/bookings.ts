"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireContext } from "../auth/context";
import { assertAccess } from "../rbac/policy";
import {
  createBooking,
  checkInBooking,
  checkOutBooking,
  cancelBooking,
  DoubleBookingError,
  BookingValidationError,
} from "../booking/engine";
import { createPaymentLinkForBooking, applyPayment } from "../payments/service";
import { prisma } from "../db";
import { toPaise } from "../money";

export interface ActionResult {
  ok: boolean;
  message?: string;
  ref?: string;
  bookingId?: string;
}

const createSchema = z.object({
  propertyId: z.string().min(1),
  roomId: z.string().min(1),
  channelKey: z.string().min(1),
  guestName: z.string().min(1, "Guest name is required"),
  guestPhone: z.string().min(5, "A valid mobile number is required"),
  guestEmail: z.string().email().optional().or(z.literal("")),
  checkIn: z.string().min(1),
  checkOut: z.string().min(1),
  adults: z.coerce.number().int().min(1).default(2),
  children: z.coerce.number().int().min(0).default(0),
  isForeign: z.boolean().optional().default(false),
  nightlyRateRupees: z.coerce.number().optional(),
  payment: z.enum(["link", "paid", "later"]).default("link"),
  notes: z.string().optional(),
});

export async function createBookingAction(
  input: z.input<typeof createSchema>,
): Promise<ActionResult> {
  try {
    const data = createSchema.parse(input);
    const ctx = await requireContext();
    assertAccess(ctx, "bookings:write", { propertyId: data.propertyId });

    const booking = await createBooking({
      ownerId: ctx.ownerId,
      propertyId: data.propertyId,
      roomId: data.roomId,
      channelKey: data.channelKey,
      checkIn: data.checkIn,
      checkOut: data.checkOut,
      adults: data.adults,
      children: data.children,
      nightlyRatePaise: data.nightlyRateRupees ? toPaise(data.nightlyRateRupees) : undefined,
      guest: {
        name: data.guestName,
        phone: data.guestPhone,
        email: data.guestEmail || null,
        isForeign: data.isForeign,
      },
      notes: data.notes || null,
      createdById: ctx.userId,
      actorName: ctx.name,
    });

    if (data.payment === "paid") {
      await applyPayment(booking.id, booking.totalAmount, { method: "cash" });
    } else if (data.payment === "link") {
      await createPaymentLinkForBooking(booking.id, { actorName: ctx.name }).catch(() => {});
    }

    revalidatePath("/dashboard");
    revalidatePath("/calendar");
    revalidatePath("/bookings");
    return { ok: true, ref: booking.ref, bookingId: booking.id };
  } catch (e) {
    if (e instanceof DoubleBookingError) {
      return { ok: false, message: "That room is already booked for one or more of those nights." };
    }
    if (e instanceof BookingValidationError) return { ok: false, message: e.message };
    if (e instanceof z.ZodError) return { ok: false, message: e.errors[0].message };
    console.error(e);
    return { ok: false, message: "Something went wrong creating the booking." };
  }
}

export async function checkInAction(bookingId: string): Promise<ActionResult> {
  const ctx = await requireContext();
  const b = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: { property: true },
  });
  if (!b) return { ok: false, message: "Booking not found" };
  assertAccess(ctx, "bookings:write", { propertyId: b.propertyId });
  await checkInBooking(bookingId, ctx.ownerId, ctx.name);
  revalidatePath(`/bookings/${bookingId}`);
  revalidatePath("/dashboard");
  return { ok: true };
}

export async function checkOutAction(bookingId: string): Promise<ActionResult> {
  const ctx = await requireContext();
  const b = await prisma.booking.findUnique({ where: { id: bookingId } });
  if (!b) return { ok: false, message: "Booking not found" };
  assertAccess(ctx, "bookings:write", { propertyId: b.propertyId });
  await checkOutBooking(bookingId, ctx.ownerId, ctx.name);
  revalidatePath(`/bookings/${bookingId}`);
  revalidatePath("/dashboard");
  return { ok: true };
}

export async function cancelAction(bookingId: string, reason: string): Promise<ActionResult> {
  const ctx = await requireContext();
  const b = await prisma.booking.findUnique({ where: { id: bookingId } });
  if (!b) return { ok: false, message: "Booking not found" };
  assertAccess(ctx, "bookings:cancel", { propertyId: b.propertyId });
  await cancelBooking(bookingId, ctx.ownerId, reason, ctx.name);
  revalidatePath(`/bookings/${bookingId}`);
  revalidatePath("/calendar");
  return { ok: true };
}

export async function sendPaymentLinkAction(bookingId: string): Promise<ActionResult> {
  const ctx = await requireContext();
  const b = await prisma.booking.findUnique({ where: { id: bookingId } });
  if (!b) return { ok: false, message: "Booking not found" };
  assertAccess(ctx, "payments:read", { propertyId: b.propertyId });
  try {
    const { shortUrl, mock } = await createPaymentLinkForBooking(bookingId, {
      actorName: ctx.name,
    });
    revalidatePath(`/bookings/${bookingId}`);
    return {
      ok: true,
      message: mock ? `Demo link created: ${shortUrl}` : `Link sent: ${shortUrl}`,
    };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Could not create link" };
  }
}

export async function markPaidAction(bookingId: string): Promise<ActionResult> {
  const ctx = await requireContext();
  const b = await prisma.booking.findUnique({ where: { id: bookingId } });
  if (!b) return { ok: false, message: "Booking not found" };
  assertAccess(ctx, "payments:read", { propertyId: b.propertyId });
  const due = b.totalAmount - b.amountPaid;
  if (due > 0) await applyPayment(bookingId, due, { method: "cash" });
  revalidatePath(`/bookings/${bookingId}`);
  return { ok: true };
}
