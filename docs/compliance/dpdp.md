# DPDP (Digital Personal Data Protection)

DPDP Act 2023 + DPDP Rules 2025 (notified 13 Nov 2025; full compliance deadline 13 May 2027;
penalties up to ₹250 crore). The homestay **owner is the Data Fiduciary**; StayKit (the software) is
the **Data Processor**.

## What StayKit provides

- **Consent capture** — `Guest.marketingConsent` + `Guest.dpdpConsentAt`; marketing is opt-in.
- **Right to access (export)** — booking/guest data export (CSV today; per-guest export is on the roadmap).
- **Right to erasure** — guest erasure, with **statutory holds** for tax records (typically 6 years
  under the GST Act, 8 under the Income Tax Act) clearly explained before deletion.
- **Encrypted ID documents** — guest ID files are AES-256-GCM encrypted at rest; viewing the full
  document requires step-up re-auth and writes an `AuditLog` row.
- **90-day auto-purge** — `GUEST_ID` files are purged 90 days after checkout (the `NIGHTLY_CLEANUP`
  job), unless on legal hold.
- **Audit logs** — every access/mutation is recorded with the actor (human vs MCP).

## Data localisation

DPDP does not mandate blanket localisation, but defaults assume **India-region hosting** (S3
`ap-south-1` or R2 with India-restricted buckets). Significant Data Fiduciary obligations are unlikely
at typical homestay scale but are noted here for chains that might cross thresholds.
