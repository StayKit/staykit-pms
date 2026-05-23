/**
 * Rate resolution (pure). Walk rate plans in priority-desc order; the first plan
 * that matches the (date, roomType) and day-of-week wins, else fall back to the
 * room type's base rate. Day-of-week bitmask is "Mon..Sun" (index 0 = Monday).
 */

export interface RatePlanLike {
  id: string;
  priority: number;
  startDate: Date;
  endDate: Date;
  daysOfWeek: string; // "1111111" Mon..Sun
  overrides: { roomTypeId: string; amount: number }[];
}

/** JS getUTCDay(): 0=Sun..6=Sat. Our bitmask is 0=Mon..6=Sun. */
function bitmaskIndex(date: Date): number {
  const js = date.getUTCDay(); // 0=Sun
  return js === 0 ? 6 : js - 1; // → 0=Mon..6=Sun
}

/** Effective nightly rate (paise) for one night of one room type. */
export function rateForNight(
  date: Date,
  roomTypeId: string,
  baseRate: number,
  plans: RatePlanLike[],
): number {
  const candidates = [...plans].sort((a, b) => b.priority - a.priority);
  const dowIdx = bitmaskIndex(date);
  for (const plan of candidates) {
    if (date < plan.startDate || date >= plan.endDate) continue;
    if (plan.daysOfWeek[dowIdx] !== "1") continue;
    const override = plan.overrides.find((o) => o.roomTypeId === roomTypeId);
    if (override) return override.amount;
  }
  return baseRate;
}

/** Sum the nightly rates across a stay. */
export function quoteStay(
  nights: Date[],
  roomTypeId: string,
  baseRate: number,
  plans: RatePlanLike[],
): { perNight: { date: Date; rate: number }[]; subtotal: number } {
  const perNight = nights.map((date) => ({
    date,
    rate: rateForNight(date, roomTypeId, baseRate, plans),
  }));
  return { perNight, subtotal: perNight.reduce((s, n) => s + n.rate, 0) };
}
