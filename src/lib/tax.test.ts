import { describe, it, expect } from "vitest";
import { computeTax, gstRateForNightlyValue, splitInclusive } from "./tax";

describe("GST rate by per-night transaction value", () => {
  it("applies 5% at or below ₹7,500/night", () => {
    expect(gstRateForNightlyValue(6300_00)).toBe(0.05);
    expect(gstRateForNightlyValue(7500_00)).toBe(0.05); // boundary inclusive
  });
  it("applies 18% above ₹7,500/night", () => {
    expect(gstRateForNightlyValue(7500_01)).toBe(0.18);
    expect(gstRateForNightlyValue(9000_00)).toBe(0.18);
  });
});

describe("computeTax", () => {
  it("charges no GST when the owner has no GSTIN", () => {
    const r = computeTax([{ nightlyRatePaise: 6300_00, nights: 3 }], false);
    expect(r.taxAmountPaise).toBe(0);
    expect(r.totalPaise).toBe(18900_00);
    expect(r.gstApplicable).toBe(false);
  });

  it("computes 5% GST for a sub-threshold stay", () => {
    const r = computeTax([{ nightlyRatePaise: 6300_00, nights: 3 }], true);
    expect(r.subtotalPaise).toBe(18900_00);
    expect(r.taxAmountPaise).toBe(945_00); // 5% of 18,900
    expect(r.totalPaise).toBe(19845_00);
    expect(r.effectiveRate).toBeCloseTo(0.05, 5);
  });

  it("computes 18% GST above the threshold", () => {
    const r = computeTax([{ nightlyRatePaise: 9000_00, nights: 2 }], true);
    expect(r.subtotalPaise).toBe(18000_00);
    expect(r.taxAmountPaise).toBe(3240_00); // 18% of 18,000
  });

  it("blends rates across mixed lines using per-night value", () => {
    const r = computeTax(
      [
        { nightlyRatePaise: 6000_00, nights: 1 }, // 5%
        { nightlyRatePaise: 9000_00, nights: 1 }, // 18%
      ],
      true,
    );
    expect(r.taxAmountPaise).toBe(300_00 + 1620_00);
  });
});

describe("splitInclusive", () => {
  it("backs out base and tax from a GST-inclusive total", () => {
    const { basePaise, taxPaise, rate } = splitInclusive(19845_00, 6300_00, true);
    expect(rate).toBe(0.05);
    expect(basePaise).toBe(18900_00);
    expect(taxPaise).toBe(945_00);
  });
});
