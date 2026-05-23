/**
 * Money is always stored and passed around as integer paise. Format only at the edge.
 * Indian numbering system: ₹ 1,23,456.
 */

const inrFmt = new Intl.NumberFormat("en-IN", {
  maximumFractionDigits: 0,
});

const inrPaiseFmt = new Intl.NumberFormat("en-IN", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** Format paise as a rupee string. `withSymbol` prepends "₹ ". */
export function inr(paise: number, withSymbol = true): string {
  const rupees = Math.round(paise) / 100;
  const sign = rupees < 0 ? "-" : "";
  const body =
    Math.round(Math.abs(paise)) % 100 === 0
      ? inrFmt.format(Math.abs(rupees))
      : inrPaiseFmt.format(Math.abs(rupees));
  return withSymbol ? `₹${sign ? " " + sign : " "}${body}` : `${sign}${body}`;
}

/** Whole-rupee paise → integer rupees (drops paise). */
export function toRupees(paise: number): number {
  return Math.round(paise) / 100;
}

/** Rupees → paise (integer). */
export function toPaise(rupees: number): number {
  return Math.round(rupees * 100);
}
