import { describe, it, expect } from "vitest";
import { generateBookingRef } from "./ref";

describe("generateBookingRef", () => {
  it("produces SK- followed by 5 characters (e.g. SK-A8X3Q)", () => {
    expect(generateBookingRef()).toMatch(/^SK-[A-Z0-9]{5}$/);
  });

  it("never uses the ambiguous characters I, O, 0 or 1", () => {
    for (let i = 0; i < 500; i++) {
      const body = generateBookingRef().slice(3);
      expect(body).not.toMatch(/[IO01]/);
    }
  });

  it("is highly likely to be unique across calls", () => {
    const refs = new Set(Array.from({ length: 200 }, () => generateBookingRef()));
    // 200 draws from 32^5 ≈ 33.5M — collisions are vanishingly unlikely.
    expect(refs.size).toBeGreaterThan(195);
  });
});
