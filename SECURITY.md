# Security Policy

## Reporting a vulnerability

Please report security issues **privately** to `security@staykit.example` (replace with your project
contact). Do not open a public GitHub issue for vulnerabilities.

Include: a description, reproduction steps, affected version/commit, and impact. We aim to acknowledge
within 72 hours and to ship a fix or mitigation as quickly as severity warrants. We'll credit
reporters (with permission) in `SECURITY-THANKS.md`. A bug bounty is not offered in v1.

## Scope & sensitive areas

StayKit handles guest PII (names, phones, ID documents) and payment flows. Areas that warrant care:

- **Razorpay webhooks** — signatures are verified against the **raw** request body; events are
  de-duplicated by `x-razorpay-event-id`. Never pre-parse the body before verification.
- **MCP / OAuth** — tools are RBAC-gated server-side; tokens are stored hashed; scopes map 1:1 to
  permissions. The dev fallback that allows unauthenticated MCP access is **disabled in production**
  and by `REQUIRE_LOGIN=1`.
- **OTP** — codes are stored as `sha256(code + pepper)`, rate-limited per contact and per IP.
- **Guest ID documents** — encrypted at rest (AES-256-GCM) and auto-purged 90 days after checkout
  (DPDP), excluding statutory tax-record holds.
- **Sessions** — opaque tokens stored hashed; `HttpOnly`, `SameSite=Lax`, `Secure` in production.

## Supported versions

The `main` branch receives security fixes during the v1 development phase.
