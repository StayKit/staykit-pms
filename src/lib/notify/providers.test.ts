import { describe, it, expect, vi, afterEach } from "vitest";
import { providerFor, notificationsConfigured } from "./providers";

// B.8: providers sit behind one interface; with no credentials configured the
// console fallback logs instead of sending so the app runs end-to-end in dev.

describe("providerFor", () => {
  it("returns the console fallback provider", () => {
    const p = providerFor("SMS");
    expect(p.name).toBe("console");
    expect(p.supports("SMS")).toBe(true);
  });

  it("logs the message and returns a provider message id", async () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    const p = providerFor("WHATSAPP");
    const res = await p.send({ channel: "WHATSAPP", to: "+91...", body: "hello" });
    expect(res.provider).toBe("console");
    expect(res.providerMessageId).toMatch(/^console_/);
    expect(spy).toHaveBeenCalled();
  });
});

describe("real providers (env-gated)", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("uses Resend for EMAIL when RESEND_API_KEY is set and posts to the API", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_test");
    vi.stubEnv("EMAIL_FROM", "stay@example.in");
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(JSON.stringify({ id: "email_123" }), { status: 200 }));
    const p = providerFor("EMAIL");
    expect(p.name).toBe("resend");
    const res = await p.send({ channel: "EMAIL", to: "g@x.in", body: "hi", subject: "S" });
    expect(res.providerMessageId).toBe("email_123");
    expect(fetchSpy).toHaveBeenCalledWith("https://api.resend.com/emails", expect.anything());
  });

  it("uses MSG91 for SMS when keys are set and throws on HTTP error", async () => {
    vi.stubEnv("MSG91_AUTH_KEY", "k");
    vi.stubEnv("MSG91_SENDER_ID", "STAYKT");
    const p = providerFor("SMS");
    expect(p.name).toBe("msg91-sms");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("nope", { status: 401 }));
    await expect(p.send({ channel: "SMS", to: "9876543210", body: "hi" })).rejects.toThrow(/MSG91/);
  });

  it("notificationsConfigured reflects which channels have keys", () => {
    vi.stubEnv("MSG91_AUTH_KEY", "k");
    vi.stubEnv("MSG91_SENDER_ID", "STAYKT");
    vi.stubEnv("MSG91_WHATSAPP_NUMBER", "");
    vi.stubEnv("RESEND_API_KEY", "re");
    expect(notificationsConfigured()).toEqual({ sms: true, whatsapp: false, email: true });
  });
});
