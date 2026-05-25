# StayKit — Functional Audit (User's Cap, v2)

_Perspective: a non-technical homestay owner / front-desk staff running the property day-to-day._
_Date: 2026-05-25. This is a deeper pass after an earlier user audit (whose 25 items were remediated). It focuses on what is still broken, missing, or misleading._

Items marked **✓ code-verified** were confirmed by reading the source during this audit. Others are strong findings from a structured review.

---

## P0 — Critical (money, trust, compliance, or the core promise is broken)

### 1. Notifications never actually send — the whole messaging stack is a stub ✓ code-verified

`src/lib/notify/providers.ts:47-50` — `providerFor()` **always returns `ConsoleProvider`**, regardless of whether MSG91/Resend keys are configured. Every SMS / email / WhatsApp is only `console.log`-ed, yet the delivery log records it as **SENT**.

- "Send payment link", "Message this guest", "Resend", booking confirmations, payment receipts, cancellation notices — none reach a real guest.
- The Integrations settings page invites the owner to enter provider keys, creating false confidence that messaging works.
- **This is the single biggest gap.** A booking system whose confirmations and payment links silently go nowhere is not usable in production.

### 2. GST shown at booking time is hardcoded to 5% and can be wrong ✓ code-verified

`src/components/owner/QuickAdd.tsx:127` (`gst = subtotal * 0.05`) and the "GST (5%)" line at `:393`. The real engine (`src/lib/tax.ts`) charges **18% above ₹7,500/night** and **0% when the property has no GSTIN**. So the total quoted to the guest at the point of sale can differ from what is actually stored and invoiced:

- Not GST-registered → screen shows 5% tax that doesn't exist.
- Premium rooms (>₹7,500) → screen under-charges (shows 5%, real is 18%).
- Staff confirm a price to the guest verbally that the system then changes. Erodes trust in every number on the screen.

### 3. Invoice numbers are not gapless or sequential (GST non-compliance) ✓ code-verified

`src/app/(owner)/bookings/[id]/invoice/route.ts:40` — invoice number is `${invoicePrefix}-${booking.ref}` (e.g. `INV-SK-A8X3Q`). The `Property.invoiceCounter` field exists but is **never incremented**. Indian GST law requires a consecutive serial number per financial year. There is also no invoice register/ledger, no record of what was issued, and re-printing regenerates from live booking state (so a corrected booking silently changes an already-issued invoice).

### 4. Invoices always split CGST+SGST; no IGST / place-of-supply ✓ code-verified

`invoice/route.ts:90-93` hardcodes the CGST+SGST (intra-state) split, and the `Guest` model has **no `state` field** (`prisma/schema.prisma:270-291`, only `city`). A guest from another state must legally be billed **IGST**. Every inter-state booking is taxed and labelled incorrectly. (Bonus: the CGST label string `@ ${(GST.lowRate*50)}%–9%` renders as a malformed "2.5%–9%".)

### 5. Refund failures are invisible with no recovery path

When Razorpay rejects a refund, `src/lib/payments/service.ts` marks it `FAILED` with a reason, but nothing surfaces this to the owner — no banner, no alert, no "retry/settle manually" action on the booking or payments report. The guest's money is stuck and the owner doesn't know.

---

## P1 — High (significant daily-ops friction or compliance exposure)

### 6. No "Mark as no-show" action ✓ code-verified

The `NO_SHOW` status exists in the enum but there is **no button** to set it (`BookingDetailView.tsx:439-511` footer offers only check-out / confirm-paid / send-link / check-in / cancel). A guest who never arrives can't be recorded correctly, which also distorts occupancy reports and refund logic.

### 7. A tentative hold can't be confirmed without marking it paid ✓ code-verified

For a `tentative` booking the only primary action is **"Confirm & mark paid"** (`BookingDetailView.tsx:449-457`). There is no "confirm, collect later" path. Staff who hold a room pending a guest's decision are forced to fake a cash payment to confirm it.

### 8. Front-desk staff cannot cancel a booking they just made ✓ code-verified

`src/lib/rbac/policy.ts:54` — `STAFF` has `bookings:write` but **not `bookings:cancel`**. A front-desk person can create a booking but can't undo their own mistake or handle a guest cancelling at the counter; they must call the owner. (Worse: the Cancel button still shows for them and then errors — see #24.)

### 9. One booking = one room — no multi-room or group bookings ✓ code-verified

QuickAdd has a single room `<select>` (`QuickAdd.tsx:273`) and the invoice/detail use `rooms[0]`. A family needing two rooms, or a group, must be entered as separate disconnected bookings — no group check-in, no combined invoice, no single payment, no linked cancellation.

### 10. No automated / scheduled guest reminders ✓ code-verified

`src/lib/booking/engine.ts` only enqueues notifications on lifecycle events (confirm/tentative, checkout-thanks, cancel; payment-received in `applyPayment`). The `NotificationAutomation` model with `delayMinutes` (for "24h before check-in", "check-in instructions", "payment due") is defined in the schema but **nothing dispatches it**. Triggers like `PRE_ARRIVAL_24H` / `CHECK_IN_INSTRUCTIONS` exist as templates but never fire on their own — the owner must remember to send each one manually.

### 11. Rooms can't be edited; no photos, amenities, or room-type colour UI ✓ code-verified

`RoomsManager.tsx` only **adds and deletes** room types and rooms. There is no way to:

- rename a room/type or change its rate, occupancy, or assigned type (fix a typo = delete + recreate, which fails once it has bookings);
- upload room **photos** (`Room.photos` exists in schema, no UI);
- set **amenities** (`Room.amenities` exists, no UI);
- pick the **room-type colour** used by the calendar (`RoomType.color` exists, no picker).

### 12. Payment links: expiry not handled, resend silently creates duplicates

Razorpay links default to a 6-month expiry (`PaymentLink.expiresAt` stored) but the app never checks it — the guest portal shows the first link unconditionally, so a guest can be sent a dead link with no error. "Send payment link" creates a brand-new link each time **without cancelling the old one**, so two live links can exist and a guest could pay the wrong/old amount.

### 13. Guest state is never captured (blocks correct invoicing)

Tied to #4: there is no field or UI to record the guest's state of residence, so place-of-supply (and therefore CGST/SGST vs IGST) can never be determined correctly.

### 14. Guests can't get their own invoice / receipt

The invoice route requires owner/staff auth (`invoice/route.ts:22-23`), so a logged-in guest cannot download an invoice or a payment receipt from `/my`. Every invoice request becomes a manual owner task; cash/partial payments produce no guest-facing receipt at all.

### 15. Occupancy / room capacity is never enforced

Booking creation accepts any `adults`+`children` without checking the room type's `maxOccupancy`. Staff can book 6 guests into a 2-person room with no warning, and there is no extra-person charge mechanism.

---

## P2 — Medium (quality-of-life, efficiency, and accountability)

### 16. Success/error feedback renders in a raw "dev-code" block ✓ code-verified

After saving rooms, payments, settings, etc., the result message appears in a monospace `.dev-code` box (`RoomsManager.tsx:282`, `BookingDetailView.tsx:515`). To a non-technical owner this looks like an error/debug output, not a friendly confirmation toast.

### 17. Recording a manual payment has no reference/notes field ✓ code-verified

`RecordPaymentPanel` (`BookingDetailView.tsx:555-570`) captures only amount + method. There's nowhere to note a UPI txn ID or bank reference, making later reconciliation guesswork. (The server action accepts notes — the UI just doesn't expose it.)

### 18. No deposit / security-deposit concept

Everything is "amount paid". There's no way to record a refundable security deposit separately from the room payment, or mark part of a payment non-refundable, so refund math treats the whole paid amount as refundable.

### 19. No settlement / reconciliation visibility

`Payment.settlementId` / `settledAt` are never populated, so the owner can't see which captured payments have actually reached their bank. There's no report reconciling invoices → payments → settlements.

### 20. Moving a booking gives no price preview

The Move panel recalculates rate + GST for the new room/dates but shows no preview of the new total before saving — the amount can jump unexpectedly (recoverable via undo, but jarring).

### 21. Rate plans are a black box at the edges

- No preview of **which** plan will apply to a given room on a given date.
- No conflict/overlap warning when two plans share a priority.
- No seasonal/holiday or weekday/weekend starter templates — a first-time host faces a blank form.
- The applied plan isn't shown on the booking detail after creation (only fleetingly in QuickAdd).

### 22. Housekeeping is a status dropdown, not a workflow

Rooms can be CLEAN/DIRTY/IN_PROGRESS/OUT_OF_ORDER, but there's no task assignment to a staff member, no "who cleaned it / when", no completion proof, and no single housekeeping board combining occupancy + cleanliness for the morning turn.

### 23. Reporting gaps

- No PDF/Excel export for an accountant — CSV only.
- The CSV export ignores the active date range (`reports/page.tsx` links a fixed `/api/reports/bookings.csv`).
- No forward-looking pipeline / occupancy forecast, no ADR / RevPAR.
- The "pending payments" KPI doesn't separate fully-unpaid from partially-paid.

### 24. Role permissions aren't reflected in the UI

STAFF (and MANAGER) see links/buttons for things they can't do — Rates, Settings, the Cancel button (#8) — and only discover the limit when the action errors. Confusing; feels broken rather than restricted.

### 25. Guest CRM is thin

- No tags / VIP / blacklist / "do not book".
- No merge UI for duplicate guest records (phone is now normalized, but existing dupes can't be fixed).
- No lifetime-value sort/segment to find best customers.
- No bulk actions (bulk message, bulk tag, bulk check-in/mark-paid).

### 26. Team onboarding/offboarding is manual

Adding a team member (`TeamManager`) creates the user but sends no invite/OTP link — they don't know they have access. Disabling leaves all their data; there's no clean offboard.

### 27. Failed/bounced messages don't alert the owner

Even once real sending exists (#1), the retry-to-DLQ path in `dispatch.ts` has no owner-facing alert — the owner must remember to open the delivery log to discover a guest never got a critical message.

### 28. Audit log doesn't cover configuration changes; can't be exported

Booking/payment/AI actions are logged, but room cleanliness, rate-plan edits/deletes, and maintenance blocks are not. There's also no CSV export of the audit log for dispute resolution.

### 29. No "export everything" / backup for the owner

No way to download a full copy of the owner's data (bookings, guests, invoices, settings). For a self-hosted SQLite app this is both a DPDP-portability expectation and a basic safety net.

### 30. Channels are manual attribution only (overbooking risk)

By design there is no real OTA sync (Airbnb/Booking.com/MMT). An owner listing elsewhere must manually mirror availability or risk double-bookings. Fine as a stated limitation, but it should be unmistakable in the UI, not a quiet design note.

### 31. FRRO Form C dead-ends at a government link

Foreign guests are flagged and a reminder is logged, but there's no generated/pre-filled Form C and no export of the foreigners list. (Previously marked "skipped — owner says not needed"; re-flagging because it's a legal obligation for any property that does take foreign guests.)

---

## P3 — Lower priority (polish & completeness)

### 32. Calendar (tape chart) limitations

No room-type colours (colour exists in schema, unused), no per-day rate/availability overlay, no cleanliness overlay, and checked-out/cancelled bars add visual clutter over time.

### 33. Guest portal is shallow

Can edit email/arrival/requests but not name/phone/city; no booking history split (past vs upcoming); no check-in/out status visibility; no self-managed marketing consent; no self-service ID-document upload.

### 34. Notification templates

Limited variable set (no room number/type, amenities, cancellation-deadline); no SMS character-count/segment preview; only one template per channel+trigger (no A/B or seasonal variants).

### 35. Invoice details

Invoice date is the **booking creation date**, not the payment date (`invoice/route.ts:78`); no per-night/per-room line-item breakdown when rates vary; superseded proforma isn't archived when the tax invoice is issued.

### 36. Misc

- Currency hardcoded to INR (`Property.defaultCurrency` unused).
- Overpayment is rejected outright — no change/credit/round-up handling.
- No session-timeout warning before logout.
- Onboarding isn't resumable section-by-section or adaptive to property size.
- No reverse-charge (RCM) / tax-exempt marking for B2B guests.

---

## Summary by area

| Area                         | P0         | P1         | P2            | P3      |
| ---------------------------- | ---------- | ---------- | ------------- | ------- |
| Notifications / messaging    | 1 (#1)     | 1 (#10)    | 1 (#27)       | 1 (#34) |
| Tax / invoicing / compliance | 3 (#2,3,4) | 1 (#13)    | —             | 1 (#35) |
| Payments / refunds           | 1 (#5)     | 1 (#12)    | 3 (#17,18,19) | 1 (#36) |
| Booking lifecycle            | —          | 3 (#6,7,9) | 1 (#20)       | —       |
| Guests / portal / CRM        | —          | 1 (#14)    | 1 (#25)       | 1 (#33) |
| Rooms / housekeeping / rates | —          | 2 (#11,15) | 2 (#21,22)    | 1 (#32) |
| Reports / data               | —          | —          | 2 (#23,29)    | —       |
| Roles / team / audit         | —          | 1 (#8)     | 3 (#24,26,28) | —       |
| Channels / OTA / FRRO        | —          | —          | 2 (#30,31)    | —       |

**Highest leverage:** (1) make notifications actually send, (2) fix GST display + invoice numbering + IGST so the money/legal layer is trustworthy, (3) close the booking-lifecycle gaps (no-show, confirm-without-pay, multi-room, staff cancel). Those touch the most frequent and highest-stakes daily moments.
