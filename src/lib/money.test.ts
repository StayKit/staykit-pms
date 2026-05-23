import { describe, it, expect } from "vitest";
import { inr, toPaise, toRupees } from "./money";

describe("inr (Indian numbering)", () => {
  it("formats lakhs with the Indian grouping", () => {
    expect(inr(123456_00)).toBe("₹ 1,23,456");
  });
  it("omits the symbol when asked", () => {
    expect(inr(18900_00, false)).toBe("18,900");
  });
  it("shows paise only when present", () => {
    expect(inr(945_50)).toBe("₹ 945.50");
    expect(inr(945_00)).toBe("₹ 945");
  });
  it("renders negative amounts with a sign", () => {
    expect(inr(-50000_00)).toBe("₹ -50,000");
    expect(inr(-50000_00, false)).toBe("-50,000");
  });
});

describe("paise <-> rupees", () => {
  it("round-trips", () => {
    expect(toPaise(6300)).toBe(630000);
    expect(toRupees(630000)).toBe(6300);
  });
});
