# StayKit — User-Audit Remediation Tracker

Live status for fixing the P0 + P1 findings in [`USER_AUDIT.md`](./USER_AUDIT.md).
These are the daily-operations gaps that hurt front-desk / owner workflows most.

**Status legend:** ✅ done · 🚧 in progress · ⬜ not started

Last updated: 2026-05-25 — **All P0 + P1 items complete.**

---

## P0 — Critical

| #   | Item                                               | Status |
| --- | -------------------------------------------------- | ------ |
| 1   | Rate plans auto-applied at booking time (QuickAdd) | ✅     |
| 2   | Availability check when creating a booking         | ✅     |
| 3   | App shell responsive on mobile / tablet            | ✅     |

## P1 — High

| #   | Item                                               | Status |
| --- | -------------------------------------------------- | ------ |
| 4   | Add internal notes to a booking after creation     | ✅     |
| 5   | Manually send a notification to a specific guest   | ✅     |
| 6   | Wire up Calendar "Block dates" + "Filters" buttons | ✅     |
| 7   | Bookings list date-range filter + column sorting   | ✅     |
| 8   | Edit a guest's profile after creation              | ✅     |

---

## What changed, by item

### P0-1 — Rate plans auto-applied at booking time

- `quoteBookingAction` (`src/lib/actions/bookings.ts`) prices a stay from the property's
  rate plans and returns the applied plan name + whether rates vary per night.
- `resolveNight` / `quoteStay` (`src/lib/booking/rates.ts`) now surface the winning plan's
  id + name (not just the rate).
- QuickAdd auto-fills the rate from the plan when staff haven't typed their own, shows
  "{plan} applied" / "Base rate", and submits with **no** flat rate in auto mode so the
  engine applies the true per-night rates. Typing a rate switches to manual; an
  "Use rate plan instead" link reverts.

### P0-2 — Availability check at booking time

- `quoteBookingAction` also returns `unavailableRoomIds` (occupied nights + maintenance
  blocks overlapping the window).
- QuickAdd disables unavailable rooms in the picker ("— booked / blocked"), warns when the
  selected room clashes, and blocks advancing to Review.

### P0-3 — Responsive shell

- `OwnerShell` gains a mobile top bar (hamburger + brand + new-booking) and an off-canvas
  sidebar drawer with a scrim; drawer auto-closes on route change.
- `globals.css` `@media (max-width: 900px)`: shell → flex column, sidebar → slide-in drawer,
  form rows stack, QuickAdd modal → bottom sheet, topbar search hidden.

### P1-4 — Booking notes after creation

- `updateBookingNotesAction` (`src/lib/actions/bookings.ts`, audited).
- `BookingDetailView` Stay tab now has an editable **Internal notes** panel (always shown).

### P1-5 — Manually message a guest

- `sendBookingNotificationAction` (`src/lib/actions/notifications.ts`): picks destination
  from the template channel (email → guest email, SMS/WhatsApp → phone), builds the scope
  from the booking, logs against the booking. `sendNow` extended with `{ bookingId }`.
- `BookingDetailView` Messages tab has a **Message this guest** template picker.

### P1-6 — Calendar Block dates + Filters

- "Block dates" opens a modal → `createMaintenanceBlockAction` (room/from/to/reason).
- "Filters" opens a popover to filter the tape chart by room type + booking status
  (client-side), with an active-count badge and "Clear all".

### P1-7 — Bookings date range + sorting

- `BookingsFilters` adds a check-in From/To date range (`?from`/`?to`).
- Bookings page applies the range and supports sortable columns (`?sort`/`?dir`) on Guest,
  Dates, Room, Status, Total with toggle arrows.

### P1-8 — Edit guest profile

- New `GuestEditForm` (wraps the pre-existing `updateGuestAction`) on the guest detail page:
  edit name / email / city / notes. (Phone stays read-only — it's the guest's unique key.)

---

## Verification

- [x] `npm run typecheck` — clean
- [x] `npm run lint` — no warnings/errors
- [x] `npm test` — **521 passed** (78 files; +11 new)
- [x] `npm run build` — green
- [x] Runtime smoke: dashboard, bookings (+sort/+range), calendar, guests, booking & guest
      detail all 200; mobile shell + new UI strings render; no dev-log errors.

---

## P2 — Medium (complete, except #16 skipped)

| #   | Item                                               | Status                         |
| --- | -------------------------------------------------- | ------------------------------ |
| 9   | Reports custom date range + clickable KPI cards    | ✅                             |
| 10  | Guest portal editable + cancel-request workflow    | ✅                             |
| 11  | Show occupied/vacant rooms tonight in Rooms view   | ✅                             |
| 12  | Notification delivery drill-down log               | ✅                             |
| 13  | Prevent duplicate guest records (phone = identity) | ✅                             |
| 14  | Onboarding wizard re-openable                      | ✅                             |
| 15  | Empty states with in-context action buttons        | ✅                             |
| 16  | FRRO Form C generation                             | ⏭️ skipped (owner: not needed) |

**Decisions:** #13 — no merge UI; instead normalize the mobile number (the guest's identity)
so variants like `+91-9876…` and `9876…` collapse to one canonical record. #16 — skipped.

### What changed, by item (P2)

- **#9** — `reports/page.tsx` reads `?from/?to`; new `ReportsDateRange` client control. The 4 preset
  KPI cards (+ a custom card) are now `<Link>`s that drill into `/bookings?from&to`; the custom range
  also drives the "Key metrics" panel + source mix.
- **#10** — schema: `Booking.arrivalTime / guestRequests / cancelRequestedAt / cancelRequestReason`.
  New `src/lib/actions/guest-portal.ts` (`updateMyBookingAction`, `requestCancellationAction`, both
  fail-closed on the guest session). `GuestBookingActions` lets the guest edit email/arrival/requests
  and request cancellation; staff see a cancel-request banner + a "From the guest" section on the
  booking detail.
- **#11** — `properties/[id]/rooms` queries tonight's `BookingRoom`; `RoomsManager` shows a "Tonight"
  column (guest name → booking link, or "Vacant"; key icon when checked in).
- **#12** — new `/notifications/log` page (recipient, channel, message body, status, attempts/errors)
  with status filters; linked from the notifications page header + the "sent (30d)" badge.
- **#13** — new `src/lib/phone.ts#normalizePhone`; used by the booking engine's guest upsert and the
  OTP auth flow (replaced the local copy) so one person = one guest record.
- **#14** — "Setup guide" entry in the sidebar Advanced group → `/onboarding` (the wizard reads live
  setup state and has a "Go to dashboard" exit).
- **#15** — actionable empty states (`.empty-state`) on Bookings + Guests with "New booking" /
  "Clear filters" CTAs; the Guests "Add guest" button now links to the booking flow.

---

---

## P3 — Lower priority (complete) + Notifications build-out

| #   | Item                                                         | Status |
| --- | ------------------------------------------------------------ | ------ |
| 17  | QuickAdd shows the applied rate plan / per-night breakdown   | ✅     |
| 18  | Resend / re-trigger a notification from the booking detail   | ✅     |
| 19  | Staff-side guest-cancellation-request workflow               | ✅     |
| 20  | Proforma / quote invoice before payment                      | ✅     |
| 21  | Guest list CSV export                                        | ✅     |
| 22  | Template editor: preview + variable reference + test-send    | ✅     |
| 23  | Channel colour picker clarity (+ edit existing)              | ✅     |
| 24  | Multi-property overview                                      | ✅     |
| 25  | Keyboard shortcuts / power-user affordances                  | ✅     |
| —   | **/notifications: full template CRUD + used across the app** | ✅     |

### What changed, by item (P3 + Notifications)

- **/notifications rebuilt** — `NotificationTemplatesManager` (create/edit/delete/toggle) replacing the
  read-only table; `createTemplateAction` / `deleteTemplateAction` added (+ extended
  `updateTemplateAction` for DLT/WhatsApp ids). Editor has live preview, variable-insert chips and
  test-send (**#22**).
- **Templates used across the app** — `enqueueNotification` now routes per channel (EMAIL→email,
  SMS/WhatsApp→phone, skips when no contact). Lifecycle triggers fire from the engine/services:
  BOOKING_CONFIRMED/TENTATIVE on create, PAYMENT_RECEIVED centralised in `applyPayment` (covers cash
  - online; removed the webhook dup), CANCELLED on cancel, POST_CHECKOUT_THANKS on check-out.
- **#17** — QuickAdd review step shows the applied plan / "rates vary by night".
- **#18** — `resendNotificationAction` + a Resend button on each message in the booking Messages tab.
- **#19** — guest cancel request now has a "Cancellation requests" bookings filter, a red sidebar
  badge on Bookings (count via the owner layout), and a "Cancel requested" row marker.
- **#20** — invoice route renders "Proforma Invoice / Quote" until a payment is recorded, "Tax
  Invoice" after; booking detail always offers the download (label adapts).
- **#21** — `/api/reports/guests.csv` + Export CSV button on Guests.
- **#23** — channel colour: hex shown on create, and each row's swatch is an editable colour input
  (saves via `updateChannelAction`).
- **#24** — new `/overview` page (nav: Overview) — per-property occupancy/arrivals/departures/pending
  - a combined arrivals-today list + "Open" (sets active property → dashboard).
- **#25** — `KeyboardShortcuts` (mounted in OwnerShell): `n` new booking, `/` focus search,
  `g`+`d/o/c/b/u/r/n` navigation, `?` help overlay. Ignores typing in inputs.

---

## New tests added

- `src/lib/actions/bookings.quote.test.ts` — quote base/plan/availability, notes, **phone dedup** (7)
- `src/lib/actions/notifications.test.ts` — `sendBookingNotificationAction` happy + no-email (2)
- `src/lib/booking/rates.test.ts` — `resolveNight` / plan-name surfacing (3)
- `src/lib/phone.test.ts` — `normalizePhone` Indian variants / intl / blank (3)
- `src/lib/actions/guest-portal.test.ts` — guest edit + cancel-request, fail-closed paths (6)
- `src/lib/actions/notifications.test.ts` (P3) — template create/dup/delete + `resendNotificationAction` (3)
- `src/lib/actions/bookings.quote.test.ts` (P3) — lifecycle notifications fire on create + check-out (2)

## P2 verification

- [x] `npx prisma db push` · `typecheck` · `lint` · `npm test` **531** · `build` — all green
- [x] Runtime smoke OK (reports custom range, notifications log, rooms tonight, empty states)

## P3 + Notifications verification

- [x] `npm run typecheck` — clean
- [x] `npm run lint` — clean
- [x] `npm test` — **536 passed** (80 files, +5)
- [x] `npm run build` — green
- [x] Runtime smoke: `/notifications` (template manager), `/overview`, `/api/reports/guests.csv`,
      `/bookings?filter=cancelreq`, invoice proforma vs tax label, Overview + Setup guide in nav —
      all 200, no dev-log errors.
