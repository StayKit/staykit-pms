/** Shared result shape for server actions. Mirrors the ad-hoc one in bookings.ts. */
export interface ActionResult<T = unknown> {
  ok: boolean;
  message?: string;
  id?: string;
  data?: T;
}

export function ok<T>(data?: T, message?: string): ActionResult<T> {
  return { ok: true, data, message };
}

export function fail(message: string): ActionResult {
  return { ok: false, message };
}

/** Turn a thrown error into a friendly ActionResult message. */
export function failFrom(e: unknown, fallback = "Something went wrong."): ActionResult {
  return { ok: false, message: e instanceof Error ? e.message : fallback };
}
