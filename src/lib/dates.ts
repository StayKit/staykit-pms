/**
 * Date helpers. Nights are anchored to UTC-midnight (the convention used by
 * BookingRoom.date) so the (roomId, date) unique constraint works regardless of
 * the server timezone. Display formatting uses Asia/Kolkata.
 */
import { APP } from "./config";

/** UTC-midnight of the given date's calendar day (in IST). */
export function utcMidnight(d: Date | string): Date {
  const date = typeof d === "string" ? new Date(d) : d;
  // Interpret the wall-clock day in IST, then store as that day's UTC midnight.
  const ymd = date.toLocaleDateString("en-CA", { timeZone: APP.timezone }); // YYYY-MM-DD
  return new Date(`${ymd}T00:00:00.000Z`);
}

/** Parse a YYYY-MM-DD string to UTC midnight. */
export function parseYmd(s: string): Date {
  return new Date(`${s}T00:00:00.000Z`);
}

export function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setUTCDate(x.getUTCDate() + n);
  return x;
}

export function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Number of nights between check-in and check-out (exclusive of checkout day). */
export function nightsBetween(checkIn: Date, checkOut: Date): number {
  const ms = utcMidnight(checkOut).getTime() - utcMidnight(checkIn).getTime();
  return Math.round(ms / 86_400_000);
}

/** Every night occupied by a stay: [checkIn, checkOut) as UTC-midnight dates. */
export function eachNight(checkIn: Date, checkOut: Date): Date[] {
  const start = utcMidnight(checkIn);
  const end = utcMidnight(checkOut);
  const out: Date[] = [];
  for (let d = new Date(start); d < end; d = addDays(d, 1)) out.push(new Date(d));
  return out;
}

export function shortDate(d: Date): string {
  return d.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}

export function longDate(d: Date): string {
  return d.toLocaleDateString("en-IN", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function weekday(d: Date): string {
  return d.toLocaleDateString("en-IN", { weekday: "short", timeZone: "UTC" });
}

export function isWeekend(d: Date): boolean {
  const dow = d.getUTCDay();
  return dow === 0 || dow === 6;
}

/** Today at UTC-midnight (IST calendar day). */
export function today(): Date {
  return utcMidnight(new Date());
}
