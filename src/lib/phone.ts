/**
 * Phone numbers are a guest's identity (one Guest per owner+phone). Normalising on the
 * way in means variants like "+91-98765 43210", "098765 43210" and "9876543210" all
 * collapse to one canonical "+919876543210", so we never create duplicate guest records.
 * India (+91) is assumed for bare 10-digit numbers; explicit +<country> is preserved.
 */
export function normalizePhone(raw: string | null | undefined): string {
  const cleaned = (raw ?? "").replace(/[^\d+]/g, "");
  if (!cleaned) return "";
  // An explicit country code wins — just strip stray symbols.
  if (cleaned.startsWith("+")) return "+" + cleaned.replace(/\D/g, "");
  const digits = cleaned.replace(/\D/g, "").replace(/^0+/, ""); // drop trunk zeros
  if (digits.length === 10) return "+91" + digits; // bare Indian mobile
  if (digits.length === 12 && digits.startsWith("91")) return "+" + digits; // 91XXXXXXXXXX
  return "+" + digits; // other international number entered without a +
}
