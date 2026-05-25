import { describe, it, expect, beforeEach } from "vitest";
import { enforceRateLimit, RateLimitError, resetRateLimits } from "./ratelimit";
import { MCP } from "../config";

beforeEach(() => resetRateLimits());

describe("enforceRateLimit", () => {
  it("allows calls up to the per-minute cap, then throws", () => {
    for (let i = 0; i < MCP.perTokenCallsPerMin; i++) {
      expect(() => enforceRateLimit("tok", "get_kpis")).not.toThrow();
    }
    expect(() => enforceRateLimit("tok", "get_kpis")).toThrow(RateLimitError);
  });

  it("keeps separate budgets per token", () => {
    for (let i = 0; i < MCP.perTokenCallsPerMin; i++) enforceRateLimit("a", "get_kpis");
    // A different token is unaffected by token "a" exhausting its budget.
    expect(() => enforceRateLimit("b", "get_kpis")).not.toThrow();
  });

  it("applies a stricter hourly sub-limit to send_notification", () => {
    for (let i = 0; i < MCP.sendNotificationPerHour; i++) {
      expect(() => enforceRateLimit("n", "send_notification")).not.toThrow();
    }
    expect(() => enforceRateLimit("n", "send_notification")).toThrow(/Notification limit/);
    // Non-notification calls on the same token are still allowed (separate budget).
    expect(() => enforceRateLimit("n", "get_kpis")).not.toThrow();
  });
});
