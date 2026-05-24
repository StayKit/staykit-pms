/**
 * Cancellation & refund policy (J5). There is no structured per-property policy model
 * in v1 — `Property.cancellationPolicy` is free text — so this is the built-in default
 * the UI applies and explains. Owners can always override the computed amount.
 *
 *   Guest cancellation  → tiered by lead time before check-in:
 *                           ≥ 7 days  → 100% refund
 *                           3–6 days  →  50% refund
 *                           < 3 days  →   0% refund
 *   No-show             → 0% refund
 *   Owner cancellation  → 100% refund (the guest isn't at fault)
 *   Force majeure       → 100% refund
 */
import { utcMidnight } from "../dates";

export type CancellationReason =
  | "Guest cancellation"
  | "No-show"
  | "Owner cancellation"
  | "Force majeure";

export const CANCELLATION_REASONS: CancellationReason[] = [
  "Guest cancellation",
  "No-show",
  "Owner cancellation",
  "Force majeure",
];

export interface RefundQuote {
  refundablePaise: number;
  retainedPaise: number;
  pct: number;
  leadDays: number;
  reason: CancellationReason;
  explanation: string;
}

/** Whole days between `now` and `checkIn` (negative once the stay has started). */
export function leadDaysUntil(checkIn: Date, now = new Date()): number {
  const ms = utcMidnight(checkIn).getTime() - utcMidnight(now).getTime();
  return Math.floor(ms / 86_400_000);
}

export function refundPctFor(reason: CancellationReason, leadDays: number): number {
  switch (reason) {
    case "Owner cancellation":
    case "Force majeure":
      return 100;
    case "No-show":
      return 0;
    case "Guest cancellation":
      if (leadDays >= 7) return 100;
      if (leadDays >= 3) return 50;
      return 0;
  }
}

export function quoteRefund(input: {
  amountPaidPaise: number;
  checkIn: Date;
  reason: CancellationReason;
  now?: Date;
}): RefundQuote {
  const leadDays = leadDaysUntil(input.checkIn, input.now);
  const pct = refundPctFor(input.reason, leadDays);
  const refundablePaise = Math.round((input.amountPaidPaise * pct) / 100);
  const retainedPaise = input.amountPaidPaise - refundablePaise;

  let explanation: string;
  if (input.amountPaidPaise <= 0) {
    explanation = "Nothing was paid, so there is nothing to refund.";
  } else if (pct === 100) {
    explanation =
      input.reason === "Guest cancellation"
        ? `Cancelled ${leadDays} days ahead — full refund.`
        : `${input.reason} — full refund.`;
  } else if (pct === 0) {
    explanation =
      input.reason === "No-show"
        ? "No-show — no refund."
        : `Cancelled ${leadDays} day${leadDays === 1 ? "" : "s"} ahead — no refund.`;
  } else {
    explanation = `Cancelled ${leadDays} days ahead — ${pct}% refund.`;
  }

  return { refundablePaise, retainedPaise, pct, leadDays, reason: input.reason, explanation };
}
