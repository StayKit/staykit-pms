import { describe, it, expect, vi, afterEach } from "vitest";

// These modules read env at import time with `process.env.X || default`. Re-import
// them with the var unset to exercise the fallback branch.
afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("config APP.baseUrl default", () => {
  it("falls back to localhost when APP_BASE_URL is unset", async () => {
    vi.stubEnv("APP_BASE_URL", "");
    vi.resetModules();
    const { APP } = await import("./config");
    expect(APP.baseUrl).toBe("http://localhost:3000");
  });
});

describe("OTP pepper default", () => {
  it("issues a code even when OTP_PEPPER is unset (uses the fallback pepper)", async () => {
    vi.stubEnv("OTP_PEPPER", "");
    vi.resetModules();
    const { requestOtp } = await import("./auth/otp");
    const { prisma } = await import("./db");
    await prisma.otpRequest.deleteMany();
    const r = await requestOtp("+919800000099", "STAFF_LOGIN");
    expect(r.devCode).toMatch(/^\d{6}$/);
  });
});
