"use server";

import { prisma } from "../db";
import { requestOtp, verifyOtp, RateLimitError } from "../auth/otp";
import { createStaffSession, createGuestSession, destroySession } from "../auth/session";
import { normalizePhone } from "../phone";

export interface OtpRequestResult {
  ok: boolean;
  requestId?: string;
  devCode?: string;
  message?: string;
}

export async function requestStaffOtp(phoneRaw: string): Promise<OtpRequestResult> {
  try {
    const phone = normalizePhone(phoneRaw);
    const user = await prisma.user.findUnique({ where: { phone } });
    if (!user || !user.active) {
      return { ok: false, message: "No active staff account for that number." };
    }
    const r = await requestOtp(phone, "STAFF_LOGIN");
    return { ok: true, requestId: r.requestId, devCode: r.devCode };
  } catch (e) {
    if (e instanceof RateLimitError) return { ok: false, message: e.message };
    return { ok: false, message: "Could not send a code. Try again." };
  }
}

export async function verifyStaffOtp(requestId: string, code: string): Promise<OtpRequestResult> {
  try {
    const res = await verifyOtp(requestId, code);
    if (!res.ok)
      return { ok: false, message: "That code didn't match — please try again or resend." };
    const user = await prisma.user.findUnique({ where: { phone: res.contact } });
    if (!user) return { ok: false, message: "Account not found." };
    await createStaffSession(user.id);
    return { ok: true };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Verification failed." };
  }
}

export async function requestGuestOtp(phoneRaw: string): Promise<OtpRequestResult> {
  try {
    const phone = normalizePhone(phoneRaw);
    const r = await requestOtp(phone, "GUEST_LOGIN");
    return { ok: true, requestId: r.requestId, devCode: r.devCode };
  } catch (e) {
    if (e instanceof RateLimitError) return { ok: false, message: e.message };
    return { ok: false, message: "Could not send a code. Try again." };
  }
}

export async function verifyGuestOtp(requestId: string, code: string): Promise<OtpRequestResult> {
  try {
    const res = await verifyOtp(requestId, code);
    if (!res.ok)
      return { ok: false, message: "That code didn't match — please try again or resend." };
    await createGuestSession(res.contact);
    return { ok: true };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Verification failed." };
  }
}

export async function logout(scope: "staff" | "guest" = "staff") {
  await destroySession(scope);
  return { ok: true };
}
