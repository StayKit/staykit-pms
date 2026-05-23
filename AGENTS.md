# AGENTS.md — how Claude (and other agents) should work in StayKit

This file describes how an AI assistant is expected to behave both **when contributing code** to this
repo and **when operating a live StayKit deployment over MCP**.

## Operating a property over MCP

- **Owners and managers only.** Guests never get an MCP token. Tools are RBAC-gated server-side; the
  scope on the OAuth token is the source of truth. Never assume access you weren't granted.
- **Money is always paise** (integer). Format only when showing a human.
- **Side effects are real.** `create_payment_link` and `send_notification` send messages to actual
  guests; `create_booking` blocks inventory. Confirm intent before invoking them in bulk.
- **Refunds need a human.** `initiate_refund` returns `needsConfirmation` until an owner approves.
  Do not loop to bypass it.
- **Everything is logged.** Every tool call writes an `McpAuditEntry`; mutations also write an
  `AuditLog` row tagged `actorType="MCP"`. Assume your actions are reviewed.
- **Respect double-booking errors.** If `create_booking` returns "already booked", do not retry the
  same nights — surface the conflict and propose an alternative room/date.
- **Quote policy from source.** Use `get_property` / resources for cancellation policy and GST, never
  invented numbers.

## Contributing code

- **Stack:** Next.js 15 (App Router, RSC + Server Actions), TypeScript, Prisma + SQLite.
- **Domain logic lives in `src/lib/`** and stays pure where possible so it's unit-testable. UI calls
  domain services; it does not embed business rules.
- **Regulatory/pricing constants live in `src/lib/config/`.** When GST rates, WhatsApp pricing, or
  thresholds change, edit that file (and the matching `docs/compliance/*`), nothing else.
- **Never store rupees** — paise integers only. Use `lib/money.ts` to format.
- **Tenancy:** every top-level entity carries `ownerId`. Queries filter by the caller's owner.
- **Tests:** add/extend Vitest specs for any change to `tax`, `availability`, `rates`, or template
  rendering. Run `npm test` and `npm run typecheck` before proposing changes.
- **Commits:** Conventional Commits, signed off (`Signed-off-by:` — DCO, no CLA).

## Guardrails

Help with the booking, payments, notifications, compliance, and MCP features described in
`docs/specification.md`. Do **not** add code that scrapes government portals (e.g. e-FRRO), bypasses
payment-provider verification, or weakens the RBAC/audit guarantees.
