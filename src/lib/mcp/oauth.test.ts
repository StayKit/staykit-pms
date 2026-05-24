import { describe, it, expect, vi } from "vitest";
import { createHash } from "node:crypto";
import {
  signAuthCode,
  verifyAuthCode,
  verifyPkce,
  narrowScopes,
  newOpaqueToken,
  hashToken,
  AUTH_CODE_TTL_MS,
} from "./oauth";

const payload = {
  clientId: "mcp_abc",
  userId: "u1",
  scopes: "bookings:read,reports:read",
  redirectUri: "https://claude.ai/cb",
  codeChallenge: "chal",
  resource: "http://localhost:3000/mcp",
};

describe("auth code signing", () => {
  it("round-trips a valid code", () => {
    const code = signAuthCode(payload);
    const out = verifyAuthCode(code);
    expect(out?.clientId).toBe("mcp_abc");
    expect(out?.scopes).toBe("bookings:read,reports:read");
  });

  it("rejects a tampered code", () => {
    const code = signAuthCode(payload);
    expect(verifyAuthCode(code.slice(0, -2) + "xy")).toBeNull();
    expect(verifyAuthCode("garbage")).toBeNull();
  });

  it("rejects an expired code", () => {
    vi.useFakeTimers();
    const code = signAuthCode(payload);
    vi.advanceTimersByTime(AUTH_CODE_TTL_MS + 1000);
    expect(verifyAuthCode(code)).toBeNull();
    vi.useRealTimers();
  });
});

describe("verifyPkce (S256)", () => {
  it("accepts the matching verifier and rejects others", () => {
    const verifier = "a-very-long-random-verifier-string-1234567890";
    const challenge = createHash("sha256").update(verifier).digest("base64url");
    expect(verifyPkce(verifier, challenge)).toBe(true);
    expect(verifyPkce("wrong", challenge)).toBe(false);
  });
});

describe("narrowScopes", () => {
  it("intersects requested with allowed and defaults to all allowed", () => {
    expect(narrowScopes("bookings:read payments:refund", "bookings:read,reports:read")).toBe(
      "bookings:read",
    );
    expect(narrowScopes(null, "bookings:read,reports:read")).toBe("bookings:read,reports:read");
  });
});

describe("newOpaqueToken", () => {
  it("produces a token whose hash matches hashToken", () => {
    const { token, hash } = newOpaqueToken();
    expect(hashToken(token)).toBe(hash);
  });
});
