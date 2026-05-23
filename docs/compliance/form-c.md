# Form C / Form III (foreign guests)

Under the **Immigration and Foreigners Act 2025** (in force 1 Sep 2025), accommodation providers must
report foreign nationals to the FRRO. The OCI exemption was removed — **OCI cardholders are now
included**. Reporting is required within 24 hours of check-in (and, under the 2025 Rules, at checkout).

## What StayKit does

- Tracks `Guest.isForeign` (and `nationality`). The booking UI surfaces a **"Foreign national —
  Form C pending"** badge and a check-in reminder.
- A `FORM_C_REMINDER` job nudges the owner for foreign guests checked in within the last 24h without
  an acknowledged filing.
- Links to the official portal: <https://indianfrro.gov.in/sform>.

## What StayKit does **not** do

It does **not** auto-file. No public API exists for e-FRRO; scraping the portal would create
unacceptable liability. The owner remains responsible for the actual submission.
