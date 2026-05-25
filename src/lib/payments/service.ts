/**
 * Payment links & reconciliation glue between the booking domain and Razorpay.
 */
import { prisma } from "../db";
import { APP } from "../config";
import { writeAudit } from "../audit";
import { createPaymentLink, initiateRefund } from "./razorpay/client";
import { enqueueNotification } from "../notify/dispatch";

export async function createPaymentLinkForBooking(
  bookingId: string,
  opts: {
    amountPaise?: number;
    notifyVia?: string;
    actorName?: string;
    actorType?: "USER" | "MCP";
  } = {},
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
  const payment = await prisma.$transaction(async (tx) => {
    const created = await tx.payment.create({
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
    return created;
  });

  // Notify the guest a payment was received — covers cash, online and booking-time "paid"
  // (best-effort; no-op when no PAYMENT_RECEIVED template exists). Centralised here so the
  // cash-first path notifies too, not just the Razorpay webhook.
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: { property: true, guests: { where: { isPrimary: true }, include: { guest: true } } },
  });
  const guest = booking?.guests[0]?.guest;
  if (booking && guest) {
    await enqueueNotification({
      ownerId: booking.property.ownerId,
      triggerKey: "PAYMENT_RECEIVED",
      to: guest.phone,
      email: guest.email,
      bookingId,
      scope: {
        guest: { name: guest.name },
        booking: {
          ref: booking.ref,
          checkIn: booking.checkIn.toISOString(),
          checkOut: booking.checkOut.toISOString(),
        },
        property: { name: booking.property.name, checkInTime: booking.property.checkInTime },
        amount: { due: booking.totalAmount - booking.amountPaid, total: booking.totalAmount },
      },
    }).catch(() => {});
  }
  return payment;
}

export class RefundError extends Error {
  readonly code = "REFUND_INVALID";
  constructor(message: string) {
    super(message);
    this.name = "RefundError";
  }
}

/**
 * Initiate a refund against a booking's most recent captured payment. Calls Razorpay
 * when live keys are configured (status stays CREATED until the refund.processed
 * webhook arrives); in mock mode there is no webhook, so we settle it immediately.
 */
export async function createRefund(
  bookingId: string,
  opts: {
    amountPaise: number;
    reason?: string;
    speed?: "normal" | "optimum";
    initiatedById: string;
    actorName?: string;
    actorType?: "USER" | "MCP";
  },
) {
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: {
      property: true,
      payments: { where: { status: "CAPTURED" }, orderBy: { createdAt: "desc" } },
    },
  });
  if (!booking) throw new RefundError("Booking not found");
  if (opts.amountPaise <= 0) throw new RefundError("Refund amount must be positive.");
  if (opts.amountPaise > booking.amountPaid) {
    throw new RefundError("Refund exceeds the amount paid on this booking.");
  }
  const payment = booking.payments[0];
  if (!payment) throw new RefundError("No captured payment to refund.");

  const speed = opts.speed ?? "normal";
  let razorpayRefundId: string | null = null;
  let mock = true;
  if (payment.razorpayPaymentId) {
    const r = await initiateRefund(payment.razorpayPaymentId, opts.amountPaise, speed);
    razorpayRefundId = r.razorpayRefundId;
    mock = r.mock;
  } else {
    razorpayRefundId = `rfnd_local_${Date.now().toString(36)}`;
  }

  const refund = await prisma.refund.create({
    data: {
      bookingId,
      paymentId: payment.id,
      amount: opts.amountPaise,
      speed,
      reason: opts.reason,
      status: "CREATED",
      razorpayRefundId,
      initiatedById: opts.initiatedById,
    },
  });

  await writeAudit({
    ownerId: booking.property.ownerId,
    actorType: opts.actorType ?? "USER",
    actorName: opts.actorName ?? "Staff",
    action: "REFUND_INITIATED",
    entityType: "Booking",
    entityId: bookingId,
    summary: `initiated refund of ${(opts.amountPaise / 100).toLocaleString("en-IN")} (${opts.reason ?? "no reason"})`,
  });

  // No webhook will arrive in mock mode — settle now so the demo flow completes.
  if (mock) await markRefundProcessed(refund.id);

  // Re-read so the returned status reflects mock-mode settlement.
  const final = await prisma.refund.findUnique({ where: { id: refund.id } });
  return { refund: final ?? refund, mock };
}

/**
 * Settle a refund (called by the refund.processed webhook, or immediately in mock
 * mode). Decrements amountPaid, flips the payment to REFUNDED once fully refunded,
 * and notifies the guest. Idempotent: a second call is a no-op.
 */
export async function markRefundProcessed(refundId: string) {
  const refund = await prisma.refund.findUnique({
    where: { id: refundId },
    include: {
      booking: {
        include: {
          property: true,
          guests: { where: { isPrimary: true }, include: { guest: true } },
        },
      },
    },
  });
  if (!refund || refund.status === "PROCESSED") return refund;

  await prisma.$transaction(async (tx) => {
    await tx.refund.update({
      where: { id: refundId },
      data: { status: "PROCESSED", processedAt: new Date() },
    });
    await tx.booking.update({
      where: { id: refund.bookingId },
      data: { amountPaid: { decrement: refund.amount } },
    });
    const agg = await tx.refund.aggregate({
      where: { paymentId: refund.paymentId, status: "PROCESSED" },
      _sum: { amount: true },
    });
    const payment = await tx.payment.findUnique({ where: { id: refund.paymentId } });
    if (payment && (agg._sum.amount ?? 0) >= payment.amount) {
      await tx.payment.update({ where: { id: payment.id }, data: { status: "REFUNDED" } });
    }
  });

  await writeAudit({
    ownerId: refund.booking.property.ownerId,
    actorType: "SYSTEM",
    actorName: "System",
    action: "REFUND_PROCESSED",
    entityType: "Booking",
    entityId: refund.bookingId,
    summary: `refund of ${(refund.amount / 100).toLocaleString("en-IN")} processed`,
  });

  const guest = refund.booking.guests[0]?.guest;
  if (guest) {
    await enqueueNotification({
      ownerId: refund.booking.property.ownerId,
      triggerKey: "REFUND_PROCESSED",
      to: guest.phone,
      bookingId: refund.bookingId,
      scope: { guest, booking: refund.booking, property: refund.booking.property, refund },
    }).catch(() => {});
  }
  return refund;
}

/** Mark a refund failed (refund.failed webhook). Does not touch amountPaid. */
export async function markRefundFailed(refundId: string, reason?: string) {
  const refund = await prisma.refund.findUnique({ where: { id: refundId } });
  if (!refund || refund.status !== "CREATED") return refund;
  return prisma.refund.update({
    where: { id: refundId },
    data: { status: "FAILED", reason: reason ?? refund.reason },
  });
}
