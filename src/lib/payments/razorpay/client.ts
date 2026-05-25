/**
 * Razorpay client. We never collect payments on-site — only Payment Links (§B.7).
 * Test vs Live are separate env vars; RAZORPAY_MODE picks the active set. When keys
 * are absent the client runs in "mock" mode and returns deterministic fake links so
 * the booking flow works locally without a Razorpay account.
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import { APP } from "../../config";

// Read per call so an owner can flip RAZORPAY_MODE (Settings → Integrations after
// KYC) without a restart, per the spec (B.7).
function mode(): "test" | "live" {
  return (process.env.RAZORPAY_MODE || "test") as "test" | "live";
}

function keyId() {
  return mode() === "live" ? process.env.RAZORPAY_KEY_ID_LIVE : process.env.RAZORPAY_KEY_ID_TEST;
}
function keySecret() {
  return mode() === "live"
    ? process.env.RAZORPAY_KEY_SECRET_LIVE
    : process.env.RAZORPAY_KEY_SECRET_TEST;
}
export function webhookSecret() {
  return mode() === "live"
    ? process.env.RAZORPAY_WEBHOOK_SECRET_LIVE
    : process.env.RAZORPAY_WEBHOOK_SECRET_TEST;
}

export function isConfigured(): boolean {
  return !!(keyId() && keySecret());
}

/**
 * Online payments (Razorpay links) are OFF by default. They turn on only when the
 * keys are present AND the credentials actually work — otherwise everything stays
 * cash/manual. We verify against a cheap authenticated endpoint and cache the result.
 */
let credCache: { ok: boolean; at: number } | null = null;
const CRED_TTL_MS = 10 * 60_000;

export function resetCredentialCache() {
  credCache = null;
}

export async function verifyRazorpayCredentials(): Promise<{ ok: boolean; error?: string }> {
  if (!isConfigured()) return { ok: false, error: "Razorpay keys are not set." };
  try {
    const auth = Buffer.from(`${keyId()}:${keySecret()}`).toString("base64");
    const res = await fetch("https://api.razorpay.com/v1/payments?count=1", {
      headers: { Authorization: `Basic ${auth}` },
    });
    if (res.ok) return { ok: true };
    return { ok: false, error: `Razorpay rejected the credentials (HTTP ${res.status}).` };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not reach Razorpay." };
  }
}

/** True only when keys are present and verified valid (cached). Default: false → cash. */
export async function onlinePaymentsEnabled(): Promise<boolean> {
  if (!isConfigured()) return false;
  const now = Date.now();
  if (credCache && now - credCache.at < CRED_TTL_MS) return credCache.ok;
  const ok = (await verifyRazorpayCredentials()).ok;
  credCache = { ok, at: now };
  return ok;
}

export interface CreatePaymentLinkParams {
  amountPaise: number;
  referenceId: string; // booking ref
  bookingId: string;
  customer: { name: string; contact: string; email?: string | null };
  notify: { sms: boolean; email: boolean };
  callbackUrl: string;
}

export interface PaymentLinkResult {
  razorpayLinkId: string;
  shortUrl: string;
  expiresAt: Date | null;
  mock: boolean;
}

const SIX_MONTHS_MS = 1000 * 60 * 60 * 24 * 182;

export async function createPaymentLink(
  params: CreatePaymentLinkParams,
): Promise<PaymentLinkResult> {
  const expiresAt = new Date(Date.now() + SIX_MONTHS_MS);

  if (!isConfigured()) {
    // Mock mode — return a believable fake link.
    const id = `plink_mock_${Date.now().toString(36)}`;
    return {
      razorpayLinkId: id,
      shortUrl: `${APP.baseUrl}/pay/${id}`,
      expiresAt,
      mock: true,
    };
  }

  const auth = Buffer.from(`${keyId()}:${keySecret()}`).toString("base64");
  const res = await fetch("https://api.razorpay.com/v1/payment_links", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Basic ${auth}` },
    body: JSON.stringify({
      amount: params.amountPaise,
      currency: "INR",
      accept_partial: false,
      reference_id: params.referenceId,
      customer: {
        name: params.customer.name,
        contact: params.customer.contact,
        email: params.customer.email ?? undefined,
      },
      notify: { sms: params.notify.sms, email: params.notify.email },
      callback_url: params.callbackUrl,
      callback_method: "get",
      notes: { bookingId: params.bookingId },
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Razorpay payment link failed (${res.status}): ${text}`);
  }
  const data = (await res.json()) as { id: string; short_url: string; expire_by?: number };
  return {
    razorpayLinkId: data.id,
    shortUrl: data.short_url,
    expiresAt: data.expire_by ? new Date(data.expire_by * 1000) : expiresAt,
    mock: false,
  };
}

/**
 * Verify the X-Razorpay-Signature header against the RAW request body using
 * HMAC-SHA256. The route handler MUST read request.text() and not pre-parse JSON,
 * or verification breaks (§B.7).
 */
export function verifyWebhookSignature(rawBody: string, signature: string): boolean {
  const secret = webhookSecret();
  if (!secret) return false;
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Cancel a payment link so a superseded link can't be paid (audit P1 #12). No-op in
 * mock mode and for mock link ids. Throws on a real API failure so the caller can decide.
 */
export async function cancelPaymentLink(
  razorpayLinkId: string,
): Promise<{ cancelled: boolean; mock: boolean }> {
  if (!isConfigured() || razorpayLinkId.startsWith("plink_mock_")) {
    return { cancelled: true, mock: true };
  }
  const auth = Buffer.from(`${keyId()}:${keySecret()}`).toString("base64");
  const res = await fetch(`https://api.razorpay.com/v1/payment_links/${razorpayLinkId}/cancel`, {
    method: "POST",
    headers: { Authorization: `Basic ${auth}` },
  });
  if (!res.ok) throw new Error(`Razorpay link cancel failed (${res.status}): ${await res.text()}`);
  return { cancelled: true, mock: false };
}

export async function initiateRefund(
  razorpayPaymentId: string,
  amountPaise: number,
  speed: "normal" | "optimum",
): Promise<{ razorpayRefundId: string; mock: boolean }> {
  if (!isConfigured()) {
    return { razorpayRefundId: `rfnd_mock_${Date.now().toString(36)}`, mock: true };
  }
  const auth = Buffer.from(`${keyId()}:${keySecret()}`).toString("base64");
  const res = await fetch(`https://api.razorpay.com/v1/payments/${razorpayPaymentId}/refund`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Basic ${auth}` },
    body: JSON.stringify({ amount: amountPaise, speed }),
  });
  if (!res.ok) throw new Error(`Razorpay refund failed (${res.status}): ${await res.text()}`);
  const data = (await res.json()) as { id: string };
  return { razorpayRefundId: data.id, mock: false };
}
