# AGENTS.md — how Claude (and other agents) should work in StayKit

This file describes how an AI assistant is expected to behave both **when contributing code** to this
repo and **when operating a live StayKit deployment over MCP**.

## Operating a property over MCP

See [docs/mcp.md](docs/mcp.md) for the full surface (36 tools), scopes, resources, and prompts.

- **Owners, managers, and front-desk staff only.** Guests never get an MCP token. Tools are RBAC-gated
  server-side; the scope on the OAuth token is the source of truth. A staff/manager token may be
  **scoped to specific properties** — you can only see/act on those. Never assume access you weren't
  granted.
- **Operational, not configurational.** You can run the day (book, move, pay, refund, check-in, Form C,
  housekeeping, messages). You **cannot fine-tune the business** by chat — rate-plan pricing, room /
  property / channel setup, and team management are portal-only. Read them for context
  (`list_channels`, `list_rate_plans`) but don't expect a write tool.
- **Money is always paise** (integer). Format only when showing a human. Record cash/UPI with
  `record_payment`; never exceed the balance due.
- **Side effects are real and rate-limited.** `create_payment_link`, `send_notification`, and
  `resend_notification` message actual guests; `create_booking` blocks inventory. Confirm intent
  before invoking them in bulk.
- **Some actions need a human.** `initiate_refund`, `cancel_booking`, and `erase_guest` return
  `needsConfirmation` until re-called with `confirm:true`. Do not loop to bypass it.
- **Everything is logged.** Every tool call writes an `McpAuditEntry`; mutations also write an
  `AuditLog` row tagged `actorType="MCP"`. Assume your actions are reviewed.
- **Respect double-booking errors.** If `create_booking` returns "already booked", do not retry the
  same nights — surface the conflict and propose an alternative room/date.
- **Quote policy and price from source.** Use `quote_booking`, `get_property`, and resources for
  pricing, cancellation policy, and GST — never invented numbers.

## Contributing code

- **Stack:** Next.js 15 (App Router, RSC + Server Actions), TypeScript, Prisma + SQLite.
- **Domain logic lives in `src/lib/`** and stays pure where possible so it's unit-testable. UI calls
  domain services; it does not embed business rules.
- **Regulatory/pricing constants live in `src/lib/config/`.** When GST rates, WhatsApp pricing, or
  thresholds change, edit that file (and the matching `docs/compliance/*`), nothing else.
- **Never store rupees** — paise integers only. Use `lib/money.ts` to format.
- **Tenancy:** every top-level entity carries `ownerId`. Queries filter by the caller's owner. MCP
  tools/resources additionally honour `propertyScopes` (via `propertyScopeWhere`/`assertProperty`).
- **AI-first invariant:** when you add an owner-facing **operational** action (a server action a user
  takes in reaction to a request), add a matching MCP tool in `src/lib/mcp/tools.ts` and a test. New
  **fine-tuning** (pricing, inventory/property/channel setup, team) stays UI-only — see
  [docs/mcp.md](docs/mcp.md) for the boundary.
- **Tests:** add/extend Vitest specs for any change to `tax`, `availability`, `rates`, template
  rendering, or the MCP tool surface. Run `npm test` and `npm run typecheck` before proposing changes.
- **Commits:** Conventional Commits, signed off (`Signed-off-by:` — DCO, no CLA).

## Guardrails

Help with the booking, payments, notifications, compliance, and MCP features described in
`docs/specification.md`. Do **not** add code that scrapes government portals (e.g. e-FRRO), bypasses
payment-provider verification, or weakens the RBAC/audit guarantees.
