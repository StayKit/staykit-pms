# StayKit — P0/P1/P2 Implementation Log

Tracks the build that addresses the findings in [FUNCTIONAL_AUDIT.md](FUNCTIONAL_AUDIT.md).
Started 2026-05-25. Baseline before work: 561 tests passing, `tsc` clean.

Legend: ☐ not started · ◐ in progress · ✅ done · ⏭ deferred (with reason)

---

## P0 — Critical

| #   | Item                                                  | Status | Notes                                                                                                                                                                                                                       |
| --- | ----------------------------------------------------- | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Notifications actually send (MSG91 + Resend adapters) | ✅     | Real `Msg91SmsProvider`, `Msg91WhatsAppProvider`, `ResendProvider` in `notify/providers.ts`, env-gated per channel; console fallback kept. Integrations page + `.env.example` updated; added `MSG91_WHATSAPP_NUMBER`.       |
| 2   | GST at booking time uses the real tax engine          | ✅     | `quoteBookingAction` now returns `taxRupees`/`totalRupees`/`taxLabel` from `computeTax`, incl. a manual-rate path; QuickAdd shows the real 0/5/18% line. Tests added.                                                       |
| 3   | Gapless sequential invoice numbers + register         | ✅     | `lib/invoice.ts` `issueInvoiceNumber` (per-FY, frozen on first payment) wired into `applyPayment`; `Booking.invoiceNumber`/`invoiceIssuedAt`, `Property.invoiceFyLabel`. New `/reports/invoices` register + `invoices.csv`. |
| 4   | IGST / place-of-supply (intra vs inter-state)         | ✅     | `placeOfSupply()` chooses CGST+SGST vs IGST from property vs guest state; invoice route rewritten, malformed CGST label fixed. `Guest.state` added.                                                                         |
| 5   | Refund failures surfaced + recovery path              | ✅     | `retryRefundAction` + `settleRefundManuallyAction`; failed-refund banner on booking detail + alert on payments report.                                                                                                      |

## P1 — High

| #   | Item                                          | Status | Notes                                                                                                                                                                                                                |
| --- | --------------------------------------------- | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 6   | Mark as no-show                               | ✅     | `markNoShow` engine fn + `noShowAction`; footer "No-show" button; frees room nights, excluded from occupancy. Tests added.                                                                                           |
| 7   | Confirm a tentative hold without marking paid | ✅     | `confirmBookingHold` + `confirmBookingAction`; "Confirm (collect later)" button beside "Confirm & mark paid". Tests added.                                                                                           |
| 8   | Staff can cancel a booking                    | ✅     | Added `bookings:cancel` to STAFF in `rbac/policy.ts`; policy test updated.                                                                                                                                           |
| 9   | Multi-room / group bookings                   | ✅     | Engine + action + quote accept `roomIds`; per-room pricing, combined GST, capacity = sum; QuickAdd room chips (multi-select); invoice lists each room; detail shows "N rooms". Tests added. (Single-room move only.) |
| 10  | Automated / scheduled guest reminders         | ✅     | `dispatchScheduledReminders` daily task fires arrival templates by default offset (PRE_ARRIVAL_24H −24h, CHECK_IN_INSTRUCTIONS arrival morning), honoring an automation override; deduped. Tests added.              |
| 11  | Edit rooms; amenities + room-type colour      | ✅     | Inline `RoomTypeEditor` (name/rate/occupancy/colour/description) + `RoomEditor` (name/number/type/amenities/active) in RoomsManager; actions audited. (Room photos deferred — needs upload UI; tracked in P3.)       |
| 12  | Payment-link expiry + cancel-old-on-resend    | ✅     | `cancelPaymentLink` + cancel-on-resend in `createPaymentLinkForBooking`; guest portal hides expired/cancelled links; `expireStalePaymentLinks` daily task. Tests added.                                              |
| 13  | Capture guest state (place of supply)         | ✅     | State select in QuickAdd + GuestEditForm; engine upsert + actions persist it.                                                                                                                                        |
| 14  | Guests can download their own invoice/receipt | ✅     | Invoice route accepts a guest session for their own booking; download link on `/my/bookings/[id]`.                                                                                                                   |
| 15  | Occupancy / capacity enforced                 | ✅     | Engine rejects guests > room-type max occupancy; QuickAdd warns + blocks review.                                                                                                                                     |

## P2 — Medium

| #   | Item                                                        | Status | Notes                                                                                                                                                                                       |
| --- | ----------------------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 16  | Friendly toast feedback (replace `.dev-code`)               | ✅     | New `Toast` component; migrated BookingDetailView, RoomsManager, RatePlansManager, TeamManager, ChannelsManager, MaintenanceManager, PropertyForm, GuestActions.                            |
| 17  | Reference/notes field on manual payment                     | ✅     | Reference/txn-ID field added to RecordPaymentPanel; flows to the audited action.                                                                                                            |
| 18  | Security-deposit concept                                    | ✅     | `Payment.isDeposit` + `Booking.depositHeld`; record-deposit checkbox, separate display, return/forfeit actions; excluded from invoice revenue.                                              |
| 19  | Settlement / reconciliation visibility                      | ✅     | Manual payments settle on record (`settledAt`/`settlementId="DIRECT"`); payments report adds Awaiting-settlement + outstanding split. (Razorpay settlement webhook still external.)         |
| 20  | Price preview when moving a booking                         | ✅     | MovePanel shows live new total (incl. GST) via `quoteBookingAction` before saving.                                                                                                          |
| 21  | Rate-plan previews / templates / conflict warning           | ✅     | Starter templates (Weekend/Festive/Off-season), priority-tie conflict banner + per-row "tie" badge. (QuickAdd already previews the applied plan at booking time.)                           |
| 22  | Housekeeping board                                          | ✅     | New `/housekeeping` board: occupancy + arriving/departing + cleanliness + assignee, prioritised by the morning turn. `Room.cleanedAt/cleanedById/housekeeperId`; `assignHousekeeperAction`. |
| 23  | Reporting gaps (range-aware CSV, ADR/RevPAR, split pending) | ✅     | Range-aware bookings CSV; ADR/RevPAR present; pending split (unpaid vs part-paid) on payments report. (PDF/Excel beyond CSV deferred — browser Print-to-PDF covers invoices/Form C.)        |
| 24  | Role permissions reflected in the UI                        | ✅     | `navForRole` hides Reports/Properties/Channels/MCP from roles lacking the perm; Settings sub-nav gates Property/Integrations/Team; staff-cancel (#8) resolves the stale Cancel button.      |
| 25  | Guest CRM (tags / VIP / blacklist / LTV)                    | ✅     | `Guest.vip/blacklisted/tags`; `GuestCrmPanel` toggles+tags; blacklist blocks new bookings in the engine; guests list shows badges + LTV + "Top spenders" sort.                              |
| 26  | Team onboarding/offboarding (invite link)                   | ✅     | `inviteTeamMemberAction` (best-effort SMS/email + copyable /signin link); deactivate now revokes sessions + audits.                                                                         |
| 27  | Failed/bounced message alerts                               | ✅     | Dashboard banner counts FAILED/DLQ messages (14d) → links to the delivery log's Failed filter.                                                                                              |
| 28  | Audit log covers config changes + CSV export                | ✅     | Audit added to room/room-type/cleanliness/rate-plan/maintenance edits & deletes; `/api/reports/audit.csv` + export button.                                                                  |
| 29  | Export-everything / backup                                  | ✅     | `/api/export` full JSON dump; "Download all my data" in Settings → Account.                                                                                                                 |
| 30  | Channels overbooking warning in UI                          | ✅     | Prominent overbooking-risk banner on the Channels page when an OTA channel is active.                                                                                                       |
| 31  | FRRO Form C generation + foreigners export                  | ✅     | Pre-filled printable Form C at `/bookings/[id]/form-c`; "Generate Form C" on the booking; foreigners register CSV `/api/reports/foreigners.csv` + reports link.                             |

---

## Change log

- **2026-05-25** — Implemented all P0 (5), P1 (10) and P2 (16) findings from the functional audit.
  - One additive Prisma migration: `Guest.state/vip/blacklisted/tags`, `Booking.invoiceNumber/invoiceIssuedAt/depositHeld`, `Property.invoiceFyLabel`, `Payment.isDeposit`, `Room.housekeeperId/cleanedAt/cleanedById`.
  - New modules: `lib/invoice.ts`, `components/Toast.tsx`, `components/owner/GuestCrmPanel.tsx`, `components/owner/manage/HousekeepingBoard.tsx`.
  - New routes/pages: `/housekeeping`, `/reports/invoices`, `bookings/[id]/form-c`, `api/reports/invoices.csv`, `api/reports/audit.csv`, `api/reports/foreigners.csv`, `api/export`.
  - Verification: `tsc` clean, ESLint clean, **584 tests passing** (was 561; +23 new). Prettier-formatted.

### Deferred (documented, lower priority)

- Room **photo** upload UI (#11) — needs the storage/upload flow; tracked under P3 #32-area.
- True OTA availability **sync** (#30) — out of scope by design; surfaced as a UI warning instead.
- Razorpay **settlement webhook** (#19) — external integration; manual payments reconcile, online captures show "awaiting settlement".
- **PDF/Excel** report export beyond CSV (#23) — browser Print-to-PDF covers invoices & Form C.
- Storing the **applied rate-plan name** on the booking for post-creation display (#21) — shown live in QuickAdd at creation time.
  </content>
  </invoke>
