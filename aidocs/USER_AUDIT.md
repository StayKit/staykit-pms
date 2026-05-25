# StayKit — User Functionality Audit

_Perspective: property owner / front-desk staff using this daily to run a hotel_

---

## P0 — Critical (Core daily operations at risk)

### 1. Rate plans are completely ignored when creating bookings

The rate plans system (with priority, date ranges, room-type overrides) exists but has zero effect at booking time. QuickAdd always defaults to the room's base rate and requires the user to manually type a price. Every single booking requires the staff to mentally calculate the correct rate. A rate plan that charges ₹4,500 on weekends vs ₹3,200 on weekdays is invisible to the person taking the booking.

### 2. No availability check when creating a booking

The new booking form does not show which rooms are available for the selected dates. You can select a room that is already booked; the conflict is only caught at submission. In a busy property during peak season, this creates friction every time staff has to back out and guess again.

### 3. The app is not usable on mobile or tablet

The sidebar is hardcoded at 248px. There are no media queries for the app shell. Front-desk staff who take bookings on a phone or iPad will see a broken, overflowing layout. This is the entire guest-facing reception workflow.

---

## P1 — High (Significantly hurts daily operations)

### 4. Cannot add internal notes to a booking after it's created

Notes can only be added at booking creation time via QuickAdd. Once the booking exists, the detail page shows notes as read-only. There is no way to record "guest called — wants early check-in" or "room needs extra pillow" against the booking. Special requests disappear.

### 5. No manual way to send a notification to a specific guest

The Notifications page manages templates, but there is no "send this template to guest X" action anywhere in the app. The `sendTestAction` server action exists but is not wired to any UI. If a payment link email bounces or a guest asks for a re-send, staff have no way to do it inside the app.

### 6. "Block dates" and "Filters" buttons on the Calendar are non-functional placeholders

Two of the most-used calendar actions — blocking a room for maintenance and filtering the view — have buttons that do nothing. A staff member clicking "Block dates" will get no feedback. The maintenance block workflow requires going to Properties → Maintenance, which is buried.

### 7. Bookings list has no date range filter and no column sorting

The filter chips are preset and fixed (Today, Unpaid, Tentative, etc.). There is no way to see "all check-ins between June 1 and June 10" or "all departures this week." Columns cannot be sorted. For a 20-room property with 200 active bookings, finding anything requires scrolling through an unordered list.

### 8. Cannot edit a guest's profile after it's created

The guest detail page is entirely read-only. If a guest provides their email at check-in, there is no field to add it. If a name was entered wrong, there is no correction path. The only editable item is the marketing consent toggle. Guest records become stale with no repair mechanism.

---

## P2 — Medium (Quality of life and efficiency gaps)

### 9. Reports have no custom date range

KPI cards offer only four presets: Today, Last 7d, Last 30d, Last 90d. An owner wanting "how did we do in April" or "revenue for this financial year" has no way to get that. The cards are also not clickable — you can't drill into which bookings make up that revenue number. The channel mix chart is a static bar with no interactivity.

### 10. Guest portal is entirely read-only

Guests can view their booking and pay online, but they cannot update their email, provide arrival time, or communicate any preference. The "Request to cancel" button exists in the UI but has no visible backend action. Guests who want to cancel must call the property directly, and staff have no corresponding workflow to handle the request inside the app.

### 11. No way to see occupied rooms tonight in the Rooms view

The RoomsManager shows cleanliness status per room but not whether the room is currently occupied. To see tonight's guests, staff must go to the Calendar. There is no "housekeeping view" that shows clean/dirty alongside occupied/vacant in one screen.

### 12. Notification delivery has no drill-down log

The notifications page shows "X sent in 30 days" as a summary badge. There is no way to view which specific guests received which messages, whether delivery failed, or what the message content was for a given send. If a guest says "I never received my booking confirmation," there is no audit path for it.

### 13. No way to merge duplicate guest records

If a guest books once with `+91-9876...` and again with `9876...` (without country code), they get two guest records. The address book grows with duplicates. There is no merge, link, or de-duplicate action anywhere.

### 14. Onboarding wizard cannot be re-opened

After the initial 5-step setup, the wizard is gone. If a new team member needs to understand what was configured, or if setup was incomplete, there is no "resume setup" or "getting started" guide to return to.

### 15. Empty states don't help users take action

Pages like Bookings, Guests, and Reports show "No results" text but provide no in-context button to create the first item. The global FAB ("New booking") exists but empty states on filtered views give no guidance.

### 16. FRRO Form C is a link to the government portal, not a generated document

Foreign guests are correctly flagged and counted, but the FRRO compliance workflow dead-ends at a link to `indianfrro.gov.in`. The foreigners list cannot be exported. Staff must manually re-enter guest data on the government site.

---

## P3 — Lower Priority (Polish and completeness)

### 17. Rate/night field in QuickAdd doesn't reflect the active rate plan

Even if rate plan auto-application (P0 #1 above) were fixed, the QuickAdd form shows no indication of which rate plan is being applied or why. Staff have no visibility into pricing logic.

### 18. No way to re-send or manually trigger a notification from the booking detail

The Comms tab in a booking shows all sent messages but they are read-only. There is no "Resend" or "Send again" button next to any message.

### 19. Guest cancellation request has no staff-side workflow

The guest portal has a "Request to cancel" button but there is no corresponding inbox, badge, or notification for staff. The request goes nowhere visible.

### 20. Invoice download is only available for bookings with recorded payments

If a guest paid cash and no payment was recorded via "Record payment," the invoice download may not be available. There is no way to generate a pro-forma or quote document before payment.

### 21. No export for the guest list

The bookings page has a CSV export. The guests page has no equivalent. For marketing, compliance, or backup purposes, there is no way to download the full address book.

### 22. Notification template editing has no preview or variable reference

When editing SMS/email/WhatsApp templates, staff type variables like `{{guestName}}` blind. There is no preview of how the rendered message will look, no list of available variables, and no test-send UI on the template edit page itself.

### 23. Channel color picker UX is unclear

Channels can be assigned colors, but it is not clear whether a color picker is available or if colors must be typed as hex values. The tape chart uses these colors prominently.

### 24. Multi-property view is missing

Staff with access to multiple properties must switch properties one at a time via the property switcher. There is no cross-property arrivals list, occupancy summary, or unified bookings view.

### 25. No keyboard shortcuts or power-user affordances

The app has no keyboard shortcuts for common actions (new booking, check-in, search). Frequent users who process 20+ check-ins a day must mouse through the same flows every time.

---

## Summary by Area

| Area                        | P0  | P1  | P2  | P3  |
| --------------------------- | --- | --- | --- | --- |
| Booking creation            | 2   | —   | —   | 2   |
| Booking management          | —   | 2   | 1   | 1   |
| Calendar                    | —   | 1   | —   | —   |
| Guests                      | —   | 1   | 2   | —   |
| Notifications               | —   | 1   | 1   | 2   |
| Reports                     | —   | 1   | 1   | —   |
| Guest portal                | —   | —   | 2   | 1   |
| Mobile / platform           | 1   | —   | —   | —   |
| Settings / compliance       | —   | —   | 2   | 1   |
| Power user / multi-property | —   | —   | 1   | 2   |

The biggest leverage points are **rate plan application at booking time**, **mobile layout**, and **availability checking** — those three together represent the most frequent daily friction for any property running more than a handful of rooms.
