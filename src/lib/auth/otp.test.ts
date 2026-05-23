import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { requestOtp, verifyOtp, RateLimitError } from "./otp";
import { prisma } from "@/lib/db";
import { resetDb } from "../../../test/factories";

beforeEach(resetDb);
afterEach(() => vi.unstubAllEnvs());

describe("requestOtp", () => {
  it("issues a 6-digit code with a 5-minute TTL (dev code exposed in non-prod)", async () => {
    const r = await requestOtp("+919800000001", "STAFF_LOGIN");
    expect(r.requestId).toBeTruthy();
    expect(r.expiresIn).toBe(300);
    expect(r.devCode).toMatch(/^\d{6}$/);
  });

  it("hides the dev code in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const r = await requestOtp("+919800000002", "STAFF_LOGIN");
    expect(r.devCode).toBeUndefined();
  });

  it("rate-limits to 3 sends per contact per 15 minutes", async () => {
    for (let i = 0; i < 3; i++) await requestOtp("+919800000003", "GUEST_LOGIN");
    await expect(requestOtp("+919800000003", "GUEST_LOGIN")).rejects.toThrow(RateLimitError);
  });

  it("rate-limits to 10 sends per IP per hour", async () => {
    for (let i = 0; i < 10; i++) await requestOtp(`+9198000100${i}`, "GUEST_LOGIN", "1.2.3.4");
    await expect(requestOtp("+919800019999", "GUEST_LOGIN", "1.2.3.4")).rejects.toThrow(RateLimitError);
  });
});

describe("verifyOtp", () => {
  it("accepts the correct code once and marks it consumed", async () => {
    const r = await requestOtp("+919800000010", "STAFF_LOGIN");
    const res = await verifyOtp(r.requestId, r.devCode!);
    expect(res.ok).toBe(true);
    expect(res.contact).toBe("+919800000010");
    // second use is rejected
    await expect(verifyOtp(r.requestId, r.devCode!)).rejects.toThrow(/already been used/);
  });

  it("rejects a wrong code and counts the attempt", async () => {
    const r = await requestOtp("+919800000011", "STAFF_LOGIN");
    const res = await verifyOtp(r.requestId, "000000");
    expect(res.ok).toBe(false);
    const row = await prisma.otpRequest.findUnique({ where: { id: r.requestId } });
    expect(row?.attempts).toBe(1);
  });

  it("throws for an unknown request id", async () => {
    await expect(verifyOtp("nope", "123456")).rejects.toThrow(/no longer valid/);
  });

  it("throws when the code has expired", async () => {
    const r = await requestOtp("+919800000012", "STAFF_LOGIN");
    await prisma.otpRequest.update({
      where: { id: r.requestId },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    await expect(verifyOtp(r.requestId, r.devCode!)).rejects.toThrow(/expired/);
  });

  it("locks out after 5 attempts", async () => {
    const r = await requestOtp("+919800000013", "STAFF_LOGIN");
    await prisma.otpRequest.update({ where: { id: r.requestId }, data: { attempts: 5 } });
    await expect(verifyOtp(r.requestId, r.devCode!)).rejects.toThrow(RateLimitError);
  });
});
