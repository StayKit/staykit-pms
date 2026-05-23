/**
 * Minimal Mustache-style renderer: {{a.b.c}} and {{var|filter}}. Kept dependency-free.
 * Filters: |inr (paise→₹), |date (ISO→"12 Jun"), |upper.
 */
import { inr } from "../money";
import { shortDate } from "../dates";

type Scope = Record<string, unknown>;

function resolve(path: string, scope: Scope): unknown {
  return path.split(".").reduce<unknown>((acc, key) => {
    if (acc && typeof acc === "object" && key in (acc as Scope)) {
      return (acc as Scope)[key];
    }
    return undefined;
  }, scope);
}

function applyFilter(value: unknown, filter?: string): string {
  if (value == null) return "";
  switch (filter) {
    case "inr":
      return inr(Number(value));
    case "date":
      return shortDate(new Date(String(value)));
    case "upper":
      return String(value).toUpperCase();
    default:
      return String(value);
  }
}

export function renderTemplate(template: string, scope: Scope): string {
  return template.replace(/\{\{\s*([\w.]+)\s*(?:\|\s*(\w+)\s*)?\}\}/g, (_m, path, filter) =>
    applyFilter(resolve(path, scope), filter),
  );
}

/** Variables documented in the template editor UI. */
export const TEMPLATE_VARIABLES = [
  "{{guest.name}}",
  "{{booking.ref}}",
  "{{booking.checkIn|date}}",
  "{{booking.checkOut|date}}",
  "{{property.name}}",
  "{{property.checkInTime}}",
  "{{amount.due|inr}}",
  "{{amount.total|inr}}",
  "{{paymentLink.url}}",
] as const;
