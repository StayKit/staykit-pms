/**
 * GST computation for accommodation services.
 *
 * Per Notification 15/2025-Central Tax (Rate) dated 17 Sep 2025 (effective 22 Sep 2025):
 *   - transaction value ≤ ₹7,500 per unit per night → 5% GST, no ITC
 *   - transaction value  > ₹7,500 per unit per night → 18% GST, with ITC
 *
 * The threshold check is on the *per-unit-per-night transaction value*, not the
 * total stay value or the declared tariff. Owners without a GSTIN charge no GST.
 */
import { GST } from "./config";

export interface TaxLine {
  /** Per-night rate in paise. */
  nightlyRatePaise: number;
  nights: number;
  /** Number of rooms/units at this rate (default 1). */
  units?: number;
}

export interface TaxResult {
  subtotalPaise: number;
  taxAmountPaise: number;
  totalPaise: number;
  /** Effective rate applied (0, 0.05 or 0.18). Mixed lines report the blended rate. */
  effectiveRate: number;
  gstApplicable: boolean;
}

/** GST rate for a single per-night transaction value (paise). */
export function gstRateForNightlyValue(nightlyRatePaise: number): number {
  return nightlyRatePaise <= GST.thresholdPaise ? GST.lowRate : GST.highRate;
}

/**
 * Compute GST across one or more rate lines. `hasGstin=false` returns zero tax
 * (owner is below the registration threshold / unregistered).
 */
export function computeTax(lines: TaxLine[], hasGstin: boolean): TaxResult {
  let subtotal = 0;
  let tax = 0;

  for (const line of lines) {
    const units = line.units ?? 1;
    const lineSubtotal = line.nightlyRatePaise * line.nights * units;
    subtotal += lineSubtotal;
    if (hasGstin) {
      const rate = gstRateForNightlyValue(line.nightlyRatePaise);
      tax += Math.round(lineSubtotal * rate);
    }
  }

  const total = subtotal + tax;
  return {
    subtotalPaise: subtotal,
    taxAmountPaise: tax,
    totalPaise: total,
    effectiveRate: subtotal > 0 ? tax / subtotal : 0,
    gstApplicable: hasGstin,
  };
}

/** Given a GST-inclusive total, back out the base and tax (single rate). */
export function splitInclusive(
  totalPaise: number,
  nightlyRatePaise: number,
  hasGstin: boolean,
): { basePaise: number; taxPaise: number; rate: number } {
  if (!hasGstin) return { basePaise: totalPaise, taxPaise: 0, rate: 0 };
  const rate = gstRateForNightlyValue(nightlyRatePaise);
  const base = Math.round(totalPaise / (1 + rate));
  return { basePaise: base, taxPaise: totalPaise - base, rate };
}
