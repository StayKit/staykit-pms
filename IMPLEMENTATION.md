# StayKit — Implementation Tracker

Gap analysis of the spec (`docs/specification.md`) against the codebase, turned into a
build plan. The Prisma schema is already complete; the missing work is in the worker,
domain services, server actions, and UI layers. The project deliberately uses **minimal
dependencies** (no mustache, no MCP SDK, no JWT lib, no Recharts) — new code follows that
hand-rolled style unless a dependency is unavoidable.

**Status legend:** ✅ done · 🚧 in progress · ⬜ not started · ⏭️ deferred (documented why)

Last updated: 2026-05-23

---

## Phase 1 — Background jobs & notification worker `✅`

The biggest hole: queued notifications were never drained, so payment-received messages
silently never sent.

- ✅ `src/lib/jobs/queue.ts` — generic Job enqueue / claim (atomic) / complete / retry
- ✅ `src/lib/jobs/tasks.ts` — task bodies: occupancy snapshot, nightly cleanup, Form C reminder
- ✅ `src/lib/jobs/worker.ts` — in-process poller: drains `NotificationLog` QUEUED rows + daily cron, exponential backoff → DLQ
- ✅ `src/lib/notify/dispatch.ts` — `drainNotifications()` with backoff/DLQ
- ✅ `src/instrumentation.ts` — start the worker on server boot (nodejs runtime only)
- ✅ Tests (28 new): drain happy-path, backoff/DLQ, claim races, cron task bodies, daily-gating
- ⏭️ Refund poll job — folded into Phase 2 (needs refunds to exist first)

## Phase 2 — Refunds end-to-end `✅`

`initiateRefund()` existed but had no caller; cancel & refund (J5) was non-functional.

- ✅ `src/lib/booking/cancellation.ts` — policy engine: refundable amount by lead time + reason
- ✅ `src/lib/payments/service.ts` — `createRefund()`, `markRefundProcessed()`, `markRefundFailed()` (Razorpay + mock auto-settle, audits, guest notify)
- ✅ Webhook: handle `refund.processed` / `refund.failed` (route refactored into focused handlers)
- ✅ `src/lib/actions/payments.ts` — `refundAction` + `quoteRefundAction` (RBAC `payments:refund`)
- ✅ UI: `RefundPanel` in `BookingDetailView` (reason → live policy quote → process), refund rows in timeline
- ✅ MCP `initiate_refund`: previews policy, then actually refunds on `confirm=true`
- ✅ Tests (38 new): cancellation policy, refund service, webhook refund events, MCP refund
- ⏭️ `RAZORPAY_REFUND_POLL` backstop — deferred: webhook + mock auto-settle cover all current
  paths; a live poll needs a Razorpay "get refund" client method we haven't wrapped yet.

## Phase 3 — Property / inventory / rate-plan / channel CRUD `✅`

Currently nothing could be configured through the UI — only via seed. Now fully CRUD-able.

- ✅ `src/lib/actions/properties.ts` — property create/update with GSTIN + pincode validation
- ✅ `src/lib/actions/rooms.ts` — room types + rooms CRUD, cleanliness, delete guards
- ✅ `src/lib/actions/rateplans.ts` — rate plans + overrides, maintenance blocks w/ booking-overlap check
- ✅ `src/lib/actions/channels.ts` — channel sources create/update/toggle (slugified keys)
- ✅ `src/lib/actions/{result,guards}.ts` — shared ActionResult + tenancy/RBAC guard helpers
- ✅ `src/lib/india.ts` — Indian states/UT list for property forms
- ✅ Pages: `/properties`, `/properties/[id]/{rooms,rate-plans,maintenance,settings}` (+ `PropertyTabs`)
- ✅ Page: `/channels`; nav entries + titles added; managers under `components/owner/manage/`
- ✅ Tests (12 new): channels, properties, rooms/types, rate plans, maintenance overlap
- ✅ `npm run build` green (all new routes), `next lint` clean, tsc clean, 416 tests pass
- 📝 Note: room-types share the `/rooms` page (combined inventory view) rather than a separate route.

## Phase 4 — Onboarding wizard `✅`

- ✅ `/onboarding` 5-step first-run wizard (property → rooms → rates → payments → notifications)
  with a live progress bar that reads real setup state from the DB
- ✅ "Why we ask this" explainers per step; embedded property form (stays in-wizard via `onCreated`)
- ✅ `src/lib/notify/defaults.ts` + `src/lib/actions/notifications.ts` — seed 9 default templates,
  toggle/update/test-send (also powers the notifications page in Phase 5)
- ✅ Tests (4 new): seed idempotency, toggle/update, test-send
- 📝 Razorpay step links to `/settings` until `/settings/integrations` lands in Phase 5.

## Phase 5 — Remaining owner surfaces `🚧 (core done)`

- ✅ `/guests/[id]` — profile, stay history, marketing-consent toggle, DPDP erasure (anonymise-on-billable)
  via `src/lib/actions/guests.ts`; guest list rows now link through
- ✅ `/team` — users, roles, property-scope assignment, enable/disable (self-protected) via `src/lib/actions/team.ts`
- ✅ Reports sub-pages: `/reports/audit` (human vs 🤖 vs system filter) and `/reports/payments`
  (reconciliation + refunds); links + CSV export wired from `/reports`
- ✅ Booking **move/modify** (dates + room) — `moveBooking()` engine fn with conflict re-check + GST
  recompute, `moveBookingAction`, `MovePanel` in the booking detail
- ✅ Tests (16 new): guests (consent/edit/erase), team (create/role/scope/toggle), move (dates/room/conflict)
- ⏭️ Settings sub-pages (`/settings/{integrations,account,mcp,legal}`): deferred — the combined
  read-only `/settings` page already shows integration status; keys belong in `.env` for a self-host,
  so there's no DB key-entry form to build. Onboarding links to `/settings`.
- ⏭️ `/reports/{occupancy,revenue}` split: deferred — both already live on the combined `/reports` page.
- ⏭️ Full booking flow extra fields (ID upload, multi-guest, GST customer): folded into Phase 8 (storage).

## Phase 6 — MCP completeness `✅`

- ✅ Tools: `modify_booking`, `block_room`, `unblock_room`, `list_rate_plans`, `upsert_rate_plan`,
  `send_notification` (catalog now 21 tools, all scope-enforced)
- ✅ MCP Resources (`src/lib/mcp/resources.ts`): `staykit://properties[/{id}]`, `bookings/{id}`,
  `policies/cancellation/{id}`, `reports/occupancy/{from}/{to}` + resource templates
- ✅ MCP Prompts (`src/lib/mcp/prompts.ts`): `daily_briefing`, `revenue_report`, `guest_outreach_draft`
- ✅ Route wires `resources/list|read`, `prompts/list|get`; `initialize` advertises both capabilities
- ✅ Tests (20 new): new tools, resources read/list, prompts; route-level resource/prompt methods

## Phase 7 — OAuth 2.1 + PKCE for MCP `✅`

- ✅ `/api/oauth/register` (RFC 7591 Dynamic Client Registration, public/PKCE clients)
- ✅ `/api/oauth/authorize` — PKCE-mandatory (S256) auth-code flow, redirect_uri validation,
  scope narrowing, RFC 8707 `resource`, owner session w/ dev fallback
- ✅ `/api/oauth/token` — authorization_code (PKCE verify) + refresh_token (with rotation/revoke)
- ✅ `src/lib/mcp/oauth.ts` — stateless HMAC-signed auth codes, PKCE S256, opaque token mint
- ✅ AS metadata updated; resolveMcpContext already validates the issued opaque tokens
- ✅ Tests (12 new): helpers + full register→authorize→token→MCP-call flow, PKCE reject, refresh rotation
- 📝 **Design decision:** issue **opaque** access/refresh tokens validated by RS-internal DB lookup
  (valid for a combined self-hosted AS+RS) instead of EdDSA JWTs + JWKS — so `/.well-known/jwks.json`
  is intentionally not published. Swapping to signed JWTs later is localised to oauth.ts + auth.ts.

## Phase 8 — Files, DPDP, invoices, observability `🚧 (core done)`

- ✅ `src/lib/storage/` — local backend; **AES-256-GCM** encryption for `GUEST_ID` files at rest
- ✅ Guest ID **upload** (`uploadGuestIdAction`) + **audited view route** (`/guests/[id]/id-document`
  writes an AuditLog row on every view) + UI in `GuestActions`
- ✅ **90-day auto-purge** of ID docs after checkout (`purgeExpiredGuestIds` in daily tasks); erasure shreds the file
- ✅ DPDP: consent capture/withdraw + right-to-erasure (Phase 5) now also delete encrypted ID bytes
- ✅ **GST invoice** at `/bookings/[id]/invoice` — printable HTML (CGST/SGST split, SAC 996311), linked from booking detail
- ✅ Observability: `/api/metrics` (Prometheus text), `/api/webhooks/msg91` delivery receipts → NotificationLog status
- ✅ Tests (19 new): encrypt/decrypt, saveFile/read/delete, purge, metrics, msg91, guest-ID upload
- ⏭️ **Deferred (documented):** S3 storage backend (interface ready), Reports XLSX/PDF export (needs a
  spreadsheet lib — CSV ships today), `next-intl` i18n + `hi-IN` catalog (large UI migration; en-IN
  number/date formatting already in place), step-up **OTP** re-auth before viewing IDs (RBAC + audit
  gate ships now), Sentry/`pino` wiring (structured logs to AuditLog + `/api/metrics` ship now).

## Payments: cash-first (post-build change) `✅`

Razorpay is now a **backup, off by default** — most homestays run on cash/UPI.

- ✅ `onlinePaymentsEnabled()` gate (`razorpay/client.ts`): online links turn on **only** when keys
  are present AND credentials verify against Razorpay (cached 10 min). Default everywhere → cash/manual.
- ✅ `Property.paymentInstructions` field — owner-editable (PropertyForm/settings), shown to guests.
- ✅ Guest portal: unpaid bookings show the payment instructions + **"Awaiting payment confirmation"**
  (no online link unless enabled); paid shows "Paid in full".
- ✅ Manager confirmation: `recordPaymentAction` (amount + method: cash/UPI/bank/card) + `RecordPaymentPanel`
  in the booking detail; QuickAdd defaults to "Collect manually", online link chip only when enabled.
- ✅ Server guards: `createBookingAction`/`sendPaymentLinkAction` no-op the online path when disabled.
- ✅ Tests (11 new/updated): online-gate (off by default, on only when verified), recordPayment,
  cash-first booking creation, guest-portal status, BookingDetailView cash fallback.

---

## Summary

Phases 1–7 complete; Phase 8 core complete with the heavier integrations (S3, i18n, XLSX,
Sentry, step-up OTP) explicitly deferred with rationale. **475 tests pass, `next lint` clean,
`tsc` clean, `npm run build` green.** Test count grew 404 → 475 (+~150 since the gap analysis).

---

## Notes / decisions

- Worker drains `NotificationLog` QUEUED rows directly (matches `dispatch.ts` design note),
  with a generic `Job` queue for non-notification background work (cron, refund poll).
- Keeping the single-app layout and hand-written CSS per existing build decisions.
