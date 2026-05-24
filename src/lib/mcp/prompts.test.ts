import { describe, it, expect } from "vitest";
import { PROMPTS, getPrompt } from "./prompts";

describe("prompts", () => {
  it("lists three prompts with argument metadata", () => {
    expect(PROMPTS.map((p) => p.name)).toEqual([
      "daily_briefing",
      "revenue_report",
      "guest_outreach_draft",
    ]);
    expect(PROMPTS.find((p) => p.name === "revenue_report")?.arguments).toHaveLength(2);
  });

  it("renders daily_briefing as a user message", () => {
    const r = getPrompt("daily_briefing");
    expect(r.messages[0].role).toBe("user");
    expect(r.messages[0].content.text).toMatch(/briefing/i);
  });

  it("interpolates revenue_report dates", () => {
    const r = getPrompt("revenue_report", { from: "2026-03-01", to: "2026-03-31" });
    expect(r.messages[0].content.text).toContain("2026-03-01");
    expect(r.messages[0].content.text).toContain("2026-03-31");
  });

  it("interpolates guest_outreach_draft args with defaults", () => {
    const r = getPrompt("guest_outreach_draft", { audience: "March guests", theme: "monsoon" });
    expect(r.messages[0].content.text).toContain("March guests");
    expect(r.messages[0].content.text).toContain("monsoon");
    expect(r.messages[0].content.text).toContain("whatsapp");
  });

  it("throws for an unknown prompt", () => {
    expect(() => getPrompt("nope")).toThrow(/Unknown prompt/);
  });
});
