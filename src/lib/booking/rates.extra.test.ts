import { describe, it, expect } from "vitest";
import { rateForNight, type RatePlanLike } from "./rates";
import { parseYmd } from "../dates";

const plan: RatePlanLike = {
  id: "p",
  priority: 10,
  startDate: parseYmd("2026-11-01"),
  endDate: parseYmd("2026-11-10"),
  daysOfWeek: "1111111",
  overrides: [{ roomTypeId: "deluxe", amount: 8500_00 }],
};

describe("rateForNight date-window boundaries", () => {
  it("ignores a plan before its start date", () => {
    expect(rateForNight(parseYmd("2026-10-31"), "deluxe", 6300_00, [plan])).toBe(6300_00);
  });
  it("ignores a plan on/after its end date (exclusive)", () => {
    expect(rateForNight(parseYmd("2026-11-10"), "deluxe", 6300_00, [plan])).toBe(6300_00);
    expect(rateForNight(parseYmd("2026-11-20"), "deluxe", 6300_00, [plan])).toBe(6300_00);
  });
});
