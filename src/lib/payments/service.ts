/**
 * Payment links & reconciliation glue between the booking domain and Razorpay.
 */
import { prisma } from "../db";
import { APP } from "../config";
import { writeAudit } from "../audit";
import { createPaymentLink } from "./razorpay/client";

export async function createPaymentLinkForBooking(
  bookingId: string,
  opts: { amountPaise?: number; notifyVia?: string; actorName?: string; actorType?: "USER" | "MCP" } = {},
) {
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: { property: true, guests: { include: { guest: true }, where: { isPrimary: true } } },
  });
  if (!booking) throw new Error("Booking not found");

  const primary = booking.guests[0]?.guest;
  if (!primary) throw new Error("Booking has no primary guest");

  const amount = opts.amountPaise ?? booking.totalAmount - booking.amountPaid;
  if (amount <= 0) throw new Error("Nothing left to collect on this booking.");

  const link = await createPaymentLink({
    amountPaise: amount,
    referenceId: booking.ref,
    bookingId: booking.id,
    customer: { name: primary.name, contact: primary.phone, email: primary.email },
    notify: {
      sms: (opts.notifyVia ?? "sms,email").includes("sms"),
      email: (opts.notifyVia ?? "sms,email").includes("email"),
    },
    callbackUrl: `${APP.baseUrl}/my/bookings/${booking.id}?paid=1`,
  });

  const row = await prisma.paymentLink.create({
    data: {
      bookingId: booking.id,
      razorpayLinkId: link.razorpayLinkId,
      shortUrl: link.shortUrl,
      amount,
      notifyVia: opts.notifyVia ?? "sms,email",
      expiresAt: link.expiresAt,
    },
  });

  await writeAudit({
    ownerId: booking.property.ownerId,
    actorType: opts.actorType ?? "USER",
    actorName: opts.actorName ?? "Staff",
    action: "PAYMENT_LINK_SENT",
    entityType: "Booking",
    entityId: booking.id,
    summary: `sent payment link to ${primary.name}`,
  });

  return { row, mock: link.mock, shortUrl: link.shortUrl };
}

/** Apply a captured payment (used by the webhook handler and the mock "mark paid"). */
export async function applyPayment(
  bookingId: string,
  amountPaise: number,
  meta: { razorpayPaymentId?: string; method?: string; paymentLinkId?: string } = {},
) {
  return prisma.$transaction(async (tx) => {
    const payment = await tx.payment.create({
      data: {
        bookingId,
        amount: amountPaise,
        status: "CAPTURED",
        capturedAt: new Date(),
        method: meta.method,
        razorpayPaymentId: meta.razorpayPaymentId,
        paymentLinkId: meta.paymentLinkId,
      },
    });
    const booking = await tx.booking.update({
      where: { id: bookingId },
      data: { amountPaid: { increment: amountPaise } },
    });
    if (meta.paymentLinkId) {
      const link = await tx.paymentLink.findUnique({ where: { id: meta.paymentLinkId } });
      if (link) {
        const fullyPaid = booking.amountPaid >= booking.totalAmount;
        await tx.paymentLink.update({
          where: { id: meta.paymentLinkId },
          data: { status: fullyPaid ? "PAID" : "PARTIALLY_PAID", paidAt: new Date() },
        });
      }
    }
    return payment;
  });
}
