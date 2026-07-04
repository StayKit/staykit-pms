/**
 * OTP issuance & verification. 6-digit numeric, stored as sha256(code + pepper),
 * 5-minute TTL, rate-limited per contact and per IP (§B.5). In development the
 * generated code is logged and returned so you can sign in without an SMS gateway.
 */
import { createHash, randomInt } from "node:crypto";
import { prisma } from "../db";
import { OTP } from "../config";
import type { OtpPurpose } from "@prisma/client";

const PEPPER = process.env.OTP_PEPPER || "dev-pepper-change-me";

// When true, the generated OTP is logged and returned to the caller so it can be
// shown on the sign-in screen. Real SMS/email dispatch is still a TODO, so this is
// the only delivery path today. Always on outside production; opt in for a
// production test/demo instance with OTP_EXPOSE_CODE=1 (no SMS provider needed).
// Evaluated per-call (not captured at import) so NODE_ENV is read at request time.
function exposeOtp(): boolean {
  return process.env.OTP_EXPOSE_CODE === "1" || process.env.NODE_ENV !== "production";
}

function hashCode(code: string): string {
  return createHash("sha256")
    .update(code + PEPPER)
    .digest("hex");
}

function generateCode(): string {
  return String(randomInt(0, 10 ** OTP.length)).padStart(OTP.length, "0");
}

export class RateLimitError extends Error {
  readonly code = "RATE_LIMITED";
  constructor(message: string) {
    super(message);
    this.name = "RateLimitError";
  }
}

export interface RequestOtpResult {
  requestId: string;
  expiresIn: number; // seconds
  /** Only populated in development to ease local testing. */
  devCode?: string;
}

export async function requestOtp(
  contact: string,
  purpose: OtpPurpose,
  ip?: string,
): Promise<RequestOtpResult> {
  const since15 = new Date(Date.now() - 15 * 60_000);
  const sinceHour = new Date(Date.now() - 60 * 60_000);

  const perContact = await prisma.otpRequest.count({
    where: { contact, purpose, createdAt: { gte: since15 } },
  });
  if (perContact >= OTP.perContactPer15Min) {
    throw new RateLimitError("Too many code requests. Please wait a few minutes.");
  }
  if (ip) {
    const perIp = await prisma.otpRequest.count({
      where: { ip, createdAt: { gte: sinceHour } },
    });
    if (perIp >= OTP.perIpPerHour) {
      throw new RateLimitError("Too many requests from your network. Try again later.");
    }
  }

  const code = generateCode();
  const expiresAt = new Date(Date.now() + OTP.ttlMinutes * 60_000);
  const req = await prisma.otpRequest.create({
    data: { contact, purpose, codeHash: hashCode(code), expiresAt, ip },
  });

  // TODO(notify): dispatch via MSG91 SMS / email provider. Until that lands,
  // exposeOtp() surfaces the code (logged + returned) instead of sending it.
  if (exposeOtp()) {
    console.log(`[OTP] ${purpose} for ${contact}: ${code}`);
  }

  return {
    requestId: req.id,
    expiresIn: OTP.ttlMinutes * 60,
    devCode: exposeOtp() ? code : undefined,
  };
}

export interface VerifyOtpResult {
  ok: boolean;
  contact: string;
  purpose: OtpPurpose;
}

export async function verifyOtp(requestId: string, code: string): Promise<VerifyOtpResult> {
  const req = await prisma.otpRequest.findUnique({ where: { id: requestId } });
  if (!req) throw new Error("This code request is no longer valid.");
  if (req.consumedAt) throw new Error("This code has already been used.");
  if (req.expiresAt < new Date()) throw new Error("This code has expired. Please resend.");
  if (req.attempts >= OTP.maxVerifyAttempts) {
    throw new RateLimitError("Too many attempts. Please request a new code.");
  }

  const matches = req.codeHash === hashCode(code);
  await prisma.otpRequest.update({
    where: { id: requestId },
    data: {
      attempts: { increment: 1 },
      consumedAt: matches ? new Date() : null,
    },
  });

  return { ok: matches, contact: req.contact, purpose: req.purpose };
}
