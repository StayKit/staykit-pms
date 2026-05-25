/**
 * Rate resolution (pure). Walk rate plans in priority-desc order; the first plan
 * that matches the (date, roomType) and day-of-week wins, else fall back to the
 * room type's base rate. Day-of-week bitmask is "Mon..Sun" (index 0 = Monday).
 */

export interface RatePlanLike {
  id: string;
  name?: string;
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

/**
 * Resolve one night for one room type: the highest-priority matching plan override
 * wins; otherwise the room type's base rate. Returns which plan applied (if any) so
 * the UI can show *why* a rate was charged.
 */
export function resolveNight(
  date: Date,
  roomTypeId: string,
  baseRate: number,
  plans: RatePlanLike[],
): { rate: number; planId: string | null; planName: string | null } {
  const candidates = [...plans].sort((a, b) => b.priority - a.priority);
  const dowIdx = bitmaskIndex(date);
  for (const plan of candidates) {
    if (date < plan.startDate || date >= plan.endDate) continue;
    if (plan.daysOfWeek[dowIdx] !== "1") continue;
    const override = plan.overrides.find((o) => o.roomTypeId === roomTypeId);
    if (override) return { rate: override.amount, planId: plan.id, planName: plan.name ?? null };
  }
  return { rate: baseRate, planId: null, planName: null };
}

/** Effective nightly rate (paise) for one night of one room type. */
export function rateForNight(
  date: Date,
  roomTypeId: string,
  baseRate: number,
  plans: RatePlanLike[],
): number {
  return resolveNight(date, roomTypeId, baseRate, plans).rate;
}

/** Sum the nightly rates across a stay, keeping which plan applied per night. */
export function quoteStay(
  nights: Date[],
  roomTypeId: string,
  baseRate: number,
  plans: RatePlanLike[],
): {
  perNight: { date: Date; rate: number; planId: string | null; planName: string | null }[];
  subtotal: number;
} {
  const perNight = nights.map((date) => ({
    date,
    ...resolveNight(date, roomTypeId, baseRate, plans),
  }));
  return { perNight, subtotal: perNight.reduce((s, n) => s + n.rate, 0) };
}
