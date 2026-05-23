import { describe, it, expect } from "vitest";
import { renderTemplate } from "./template";

describe("renderTemplate", () => {
  const scope = {
    guest: { name: "Sameer" },
    booking: { ref: "SK-CO2403", checkIn: "2026-06-12" },
    property: { name: "Coorg Coffee Cottage" },
    amount: { due: 945000 },
  };

  it("substitutes nested variables", () => {
    expect(renderTemplate("Hi {{guest.name}}, ref {{booking.ref}}", scope)).toBe(
      "Hi Sameer, ref SK-CO2403",
    );
  });

  it("applies the inr filter", () => {
    expect(renderTemplate("Pay {{amount.due|inr}}", scope)).toBe("Pay ₹ 9,450");
  });

  it("applies the date filter", () => {
    expect(renderTemplate("Arrive {{booking.checkIn|date}}", scope)).toBe("Arrive 12 Jun");
  });

  it("renders missing variables as empty strings", () => {
    expect(renderTemplate("Hello {{guest.unknown}}!", scope)).toBe("Hello !");
  });
});
