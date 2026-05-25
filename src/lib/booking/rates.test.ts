import { describe, it, expect } from "vitest";
import { rateForNight, resolveNight, quoteStay, type RatePlanLike } from "./rates";
import { parseYmd, eachNight } from "../dates";

const base = 6300_00;

const diwali: RatePlanLike = {
  id: "p1",
  name: "Diwali peak",
  priority: 10,
  startDate: parseYmd("2026-11-01"),
  endDate: parseYmd("2026-11-10"),
  daysOfWeek: "1111111",
  overrides: [{ roomTypeId: "deluxe", amount: 8500_00 }],
};

const weekendOnly: RatePlanLike = {
  id: "p2",
  priority: 5,
  startDate: parseYmd("2026-01-01"),
  endDate: parseYmd("2027-01-01"),
  daysOfWeek: "0000011", // Sat+Sun
  overrides: [{ roomTypeId: "deluxe", amount: 7000_00 }],
};

describe("rateForNight", () => {
  it("falls back to base rate when no plan matches", () => {
    expect(rateForNight(parseYmd("2026-03-03"), "deluxe", base, [])).toBe(base);
  });

  it("applies the highest-priority matching plan", () => {
    // 2026-11-05 is inside Diwali (priority 10) → 8500
    expect(rateForNight(parseYmd("2026-11-05"), "deluxe", base, [diwali, weekendOnly])).toBe(
      8500_00,
    );
  });

  it("respects day-of-week applicability", () => {
    // 2026-06-06 is a Saturday → weekend plan applies (7000); a Tuesday does not.
    expect(rateForNight(parseYmd("2026-06-06"), "deluxe", base, [weekendOnly])).toBe(7000_00);
    expect(rateForNight(parseYmd("2026-06-09"), "deluxe", base, [weekendOnly])).toBe(base); // Tue
  });

  it("ignores plans that don't override the requested room type", () => {
    expect(rateForNight(parseYmd("2026-11-05"), "suite", base, [diwali])).toBe(base);
  });
});

describe("resolveNight", () => {
  it("returns the applied plan's id and name", () => {
    const r = resolveNight(parseYmd("2026-11-05"), "deluxe", base, [diwali]);
    expect(r).toEqual({ rate: 8500_00, planId: "p1", planName: "Diwali peak" });
  });

  it("returns null plan info when falling back to the base rate", () => {
    const r = resolveNight(parseYmd("2026-03-03"), "deluxe", base, [diwali]);
    expect(r).toEqual({ rate: base, planId: null, planName: null });
  });
});

describe("quoteStay", () => {
  it("sums nightly rates across a stay", () => {
    const nights = eachNight(parseYmd("2026-03-01"), parseYmd("2026-03-04")); // 3 nights
    const q = quoteStay(nights, "deluxe", base, []);
    expect(q.perNight).toHaveLength(3);
    expect(q.subtotal).toBe(base * 3);
  });

  it("surfaces the plan name on nights a plan applies", () => {
    const nights = eachNight(parseYmd("2026-11-04"), parseYmd("2026-11-06")); // 2 nights in Diwali
    const q = quoteStay(nights, "deluxe", base, [diwali]);
    expect(q.perNight.every((n) => n.planName === "Diwali peak")).toBe(true);
  });
});
