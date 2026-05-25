import { describe, it, expect } from "vitest";
import { normalizePhone } from "./phone";

describe("normalizePhone", () => {
  it("treats Indian variants of the same number as one identity", () => {
    const canonical = "+919876543210";
    expect(normalizePhone("+91-9876543210")).toBe(canonical);
    expect(normalizePhone("+91 98765 43210")).toBe(canonical);
    expect(normalizePhone("9876543210")).toBe(canonical);
    expect(normalizePhone("098765 43210")).toBe(canonical);
    expect(normalizePhone("(+91) 98765-43210")).toBe(canonical);
    expect(normalizePhone("919876543210")).toBe(canonical);
  });

  it("preserves an explicit non-Indian country code", () => {
    expect(normalizePhone("+1 (415) 555-2671")).toBe("+14155552671");
    expect(normalizePhone("+44 20 7946 0958")).toBe("+442079460958");
  });

  it("returns an empty string for blank input", () => {
    expect(normalizePhone("")).toBe("");
    expect(normalizePhone(null)).toBe("");
    expect(normalizePhone(undefined)).toBe("");
  });
});
