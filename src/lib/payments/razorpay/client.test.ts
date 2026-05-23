import { describe, it, expect, vi, afterEach } from "vitest";
import { createHmac } from "node:crypto";
import {
  isConfigured,
  createPaymentLink,
  verifyWebhookSignature,
  initiateRefund,
  webhookSecret,
} from "./client";

const params = {
  amountPaise: 250000,
  referenceId: "SK-A8X3Q",
  bookingId: "b1",
  customer: { name: "Sameer", contact: "+919812300000", email: "s@k.in" },
  notify: { sms: true, email: true },
  callbackUrl: "http://localhost:3000/my/bookings/b1?paid=1",
};

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("isConfigured", () => {
  it("is false without keys (mock mode)", () => {
    expect(isConfigured()).toBe(false);
  });
  it("is true when key id + secret are present", () => {
    vi.stubEnv("RAZORPAY_KEY_ID_TEST", "rzp_test_x");
    vi.stubEnv("RAZORPAY_KEY_SECRET_TEST", "secret");
    expect(isConfigured()).toBe(true);
  });
});

describe("createPaymentLink", () => {
  it("returns a believable mock link with ~6-month expiry when unconfigured", async () => {
    const r = await createPaymentLink(params);
    expect(r.mock).toBe(true);
    expect(r.razorpayLinkId).toMatch(/^plink_mock_/);
    expect(r.shortUrl).toBe("http://localhost:3000/pay/" + r.razorpayLinkId);
    expect(r.expiresAt!.getTime()).toBeGreaterThan(Date.now() + 150 * 24 * 3600 * 1000);
  });

  it("calls the Razorpay API and maps the response when configured", async () => {
    vi.stubEnv("RAZORPAY_KEY_ID_TEST", "rzp_test_x");
    vi.stubEnv("RAZORPAY_KEY_SECRET_TEST", "secret");
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: "plink_real", short_url: "https://rzp.io/i/abc", expire_by: 1893456000 }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const r = await createPaymentLink(params);
    expect(r.mock).toBe(false);
    expect(r.razorpayLinkId).toBe("plink_real");
    expect(r.shortUrl).toBe("https://rzp.io/i/abc");
    // request shape
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.amount).toBe(250000);
    expect(body.reference_id).toBe("SK-A8X3Q");
    expect(body.notes.bookingId).toBe("b1");
  });

  it("throws when the Razorpay API returns an error", async () => {
    vi.stubEnv("RAZORPAY_KEY_ID_TEST", "rzp_test_x");
    vi.stubEnv("RAZORPAY_KEY_SECRET_TEST", "secret");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 401, text: async () => "bad key" }));
    await expect(createPaymentLink(params)).rejects.toThrow(/payment link failed/);
  });

  it("falls back to a 6-month expiry when the API omits expire_by", async () => {
    vi.stubEnv("RAZORPAY_KEY_ID_TEST", "rzp_test_x");
    vi.stubEnv("RAZORPAY_KEY_SECRET_TEST", "secret");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ id: "p", short_url: "u" }) }));
    const r = await createPaymentLink(params);
    expect(r.expiresAt).toBeInstanceOf(Date);
  });
});

describe("verifyWebhookSignature", () => {
  it("verifies a correct HMAC-SHA256 of the raw body", () => {
    vi.stubEnv("RAZORPAY_WEBHOOK_SECRET_TEST", "whsec");
    const raw = '{"event":"payment.captured"}';
    const sig = createHmac("sha256", "whsec").update(raw).digest("hex");
    expect(verifyWebhookSignature(raw, sig)).toBe(true);
  });

  it("rejects a tampered body / wrong signature", () => {
    vi.stubEnv("RAZORPAY_WEBHOOK_SECRET_TEST", "whsec");
    const sig = createHmac("sha256", "whsec").update("orig").digest("hex");
    expect(verifyWebhookSignature("tampered", sig)).toBe(false);
  });

  it("returns false when no webhook secret is configured", () => {
    expect(webhookSecret()).toBeUndefined();
    expect(verifyWebhookSignature("x", "y")).toBe(false);
  });

  it("uses live secret when RAZORPAY_MODE=live", () => {
    vi.stubEnv("RAZORPAY_MODE", "live");
    vi.stubEnv("RAZORPAY_WEBHOOK_SECRET_LIVE", "livesec");
    expect(webhookSecret()).toBe("livesec");
  });
});

describe("initiateRefund", () => {
  it("returns a mock refund when unconfigured", async () => {
    const r = await initiateRefund("pay_x", 100000, "normal");
    expect(r.mock).toBe(true);
    expect(r.razorpayRefundId).toMatch(/^rfnd_mock_/);
  });

  it("calls the refund API when configured", async () => {
    vi.stubEnv("RAZORPAY_KEY_ID_TEST", "rzp_test_x");
    vi.stubEnv("RAZORPAY_KEY_SECRET_TEST", "secret");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ id: "rfnd_real" }) }));
    const r = await initiateRefund("pay_x", 100000, "optimum");
    expect(r).toEqual({ razorpayRefundId: "rfnd_real", mock: false });
  });

  it("throws on a failed refund API call", async () => {
    vi.stubEnv("RAZORPAY_KEY_ID_TEST", "rzp_test_x");
    vi.stubEnv("RAZORPAY_KEY_SECRET_TEST", "secret");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 400, text: async () => "nope" }));
    await expect(initiateRefund("pay_x", 100000, "normal")).rejects.toThrow(/refund failed/);
  });
});
