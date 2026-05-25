"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "../db";
import { getGuestSession } from "../auth/session";
import { writeAudit } from "../audit";
import { type ActionResult, ok, fail, failFrom } from "./result";

/**
 * Load a booking that belongs to the signed-in guest (matched by their phone session).
 * Returns null if there's no session or the booking isn't theirs — the caller fails closed.
 */
async function guestBooking(bookingId: string) {
  const session = await getGuestSession();
  if (!session) return null;
  const booking = await prisma.booking.findFirst({
    where: { id: bookingId, guests: { some: { guest: { phone: session.phone } } } },
    include: {
      property: true,
      guests: { where: { isPrimary: true }, include: { guest: true } },
    },
  });
  if (!booking) return null;
  return { session, booking };
}

const updateSchema = z.object({
  email: z.string().email("Enter a valid email").optional().or(z.literal("")),
  arrivalTime: z.string().max(120).optional().or(z.literal("")),
  requests: z.string().max(1000).optional().or(z.literal("")),
});

/** Guest self-service: update their email, expected arrival time and special requests. */
export async function updateMyBookingAction(
  bookingId: string,
  input: z.input<typeof updateSchema>,
): Promise<ActionResult> {
  try {
    const data = updateSchema.parse(input);
    const ctx = await guestBooking(bookingId);
    if (!ctx) return fail("We couldn't find that booking.");
    const guest = ctx.booking.guests[0]?.guest;

    await prisma.$transaction([
      prisma.booking.update({
        where: { id: bookingId },
        data: {
          arrivalTime: data.arrivalTime?.trim() || null,
          guestRequests: data.requests?.trim() || null,
        },
      }),
      ...(guest && data.email !== undefined
        ? [
            prisma.guest.update({
              where: { id: guest.id },
              data: { email: data.email.trim() || null },
            }),
          ]
        : []),
    ]);

    await writeAudit({
      ownerId: ctx.booking.property.ownerId,
      actorType: "GUEST",
      actorName: guest?.name ?? "Guest",
      action: "GUEST_UPDATED_BOOKING",
      entityType: "Booking",
      entityId: bookingId,
      summary: "guest updated their details (email / arrival / requests)",
    });

    revalidatePath(`/my/bookings/${bookingId}`);
    revalidatePath(`/bookings/${bookingId}`);
    return ok(undefined, "Saved — thank you!");
  } catch (e) {
    if (e instanceof z.ZodError) return fail(e.errors[0].message);
    return failFrom(e, "Could not save your details.");
  }
}

/**
 * Guest requests a cancellation. This does NOT cancel the booking — it flags the request
 * so staff can apply the cancellation policy and process any refund. Notifies the owner.
 */
export async function requestCancellationAction(
  bookingId: string,
  reason: string,
): Promise<ActionResult> {
  try {
    const ctx = await guestBooking(bookingId);
    if (!ctx) return fail("We couldn't find that booking.");
    if (ctx.booking.status === "CANCELLED") return fail("This booking is already cancelled.");
    if (ctx.booking.cancelRequestedAt)
      return ok(undefined, "You've already asked to cancel — the host will be in touch.");

    const guest = ctx.booking.guests[0]?.guest;
    await prisma.booking.update({
      where: { id: bookingId },
      data: { cancelRequestedAt: new Date(), cancelRequestReason: reason.trim() || null },
    });
    await writeAudit({
      ownerId: ctx.booking.property.ownerId,
      actorType: "GUEST",
      actorName: guest?.name ?? "Guest",
      action: "GUEST_REQUESTED_CANCEL",
      entityType: "Booking",
      entityId: bookingId,
      summary: `guest requested cancellation${reason.trim() ? ` (${reason.trim()})` : ""}`,
    });

    revalidatePath(`/my/bookings/${bookingId}`);
    revalidatePath(`/bookings/${bookingId}`);
    return ok(undefined, "Cancellation requested — the host will contact you to confirm.");
  } catch (e) {
    return failFrom(e, "Could not send your request.");
  }
}
