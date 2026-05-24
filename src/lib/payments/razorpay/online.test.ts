import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  isConfigured,
  onlinePaymentsEnabled,
  verifyRazorpayCredentials,
  resetCredentialCache,
} from "./client";

beforeEach(() => {
  resetCredentialCache();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("online payments gate (cash-first default)", () => {
  it("is OFF when no keys are configured — no network call", async () => {
    expect(isConfigured()).toBe(false);
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    expect(await onlinePaymentsEnabled()).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("is ON only when keys are present AND credentials verify", async () => {
    vi.stubEnv("RAZORPAY_KEY_ID_TEST", "rzp_test_x");
    vi.stubEnv("RAZORPAY_KEY_SECRET_TEST", "secret");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));
    expect(await onlinePaymentsEnabled()).toBe(true);
  });

  it("is OFF when the credentials are rejected", async () => {
    vi.stubEnv("RAZORPAY_KEY_ID_TEST", "rzp_test_x");
    vi.stubEnv("RAZORPAY_KEY_SECRET_TEST", "bad");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 401 }));
    expect(await onlinePaymentsEnabled()).toBe(false);
    const v = await verifyRazorpayCredentials();
    expect(v.ok).toBe(false);
    expect(v.error).toMatch(/401/);
  });

  it("caches the verification result", async () => {
    vi.stubEnv("RAZORPAY_KEY_ID_TEST", "rzp_test_x");
    vi.stubEnv("RAZORPAY_KEY_SECRET_TEST", "secret");
    const fetchSpy = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchSpy);
    await onlinePaymentsEnabled();
    await onlinePaymentsEnabled();
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});
