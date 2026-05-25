/**
 * GST invoice numbering & place-of-supply helpers (audit P0 #3, #4).
 *
 * Indian GST (CGST Rules r.46) requires a consecutive serial number, unique per
 * financial year, not exceeding 16 characters. We issue the number the moment a
 * booking first receives revenue (it becomes a tax invoice), persist it on the
 * booking, and never regenerate it — so a re-print is byte-stable and the register
 * is gapless. The counter lives on Property and resets each financial year.
 */
import type { Prisma } from "@prisma/client";
import { GST } from "./config";

/** India's financial year runs 1 Apr → 31 Mar. Returns a label like "25-26" for the
 * FY that `date` (interpreted in IST) falls in. */
export function financialYearLabel(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(date);
  const year = Number(parts.find((p) => p.type === "year")!.value);
  const month = Number(parts.find((p) => p.type === "month")!.value); // 1-based
  const startYear = month >= 4 ? year : year - 1;
  return `${String(startYear).slice(2)}-${String(startYear + 1).slice(2)}`;
}

/**
 * Assign and persist the next gapless invoice number for a booking, inside the
 * caller's transaction. Idempotent: returns the existing number if already issued.
 */
export async function issueInvoiceNumber(
  tx: Prisma.TransactionClient,
  bookingId: string,
  now = new Date(),
): Promise<string> {
  const booking = await tx.booking.findUnique({
    where: { id: bookingId },
    include: { property: true },
  });
  if (!booking) throw new Error("Booking not found for invoice numbering");
  if (booking.invoiceNumber) return booking.invoiceNumber;

  const fy = financialYearLabel(now);
  const prop = booking.property;
  const next = prop.invoiceFyLabel === fy ? prop.invoiceCounter + 1 : 1;
  await tx.property.update({
    where: { id: prop.id },
    data: { invoiceCounter: next, invoiceFyLabel: fy },
  });
  const number = `${prop.invoicePrefix}/${fy}/${String(next).padStart(4, "0")}`;
  await tx.booking.update({
    where: { id: bookingId },
    data: { invoiceNumber: number, invoiceIssuedAt: now },
  });
  return number;
}

export interface PlaceOfSupply {
  /** True when the guest is in the same state as the property (CGST + SGST). */
  intraState: boolean;
  /** GST line items for the invoice. */
  lines: { label: string; amountPaise: number }[];
}

/**
 * Decide CGST+SGST (intra-state) vs IGST (inter-state) from the property's state and
 * the guest's state of residence, and split `taxAmount` into the correct lines.
 * When the guest's state is unknown we assume intra-state (the conservative default
 * for a walk-in homestay) but the caller can flag the missing data.
 */
export function placeOfSupply(
  propertyState: string,
  guestState: string | null | undefined,
  subtotalPaise: number,
  taxPaise: number,
): PlaceOfSupply {
  // Effective rate as a percentage, derived from the amounts so mixed-band stays still label sanely.
  const ratePct = subtotalPaise > 0 ? Math.round((taxPaise / subtotalPaise) * 100) : 0;
  const intraState = !guestState || guestState === propertyState;
  if (taxPaise <= 0) {
    return { intraState, lines: [] };
  }
  if (intraState) {
    const half = Math.round(taxPaise / 2);
    const halfPct = (ratePct / 2).toFixed(ratePct % 2 === 0 ? 0 : 1);
    return {
      intraState: true,
      lines: [
        { label: `CGST @ ${halfPct}%`, amountPaise: half },
        { label: `SGST @ ${halfPct}%`, amountPaise: taxPaise - half },
      ],
    };
  }
  return {
    intraState: false,
    lines: [{ label: `IGST @ ${ratePct}%`, amountPaise: taxPaise }],
  };
}

export const SAC_CODE = GST.sacCode;
