import { describe, it, expect, vi } from "vitest";
import { providerFor } from "./providers";

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
