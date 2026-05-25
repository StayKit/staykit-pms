"use server";

import { revalidatePath } from "next/cache";
import { requireContext } from "../auth/context";
import { assertAccess } from "../rbac/policy";
import { prisma } from "../db";
import { toPaise } from "../money";
import { inr } from "../money";
import { createRefund, RefundError, markRefundProcessed } from "../payments/service";
import { initiateRefund } from "../payments/razorpay/client";
import { writeAudit } from "../audit";
import { quoteRefund, type CancellationReason } from "../booking/cancellation";

export interface RefundActionResult {
  ok: boolean;
  message?: string;
}

export interface RefundQuoteResult {
  ok: boolean;
  refundablePaise?: number;
  refundable?: string;
  explanation?: string;
  message?: string;
}

/** Preview the refundable amount under the default policy (read-only). */
export async function quoteRefundAction(
  bookingId: string,
  reason: CancellationReason,
): Promise<RefundQuoteResult> {
  const ctx = await requireContext();
  const b = await prisma.booking.findFirst({
    where: { id: bookingId, property: { ownerId: ctx.ownerId } },
  });
  if (!b) return { ok: false, message: "Booking not found" };
  assertAccess(ctx, "payments:read", { propertyId: b.propertyId });
  const q = quoteRefund({ amountPaidPaise: b.amountPaid, checkIn: b.checkIn, reason });
  return {
    ok: true,
    refundablePaise: q.refundablePaise,
    refundable: inr(q.refundablePaise),
    explanation: q.explanation,
  };
}

/**
 * Process a refund. When `amountRupees` is omitted the default policy quote for the
 * reason is used; the owner can override with an explicit amount.
 */
export async function refundAction(
  bookingId: string,
  input: { reason: CancellationReason; amountRupees?: number; speed?: "normal" | "optimum" },
): Promise<RefundActionResult> {
  const ctx = await requireContext();
  const b = await prisma.booking.findFirst({
    where: { id: bookingId, property: { ownerId: ctx.ownerId } },
  });
  if (!b) return { ok: false, message: "Booking not found" };
  assertAccess(ctx, "payments:refund", { propertyId: b.propertyId });

  const amountPaise =
    input.amountRupees != null
      ? toPaise(input.amountRupees)
      : quoteRefund({ amountPaidPaise: b.amountPaid, checkIn: b.checkIn, reason: input.reason })
          .refundablePaise;

  if (amountPaise <= 0) {
    return { ok: false, message: "Nothing is refundable under this policy." };
  }

  try {
    const { mock } = await createRefund(bookingId, {
      amountPaise,
      reason: input.reason,
      speed: input.speed,
      initiatedById: ctx.userId,
      actorName: ctx.name,
    });
    revalidatePath(`/bookings/${bookingId}`);
    revalidatePath("/reports/payments");
    return {
      ok: true,
      message: mock
        ? `Refund of ${inr(amountPaise)} processed (demo mode).`
        : `Refund of ${inr(amountPaise)} initiated — settles in 5–7 working days.`,
    };
  } catch (e) {
    if (e instanceof RefundError) return { ok: false, message: e.message };
    return { ok: false, message: "Could not process the refund." };
  }
}

/**
 * Retry a refund that Razorpay rejected (audit P0 #5). Re-initiates against the same
 * captured payment; in mock mode it settles immediately. The owner reaches this from
 * the failed-refund banner on the booking.
 */
export async function retryRefundAction(refundId: string): Promise<RefundActionResult> {
  const ctx = await requireContext();
  const refund = await prisma.refund.findFirst({
    where: { id: refundId, booking: { property: { ownerId: ctx.ownerId } } },
    include: { payment: true, booking: true },
  });
  if (!refund) return { ok: false, message: "Refund not found." };
  assertAccess(ctx, "payments:refund", { propertyId: refund.booking.propertyId });
  if (refund.status !== "FAILED") {
    return { ok: false, message: "Only a failed refund can be retried." };
  }
  try {
    const speed = (refund.speed as "normal" | "optimum") ?? "normal";
    let mock = true;
    let newId: string | null = null;
    if (refund.payment.razorpayPaymentId) {
      const r = await initiateRefund(refund.payment.razorpayPaymentId, refund.amount, speed);
      newId = r.razorpayRefundId;
      mock = r.mock;
    } else {
      newId = `rfnd_local_${Date.now().toString(36)}`;
    }
    await prisma.refund.update({
      where: { id: refundId },
      data: { status: "CREATED", razorpayRefundId: newId, reason: refund.reason },
    });
    await writeAudit({
      ownerId: ctx.ownerId,
      actorType: "USER",
      actorName: ctx.name,
      action: "REFUND_RETRIED",
      entityType: "Booking",
      entityId: refund.bookingId,
      summary: `retried refund of ${inr(refund.amount)}`,
    });
    if (mock) await markRefundProcessed(refundId);
    revalidatePath(`/bookings/${refund.bookingId}`);
    revalidatePath("/reports/payments");
    return {
      ok: true,
      message: mock
        ? `Refund of ${inr(refund.amount)} processed.`
        : `Refund of ${inr(refund.amount)} re-initiated — settles in 5–7 working days.`,
    };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Retry failed." };
  }
}

/**
 * Mark a failed refund as settled outside Razorpay (owner refunded by cash/UPI). This
 * decrements amountPaid like a normal settlement so the books reconcile (audit P0 #5).
 */
export async function settleRefundManuallyAction(refundId: string): Promise<RefundActionResult> {
  const ctx = await requireContext();
  const refund = await prisma.refund.findFirst({
    where: { id: refundId, booking: { property: { ownerId: ctx.ownerId } } },
    include: { booking: true },
  });
  if (!refund) return { ok: false, message: "Refund not found." };
  assertAccess(ctx, "payments:refund", { propertyId: refund.booking.propertyId });
  if (refund.status === "PROCESSED") return { ok: false, message: "Already settled." };
  await prisma.refund.update({
    where: { id: refundId },
    data: { status: "CREATED", reason: `${refund.reason ?? "refund"} (settled manually)` },
  });
  await markRefundProcessed(refundId);
  await writeAudit({
    ownerId: ctx.ownerId,
    actorType: "USER",
    actorName: ctx.name,
    action: "REFUND_SETTLED_MANUALLY",
    entityType: "Booking",
    entityId: refund.bookingId,
    summary: `marked refund of ${inr(refund.amount)} settled manually`,
  });
  revalidatePath(`/bookings/${refund.bookingId}`);
  revalidatePath("/reports/payments");
  return { ok: true, message: `Refund of ${inr(refund.amount)} marked settled.` };
}
