# GST on accommodation

Constants live in `src/lib/config/index.ts` (`GST`) and the logic in `src/lib/tax.ts`.

## Rates (Notification 15/2025-Central Tax (Rate), 17 Sep 2025; effective 22 Sep 2025)

| Per-unit, per-night **transaction value** | GST | ITC |
| ----------------------------------------- | --- | --- |
| ≤ ₹7,500                                  | 5%  | No  |
| > ₹7,500                                  | 18% | Yes |

The threshold is on the **transaction value per unit per night** — not the declared tariff and not
the total stay value. StayKit therefore decides the rate **per night line**, so a stay that crosses
the threshold on some nights is taxed correctly per night.

- **SAC code:** `996311` ("Room or unit accommodation services by Hotels/INN/Guest House/Club etc."),
  stored on `Property.sacCode`.
- **No GSTIN, no GST:** owners below the registration threshold (₹20 lakh general / ₹10 lakh in HP,
  Uttarakhand and the North-East) charge no GST. `computeTax(..., hasGstin=false)` returns zero tax.
- The Composition scheme is **not** modeled in v1 (documented limitation).

When the government revises rates or the threshold, edit `src/lib/config` and this file — nothing else.
