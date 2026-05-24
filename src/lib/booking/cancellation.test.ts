import { describe, it, expect } from "vitest";
import { quoteRefund, refundPctFor, leadDaysUntil, CANCELLATION_REASONS } from "./cancellation";
import { addDays, today } from "../dates";

describe("leadDaysUntil", () => {
  it("counts whole days to check-in and goes negative once started", () => {
    expect(leadDaysUntil(addDays(today(), 5), today())).toBe(5);
    expect(leadDaysUntil(addDays(today(), -2), today())).toBe(-2);
  });
});

describe("refundPctFor", () => {
  it("tiers guest cancellations by lead time", () => {
    expect(refundPctFor("Guest cancellation", 10)).toBe(100);
    expect(refundPctFor("Guest cancellation", 4)).toBe(50);
    expect(refundPctFor("Guest cancellation", 1)).toBe(0);
  });
  it("is full for owner/force-majeure and zero for no-show", () => {
    expect(refundPctFor("Owner cancellation", 0)).toBe(100);
    expect(refundPctFor("Force majeure", 0)).toBe(100);
    expect(refundPctFor("No-show", 30)).toBe(0);
  });
});

describe("quoteRefund", () => {
  const base = { amountPaidPaise: 10_000_00, now: today() };

  it("refunds the full amount 7+ days out", () => {
    const q = quoteRefund({ ...base, checkIn: addDays(today(), 10), reason: "Guest cancellation" });
    expect(q.refundablePaise).toBe(10_000_00);
    expect(q.retainedPaise).toBe(0);
    expect(q.pct).toBe(100);
    expect(q.explanation).toMatch(/full refund/);
  });

  it("refunds half 3–6 days out", () => {
    const q = quoteRefund({ ...base, checkIn: addDays(today(), 4), reason: "Guest cancellation" });
    expect(q.refundablePaise).toBe(5_000_00);
    expect(q.retainedPaise).toBe(5_000_00);
    expect(q.explanation).toMatch(/50% refund/);
  });

  it("refunds nothing under 3 days out", () => {
    const q = quoteRefund({ ...base, checkIn: addDays(today(), 1), reason: "Guest cancellation" });
    expect(q.refundablePaise).toBe(0);
    expect(q.explanation).toMatch(/no refund/);
  });

  it("explains a no-show as no refund", () => {
    const q = quoteRefund({ ...base, checkIn: addDays(today(), 10), reason: "No-show" });
    expect(q.refundablePaise).toBe(0);
    expect(q.explanation).toMatch(/No-show/);
  });

  it("explains owner cancellation as full refund", () => {
    const q = quoteRefund({ ...base, checkIn: addDays(today(), 1), reason: "Owner cancellation" });
    expect(q.pct).toBe(100);
    expect(q.explanation).toMatch(/Owner cancellation/);
  });

  it("handles a booking with nothing paid", () => {
    const q = quoteRefund({
      amountPaidPaise: 0,
      checkIn: addDays(today(), 10),
      reason: "Guest cancellation",
    });
    expect(q.refundablePaise).toBe(0);
    expect(q.explanation).toMatch(/Nothing was paid/);
  });

  it("exposes the four canonical reasons", () => {
    expect(CANCELLATION_REASONS).toHaveLength(4);
  });
});
