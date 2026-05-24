/**
 * Razorpay webhook. CRITICAL: read the RAW body (request.text()) and verify the
 * HMAC signature BEFORE parsing — pre-parsing breaks signature verification (§B.7).
 * Events are de-duplicated by x-razorpay-event-id; payment/refund application is
 * idempotent by razorpayPaymentId / razorpayRefundId.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { verifyWebhookSignature } from "@/lib/payments/razorpay/client";
import { applyPayment, markRefundProcessed, markRefundFailed } from "@/lib/payments/service";
import { writeAudit } from "@/lib/audit";
import { enqueueNotification } from "@/lib/notify/dispatch";

export const dynamic = "force-dynamic";

type Entity = Record<string, unknown>;
interface RzpEvent {
  event: string;
  payload?: Record<string, { entity?: Entity }>;
}

export async function POST(req: Request) {
  const raw = await req.text();
  const signature = req.headers.get("x-razorpay-signature") ?? "";
  const eventId = req.headers.get("x-razorpay-event-id") ?? "";

  if (!verifyWebhookSignature(raw, signature)) {
    return NextResponse.json({ error: "invalid signature" }, { status: 400 });
  }

  // Idempotency: drop duplicate deliveries.
  if (eventId) {
    const existing = await prisma.webhookEvent.findUnique({ where: { eventId } });
    if (existing) return NextResponse.json({ ok: true, duplicate: true });
    await prisma.webhookEvent.create({ data: { eventId, source: "razorpay", payload: raw } });
  }

  let event: RzpEvent;
  try {
    event = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }

  try {
    if (event.event === "payment_link.paid" || event.event === "payment.captured") {
      await handlePaymentCaptured(event);
    } else if (event.event === "refund.processed") {
      await handleRefund(event, "processed");
    } else if (event.event === "refund.failed") {
      await handleRefund(event, "failed");
    }
  } catch (e) {
    console.error("razorpay webhook handler error", e);
    // Still return 2xx so Razorpay doesn't retry a handler bug forever; the event
    // is stored in WebhookEvent for replay.
  }

  return NextResponse.json({ ok: true });
}

async function handlePaymentCaptured(event: RzpEvent) {
  const paymentEntity = event.payload?.payment?.entity;
  const linkEntity = event.payload?.payment_link?.entity;
  const notes = (paymentEntity?.notes ?? linkEntity?.notes) as Record<string, string> | undefined;
  const bookingId = notes?.bookingId;
  const razorpayPaymentId = paymentEntity?.id as string | undefined;
  const amount = Number(paymentEntity?.amount ?? linkEntity?.amount ?? 0);
  if (!bookingId || amount <= 0) return;

  // Idempotent: skip if we already recorded this payment id.
  const dup = razorpayPaymentId
    ? await prisma.payment.findUnique({ where: { razorpayPaymentId } })
    : null;
  if (dup) return;

  const link = await prisma.paymentLink.findFirst({
    where: { bookingId },
    orderBy: { createdAt: "desc" },
  });
  await applyPayment(bookingId, amount, {
    razorpayPaymentId,
    method: paymentEntity?.method as string | undefined,
    paymentLinkId: link?.id,
  });

  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: {
      property: true,
      guests: { where: { isPrimary: true }, include: { guest: true } },
    },
  });
  if (!booking) return;

  await writeAudit({
    ownerId: booking.property.ownerId,
    actorType: "SYSTEM",
    actorName: "System",
    action: "PAYMENT_CAPTURED",
    entityType: "Booking",
    entityId: bookingId,
    summary: `received ${(amount / 100).toLocaleString("en-IN")} for ${booking.ref}`,
  });

  const guest = booking.guests[0]?.guest;
  if (guest) {
    await enqueueNotification({
      ownerId: booking.property.ownerId,
      triggerKey: "PAYMENT_RECEIVED",
      to: guest.phone,
      bookingId,
      scope: { guest, booking, property: booking.property },
    }).catch(() => {});
  }
}

async function handleRefund(event: RzpEvent, outcome: "processed" | "failed") {
  const entity = event.payload?.refund?.entity;
  const razorpayRefundId = entity?.id as string | undefined;
  if (!razorpayRefundId) return;
  const refund = await prisma.refund.findUnique({ where: { razorpayRefundId } });
  if (!refund) return;
  if (outcome === "processed") {
    await markRefundProcessed(refund.id);
  } else {
    await markRefundFailed(refund.id, entity?.error_description as string | undefined);
  }
}
