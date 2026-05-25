# StayKit

**Run your homestay, not a spreadsheet.**

StayKit is an open-source, self-hostable **booking & reservation management system** for Indian
homestay owners — built on **Next.js 15 + Prisma + SQLite**, with **Razorpay payment links**,
**OTP guest login**, GST-aware invoicing, and a hosted **Model Context Protocol (MCP) server** so
owners can run their property from inside **Claude.ai** in natural language.

> Status: **v1 foundation.** Core PMS, booking engine, guest portal, and the MCP server are working.
> External integrations (Razorpay live, MSG91/Resend) are wired to the correct API shape and run in a
> safe **mock/console mode** until you add credentials.

![License: AGPL-3.0](https://img.shields.io/badge/license-AGPL--3.0-1B5E5A)
![Stack](https://img.shields.io/badge/Next.js%2015-Prisma-SQLite-3D5A80)
![Made for India](https://img.shields.io/badge/made%20for-India%20%F0%9F%87%AE%F0%9F%87%B3-E07A5F)

---

## Why StayKit

- **One screen that matters** — who's arriving today and who hasn't paid yet.
- **A tape-chart calendar** where **double-booking is impossible by design** (a unique
  `(room, night)` constraint, enforced inside a serializable transaction).
- **Manual channel attribution** instead of brittle OTA two-way sync — cheaper, simpler, and how
  most Indian homestay owners actually work.
- **GST baked in** — 5% / 18% by per-night transaction value (SAC `996311`), Form C reminders for
  foreign guests, DPDP-ready consent and erasure.
- **The MCP differentiator** — connect StayKit to Claude.ai as a custom connector and manage the
  property by chat. Every AI action is OAuth-scoped, RBAC-checked, and written to an audit log.
- **Cheap to host** — SQLite + Litestream on a ₹400/month VPS. One-line switch to Postgres later.

## Try it in 5 minutes

```bash
git clone <your-fork> staykit && cd staykit
npm install
cp .env.example .env          # the defaults work out of the box (mock mode)
npm run setup                 # prisma generate + db push + seed demo data
npm run dev                   # http://localhost:3000
```

Open:

- **`/`** — marketing landing page
- **`/dashboard`** — the owner app (browsable in demo mode without login)
- **`/my`** — the guest portal (OTP; the dev code is printed in the terminal)
- **`/signin`** — staff sign-in (use the seeded owner phone `+919800014782`; code is logged)

## Architecture

```
Browser / Claude.ai
   │ HTTPS                         │ HTTPS + OAuth 2.1 Bearer
   ▼                               ▼
Next.js 15 App Router        /mcp  Streamable HTTP (JSON-RPC)
 - Server Components           - tools/list, tools/call
 - Server Actions   ── shared ─┤ - RBAC scope enforcement
 - Route Handlers     domain   │ - immutable audit log
        │            services  │
        ▼                       ▼
Domain services: booking · payments · notifications · audit · mcp · auth · rbac · tax · reports
        ▼
Prisma + SQLite (WAL) · in-process Job worker · Litestream → S3
```

Key modules (`src/lib/`):

| Path                                   | Responsibility                                                          |
| -------------------------------------- | ----------------------------------------------------------------------- |
| `booking/engine.ts`                    | Transactional create/check-in/out/cancel; **double-booking prevention** |
| `booking/availability.ts` · `rates.ts` | Pure availability + rate-plan resolution (unit-tested)                  |
| `tax.ts`                               | GST computation per Notification 15/2025 (unit-tested)                  |
| `payments/`                            | Razorpay payment links, refunds, webhook signature verification         |
| `notify/`                              | Template engine + provider interface (MSG91 / Resend, console fallback) |
| `mcp/`                                 | Tool catalog + handlers + OAuth bearer resolution                       |
| `rbac/policy.ts`                       | Role → permission map; OAuth scopes map 1:1                             |
| `auth/`                                | OTP issuance/verification + session cookies                             |

## The MCP server

The Streamable HTTP endpoint lives at **`/mcp`**. Discovery metadata is published at
`/.well-known/oauth-protected-resource` and `/.well-known/oauth-authorization-server`.

In Claude.ai → **Customize → Connectors → Add custom connector** → paste `https://<your-host>/mcp`.

**36 tools, RBAC-enforced** (scopes map 1:1 to permissions), plus read-only resources and reusable
prompts. The surface is deliberately **operational**: AI takes/moves/cancels bookings, records cash
payments, manages guests, files Form C, sets housekeeping status, sends messages, and reads reports —
while **fine-tuning stays in the portal** (rate-plan pricing, room/property/channel setup, team). AI
can read those for context but not change them by chat.

Safety: OAuth 2.1 + PKCE, per-token rate limits, property-level scoping for staff/managers,
human-in-the-loop confirmation on refunds / cancellations / guest erasure, and a full audit trail. See
[docs/mcp.md](docs/mcp.md).

## Scripts

| Command                       | What it does                         |
| ----------------------------- | ------------------------------------ |
| `npm run dev`                 | Start the dev server                 |
| `npm run build` / `npm start` | Production build / serve             |
| `npm run setup`               | `prisma generate` + `db push` + seed |
| `npm run db:reset`            | Wipe & re-seed the demo data         |
| `npm test`                    | Run the Vitest unit suite            |
| `npm run typecheck`           | `tsc --noEmit`                       |

## Compliance, baked in

GST (5%/18% by per-night value, SAC 996311), Form C / Form III reminders for foreign guests
(Immigration & Foreigners Act 2025), and DPDP 2025 (consent capture, export, erasure with statutory
tax-record holds, 90-day auto-purge of ID documents). See [docs/compliance/](docs/compliance/).
**StayKit reminds; it does not auto-file with the government.**

## Deployment

Coolify / Dokku / Docker (recommended), Fly.io (region `bom`), or Railway with a persistent volume —
all with a Litestream sidecar replicating SQLite to S3-compatible storage. Migrate to Postgres with a
one-line Prisma `provider` switch when you cross ~25 properties. See [docs/self-hosting.md](docs/self-hosting.md).

## License

**AGPL-3.0-or-later.** The network-use clause keeps hosted-SaaS forks open. See
[docs/license-rationale.md](docs/license-rationale.md). Contributions are accepted under the
**DCO** (`Signed-off-by:` in commits) — no CLA.

The `design/` folder contains the original HTML/JSX prototype the UI was built from, and the original
product specification lives in `docs/specification.md`.
