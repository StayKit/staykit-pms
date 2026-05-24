"use server";

import { revalidatePath } from "next/cache";
import { requireContext } from "../auth/context";
import { assertAccess } from "../rbac/policy";
import { prisma } from "../db";
import { toPaise } from "../money";
import { inr } from "../money";
import { createRefund, RefundError } from "../payments/service";
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
