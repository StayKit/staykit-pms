import { describe, it, expect, beforeEach, vi, type Mock } from "vitest";

vi.mock("@/lib/auth/session", () => ({
  createStaffSession: vi.fn(),
  createGuestSession: vi.fn(),
  destroySession: vi.fn(),
}));

// Wrap requestOtp so we can force a one-off failure for the generic-catch branch,
// while keeping the real implementation for every other call.
vi.mock("../auth/otp", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../auth/otp")>();
  return { ...actual, requestOtp: vi.fn(actual.requestOtp), verifyOtp: vi.fn(actual.verifyOtp) };
});

import { createStaffSession, createGuestSession, destroySession } from "@/lib/auth/session";
import { requestOtp, verifyOtp } from "../auth/otp";
import {
  requestStaffOtp,
  verifyStaffOtp,
  requestGuestOtp,
  verifyGuestOtp,
  logout,
} from "./auth";
import { prisma } from "@/lib/db";
import { resetDb, seedBasic, type Fixture } from "../../../test/factories";

const mockRequestOtp = requestOtp as unknown as Mock;
const mockVerifyOtp = verifyOtp as unknown as Mock;
let fx: Fixture;

beforeEach(async () => {
  await resetDb();
  fx = await seedBasic();
  vi.clearAllMocks();
});

async function latestOtpId() {
  const row = await prisma.otpRequest.findFirst({ orderBy: { createdAt: "desc" } });
  return row!.id;
}

describe("requestStaffOtp", () => {
  it("issues a code for an active staff account", async () => {
    const r = await requestStaffOtp(fx.user.phone);
    expect(r.ok).toBe(true);
    expect(r.devCode).toMatch(/^\d{6}$/);
  });

  it("normalises a bare 10-digit number to +91", async () => {
    await prisma.user.create({ data: { ownerId: fx.owner.id, name: "T", phone: "+919876543210", role: "STAFF" } });
    expect((await requestStaffOtp("9876543210")).ok).toBe(true);
  });

  it("refuses unknown or inactive accounts", async () => {
    expect((await requestStaffOtp("+910000000000")).ok).toBe(false);
    await prisma.user.update({ where: { id: fx.user.id }, data: { active: false } });
    expect((await requestStaffOtp(fx.user.phone)).ok).toBe(false);
  });

  it("returns the rate-limit message after too many requests", async () => {
    for (let i = 0; i < 3; i++) await requestStaffOtp(fx.user.phone);
    const r = await requestStaffOtp(fx.user.phone);
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/too many/i);
  });

  it("returns a generic error when issuance fails unexpectedly", async () => {
    mockRequestOtp.mockRejectedValueOnce(new Error("db"));
    const r = await requestStaffOtp(fx.user.phone);
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/could not send/i);
  });
});

describe("verifyStaffOtp", () => {
  it("creates a staff session on the correct code", async () => {
    const r = await requestStaffOtp(fx.user.phone);
    const res = await verifyStaffOtp(await latestOtpId(), r.devCode!);
    expect(res.ok).toBe(true);
    expect(createStaffSession as Mock).toHaveBeenCalledWith(fx.user.id);
  });

  it("rejects a wrong code", async () => {
    await requestStaffOtp(fx.user.phone);
    const res = await verifyStaffOtp(await latestOtpId(), "000000");
    expect(res.ok).toBe(false);
    expect(res.message).toMatch(/didn't match/i);
  });

  it("fails when the account vanished between request and verify", async () => {
    const r = await requestStaffOtp(fx.user.phone);
    const id = await latestOtpId();
    await prisma.user.delete({ where: { id: fx.user.id } });
    const res = await verifyStaffOtp(id, r.devCode!);
    expect(res.ok).toBe(false);
    expect(res.message).toMatch(/not found/i);
  });

  it("returns an error message when verification throws", async () => {
    expect((await verifyStaffOtp("unknown-request", "123456")).ok).toBe(false);
  });

  it("falls back to a default message when a non-Error is thrown", async () => {
    mockVerifyOtp.mockRejectedValueOnce("string failure");
    const res = await verifyStaffOtp("r", "123456");
    expect(res).toEqual({ ok: false, message: "Verification failed." });
  });
});

describe("guest OTP", () => {
  it("issues a code without requiring an account, including 10-digit and 0-prefixed inputs", async () => {
    expect((await requestGuestOtp("9812300000")).ok).toBe(true);
    expect((await requestGuestOtp("09812300001")).ok).toBe(true);
  });

  it("creates a guest session on the correct code", async () => {
    const r = await requestGuestOtp("+919812300000");
    const res = await verifyGuestOtp(await latestOtpId(), r.devCode!);
    expect(res.ok).toBe(true);
    expect(createGuestSession as Mock).toHaveBeenCalledWith("+919812300000");
  });

  it("rejects a wrong guest code and surfaces verification errors", async () => {
    await requestGuestOtp("+919812300000");
    expect((await verifyGuestOtp(await latestOtpId(), "000000")).ok).toBe(false);
    expect((await verifyGuestOtp("missing", "123456")).ok).toBe(false);
  });

  it("returns the rate-limit message for guests too", async () => {
    for (let i = 0; i < 3; i++) await requestGuestOtp("+919812300000");
    expect((await requestGuestOtp("+919812300000")).message).toMatch(/too many/i);
  });

  it("returns a generic error when guest issuance fails", async () => {
    mockRequestOtp.mockRejectedValueOnce(new Error("db"));
    expect((await requestGuestOtp("+919812300000")).ok).toBe(false);
  });

  it("falls back to a default message when guest verification throws a non-Error", async () => {
    mockVerifyOtp.mockRejectedValueOnce("string failure");
    expect(await verifyGuestOtp("r", "123456")).toEqual({ ok: false, message: "Verification failed." });
  });
});

describe("logout", () => {
  it("destroys the staff session by default and the guest session when asked", async () => {
    await logout();
    expect(destroySession as Mock).toHaveBeenCalledWith("staff");
    await logout("guest");
    expect(destroySession as Mock).toHaveBeenCalledWith("guest");
  });
});
