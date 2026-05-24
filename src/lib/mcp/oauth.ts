/**
 * OAuth 2.1 + PKCE helpers for the MCP authorization-code flow (§B.9).
 *
 * Design choice: StayKit acts as both Authorization Server and Resource Server for a
 * self-hosted single-owner deployment, and issues **opaque** access/refresh tokens
 * stored hashed in McpAccessToken (validated by DB lookup in resolveMcpContext) — a
 * valid RFC 6749/9728 pattern. We therefore don't publish a JWKS. Authorization codes
 * are short-lived **stateless HMAC-signed** blobs, so no extra table/migration is needed.
 */
import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export const AUTH_CODE_TTL_MS = 60_000; // 1 minute
const b64url = (b: Buffer) => b.toString("base64url");

function signingSecret(): string {
  return process.env.OAUTH_SIGNING_SECRET || process.env.OTP_PEPPER || "staykit-dev-oauth-secret";
}

export interface AuthCodePayload {
  clientId: string;
  userId: string;
  scopes: string; // CSV
  redirectUri: string;
  codeChallenge: string;
  resource: string;
  exp: number; // epoch ms
}

/** Encode + HMAC-sign an authorization code (stateless, single short TTL). */
export function signAuthCode(payload: Omit<AuthCodePayload, "exp">): string {
  const full: AuthCodePayload = { ...payload, exp: Date.now() + AUTH_CODE_TTL_MS };
  const body = b64url(Buffer.from(JSON.stringify(full)));
  const sig = b64url(createHmac("sha256", signingSecret()).update(body).digest());
  return `${body}.${sig}`;
}

export function verifyAuthCode(code: string): AuthCodePayload | null {
  const dot = code.lastIndexOf(".");
  if (dot < 0) return null;
  const body = code.slice(0, dot);
  const sig = code.slice(dot + 1);
  const expected = b64url(createHmac("sha256", signingSecret()).update(body).digest());
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString()) as AuthCodePayload;
    if (payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

/** PKCE S256 check: BASE64URL(SHA256(verifier)) must equal the stored challenge. */
export function verifyPkce(verifier: string, challenge: string): boolean {
  const computed = b64url(createHash("sha256").update(verifier).digest());
  const a = Buffer.from(computed);
  const b = Buffer.from(challenge);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function newOpaqueToken(): { token: string; hash: string } {
  const token = randomBytes(32).toString("base64url");
  return { token, hash: hashToken(token) };
}

/** Intersect requested scopes with what the client is allowed; CSV in/out. */
export function narrowScopes(requested: string | null, allowed: string): string {
  const allow = new Set(
    allowed
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  );
  if (!requested) return [...allow].join(",");
  const req = requested.split(/[\s,]+/).filter(Boolean);
  return req.filter((s) => allow.has(s)).join(",");
}
