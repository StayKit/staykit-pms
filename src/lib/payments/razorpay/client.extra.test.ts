import { describe, it, expect, vi, afterEach } from "vitest";
import { isConfigured, createPaymentLink } from "./client";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("isConfigured in live mode", () => {
  it("reads the live key id + secret", () => {
    vi.stubEnv("RAZORPAY_MODE", "live");
    vi.stubEnv("RAZORPAY_KEY_ID_LIVE", "rzp_live_x");
    vi.stubEnv("RAZORPAY_KEY_SECRET_LIVE", "live_secret");
    expect(isConfigured()).toBe(true);
  });
});

describe("createPaymentLink with no customer email", () => {
  it("sends undefined for a missing email", async () => {
    vi.stubEnv("RAZORPAY_KEY_ID_TEST", "rzp_test_x");
    vi.stubEnv("RAZORPAY_KEY_SECRET_TEST", "secret");
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => ({ id: "p", short_url: "u" }) });
    vi.stubGlobal("fetch", fetchMock);
    await createPaymentLink({
      amountPaise: 1000,
      referenceId: "SK-X",
      bookingId: "b",
      customer: { name: "N", contact: "+91", email: null },
      notify: { sms: true, email: false },
      callbackUrl: "u",
    });
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.customer.email).toBeUndefined();
  });
});
