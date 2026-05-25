import { describe, it, expect } from "vitest";
import {
  GST,
  GST_REGISTRATION,
  OTP,
  SESSION,
  MCP,
  RETENTION,
  APP,
  FRRO_FORM_C_URL,
  DEFAULT_CHANNELS,
} from "./index";

// These constants encode regulatory facts from the specification (B.5/B.6/B.14).
// Tests pin them to the spec so an accidental edit is caught.

describe("GST constants (Notification 15/2025)", () => {
  it("uses ₹7,500/night threshold with 5% and 18% rates and SAC 996311", () => {
    expect(GST.thresholdPaise).toBe(7500_00);
    expect(GST.lowRate).toBe(0.05);
    expect(GST.highRate).toBe(0.18);
    expect(GST.sacCode).toBe("996311");
  });
});

describe("GST registration thresholds", () => {
  it("is ₹20 lakh general / ₹10 lakh special-category", () => {
    expect(GST_REGISTRATION.generalThresholdPaise).toBe(20_00_000_00);
    expect(GST_REGISTRATION.specialThresholdPaise).toBe(10_00_000_00);
    expect(GST_REGISTRATION.specialStates).toContain("HP");
    expect(GST_REGISTRATION.specialStates).toContain("UK");
  });
});

describe("OTP policy (B.5)", () => {
  it("is 6 digits, 5-minute TTL, 5 verify attempts, 3/15min, 10/hour", () => {
    expect(OTP.length).toBe(6);
    expect(OTP.ttlMinutes).toBe(5);
    expect(OTP.maxVerifyAttempts).toBe(5);
    expect(OTP.perContactPer15Min).toBe(3);
    expect(OTP.perIpPerHour).toBe(10);
  });
});

describe("MCP scopes (B.9)", () => {
  it("advertises the operational scope set (fine-tuning scopes are excluded — UI-only)", () => {
    expect(MCP.scopes).toEqual([
      "bookings:read",
      "bookings:write",
      "bookings:cancel",
      "payments:read",
      "payments:write",
      "payments:refund",
      "properties:read",
      "properties:write",
      "guests:read",
      "guests:write",
      "notifications:read",
      "notifications:send",
      "compliance:read",
      "compliance:write",
      "reports:read",
    ]);
    // Fine-tuning permissions must NOT be grantable to an MCP token.
    expect(MCP.scopes).not.toContain("rates:write");
    expect(MCP.scopes).not.toContain("team:manage");
    expect(MCP.scopes).not.toContain("mcp:admin");
    expect(MCP.accessTokenTtlMinutes).toBe(15);
    expect(MCP.refreshTokenTtlDays).toBe(30);
    expect(MCP.sendNotificationPerHour).toBe(10);
  });
});

describe("retention & app constants", () => {
  it("auto-purges guest IDs 90 days post-checkout with statutory tax holds", () => {
    expect(RETENTION.guestIdDaysAfterCheckout).toBe(90);
    expect(RETENTION.gstYears).toBe(6);
    expect(RETENTION.incomeTaxYears).toBe(8);
  });
  it("defaults to INR, Asia/Kolkata, en-IN", () => {
    expect(APP.defaultCurrency).toBe("INR");
    expect(APP.timezone).toBe("Asia/Kolkata");
    expect(APP.defaultLocale).toBe("en-IN");
  });
  it("session cookie bases and FRRO URL match the spec", () => {
    expect(SESSION.staffCookie).toBe("staykit_session");
    expect(SESSION.guestCookie).toBe("staykit_guest");
    expect(FRRO_FORM_C_URL).toBe("https://indianfrro.gov.in/sform");
  });
});

describe("default channels", () => {
  it("seeds the spec's manual source channels", () => {
    const keys = DEFAULT_CHANNELS.map((c) => c.key);
    expect(keys).toEqual([
      "direct",
      "walkin",
      "phone",
      "instagram",
      "whatsapp",
      "airbnb",
      "booking",
      "mmt",
    ]);
  });
});
