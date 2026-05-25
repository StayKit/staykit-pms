# StayKit MCP server

StayKit exposes management capabilities to AI assistants (Claude.ai) over the **Model Context
Protocol**, Streamable HTTP transport, at **`/mcp`**. The product is AI-first: an owner can run the
property by forwarding a WhatsApp/email to Claude, which calls these tools to update StayKit.

Implementation: [src/app/mcp/route.ts](../src/app/mcp/route.ts) (JSON-RPC handler) and
[src/lib/mcp/](../src/lib/mcp/) (`tools`, `resources`, `prompts`, `auth`, `oauth`, `ratelimit`).

## Connect from Claude.ai

1. Claude.ai → **Customize → Connectors → Add custom connector**.
2. URL: `https://<your-staykit-host>/mcp`.
3. Approve the requested scopes in the browser.

Discovery metadata (so clients can find the authorization server):

- `GET /.well-known/oauth-protected-resource` (RFC 9728)
- `GET /.well-known/oauth-authorization-server` (RFC 8414; advertises PKCE `S256`)

## What AI does vs what stays in the portal

The tool surface is deliberately **operational, not configurational**. AI handles the things an owner
reacts to all day (taking a booking, recording a cash payment, moving dates, filing Form C); the
**fine-tuning that sets the rules AI works within stays in the web app**.

| Done via AI (MCP tools)                                          | Web-app only (no MCP write)                            |
| ---------------------------------------------------------------- | ------------------------------------------------------ |
| Book, quote, move, check-in/out, confirm, no-show, cancel, notes | Rate-plan authoring (pricing strategy)                 |
| Record cash/UPI payments, payment links, refunds                 | Room & room-type inventory CRUD                        |
| Edit/erase guests, consent, Form C                               | Property details (address, GSTIN, cancellation policy) |
| Set housekeeping status, block/unblock rooms                     | Booking-source channel management                      |
| Send/resend messages, read delivery log                          | Notification template & automation authoring           |
| Read everything (incl. rates, channels, templates) for context   | Team & role management                                 |

AI can **read** the UI-only areas (it needs rates to quote, channel keys to book) but cannot write
them. Adding a new owner-facing operation? Ship a matching MCP tool unless it's deliberately
fine-tuning — keep the operational surface complete.

## Authentication

Tools require an OAuth 2.1 Bearer token (Authorization Code + PKCE `S256`; opaque tokens stored
**hashed** in `McpAccessToken.tokenHash`). A token carries a `scopes` CSV (1:1 with RBAC
permissions) and a `resource` (RFC 8707). The grantable scope set is `MCP.scopes`
([src/lib/config/index.ts](../src/lib/config/index.ts)) — the operational scopes only; fine-tuning
permissions (`rates:write`, `team:manage`, `mcp:admin`) are **not grantable to a token**.

Flow endpoints: `/api/oauth/register` (RFC 7591 dynamic client registration), `/api/oauth/authorize`,
`/api/oauth/token`. Auth codes are short-lived HMAC-signed blobs; access tokens last 15 min, refresh
tokens 30 days.

> In development (`NODE_ENV!=='production'` and not `REQUIRE_LOGIN=1`) the endpoint falls back to the
> demo owner with full scopes so the MCP Inspector works without the OAuth dance. **Set
> `REQUIRE_LOGIN=1` if you run a non-production `NODE_ENV` on an exposed host.**

## Safety model

- **RBAC scopes** — every tool declares the permission it needs; enforced server-side from the token,
  never trusted from the client.
- **Property scoping** — a MANAGER/STAFF token scoped to specific properties can only read/write those
  (enforced in every tool/resource via `propertyScopeWhere`/`assertProperty`). An OWNER token sees all.
- **Rate limits** ([src/lib/mcp/ratelimit.ts](../src/lib/mcp/ratelimit.ts)) — per token: 60 calls/min,
  1000 calls/hour, and a stricter **10 `send_notification`/hour** (it spends real SMS/email).
- **Human-in-the-loop** — `initiate_refund`, `cancel_booking`, and `erase_guest` return
  `needsConfirmation` until re-called with `confirm:true`. Do not loop to bypass it.
- **Audit** — every call writes `McpAuditEntry` (args PII-redacted); mutations also write an
  `AuditLog` row tagged `actorType="MCP"`. Read tools mask guest phone/email.

## JSON-RPC methods

`initialize`, `ping`, `notifications/initialized`, `tools/list`, `tools/call`, `resources/list`,
`resources/read`, `prompts/list`, `prompts/get`. Example:

```bash
curl -X POST https://host/mcp \
  -H 'content-type: application/json' \
  -H 'Authorization: Bearer <token>' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call",
       "params":{"name":"get_kpis","arguments":{"from":"2026-05-01","to":"2026-05-31"}}}'
```

`tools/list` returns only the tools the token is scoped for. Tool errors come back as a result with
`isError:true` (not a JSON-RPC error), per MCP convention.

## Tools (36)

Money is always **paise** (integer). Dates are `YYYY-MM-DD`.

### Read — context the AI pulls before acting

| Tool                                            | Scope                           | Notes                                                 |
| ----------------------------------------------- | ------------------------------- | ----------------------------------------------------- |
| `list_properties`, `get_property`, `list_rooms` | `properties:read`               | `list_rooms` includes housekeeping status             |
| `list_rate_plans`, `list_maintenance_blocks`    | `properties:read`               | rates are read-only over MCP                          |
| `list_channels`                                 | `bookings:read`                 | use a channel `key` for `create_booking`              |
| `check_availability`, `quote_booking`           | `bookings:read`                 | `quote_booking` = price + availability, no write      |
| `list_bookings`, `get_booking`                  | `bookings:read`                 | `list_bookings` includes the source channel           |
| `search_guests`, `get_guest`                    | `bookings:read` / `guests:read` | search is redacted + segmentable; get is full profile |
| `get_payment_status`                            | `payments:read`                 |                                                       |
| `list_form_c_pending`                           | `compliance:read`               | foreign guests still needing FRRO Form C              |
| `list_notification_log`                         | `notifications:read`            | delivery status; recipient masked                     |
| `get_kpis`, `source_mix`                        | `reports:read`                  | occupancy/ADR/RevPAR; channel breakdown               |

### Write — reacting to a request

| Tool                                                       | Scope                | Notes                                             |
| ---------------------------------------------------------- | -------------------- | ------------------------------------------------- |
| `create_booking`                                           | `bookings:write`     | double-booking-safe; tagged `createdViaMcp`       |
| `modify_booking`                                           | `bookings:write`     | move room/dates; recomputes rate + GST            |
| `check_in`, `check_out`, `confirm_booking`, `mark_no_show` | `bookings:write`     | lifecycle transitions                             |
| `update_booking_notes`                                     | `bookings:write`     | arrival time / special requests                   |
| `cancel_booking`                                           | `bookings:cancel`    | **HITL**; releases nights; does not auto-refund   |
| `set_room_status`                                          | `bookings:write`     | housekeeping CLEAN/DIRTY/IN_PROGRESS/OUT_OF_ORDER |
| `record_payment`                                           | `payments:write`     | cash/UPI/bank/card; can't exceed balance due      |
| `create_payment_link`                                      | `payments:read`      | real side effect (SMS/email)                      |
| `initiate_refund`                                          | `payments:refund`    | **HITL**; policy-quoted                           |
| `update_guest`, `erase_guest`                              | `guests:write`       | edit / DPDP erasure (`erase_guest` is **HITL**)   |
| `mark_form_c_filed`                                        | `compliance:write`   | record FRRO Form C filed                          |
| `send_notification`, `resend_notification`                 | `notifications:send` | send a trigger / re-send a logged message         |
| `block_room`, `unblock_room`                               | `properties:write`   | maintenance blocks (inventory CRUD stays UI-only) |

## Resources

Read-only context under `staykit://…`, owner- and property-scoped:

- `staykit://properties` · `staykit://properties/{id}`
- `staykit://policies/cancellation/{id}`
- `staykit://bookings/{id}` (template)
- `staykit://reports/occupancy/{from}/{to}` (template)

## Prompts

Reusable owner instructions (`prompts/list`, `prompts/get`):

- `daily_briefing` — arrivals/departures, who owes money, Form C backlog, occupancy.
- `revenue_report(from, to)` — KPIs + channel breakdown as a table.
- `guest_outreach_draft(audience, theme, channel?)` — drafts a message to opted-in guests; never sends.

## Notes

- The handler is hand-rolled (no `@modelcontextprotocol/sdk`) to keep dependencies minimal; it
  implements the subset Claude.ai needs and is conformant for tools/resources/prompts.
- `listChanged` is `false` on all capabilities and there is no server-initiated SSE stream (GET `/mcp`
  returns a 200 text notice); add these if a future client needs push notifications.
