# Open-Source Homestay Booking & Reservation Management System — Specifications

## Executive Summary

This document bundles two publication-ready specifications for an open-source, self-hostable Homestay Booking & Reservation Management System ("StayKit" — placeholder name) targeting Indian non-technical homestay owners. The system is a **Next.js 15 (App Router, TypeScript) + Prisma + SQLite** application with **Razorpay Payment Links** for remote payment collection, **OTP-based** guest login, **RBAC-secured** owner/manager dashboards, configurable email/SMS/WhatsApp automations, and a hosted **Model Context Protocol (MCP) server** that exposes management capabilities to AI assistants like Claude.ai over OAuth 2.1 + Streamable HTTP.

Three design positions drive everything below:

1. **SQLite is production-fit for this workload** (single-owner scope, low write concurrency, ~5–500 reservations/day) when paired with WAL mode, `better-sqlite3`, Litestream replication to S3-compatible object storage, and disciplined transaction boundaries. The system is built to migrate to Postgres with a single Prisma config switch when an owner crosses ~25 properties or sustained writes >10/sec.
2. **Manual channel attribution is a feature, not a limitation.** Excluding OTA two-way sync removes a large category of regulatory and reconciliation complexity, keeps the project self-hostable on a ₹400/month VPS, and matches how most Indian homestay owners actually work.
3. **The MCP server is the differentiator.** Owners/managers (never guests) can run their property from inside Claude.ai using natural language. RBAC is enforced server-side at the tool-handler level; every AI-initiated action is written to an immutable audit log; OAuth 2.1 scopes map 1:1 to RBAC permissions.

Both specs are calibrated to: the **September 2025 GST hospitality rate cut** (5% ≤ ₹7,500/night without ITC; 18% above ₹7,500 with ITC, per Notification 15/2025-Central Tax (Rate) dated 17 Sep 2025); the **Immigration and Foreigners Act 2025** Form C / Form III electronic reporting regime (in force 1 Sep 2025, OCI cardholders now included); the **MCP 2025-11-25 authorization spec** (PKCE mandatory, CIMD default, RFC 8707 Resource Indicators, RFC 9728 Protected Resource Metadata); and the **DPDP Rules 2025** (notified 13 Nov 2025, full compliance 13 May 2027).

---

# Document A — Design Specification

## A.1 Information Architecture & Site Map

Two distinct surfaces, one shared design language.

```
A. OWNER / MANAGER APP (authenticated, RBAC-gated)
   /                              → Marketing landing (logged out) OR Dashboard redirect
   /signin                        → Email/phone + OTP login for staff (Owner/Manager/FrontDesk)
   /onboarding/*                  → First-run wizard (property, rooms, rates, payments, notifications)
   /dashboard                     → KPI tiles, today's arrivals/departures, occupancy strip
   /calendar                      → Tape chart (multi-property tabs, room-row × date-column grid)
   /bookings
       /                          → List view + filters (status, source, dates, property)
       /new                       → Quick-add modal OR full booking flow
       /[id]                      → Booking detail (guest, stay, payments, communications, audit)
       /[id]/edit
       /[id]/cancel
       /[id]/check-in
       /[id]/check-out
   /guests
       /                          → Guest CRM list
       /[id]                      → Profile, stay history, documents, communications, marketing consent
   /properties
       /                          → Property switcher
       /[id]/rooms                → Room inventory CRUD
       /[id]/room-types
       /[id]/rate-plans           → Seasonal, BAR, packages, weekday/weekend overrides
       /[id]/maintenance          → Blackouts / downtime
       /[id]/settings             → GST, invoice prefix, address, policies
   /reports
       /occupancy                 → Daily occupancy, ADR, RevPAR, source mix
       /revenue                   → Period summaries, GST-ready
       /payments                  → Razorpay reconciliation, refunds
       /audit                     → Audit log viewer (filter by actor: human vs. MCP)
   /channels                      → Source channels (Direct, Walk-in, Phone, Instagram, OTA-Airbnb-manual, …)
   /notifications
       /templates                 → Email / SMS / WhatsApp templates, variable picker
       /automations               → Trigger → template mappings with delays
       /logs                      → Send attempts, delivery status, retries
   /team                          → Users, roles, property assignments
   /settings/integrations         → Razorpay keys, DLT IDs, MSG91/SMS, WhatsApp BSP, Email provider
   /settings/account              → Owner profile, exports, danger zone
   /settings/mcp                  → MCP server status, issued tokens, OAuth clients, audit slice
   /settings/legal                → DPDP consent text, retention policy, privacy notice editor

B. GUEST PORTAL (low-auth, OTP only)
   /my                            → Phone number entry
   /my/verify                     → OTP entry
   /my/bookings                   → List of own bookings (by mobile number)
   /my/bookings/[id]              → Detail, payment link, check-in instructions, cancel request
   /pay/[paymentLinkToken]        → Razorpay-hosted page (redirect)

C. PUBLIC / SYSTEM
   /api/*                         → REST endpoints (server actions used in-app)
   /mcp                           → MCP Streamable HTTP transport endpoint
   /.well-known/oauth-protected-resource
   /.well-known/oauth-authorization-server
   /.well-known/jwks.json
   /webhooks/razorpay
   /webhooks/msg91|provider
```

## A.2 User Personas

**P1. Priya — Owner, 1–4 properties.** Age 38, runs a 5-room homestay in Coorg and a 3-cottage place in Madikeri. Uses an iPhone, comfortable with WhatsApp Business and Instagram DMs, intimidated by spreadsheets. Wants: a single screen showing "who's arriving today and who hasn't paid yet"; one-tap "send payment link"; monthly GST-ready report to email her CA. Sensitive to: technical jargon, multi-step settings.

**P2. Rakesh — Property Manager, single property.** Age 31, employed by Priya to run her Madikeri property. Has full operational rights at that property only; cannot see her Coorg books or financials beyond his property. Lives in the tape chart and the bookings list. Often offline; expects optimistic UI to reconcile.

**P3. Anjali — Front-desk / housekeeping coordinator.** Limited role: can check guests in/out, change room cleanliness status, view (not edit) rate plans, view guest contacts but not full ID documents. Uses an Android tablet at the reception desk. UI must be touch-friendly with large hit targets.

**P4. Sameer — Guest.** Booked over a phone call by Rakesh. Receives an SMS and WhatsApp message with a payment link and a "View My Booking" link. Hits the guest portal, enters his mobile, gets an OTP, sees his stay details, downloads the GST invoice after checkout. Does not create an account, does not set a password.

**P5. Claude (AI agent acting for Priya).** A non-human principal, scope-limited to Priya's properties via an OAuth 2.1 access token, capable of calling MCP tools she has authorised. Every action is signed, logged, and reversible.

## A.3 Key User Journeys

### J1. First-run owner setup (5 minutes, 5 steps)
1. **Sign up** with mobile number → OTP → set name and display.
2. **Add property**: name, address (state dropdown defaults to India), GSTIN (optional with explainer "skip if turnover < ₹20 lakh — ₹10 lakh in HP, Uttarakhand and the Northeast states"), check-in/check-out times, cancellation policy template.
3. **Add room types and rooms**: e.g. "1 Deluxe Cottage, 2 Standard, 1 Family Suite". Inline `+ Add room` chips. Default rate per room type.
4. **Configure Razorpay**: paste Key ID and Key Secret, paste Webhook Secret. Inline "Test connection" hits `/v1/payments?count=1` and shows ✓ or a friendly error.
5. **Pick notification channels**: toggle Email/SMS/WhatsApp; for SMS, show the DLT setup guide link; pre-seed six default templates (booking confirmation, payment link, payment received, day-before reminder, post-stay thank-you, cancellation).

The empty-state dashboard then shows a single tape-chart row with one inviting CTA: **"Create your first booking"**.

### J2. Manual booking (quick-add) — < 30 seconds
Click `+ Book` on a tape-chart cell (which pre-selects dates and room). Modal:
- Guest mobile (auto-lookup against guest DB) → name auto-fills if returning
- Stay dates (pre-filled from cell selection, range picker)
- Number of guests (adults/children stepper)
- Rate (auto-suggested from rate plan, editable)
- **Source channel** (dropdown: Direct / Walk-in / Phone / Instagram / WhatsApp / Airbnb / Booking.com / MMT / Other)
- Status: Confirmed (default) / Tentative / Blocked
- Payment: collect now (generates payment link, sends via SMS+Email) / mark paid / collect at check-in
- Notes (free-text)

Save → tape chart updates optimistically with the new colored bar; SMS/email is queued.

### J3. Full booking (detailed) — used when guest has special needs
Adds: ID document upload, dietary preferences, transport request, multi-guest list with ages, foreign-national flag (auto-suggests Form C reminder), GST customer details, billing address.

### J4. Check-in
Tap arriving guest in the "Today" card → check-in screen → confirm guest ID (capture if not on file) → mark room "Occupied" → trigger check-in-instructions notification → if foreign-national flag set, surface a one-tap "I have filed Form C" checkbox with link to `https://indianfrro.gov.in/sform`.

### J5. Cancel & refund
Booking detail → Cancel → pick reason (Guest cancellation / No-show / Owner cancellation / Force majeure) → cancellation policy auto-calculates refundable amount based on lead time → optionally override → "Cancel & refund" triggers a Razorpay refund (normal 5–7 working days, or "optimum" for instant where possible), updates booking status, fires the refund-processed notification when the webhook arrives.

### J6. Guest portal
SMS/email link → `/my` → enter mobile → OTP → list of bookings tied to that mobile. From a booking: pay outstanding (Razorpay), view check-in instructions, request cancellation (goes to owner for approval; doesn't directly mutate), download invoice.

### J7. AI-assisted management
Owner connects StayKit in Claude.ai → Customize → Connectors → Add custom connector → pastes `https://<their-host>/mcp` → OAuth flow → browser approves scopes (`bookings:read`, `bookings:write`, `payments:read`, `payments:refund`, `notifications:send`, `properties:read`). Then: "Show me last week's RevPAR for both properties and draft a WhatsApp blast for guests who stayed in March." Claude calls `list_bookings`, `get_kpis`, `send_notification`.

## A.4 Wireframe-Level Screen Descriptions

### Dashboard (`/dashboard`)
Top row: four KPI cards in a 12-col grid — **Today's arrivals** (count + click-through), **Today's departures**, **Tonight's occupancy** (e.g., 78% — 7 of 9 rooms), **Pending payments** (₹ amount + count of links). Middle: a "Next 7 days" mini tape strip (click to expand to full calendar). Below: a two-column split — **Today's arrivals list** (guest name, room, paid/unpaid pill, "Send link" / "Check in" buttons) and **Recent activity feed** (deduplicated audit log: "Rakesh checked in Sameer — Room 4 — 11:42 AM"). Mobile: cards collapse to a single column; the strip becomes horizontally scrollable.

### Tape Chart (`/calendar`) — the canonical PMS view
- Header: property tab strip + date-range navigator (Today / Week / 14 days / Month) + "+ Block" + "+ Book".
- Y-axis: rooms grouped by room type (collapsible groups). Each row shows room number, room-type chip, current cleanliness icon (clean ●, dirty ●, in-progress ◐).
- X-axis: dates, weekends shaded; today vertical highlight.
- Cells: empty (available) or filled with a colored bar spanning check-in → check-out.
- **Color conventions** (WCAG AA contrast; also encoded with status icon for color-blind users):
  - **Tentative** — striped amber
  - **Confirmed (unpaid)** — solid red-orange `#E07A5F`
  - **Confirmed (partial paid)** — solid yellow `#F2CC8F` with ⚠ corner badge
  - **Confirmed (paid)** — solid blue `#3D5A80`
  - **Checked in** — solid green `#81B29A`
  - **Checked out** — neutral grey `#9CA3AF`
  - **No-show** — dashed red border, white fill
  - **Maintenance / Blackout** — diagonal grey hatch
  - **Owner block (personal use)** — purple solid `#A89BD0`
- Drag-and-drop: move a booking to a different room or different dates. Drag handles on bar edges to extend stay. Hover tooltip shows guest name, source, total, balance due.
- Right click (long-press on touch): context menu — Edit / Check in / Send link / Move / Cancel.
- Click on empty cell: quick-add prefilled to that room + date.
- Legend collapsible at the bottom.

### Booking Detail (`/bookings/[id]`)
Two-column. Left (60%): tabs — **Stay** (dates, room, rate breakdown with line-item GST, source channel badge, notes), **Guest(s)** (primary + companions, IDs, contacts, foreign-national flag), **Payments** (link state-machine timeline, refunds, settlement reference), **Communications** (every SMS/email/WhatsApp sent with delivery status), **Audit** (every state change with actor — including MCP actions tagged 🤖). Right (40%): sticky action card — current status big pill, primary action ("Send payment link" / "Check in" / "Check out"), secondary actions (Modify dates, Move room, Cancel), and a downloadable Invoice (PDF) button enabled once paid.

### Room Configuration (`/properties/[id]/rooms`)
Table of rooms with inline edit. Add-Room modal: name/number, room type (dropdown with "+ New type"), max occupancy, base rate (optional override), photo upload (drag-drop), amenities multi-select, "Active" toggle. Room Types page: separate CRUD for types with default rate and tape-chart sort order.

### Rate Plans (`/properties/[id]/rate-plans`)
Card per plan: name (e.g., "Diwali Special"), date validity, day-of-week applicability checkboxes, room-type-specific overrides, min-stay, max-stay, refundable toggle. Tape-chart cells reflect the effective rate from the highest-priority matching plan.

### Guest Profile (`/guests/[id]`)
Header: avatar (initials), name, mobile (with WhatsApp shortcut), email. Sections: Stays (timeline), Documents (Aadhaar/passport with last-4 masked; viewing the full doc requires step-up re-auth and writes an AuditLog row), Communications history, Preferences/notes, Marketing consent toggle (DPDP), Right-to-erasure button (with confirm modal explaining the consequences and statutory exceptions for tax records — typically 6 years under the GST Act and 8 years under the Income Tax Act).

### Reports
Each report has the same chrome: date-range pickers (with India-friendly presets — "This month", "Last month", "Q1 FY26", "Custom"), property filter, export to CSV/XLSX/PDF. Charts via Recharts. Tooltips explain ADR/RevPAR in plain Indian English ("ADR = average price per room sold. RevPAR = revenue per available room — even unsold ones").

### Settings → Integrations
Vertical sub-nav: Razorpay, SMS (MSG91 default), WhatsApp, Email, MCP, DPDP. Each panel has a "Test" button and a status pill.

### Mobile views
On phones the tape chart shows one room row at a time (vertical scroll selects room, horizontal scroll selects dates), with an alternative **Day list** view: pick a date, see all rooms vertically with status pill — better for one-handed phone use. Add-booking becomes a full-screen bottom-sheet, not a popover.

### Guest Portal (`/my`)
Single centered card on mobile-first layout. Step 1: phone input with +91 prefix locked (changeable for international), big Continue button. Step 2: 6-digit OTP input (auto-advance, paste-friendly), 30-second resend countdown, "Try email instead" fallback. Step 3: bookings list — each card shows property name + dates + status pill + "Pay ₹X,XXX" CTA if unpaid.

## A.5 Component Library (built on shadcn/ui)

Base: **shadcn/ui** (Radix primitives + Tailwind CSS v4). Components we register from the registry: `button, input, input-otp, label, form, select, combobox, command, dialog, sheet, drawer, popover, tooltip, dropdown-menu, context-menu, table, data-table, tabs, accordion, badge, avatar, calendar, date-picker (range + presets), checkbox, radio-group, switch, separator, sonner (toasts), alert, alert-dialog, skeleton, progress, card, breadcrumb, pagination`. (Date Picker per shadcn docs is composed from `<Popover />` and `<Calendar />` — there's no DatePicker root component, by design.)

Custom composite components we author and document in `/components/storybook` (or Ladle):
- `TapeChart` — virtualized grid using `@tanstack/react-virtual`, accepts `rooms[]` and `bookings[]`, emits drag/resize events.
- `BookingBar` — the colored pill on the tape chart, status-aware.
- `RoomStatusPill` — clean / dirty / in-progress with icon + text.
- `MoneyINR` — formats `paise → ₹ X,XX,XXX.XX` with Indian numbering.
- `OTPInput` — wraps shadcn `input-otp` with rate-limit messaging.
- `PaymentLinkCard` — state-machine renderer (Created → Paid → Refunded → Expired).
- `ChannelBadge` — colored chip per source.
- `EmptyState` — illustration + headline + CTA.
- `LangSwitcher` — `en-IN` / `hi-IN` (initially); `kn-IN`, `ml-IN`, `mr-IN`, `ta-IN` queued.

## A.6 Design System

**Typography**: Inter (UI), Source Serif Pro (invoice PDFs only). Sizes follow shadcn defaults (`text-xs 12, text-sm 14, text-base 16, text-lg 18, text-xl 20, text-2xl 24, text-3xl 30`). For Devanagari fallback use Noto Sans Devanagari.

**Color palette**:
- Brand primary `#1B5E5A` (deep teal — calm, hospitable)
- Brand secondary `#E07A5F` (warm terracotta — accent / fallback CTAs)
- Neutrals follow Tailwind's `slate`
- Status tokens as defined in §A.4 (exposed as CSS variables `--status-tentative`, `--status-confirmed`, …)
- Dark mode derived from primary using OKLCH lightening per shadcn v4 conventions

**Iconography**: Lucide React (shadcn default). No custom icons in v1.

**Spacing**: Tailwind 4-point scale. Page gutters: 16 px mobile, 24 px tablet, 32 px desktop. Card padding 16/24.

**Responsive breakpoints**: Tailwind defaults — `sm 640, md 768, lg 1024, xl 1280, 2xl 1536`. Tape chart switches from "day list" to "grid" at `md`.

**Motion**: Framer Motion only for the tape-chart drag preview and sheet slides. Respect `prefers-reduced-motion`.

## A.7 Accessibility (WCAG 2.2 AA)

- All interactive elements ≥ 44 × 44 px touch target.
- Color contrast ≥ 4.5:1 (text) / 3:1 (UI). Status colors duplicated by icon and label.
- Full keyboard navigation; tape chart navigable via arrow keys with visible focus ring.
- Skip-to-content link; semantic landmarks (`<main>`, `<nav>`, `<aside>`).
- All form fields have visible labels and `aria-describedby` for errors.
- OTP input uses `inputMode="numeric"` and `autocomplete="one-time-code"` for iOS SMS autofill.
- Tape-chart cells annotated with `aria-label="Room 4, June 12 to June 14, Confirmed, Sameer Khan"`.
- Dark mode honors system preference.
- No information by color alone (icons + text).
- Tested with axe-core in CI; manual NVDA + VoiceOver smoke pass before release.

## A.8 Empty, Error, Loading States

- **Empty (no bookings yet)**: warm illustration (a stylised welcome lamp), one-line copy in plain Indian English ("No bookings yet — let's create your first one"), single primary CTA.
- **Loading**: shadcn `Skeleton` components mirroring the destination layout — never a full-page spinner.
- **Errors**: inline within the form/card; full-page error boundary only on hard failures. Show what to do next ("Razorpay key seems incorrect — verify in Settings → Razorpay → Test connection"). Toast on transient failures (notification send) with "Retry".
- **Offline**: a top banner ("You're offline — last sync 4 min ago. Changes will save when you reconnect."). Optimistic UI for booking creation; reconciles via Service Worker queue (or simple in-memory retry — see Engineering spec for staged rollout).

## A.9 Microcopy Guidance

Indian English, simple, second person, no Western idioms. Numbers in Indian system (₹ 1,23,456). Examples:
- "Send payment link" — not "Issue payment request".
- "₹ 2,500 still to pay" — not "Outstanding balance: INR 2500".
- "Add a guest" — not "Create new guest profile".
- OTP screen: "We've sent a 6-digit code to +91 98xxx xx789. Please enter it below." Resend reads: "Didn't get it? Resend code."
- Tone in error states: helpful, blame-free ("That code didn't match — please try again or resend").
- Hindi pass: JSON catalog under `/locales/hi-IN.json`; English remains the default to avoid Devanagari font issues on older Android keyboards.

## A.10 Onboarding Flow

A 5-step inline wizard with a progress bar; each step is skippable except step 1. Steps as in §A.3.J1. Each step has a "Why we ask this" link that opens a Sheet explaining the regulatory or operational reason in plain language (e.g., for GSTIN: "If your homestay's annual revenue is under ₹20 lakh — ₹10 lakh in HP, Uttarakhand and the Northeast — you don't need to register for GST yet. You can come back later"). After completion, the dashboard shows a checklist card: "Next, configure your rate plans" — gentle nudges, never blocking modals.

---

# Document B — Engineering Specification

## B.1 High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              Browser / Claude.ai                            │
└───────────┬─────────────────────────────────────────────┬───────────────────┘
            │ HTTPS                                        │ HTTPS + OAuth 2.1
            ▼                                              ▼
┌─────────────────────────────┐               ┌────────────────────────────┐
│   Next.js 15 App Router     │               │  /mcp Streamable HTTP      │
│   - Server Components       │◄──────────────┤  - OAuth Resource Server   │
│   - Server Actions          │   shared db   │  - Tool handlers           │
│   - Route Handlers (REST)   │   + services  │  - Resource handlers       │
│   - Auth.js v5 (OTP)        │               │  - RBAC scope enforcement  │
└─────────┬───────────────────┘               └────────────┬───────────────┘
          │                                                │
          ▼                                                ▼
┌─────────────────────────────────────────────────────────────────────┐
│                        Domain Services Layer                        │
│  bookings · payments · notifications · audit · mcp · auth · rbac    │
└─────────┬───────────────────────────────────────────────────────────┘
          ▼
┌──────────────────────┐  ┌─────────────────┐  ┌─────────────────────┐
│ Prisma + better-     │  │ JobQueue-lite   │  │ Notification        │
│ sqlite3 (WAL mode)   │  │ (node-cron +    │  │ Providers           │
│ Litestream → S3      │  │ in-process      │  │ - MSG91 (SMS + WA)  │
│                      │  │ worker)         │  │ - Resend (email)    │
└──────────────────────┘  └─────────────────┘  │ - Razorpay          │
                                                └─────────────────────┘
```

Single-process Node deployment. The SQLite file lives on a persistent volume. **Litestream v0.5.0** (LTX file format, released early 2026) runs as a sub-process via a supervised entrypoint and replicates the DB to S3-compatible storage every second. All background work runs in-process via `node-cron` for time-based jobs and a `Job` table polled by an in-process worker for delayed/retryable tasks. **No Redis is required for v1**; the schema isolates jobs behind a `JobQueue` interface so we can swap to BullMQ+Redis when scale demands.

## B.2 Database Schema (Prisma)

```prisma
generator client {
  provider        = "prisma-client-js"
  previewFeatures = ["driverAdapters"]
}
datasource db {
  provider = "sqlite"
  url      = env("DATABASE_URL") // file:./data/staykit.db?connection_limit=1
}

// ───── Tenancy / Identity ─────
model Owner {
  id            String   @id @default(cuid())
  name          String
  email         String?  @unique
  phone         String   @unique
  createdAt     DateTime @default(now())
  properties    Property[]
  users         User[]
  oauthClients  McpOAuthClient[]
}

model User {
  id            String   @id @default(cuid())
  ownerId       String
  owner         Owner    @relation(fields: [ownerId], references: [id], onDelete: Cascade)
  name          String
  email         String?
  phone         String   @unique
  passwordHash  String?  // optional; OTP is default
  role          Role     @default(STAFF)
  active        Boolean  @default(true)
  propertyScopes PropertyScope[]
  createdAt     DateTime @default(now())
  @@index([ownerId])
}
enum Role { OWNER MANAGER STAFF }

model PropertyScope {
  userId      String
  propertyId  String
  permissions String   // CSV of permission keys, e.g. "bookings:write,payments:refund"
  user        User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  property    Property @relation(fields: [propertyId], references: [id], onDelete: Cascade)
  @@id([userId, propertyId])
}

model Property {
  id            String   @id @default(cuid())
  ownerId       String
  owner         Owner    @relation(fields: [ownerId], references: [id], onDelete: Cascade)
  name          String
  addressLine1  String
  addressLine2  String?
  city          String
  state         String   // KA, KL, HP, UK, GA, MH, etc.
  pincode       String
  gstin         String?
  sacCode       String   @default("996311") // Room or unit accommodation services
  checkInTime   String   @default("14:00")
  checkOutTime  String   @default("11:00")
  cancellationPolicy String?
  invoicePrefix String   @default("INV")
  invoiceCounter Int     @default(0)
  defaultCurrency String @default("INR")
  active        Boolean  @default(true)
  createdAt     DateTime @default(now())
  rooms         Room[]
  ratePlans     RatePlan[]
  bookings      Booking[]
  scopes        PropertyScope[]
  maintenance   MaintenanceBlock[]
  @@index([ownerId])
}

// ───── Inventory ─────
model RoomType {
  id           String   @id @default(cuid())
  propertyId   String
  property     Property @relation(fields: [propertyId], references: [id], onDelete: Cascade)
  name         String
  maxOccupancy Int      @default(2)
  baseRate     Int      // paise
  description  String?
  sortOrder    Int      @default(0)
  rooms        Room[]
  @@unique([propertyId, name])
}

model Room {
  id          String      @id @default(cuid())
  propertyId  String
  property    Property    @relation(fields: [propertyId], references: [id], onDelete: Cascade)
  roomTypeId  String
  roomType    RoomType    @relation(fields: [roomTypeId], references: [id])
  name        String      // "Cottage 1" or "Room 101"
  active      Boolean     @default(true)
  cleanliness Cleanliness @default(CLEAN)
  amenities   String      // JSON array
  photos      String      // JSON array of FileUpload ids
  bookings    BookingRoom[]
  blocks      MaintenanceBlock[]
  @@unique([propertyId, name])
}
enum Cleanliness { CLEAN DIRTY IN_PROGRESS OUT_OF_ORDER }

model RatePlan {
  id          String   @id @default(cuid())
  propertyId  String
  property    Property @relation(fields: [propertyId], references: [id], onDelete: Cascade)
  name        String
  priority    Int      @default(0)
  startDate   DateTime
  endDate     DateTime
  daysOfWeek  String   @default("1111111") // bitmask Mon..Sun
  minStay     Int      @default(1)
  maxStay     Int?
  refundable  Boolean  @default(true)
  overrides   RatePlanOverride[]
  @@index([propertyId, startDate, endDate])
}

model RatePlanOverride {
  id         String   @id @default(cuid())
  ratePlanId String
  ratePlan   RatePlan @relation(fields: [ratePlanId], references: [id], onDelete: Cascade)
  roomTypeId String
  amount     Int      // paise per night
  @@unique([ratePlanId, roomTypeId])
}

model MaintenanceBlock {
  id          String   @id @default(cuid())
  propertyId  String
  property    Property @relation(fields: [propertyId], references: [id], onDelete: Cascade)
  roomId      String
  room        Room     @relation(fields: [roomId], references: [id], onDelete: Cascade)
  startDate   DateTime
  endDate     DateTime
  reason      String
  createdById String
  createdAt   DateTime @default(now())
  @@index([roomId, startDate, endDate])
}

// ───── Channels ─────
model ChannelSource {
  id      String  @id @default(cuid())
  ownerId String
  name    String  // "Direct", "Walk-in", "Phone", "Instagram", "Airbnb", "Booking.com", "MMT"
  color   String  @default("#3D5A80")
  active  Boolean @default(true)
  @@unique([ownerId, name])
}

// ───── Bookings ─────
model Booking {
  id                  String        @id @default(cuid())
  ref                 String        @unique // human-friendly e.g. "SK-A8X3Q"
  propertyId          String
  property            Property      @relation(fields: [propertyId], references: [id])
  channelId           String
  channel             ChannelSource @relation(fields: [channelId], references: [id])
  status              BookingStatus @default(CONFIRMED)
  checkIn             DateTime
  checkOut            DateTime
  adults              Int           @default(1)
  children            Int           @default(0)
  subtotal            Int           // paise
  taxAmount           Int           // paise
  totalAmount         Int           // paise
  amountPaid          Int           @default(0)
  notes               String?
  cancellationReason  String?
  cancelledAt         DateTime?
  checkedInAt         DateTime?
  checkedOutAt        DateTime?
  createdById         String?
  createdViaMcp       Boolean       @default(false)
  createdAt           DateTime      @default(now())
  updatedAt           DateTime      @updatedAt
  rooms               BookingRoom[]
  guests              BookingGuest[]
  payments            Payment[]
  paymentLinks        PaymentLink[]
  refunds             Refund[]
  notifications       NotificationLog[]
  @@index([propertyId, checkIn, checkOut])
  @@index([status])
}
enum BookingStatus { TENTATIVE CONFIRMED CHECKED_IN CHECKED_OUT CANCELLED NO_SHOW }

// One row per (booking, room, night) — this is the conflict-prevention table.
model BookingRoom {
  id          String   @id @default(cuid())
  bookingId   String
  booking     Booking  @relation(fields: [bookingId], references: [id], onDelete: Cascade)
  roomId      String
  room        Room     @relation(fields: [roomId], references: [id])
  date        DateTime // the night occupied (UTC midnight, IST-anchored at display)
  rateApplied Int      // paise
  // Hard guarantee: one room can only have ONE active booking per night.
  @@unique([roomId, date]) // ← double-booking prevention
  @@index([bookingId])
}

model BookingGuest {
  id        String  @id @default(cuid())
  bookingId String
  booking   Booking @relation(fields: [bookingId], references: [id], onDelete: Cascade)
  guestId   String
  guest     Guest   @relation(fields: [guestId], references: [id])
  isPrimary Boolean @default(false)
  @@index([bookingId])
}

model Guest {
  id              String   @id @default(cuid())
  ownerId         String
  name            String
  phone           String
  email           String?
  isForeign       Boolean  @default(false)
  nationality     String?
  idType          String?  // AADHAAR, PASSPORT, DRIVING_LICENSE, VOTER_ID
  idLast4         String?
  idFileId        String?  // → FileUpload; encrypted at rest
  marketingConsent Boolean @default(false)
  dpdpConsentAt   DateTime?
  notes           String?
  createdAt       DateTime @default(now())
  bookings        BookingGuest[]
  @@unique([ownerId, phone])
  @@index([ownerId])
}

// ───── Payments ─────
model PaymentLink {
  id              String            @id @default(cuid())
  bookingId       String
  booking         Booking           @relation(fields: [bookingId], references: [id])
  razorpayLinkId  String            @unique // plink_xxx
  shortUrl        String
  amount          Int               // paise
  status          PaymentLinkStatus @default(CREATED)
  expiresAt       DateTime?         // Razorpay default is 6 months from creation
  notifyVia       String            @default("sms,email")
  createdAt       DateTime          @default(now())
  paidAt          DateTime?
  payments        Payment[]
  @@index([bookingId])
}
enum PaymentLinkStatus { CREATED PARTIALLY_PAID PAID CANCELLED EXPIRED }

model Payment {
  id                String        @id @default(cuid())
  bookingId         String
  booking           Booking       @relation(fields: [bookingId], references: [id])
  paymentLinkId     String?
  paymentLink       PaymentLink?  @relation(fields: [paymentLinkId], references: [id])
  razorpayPaymentId String?       @unique // pay_xxx
  razorpayOrderId   String?
  amount            Int           // paise
  status            PaymentStatus @default(CREATED)
  method            String?       // upi, card, netbanking, wallet
  capturedAt        DateTime?
  notes             String?       // JSON
  rawWebhook        String?
  createdAt         DateTime      @default(now())
  refunds           Refund[]
  @@index([bookingId])
}
enum PaymentStatus { CREATED AUTHORIZED CAPTURED FAILED REFUNDED }

model Refund {
  id              String       @id @default(cuid())
  bookingId       String
  booking         Booking      @relation(fields: [bookingId], references: [id])
  paymentId       String
  payment         Payment      @relation(fields: [paymentId], references: [id])
  razorpayRefundId String?     @unique
  amount          Int          // paise
  speed           String       @default("normal") // normal | optimum
  reason          String?
  status          RefundStatus @default(CREATED)
  initiatedById   String
  createdAt       DateTime     @default(now())
  processedAt     DateTime?
  @@index([bookingId])
}
enum RefundStatus { CREATED PROCESSED FAILED }

model WebhookEvent {
  id        String   @id @default(cuid())
  eventId   String   @unique  // x-razorpay-event-id
  source    String   // "razorpay" | "msg91" | …
  receivedAt DateTime @default(now())
  payload   String   // raw JSON
}

// ───── Notifications ─────
model NotificationTemplate {
  id                   String   @id @default(cuid())
  ownerId              String
  channel              NotificationChannel
  triggerKey           String   // BOOKING_CONFIRMED, PAYMENT_LINK_SENT, ...
  name                 String
  subject              String?  // email only
  body                 String   // mustache {{var}}
  dltTemplateId        String?  // mandatory for SMS
  whatsappTemplateName String?  // mandatory for WhatsApp
  active               Boolean  @default(true)
  createdAt            DateTime @default(now())
  @@unique([ownerId, channel, triggerKey])
}
enum NotificationChannel { EMAIL SMS WHATSAPP }

model NotificationAutomation {
  id           String   @id @default(cuid())
  ownerId      String
  triggerKey   String
  templateId   String
  delayMinutes Int      @default(0) // negative for "before" — e.g. -1440 = 24h before check-in
  active       Boolean  @default(true)
  conditions   String?  // JSON predicate
}

model NotificationLog {
  id              String              @id @default(cuid())
  bookingId       String?
  booking         Booking?            @relation(fields: [bookingId], references: [id])
  channel         NotificationChannel
  to              String
  templateId      String?
  triggerKey      String
  status          NotificationStatus  @default(QUEUED)
  attempts        Int                 @default(0)
  lastError       String?
  providerMessageId String?
  payload         String?
  scheduledFor    DateTime
  sentAt          DateTime?
  deliveredAt     DateTime?
  createdAt       DateTime            @default(now())
  @@index([status, scheduledFor])
  @@index([bookingId])
}
enum NotificationStatus { QUEUED SENDING SENT DELIVERED FAILED DLQ }

// ───── Auth / OTP / Sessions ─────
model OtpRequest {
  id         String     @id @default(cuid())
  contact    String     // phone or email
  purpose    OtpPurpose
  codeHash   String     // sha256(code + pepper)
  attempts   Int        @default(0)
  expiresAt  DateTime
  consumedAt DateTime?
  ip         String?
  createdAt  DateTime   @default(now())
  @@index([contact, purpose, createdAt])
}
enum OtpPurpose { STAFF_LOGIN GUEST_LOGIN ACTION_CONFIRM }

model Session {
  id         String   @id @default(cuid())
  userId     String?
  guestPhone String?
  token      String   @unique // hashed
  scope      String   @default("staff") // staff | guest
  expiresAt  DateTime
  ip         String?
  userAgent  String?
  createdAt  DateTime @default(now())
  revokedAt  DateTime?
  @@index([userId])
  @@index([guestPhone])
}

// ───── MCP / OAuth ─────
model McpOAuthClient {
  id           String   @id @default(cuid())
  ownerId      String
  owner        Owner    @relation(fields: [ownerId], references: [id], onDelete: Cascade)
  clientId     String   @unique
  clientName   String
  redirectUris String   // JSON array
  scopes       String   // CSV
  publicKeyJwk String?  // for Client ID Metadata Documents
  createdAt    DateTime @default(now())
  revokedAt    DateTime?
  tokens       McpAccessToken[]
}

model McpAccessToken {
  id               String   @id @default(cuid())
  clientId         String
  client           McpOAuthClient @relation(fields: [clientId], references: [id], onDelete: Cascade)
  userId           String
  scopes           String
  tokenHash        String   @unique
  expiresAt        DateTime
  refreshHash      String?  @unique
  refreshExpiresAt DateTime?
  resource         String   // RFC 8707 — e.g., https://app.example.com/mcp
  lastUsedAt       DateTime?
  createdAt        DateTime @default(now())
  revokedAt        DateTime?
  @@index([userId])
}

model McpAuditEntry {
  id         String   @id @default(cuid())
  tokenId    String?
  userId     String?
  clientId   String?
  tool       String
  args       String   // JSON, redacted
  result     String?  // truncated JSON
  durationMs Int
  status     String   // OK | DENIED | ERROR
  createdAt  DateTime @default(now())
  @@index([userId, createdAt])
  @@index([clientId, createdAt])
}

// ───── Files / Audit / Jobs ─────
model FileUpload {
  id           String   @id @default(cuid())
  ownerId      String
  kind         FileKind
  path         String   // local path or s3 key
  storage      String   @default("local") // local | s3
  mime         String
  sizeBytes    Int
  sha256       String
  encrypted    Boolean  @default(false)
  uploadedById String
  createdAt    DateTime @default(now())
}
enum FileKind { GUEST_ID ROOM_PHOTO INVOICE_PDF OTHER }

model AuditLog {
  id         String   @id @default(cuid())
  ownerId    String
  actorType  String   // USER | MCP | SYSTEM | GUEST
  actorId    String?
  action     String   // BOOKING_CREATED, PAYMENT_CAPTURED, …
  entityType String?
  entityId   String?
  diff       String?  // JSON Patch
  ip         String?
  userAgent  String?
  createdAt  DateTime @default(now())
  @@index([ownerId, createdAt])
  @@index([entityType, entityId])
}

model Job {
  id          String   @id @default(cuid())
  kind        String
  payload     String   // JSON
  runAfter    DateTime @default(now())
  attempts    Int      @default(0)
  maxAttempts Int      @default(8)
  status      JobStatus @default(QUEUED)
  lastError   String?
  lockedAt    DateTime?
  lockedBy    String?
  createdAt   DateTime @default(now())
  completedAt DateTime?
  @@index([status, runAfter])
}
enum JobStatus { QUEUED RUNNING DONE FAILED DLQ }
```

**Tenancy enforcement.** Single-owner-multi-property is enforced by `ownerId` foreign keys on every top-level entity, plus a Prisma Client Extension (`$allOperations` hook) that injects `where: { ownerId: ctx.ownerId }` on reads and rejects writes whose `ownerId` mismatches. This is the SQLite-friendly equivalent of Postgres RLS; we accept the limitation and re-verify with a unit test per model. When migrating to Postgres we swap to true RLS policies.

## B.3 Double-Booking Prevention

The `BookingRoom(roomId, date)` unique constraint is the keystone — per SQLite's docs, "If you attempt to insert or update a value that already exists in the column, SQLite will issue an error and abort the operation." Booking creation runs inside a Serializable transaction that inserts one `BookingRoom` row per night. SQLite's single-writer model (WAL mode) serializes concurrent writes; the unique constraint is the durable guarantee even if two web workers race. A `BEFORE INSERT` trigger in a migration forbids `MaintenanceBlock` ranges from overlapping any existing `BookingRoom`.

```ts
await prisma.$transaction(async (tx) => {
  // 1. Compute nights from checkIn to checkOut-1.
  // 2. INSERT one BookingRoom row per (room, night).
  //    Any concurrent attempt fails with "UNIQUE constraint failed".
  // 3. INSERT Booking, BookingGuest rows.
}, { isolationLevel: 'Serializable' });
```

## B.4 API Surface

We use **server actions** for in-app mutations (forms, tape-chart edits) — full type inference, CSRF protection, automatic revalidation. We use **route handlers** (`app/api/.../route.ts`) for: (a) webhooks, (b) the guest portal, (c) MCP endpoints, (d) external scripts. Internal data fetching is RSC + a typed caller layer (we don't run a separate tRPC server — Server Components call domain services directly).

```
POST   /api/auth/staff/otp/request        { phone } → { requestId, expiresIn }
POST   /api/auth/staff/otp/verify         { requestId, code } → { sessionToken }
POST   /api/auth/guest/otp/request        { phone } → { requestId, expiresIn }
POST   /api/auth/guest/otp/verify         { requestId, code } → { sessionToken, bookings[] }
POST   /api/auth/logout

GET    /api/bookings?...filters
POST   /api/bookings                       (server-action wrapper)
GET    /api/bookings/:id
PATCH  /api/bookings/:id
POST   /api/bookings/:id/cancel
POST   /api/bookings/:id/check-in
POST   /api/bookings/:id/check-out
POST   /api/bookings/:id/move              { roomId, checkIn, checkOut }

POST   /api/bookings/:id/payment-link      { amount, notifyVia } → PaymentLink
POST   /api/payments/:id/refund            { amount?, reason?, speed? } → Refund
GET    /api/payments/:id

POST   /api/notifications/test             { templateId, to }
GET    /api/reports/occupancy?...
GET    /api/reports/revenue?...

POST   /api/webhooks/razorpay              X-Razorpay-Signature
POST   /api/webhooks/msg91                 (delivery receipts)

# MCP / OAuth
GET    /.well-known/oauth-protected-resource
GET    /.well-known/oauth-authorization-server
GET    /.well-known/jwks.json
POST   /api/oauth/register                  CIMD / DCR
GET    /api/oauth/authorize
POST   /api/oauth/token
POST   /mcp                                 Streamable HTTP — JSON-RPC POST
GET    /mcp                                 Streamable HTTP — SSE for notifications
DELETE /mcp                                 Streamable HTTP — session termination
```

Request/response shapes follow `{ data, error, meta }`. Amounts are always paise (integer), dates ISO-8601 with `+05:30` offset for clients but stored as UTC.

## B.5 Authentication & Authorization

**Auth.js v5** with two custom credential-style providers we author (since Auth.js v5 does not ship a built-in phone/SMS provider, we adapt the EmailProvider pattern — replacing magic-link tokens with 6-digit numeric OTPs):

1. `staff-otp`: identifier = phone, issues OTP via MSG91, verifies, looks up User row, creates Session with `scope=staff`. Cookie: `__Host-staykit_session` — `HttpOnly`, `Secure`, `SameSite=Lax`.
2. `guest-otp`: identifier = phone, same OTP flow but creates a `Session` with `scope=guest` and `guestPhone` set (no User row). Cookie: `__Host-staykit_guest`. The middleware enforces that guest sessions can only access endpoints whose data matches that phone.

**OTP generation**: 6-digit numeric, stored as `sha256(code + pepper)`. TTL 5 minutes. Per-contact rate limit: 3 sends per 15 minutes; per-IP: 10 sends per hour. Tracked in `OtpRequest` and enforced in `lib/ratelimit.ts` using `rate-limiter-flexible` against the SQLite store. Verification attempts are capped at 5 per `OtpRequest`.

**RBAC**: A central `policy.ts` maps `(role, permission)` → boolean. Permissions are namespaced strings: `bookings:read|write|cancel|refund`, `payments:read|refund`, `properties:read|write`, `rates:write`, `team:manage`, `notifications:send`, `reports:read`, `mcp:admin`. Every server action calls `assert(ctx.user, "bookings:write", { propertyId })`. For `MANAGER` and `STAFF`, the assertion additionally checks `PropertyScope`.

## B.6 Booking Engine — Availability

```ts
const rooms = await prisma.room.findMany({
  where: { propertyId, active: true, ...(roomTypeId ? { roomTypeId } : {}) },
});
const occupied = await prisma.bookingRoom.findMany({
  where: { room: { propertyId }, date: { gte: from, lt: to } },
  select: { roomId: true, date: true },
});
const blocks = await prisma.maintenanceBlock.findMany({
  where: { propertyId, startDate: { lt: to }, endDate: { gt: from } },
});
return rooms.map(r => ({
  room: r,
  unavailableDates: [
    ...occupied.filter(o => o.roomId === r.id).map(o => o.date),
    ...expandBlockNights(blocks.filter(b => b.roomId === r.id), from, to),
  ],
}));
```

Rate calculation walks rate plans in `priority desc` order, picks first match per `(date, roomType)`, falls back to `RoomType.baseRate`. GST is computed in `lib/tax.ts` from `Property.gstin?` and **per-unit-per-day transaction value**: 5% (no ITC) for ≤ ₹7,500/night and 18% (with ITC) above ₹7,500, per Notification 15/2025-Central Tax (Rate) dated 17 September 2025. Threshold, rates, and SAC code are externalised — they will change again.

## B.7 Razorpay Integration — Payment Links Lifecycle

We **never** collect payments on-site. Canonical flow:

1. Owner clicks "Send payment link" → server action calls `POST https://api.razorpay.com/v1/payment_links` with:
   ```json
   {
     "amount": 250000, "currency": "INR", "accept_partial": false,
     "reference_id": "SK-A8X3Q",
     "customer": { "name": "Sameer", "contact": "+91…", "email": "…" },
     "notify": { "sms": true, "email": true },
     "callback_url": "https://app.example.com/my/bookings/<id>?paid=1",
     "callback_method": "get",
     "notes": { "bookingId": "<id>" }
   }
   ```
   We persist `razorpayLinkId`, `shortUrl`, and `expiresAt` (Razorpay defaults links to 6 months validity unless overridden).
2. Guest pays. Razorpay fires webhooks: `payment_link.paid`, `payment.captured`, optionally `order.paid`. Our `/api/webhooks/razorpay` handler:
   - Reads the **raw body** (`request.text()`; `export const dynamic = 'force-dynamic'` so it isn't parsed first — Razorpay's webhook docs are emphatic that pre-parsing the body breaks signature verification).
   - Verifies `X-Razorpay-Signature` with `HMAC-SHA256(rawBody, RAZORPAY_WEBHOOK_SECRET)`.
   - Deduplicates via `x-razorpay-event-id` against the `WebhookEvent` table (Razorpay confirms that "you can identify the duplicate webhooks using the x-razorpay-event-id header").
   - Idempotently upserts `Payment`/`Refund` rows by `razorpayPaymentId` / `razorpayRefundId`.
   - Updates `Booking.amountPaid` and may transition `Booking.status` and `PaymentLink.status`.
   - Enqueues `PAYMENT_RECEIVED` and (optionally) `BOOKING_CONFIRMED` notifications.
   - Returns 2xx within 10 seconds; otherwise Razorpay retries on its **exponential-backoff schedule for 24 hours**, then disables the webhook (operator must re-enable from dashboard).
3. **Refunds**: server action `POST /v1/payments/:id/refund` with `{ amount?, speed: 'normal' | 'optimum' }`. Persist `Refund` in `CREATED`. Webhook `refund.processed`/`refund.failed` updates the status. Caveats coded into UI tooltips: "Normal refunds take 5–7 working days. Instant refunds can fail due to customer bank issues. Refunds aren't possible on payments older than 6 months."
4. **Reconciliation job**: nightly, fetch `GET /v1/settlements?from=…&to=…` and stamp `Payment.settledAt`/`settlementId`.

**Test vs Live**: separate env vars (`RAZORPAY_KEY_ID_LIVE/_TEST`, `RAZORPAY_KEY_SECRET_LIVE/_TEST`, `RAZORPAY_WEBHOOK_SECRET_LIVE/_TEST`). Per-deployment `RAZORPAY_MODE=test|live`; owners flip via Settings → Integrations after KYC is approved.

**Razorpay Route (split payments)** is *not used in v1*. Documented as a future enhancement for multi-property revenue routed to different bank accounts. v1 assumes one merchant account per Owner.

## B.8 Notification Dispatch Service

```
caller → enqueue(triggerKey, bookingId, channelOverrides?) →
  resolveTemplates() →
  for each (channel, template, delay):
    INSERT Job { kind: 'SEND_NOTIFICATION', payload, runAfter: now + delay }
worker (in-process, polls every 5s):
  SELECT … WHERE status='QUEUED' AND runAfter <= now() LIMIT 10
  (transaction: SELECT then UPDATE to claim)
  dispatch via provider → on success → INSERT NotificationLog status=SENT
  on failure → exponential backoff up to 8 attempts, then DLQ
```

**Providers** (interface in `lib/notify/providers.ts`):
- **SMS — MSG91** (default; mandatory DLT-compliant in India). Body must match an approved DLT content template; we store `dltTemplateId` per template and pass it on send. Per MSG91 docs, variables are `{#var#}` on the DLT platform but `##variable##` on MSG91 — we store as `{{var}}` in our editor and convert at send-time. DLT template approval typically takes **3–7 days** (per fyno.io's DLT registration guide: "The typical time frame for DLT template approval ranges between 3-7 days, and potential delays due to queue backlogs should be anticipated."). Note that from **6 May 2025**, TRAI mandates TSPs auto-append type suffixes to headers during DLT scrubbing — `-P` Promotional, `-S` Service, `-T` Transactional, `-G` Government (per TALK-Q India SMS Regulations 2025 guide: "Effective from May 6, 2025, all A2P SMS headers in India automatically include a one-letter suffix indicating the message type. The mapping is -P for Promotional, -S for Service…–T for Transactional, and -G for Government communications.").
- **WhatsApp — MSG91 WhatsApp Cloud API** (default) or **Gupshup** / **Interakt** (configurable). Outgoing **utility** messages cost ₹0.125 per delivered message; **marketing** messages went from ₹0.7846 to **₹0.8631** effective **1 January 2026** per Meta's official rate card (Whautomate.com verified against Meta: "The marketing rate went from ₹0.7846 to ₹0.8631 per message"). MSG91 charges Meta's published rate with no markup; Interakt typically adds ~12.4% (≈₹0.97/marketing message), Gupshup ≈₹0.93, AiSensy ≈₹1.09. Service messages (replies in the customer-initiated 24-hour window) are free. Templates must be pre-approved in Meta Business Manager.
- **Email — Resend** (default; clean DKIM/SPF, good India deliverability) with AWS SES and Postmark as alternates behind the same interface.

**Trigger keys**: `BOOKING_CONFIRMED`, `BOOKING_TENTATIVE`, `PAYMENT_LINK_SENT`, `PAYMENT_RECEIVED`, `PRE_ARRIVAL_24H`, `CHECK_IN_INSTRUCTIONS`, `POST_CHECKOUT_THANKS`, `REFUND_PROCESSED`, `NO_SHOW`, `CANCELLED`, `OWNER_NEW_BOOKING`.

**Template engine**: Mustache (`mustache` npm). Variables documented in-UI: `{{guest.name}}`, `{{booking.ref}}`, `{{booking.checkIn|date}}`, `{{property.name}}`, `{{property.checkInTime}}`, `{{amount.due|inr}}`, `{{paymentLink.url}}`, etc.

## B.9 MCP Server Design

**Path**: `/mcp` (Streamable HTTP — single endpoint POST/GET/DELETE).
**Spec target**: **MCP 2025-11-25** — OAuth 2.1 with PKCE (mandatory for all clients per Nov 2025 spec), RFC 8707 Resource Indicators, RFC 9728 Protected Resource Metadata, Client ID Metadata Documents (CIMD) as the preferred client identification.
**SDK**: `@modelcontextprotocol/sdk` **v1.29.0** (latest per npm registry as of mid-May 2026) with `@modelcontextprotocol/express` middleware. Express helpers include the Host-header allowlist needed for DNS-rebinding mitigation (SDK 1.24+).

**Governance context**: MCP was donated by Anthropic to the Linux Foundation's Agentic AI Foundation (AAIF) on **9 December 2025**, alongside Block's `goose` and OpenAI's `AGENTS.md` (per LF press release: "the Linux Foundation… today announced the formation of the Agentic AI Foundation (AAIF), and founding contributions… Anthropic's Model Context Protocol (MCP), Block's goose, and OpenAI's AGENTS.md."). The 2026 roadmap prioritises stateless Streamable HTTP, agent communication primitives, enterprise governance, and conformance testing.

### OAuth Resource Server setup

`GET /.well-known/oauth-protected-resource` returns:
```json
{
  "resource": "https://app.example.com/mcp",
  "authorization_servers": ["https://app.example.com"],
  "scopes_supported": ["bookings:read","bookings:write","bookings:cancel",
                       "payments:read","payments:refund","properties:read",
                       "properties:write","reports:read","notifications:send"],
  "bearer_methods_supported": ["header"],
  "resource_documentation": "https://app.example.com/docs/mcp"
}
```

`GET /.well-known/oauth-authorization-server` advertises `/api/oauth/authorize` and `/api/oauth/token`.

We act as **both** the Authorization Server and the Resource Server (acceptable for self-hosted single-owner deployments). The AS issues short-lived JWTs (15 min) with `aud=https://app.example.com/mcp`, `iss=https://app.example.com`, `sub=<userId>`, `scope=<space-separated>`, plus a refresh token (30-day expiry). Tokens are signed with **EdDSA (Ed25519)**; JWKS published at `/.well-known/jwks.json`.

### Tool catalog (owner/manager only)

| Tool | Scope required | Description |
|---|---|---|
| `list_properties` | `properties:read` | List properties accessible to current user |
| `get_property` | `properties:read` | Fetch one property |
| `list_rooms` | `properties:read` | List rooms of a property |
| `check_availability` | `bookings:read` | Availability for a property × date range |
| `list_bookings` | `bookings:read` | Filter by property, date range, status, channel |
| `get_booking` | `bookings:read` | Full booking detail |
| `create_booking` | `bookings:write` | Quick-add equivalent with channel attribution |
| `modify_booking` | `bookings:write` | Change dates / room / guest count |
| `cancel_booking` | `bookings:cancel` | With reason + refund flag |
| `check_in` | `bookings:write` | Mark CHECKED_IN; optionally update cleanliness |
| `check_out` | `bookings:write` | Mark CHECKED_OUT |
| `block_room` | `properties:write` | Create MaintenanceBlock |
| `unblock_room` | `properties:write` | Remove MaintenanceBlock |
| `list_rate_plans` | `properties:read` |  |
| `upsert_rate_plan` | `properties:write` |  |
| `get_payment_status` | `payments:read` |  |
| `create_payment_link` | `payments:read` | Side effect: sends SMS/email |
| `initiate_refund` | `payments:refund` | Requires human-in-the-loop confirmation flag |
| `send_notification` | `notifications:send` | Render & send any template to a guest (rate-limited per tool) |
| `get_kpis` | `reports:read` | Occupancy / ADR / RevPAR for a date range |
| `search_guests` | `bookings:read` | By name/phone (PII-redacted by default) |

Each tool registers with a Zod schema; the SDK auto-generates the JSON schema the client sees. Example:

```ts
server.registerTool('create_booking', {
  title: 'Create a manual booking',
  description: 'Create a new booking with manually-attributed source channel...',
  inputSchema: z.object({
    propertyId: z.string(),
    checkIn:    z.string().date(),
    checkOut:   z.string().date(),
    roomId:     z.string().optional(),
    roomTypeId: z.string().optional(),
    guest:      z.object({ name: z.string(), phone: z.string(), email: z.string().email().optional() }),
    channel:    z.string(),
    adults:     z.number().int().min(1).default(1),
    children:   z.number().int().min(0).default(0),
    rate:       z.number().int().optional(), // paise; if omitted, derived from rate plan
    notes:      z.string().optional(),
  }),
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
}, async (input, { authInfo, signal }) => {
  assertScope(authInfo, 'bookings:write');
  assertPropertyAccess(authInfo, input.propertyId);
  const result = await bookingService.create({ ...input, createdViaMcp: true, createdById: authInfo.userSub });
  await mcpAudit({ tool: 'create_booking', authInfo, args: input, result, status: 'OK' });
  return { content: [{ type: 'text', text: `Booking ${result.ref} created.` }], structuredContent: result };
});
```

### Resource catalog (read-only context)

- `staykit://properties` — list, paginated
- `staykit://properties/{id}` — detail
- `staykit://bookings/{id}` — detail
- `staykit://reports/occupancy/{from}/{to}` — JSON snapshot
- `staykit://policies/cancellation/{propertyId}` — for the assistant to quote accurate policy

### Prompts

- `daily_briefing` — "Summarise today's check-ins, check-outs, pending payments, and any issues across all my properties."
- `revenue_report` — args `{ from, to }`.
- `guest_outreach_draft` — args `{ audience, theme, channel }`.

### Authorization at the handler boundary

Every tool handler is wrapped by `withAuth(scopes, handler)`:
1. Validates the JWT (signature, `iss`, `aud=https://app.example.com/mcp`, `exp`).
2. Checks all required `scopes ⊆ token.scope`.
3. Loads the User row, ensures `active=true` and `ownerId` matches the token's owner.
4. For `propertyId`-bearing tools, checks `PropertyScope`.
5. Sets `ctx.actorType='MCP'` so downstream `AuditLog` rows are correctly attributed.

### Rate limiting

Per-token: 60 tool calls/min, 1,000/hour. Per-tool override for `send_notification`: 10/hour. Implemented via `rate-limiter-flexible` with a SQLite-backed store.

### Audit logging

Every tool call → `McpAuditEntry`. Domain mutations also produce `AuditLog` rows with `actorType='MCP'`. The Audit viewer (UI) filters by actor type so owners can review what AI agents did.

### Exposing to Claude.ai

Owner setup (documented): "In Claude.ai → Customize → Connectors → Add custom connector → URL: `https://<your-staykit-host>/mcp` → click Connect → approve scopes in browser." Claude's OAuth callback is `https://claude.ai/api/mcp/auth_callback`; we discover it dynamically from the AS metadata rather than hard-coding. Custom remote MCP connectors are available on Claude.ai Pro, Max, Team and Enterprise plans.

## B.10 Background Jobs

`lib/jobs/worker.ts` — a `setInterval(5000)` poller (single-process, fine for SQLite single-writer model). Job kinds:

- `SEND_NOTIFICATION` — payload `{ logId }` → renders template, calls provider, updates `NotificationLog`.
- `RAZORPAY_REFUND_POLL` — for refunds where webhook was missed; backfills status.
- `OCCUPANCY_SNAPSHOT` — runs at 03:00 IST nightly via `node-cron`, writes a `DailyOccupancy` row per property.
- `NIGHTLY_CLEANUP` — purges expired OtpRequests, expired Sessions, soft-deleted FileUploads older than 30 days; purges `GUEST_ID` files older than 90 days post-checkout unless legal hold.
- `FORM_C_REMINDER` — hourly; for any booking with `isForeign=true` and `checkedInAt` in the last 24h with no acknowledged Form C filing, send the owner a nudge.
- `LITESTREAM_HEALTHCHECK` — every 5 min, parse `litestream snapshots` and alert if the latest snapshot is older than 5 min.

If a deployment crosses ~500 jobs/min sustained, the same `JobQueue` interface has a **BullMQ + Redis** adapter (documented in `/docs/scaling-jobs.md`). **Trigger.dev** or **Inngest** are listed as managed alternates for owners who'd rather not run Redis.

## B.11 File Storage

Two backends behind `lib/storage/index.ts`:
- `local` (default): files written to `./data/uploads/<owner>/<sha256[0..2]>/<sha256>.<ext>`. Served via a route handler that checks RBAC. Guest ID documents are **AES-256-GCM** encrypted at rest with a key derived from `FILE_ENCRYPTION_KEY` (32 bytes). Encryption is mandatory for `kind=GUEST_ID`.
- `s3`: any S3-compatible — AWS S3 (`ap-south-1` recommended), Cloudflare R2, Wasabi, MinIO. Presigned URLs for browser uploads.

**DPDP**: guest ID documents auto-purge 90 days after `Booking.checkOut` unless flagged for legal hold; the purge job lives in `NIGHTLY_CLEANUP`.

## B.12 SQLite Production Hardening

```sql
PRAGMA journal_mode = WAL;
PRAGMA synchronous   = NORMAL;
PRAGMA busy_timeout  = 5000;
PRAGMA foreign_keys  = ON;
PRAGMA cache_size    = -64000; -- 64 MB
PRAGMA temp_store    = MEMORY;
PRAGMA mmap_size     = 268435456; -- 256 MB
```

Driver: **`better-sqlite3`** (synchronous, fast, well-supported by Prisma's `driverAdapters`). Single `PrismaClient` singleton; `connection_limit=1` in the URL.

**Litestream v0.5.0** (LTX format — much faster restores than older WAL-replay versions) sidecar config:
```yaml
dbs:
  - path: /data/staykit.db
    replicas:
      - type: s3
        endpoint: ${LITESTREAM_ENDPOINT}
        bucket: ${LITESTREAM_BUCKET}
        path: staykit/${OWNER_ID}/db
        access-key-id: ${LITESTREAM_ACCESS_KEY}
        secret-access-key: ${LITESTREAM_SECRET}
        retention: 720h
        snapshot-interval: 24h
```

Restore on container start (`entrypoint.sh`):
```sh
if [ ! -f /data/staykit.db ]; then
  litestream restore -if-replica-exists /data/staykit.db
fi
exec litestream replicate -exec "node server.js"
```

**When to migrate to Postgres**: owners with 25+ properties, sustained writes > 10/sec, or a need for read replicas. The Prisma schema migration is mechanical (`provider = "postgresql"`); the `BookingRoom` unique constraint and `Job` locking translate cleanly. Documented in `/docs/migrate-to-postgres.md`.

## B.13 Internationalization

`next-intl` with JSON catalogs in `/locales/{en-IN,hi-IN}.json`. Indian number formatting via `Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 })`. Dates in `Asia/Kolkata`. Locale set via cookie `__staykit_locale`, overridable by `?lang=`. Hindi ships in v1 (best-effort, marked "beta"); Kannada, Malayalam, Marathi, Tamil planned for v2.

## B.14 Indian Regulatory Notes Baked into the Spec

- **Form C / Form III (FRRO)**: We do **not** auto-file. We surface a check-in reminder for `isForeign=true` guests and link to `https://indianfrro.gov.in/sform`. Under the Immigration and Foreigners Act 2025 (in force 1 September 2025), the OCI exemption was removed — accommodation providers must submit Form C/III for OCI cardholders too. Reporting is required within 24 hours of check-in and (under the 2025 Rules) at check-out as well. (Tracked field: `Guest.isForeign`.)
- **GST**: SAC code **`996311`** ("Room or unit accommodation services by Hotels/INN/Guest House/Club etc.") is the default on `Property.sacCode`. Tax rate logic: ≤ ₹7,500/night → 5% without ITC; > ₹7,500/night → 18% with ITC; the threshold check is on **transaction value** per unit per day (not declared tariff) per Notification 15/2025-Central Tax (Rate) dated 17 September 2025 (effective 22 September 2025 per the 56th GST Council). Composition scheme is not modeled in v1 — documented limitation.
- **GST registration thresholds**: ₹20 lakh general / ₹10 lakh special-category states (Himachal Pradesh, Uttarakhand, and the Northeastern states). Onboarding warns owners but doesn't enforce.
- **TCS section 206C(1H)**: Not modeled. Accommodation is a *service* (always excluded — per CBDT Circular 17/2020, "the said provision is not applicable on the sale of services"); and the sub-section was repealed effective **1 April 2025** by the Finance Act 2025. Section 194Q (buyer-side, on goods purchases) is also not applicable to homestay output.
- **DPDP Act 2023 + DPDP Rules 2025** (notified 13 November 2025; full compliance deadline 13 May 2027; penalties up to **₹250 crore**): The homestay owner is the **Data Fiduciary**; StayKit acts as the **Data Processor**. The system provides: consent capture at booking, data export (right to access), data erasure (right to be forgotten — with statutory holds for tax records), DPDP notice editor (Settings → Legal), encrypted guest IDs, audit logs, and a 90-day auto-purge of ID documents post-checkout. **DPDP does not mandate blanket data localisation**, but Significant Data Fiduciaries may be required to keep certain categories in India; defaults assume India-region hosting (S3 `ap-south-1` or R2 with India-restricted buckets).
- **State homestay registration** (surfaced in `/docs/compliance/state-registrations.md`):
  - **Karnataka** — Guidelines for Registration of Homestay Establishments 2025 (under Karnataka Tourism Policy 2024–29): owner must reside; 1–6 rooms (max 12 beds); no dormitories/bunk beds; Class A (Gold) ₹3,000 / Class B (Silver) ₹2,000 application fee; registered homestays get domestic rates for electricity, water, property tax.
  - **Kerala** — DTPC classification: Diamond House ₹3,000 / Gold House ₹2,000 / Silver House ₹1,000 registration; luxury tax applicable above ₹1,000/day historically (now folded into GST).
  - **Himachal Pradesh** — H.P. Home Stay Rules 2025 (notified 11 Feb 2025, portal launched 3 Feb 2026 at himachaltourism.gov.in): owner residence **no longer mandatory**; max 12 beds; CCTV in common areas mandatory; rainwater harvesting required; annual or 3-year renewal (10% discount on 3-year; additional 5% discount for woman owners); urban rural and non-Himachali owners now eligible.
  - **Uttarakhand** — UTDB policy (revision under Tour & Travel Business Policy 2014): homestays restricted to **Uttarakhand permanent residents** in their own home; outsiders/caretaker-run units must register as Bed & Breakfast instead; 5-year registration renewal; tax and utility relaxations in rural areas. Over **6,000 registered homestays** statewide with Nainital district leading (909 registered per Nainital Tourism Officer Atul Bhandari, per News9live; "With over 6,000 registered homestays in the state, Nainital tops the list, followed by Dehradun and Pithoragarh" per Indian Masterminds).
  - **Goa** — Homestay and Bed & Breakfast Scheme 2025 (notified 23 October 2025) under the Goa Registration of Tourist Trade Act 1982 & Rules 1985: Category "D" registration with the Goa Department of Tourism; 1–6 rooms (12 beds); annual registration fee **₹1,000**; mandatory display of registration number in listings; monthly tourist statistics return in Form XI; B&Bs require FDA licence; first 100 homestays and first 100 B&Bs registered receive financial incentives.
  - **Maharashtra** — Two parallel regimes: (a) MTDC Bed & Breakfast Scheme (G.R. TDM 2011/7/Pra.Kra.441 dated 30 October 2011 — still operative) — minimum 4 / maximum 10 beds, **₹5,000** registration fee valid 5 years, apply via Aaple Sarkar (Service ID 4347), processing up to 45 days; (b) Maharashtra Tourism Policy 2024 (notified 18 July 2024, valid 10 years) — layers fiscal incentives on top: 15–20% capital investment subsidy (25% for SC/ST/women), 100% Net SGST reimbursement, 5% interest subsidy (cap ₹50 lakh), stamp duty and registration-fee waiver (per Revenue & Forests Dept notification 15 October 2024), electricity duty exemption, requires a Provisional Registration Certificate.

## B.15 Testing Strategy

- **Unit** (Vitest): pure functions in `lib/` — tax computation, availability calculation, template rendering, signature verification.
- **Integration** (Vitest + Prisma test DB): service layer with a fresh SQLite per test file (`:memory:` doesn't support WAL — we use temp files).
- **Webhook tests**: replay fixtures from Razorpay's webhook testing tool; verify idempotency by sending the same event twice and asserting one Payment row.
- **E2E** (Playwright): the canonical journeys in §A.3 — first-run, quick-add, check-in/out, payment link → mocked Razorpay paid webhook → invoice download, OTP login (staff + guest), MCP tool call via Inspector.
- **Load** (k6): 50 concurrent booking creations on the same room — asserts that exactly one succeeds and 49 fail with the unique-constraint error code (the double-booking smoke test).
- **MCP**: use `@modelcontextprotocol/inspector` in CI to assert tool list shape and one happy-path invocation per tool with a test JWT.
- **Accessibility**: `@axe-core/playwright` checks on every E2E page.

CI: GitHub Actions on every PR — `pnpm lint && pnpm typecheck && pnpm test && pnpm test:e2e:headless`. Branch protection requires green.

## B.16 Deployment Options

- **Coolify / Dokku / self-hosted Docker** (recommended for v1): single container with Node + Litestream sidecar. ~512 MB RAM, 1 vCPU, 10 GB disk. ₹400–800/month VPS class (DigitalOcean, Hetzner, Contabo).
- **Fly.io**: native fit — volumes for SQLite, region `bom` (Mumbai). Litestream supported out of the box.
- **Railway**: same; mount a persistent volume.
- **Vercel**: **not recommended** for primary deployment because serverless functions have no persistent disk (SQLite needs one), and cold starts hurt the worker loop. If insisted, use Vercel for the Next.js app + a separate worker container (Railway/Fly) hosting SQLite + Litestream + jobs, with the app talking to it via a thin internal API. We ship a Vercel-compatible variant in `/deploy/vercel/` that uses **Turso** (libSQL) instead — see `/docs/turso.md` — at the cost of some write latency.
- **Docker image**: published as `ghcr.io/staykit/staykit:latest`, multi-arch (linux/amd64, linux/arm64).

`.env.example` lists all required vars; `pnpm doctor` validates them on boot.

## B.17 Observability

- **Logs**: structured JSON via `pino`. Important events also written to `AuditLog`.
- **Metrics**: `/api/metrics` Prometheus endpoint exposes booking creation rate, notification send rate per provider, webhook latency, job queue depth, SQLite WAL size, Litestream lag.
- **Error tracking**: `@sentry/nextjs` with `tunnel: '/api/sentry'` to bypass adblockers. PII scrubbing in `beforeSend` (strip phone, email, ID numbers).
- **Healthcheck**: `/api/health` returns DB ping + Litestream lag + job queue depth + provider reachability (cached 30s).
- **Status page**: optional Uptime Kuma config in `/deploy/uptime-kuma/`.

## B.18 Repository Structure & Open-Source Practices

```
staykit/
├── apps/
│   └── web/                # Next.js 15 app
│       ├── app/
│       │   ├── (owner)/
│       │   ├── (guest)/
│       │   ├── api/
│       │   └── mcp/
│       ├── components/
│       └── lib/
│           ├── auth/
│           ├── booking/
│           ├── payments/razorpay/
│           ├── notify/
│           ├── mcp/
│           ├── storage/
│           ├── jobs/
│           ├── tax/
│           ├── rbac/
│           └── i18n/
├── packages/
│   ├── prisma/             # Schema + migrations + seed
│   ├── ui/                 # Shared shadcn components
│   └── mcp-tools/          # Tool/resource definitions
├── deploy/
│   ├── docker/
│   ├── coolify/
│   ├── fly/
│   ├── railway/
│   └── vercel/
├── docs/                   # MkDocs / Nextra
│   ├── getting-started.md
│   ├── self-hosting.md
│   ├── compliance/
│   │   ├── dpdp.md
│   │   ├── gst.md
│   │   ├── form-c.md
│   │   └── state-registrations.md
│   ├── integrations/
│   ├── mcp/
│   └── api/
├── .github/
│   ├── workflows/
│   ├── ISSUE_TEMPLATE/
│   └── PULL_REQUEST_TEMPLATE.md
├── CODE_OF_CONDUCT.md
├── CONTRIBUTING.md
├── SECURITY.md
├── LICENSE
└── README.md
```

**License recommendation: AGPL-3.0.** Reasoning:
- The system competes economically with hosted SaaS PMS products. A permissive license (MIT/Apache-2.0) lets a competitor fork it, host it as closed-source SaaS, and never contribute back. For a community-funded project this is a hostile outcome.
- AGPL-3.0 closes the network-use loophole that GPL-3.0 leaves open: anyone offering StayKit as a network service must publish modifications. This keeps the hosted-SaaS playing field level.
- The cost: enterprise homestay chains may avoid AGPL software for internal use due to legal caution. We accept this trade — the target user is individual owners, not chains.
- Alternative considered: **Elastic License 2.0** or **Functional Source License (FSL-1.1-Apache-2.0)** — non-OSI but increasingly mainstream for SaaS-adjacent open source. Documented in `/docs/license-rationale.md` as a fallback.
- Contributors sign a **DCO** (`Signed-off-by:` in commits), not a CLA — keeps the bar low and keeps copyright distributed.

**README** structure: badges (license, CI, Discord), 60-second elevator pitch, screenshot of tape chart, "Try it in 5 minutes" Docker one-liner, Features, Architecture, Roadmap, How to contribute, Security policy link, License.

**CONTRIBUTING.md**: dev setup, code style (Biome/Prettier), commit convention (Conventional Commits), how to file an issue, issue→PR workflow, what counts as a `good-first-issue` (translation, new SMS provider adapter, new notification trigger).

**SECURITY.md**: responsible disclosure to `security@<project-domain>` with a PGP key; bounty not offered in v1 but acknowledgments in `SECURITY-THANKS.md`.

---

# Recommendations (Staged)

**Stage 1 — Ship v1 (target: 12 weeks)**
- Build single-property + multi-property happy path, tape chart, OTP staff/guest login, Razorpay Payment Links + webhooks, MSG91 SMS + WhatsApp + Resend email, six default notification templates, basic reports (occupancy + revenue).
- MCP server with read-only tools (`list_*`, `get_*`, `check_availability`, `get_kpis`) and PKCE OAuth flow.
- AGPL-3.0 license; AGENTS.md describing how Claude is expected to behave; CONTRIBUTING + SECURITY + LICENSE + CODE_OF_CONDUCT.
- Coolify deployment recipe + Docker image.
- Threshold to advance: 3 self-hosted alpha owners running 1 month with no data loss; >95% webhook success; <2% notification failure.

**Stage 2 — Hardening (weeks 13–24)**
- Add MCP write tools (`create_booking`, `cancel_booking`, `initiate_refund` with HITL), audit-viewer UI filtering by actor, refund flows, file-upload encryption, DPDP consent + erasure flows.
- Litestream verified end-to-end (monthly restore drill).
- Hindi translation; mobile day-list view.
- Threshold to advance: 25 active self-hosts; sub-300 ms p95 tape-chart load; AGPL compliance not blocking deals.

**Stage 3 — Scale-out (weeks 25+)**
- Optional Postgres deployment; optional BullMQ+Redis worker; optional Razorpay Route for multi-property revenue routing.
- More state-specific compliance helpers (auto-generated monthly Form XI for Goa, etc.).
- Channel attribution analytics (best ROI channel per property).
- Trigger: a single deployment crosses 25 properties or >10 writes/sec sustained.

**Decision triggers to revisit major choices**:
- If >30% of pilot owners ask for OTA two-way sync, reconsider channel-manager integration (probably Hostex or a custom Beds24 connector first).
- If AGPL-3.0 prevents 3+ paying enterprise deals, reissue under FSL-1.1-Apache-2.0 (existing contributors keep AGPL rights).
- If SQLite incidents (DB-locked errors, restore lag) exceed 1/month per deployment, accelerate the Postgres migration path to default.
- If MCP write-tool abuse appears (e.g., AI sending too many payment links), tighten the per-tool rate limit and require step-up confirmation for any tool with side effects beyond reads.

---

# Caveats

- Several specifics depend on the owner's location (state registration), turnover (GST registration), and Razorpay merchant status (KYC). The spec accommodates each but cannot remove the owner's compliance responsibility.
- The MCP specification is moving quickly; the design targets the **2025-11-25** revision and the 2026 roadmap (stateless Streamable HTTP, CIMD-default client identification). Expect tweaks when the 2026 spec finalises.
- Litestream v0.5.0's LTX format is recommended; older 0.3.x versions work but have slower restores.
- Cost figures for SMS (~₹0.10–0.25), WhatsApp utility (~₹0.125), WhatsApp marketing (₹0.8631 effective 1 Jan 2026 per Meta), and BSP markups (Interakt ~12.4%, Gupshup ~₹0.93/marketing, AiSensy ~₹1.09/marketing, MSG91 zero markup) reflect early-to-mid 2026 rates; revisit at each Meta rate-card update (typically 2–3 times/year).
- Form C / Form III filing is a legal obligation that the system reminds about but does not automate. No public API exists for the e-FRRO portal at this writing; building scraping against `indianfrro.gov.in` would create unacceptable liability.
- The "single owner, multi-property" tenancy bound is by design — running a multi-tenant SaaS where one StayKit deployment hosts many unrelated owners requires real RLS (Postgres) and a full security audit; not in scope for v1.
- DPDP "Significant Data Fiduciary" obligations are unlikely to apply at typical homestay scale, but documented in `/docs/compliance/dpdp.md` for chains that might cross thresholds.
- Pricing and rate references current as of May 2026; all regulatory/pricing constants live in `lib/config/` so a single PR updates them when notifications change.