import { describe, it, expect } from "vitest";
import {
  utcMidnight,
  parseYmd,
  addDays,
  ymd,
  nightsBetween,
  eachNight,
  shortDate,
  longDate,
  weekday,
  isWeekend,
  today,
} from "./dates";

// Nights are anchored to UTC-midnight of the IST calendar day so the
// (roomId, date) unique constraint is timezone-stable (B.2/B.3).

describe("utcMidnight (IST calendar day)", () => {
  it("keeps the same day when the UTC time is within the IST day", () => {
    expect(ymd(utcMidnight(new Date("2026-06-12T06:00:00Z")))).toBe("2026-06-12");
  });
  it("rolls to the next day for late-UTC times that are next-day in IST", () => {
    // 19:00Z = 00:30 IST the next day.
    expect(ymd(utcMidnight(new Date("2026-06-12T19:00:00Z")))).toBe("2026-06-13");
  });
  it("accepts an ISO string", () => {
    expect(ymd(utcMidnight("2026-06-12T06:00:00Z"))).toBe("2026-06-12");
  });
});

describe("parseYmd / addDays / ymd", () => {
  it("parses a YYYY-MM-DD to UTC midnight", () => {
    const d = parseYmd("2026-06-12");
    expect(d.getUTCFullYear()).toBe(2026);
    expect(d.getUTCMonth()).toBe(5);
    expect(d.getUTCDate()).toBe(12);
    expect(d.getUTCHours()).toBe(0);
  });
  it("adds days without mutating the input", () => {
    const d = parseYmd("2026-06-12");
    expect(ymd(addDays(d, 3))).toBe("2026-06-15");
    expect(ymd(d)).toBe("2026-06-12");
  });
});

describe("nightsBetween / eachNight", () => {
  it("counts nights exclusive of the checkout day", () => {
    expect(nightsBetween(parseYmd("2026-06-12"), parseYmd("2026-06-15"))).toBe(3);
  });
  it("enumerates each occupied night", () => {
    expect(eachNight(parseYmd("2026-06-12"), parseYmd("2026-06-15")).map(ymd)).toEqual([
      "2026-06-12",
      "2026-06-13",
      "2026-06-14",
    ]);
  });
});

describe("formatting", () => {
  it("shortDate renders day + short month", () => {
    expect(shortDate(parseYmd("2026-06-12"))).toBe("12 Jun");
  });
  it("longDate includes month and year", () => {
    const s = longDate(parseYmd("2026-06-12"));
    expect(s).toMatch(/June/);
    expect(s).toMatch(/2026/);
  });
  it("weekday renders the short weekday", () => {
    expect(weekday(parseYmd("2026-01-03"))).toBe("Sat");
  });
});

describe("isWeekend", () => {
  it("is true for Sat/Sun and false for weekdays", () => {
    expect(isWeekend(parseYmd("2026-01-03"))).toBe(true); // Sat
    expect(isWeekend(parseYmd("2026-01-04"))).toBe(true); // Sun
    expect(isWeekend(parseYmd("2026-01-05"))).toBe(false); // Mon
  });
});

describe("today", () => {
  it("returns UTC-midnight of the current IST day", () => {
    const t = today();
    expect(t.getUTCHours()).toBe(0);
    expect(t.getUTCMinutes()).toBe(0);
    expect(ymd(t)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
