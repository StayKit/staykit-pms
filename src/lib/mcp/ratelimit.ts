/**
 * Per-token rate limiting for the MCP endpoint. The limits in config.MCP were
 * documented but never enforced (audit §16); this is the enforcement.
 *
 * Fixed-window counters held in-process, keyed by a hash of the bearer token (so the
 * cap is per-token, not per-user). A single self-hosted Next process is the deployment
 * target, so an in-memory store is sufficient and avoids a DB round-trip on the hot
 * path. Each tool call increments the per-minute and per-hour windows; send_notification
 * additionally draws down a stricter hourly budget because it spends real SMS/email.
 */
import { MCP } from "../config";

interface Window {
  count: number;
  resetAt: number;
}

const perMinute = new Map<string, Window>();
const perHour = new Map<string, Window>();
const notifyPerHour = new Map<string, Window>();

export class RateLimitError extends Error {
  readonly code = "RATE_LIMITED";
  constructor(message: string) {
    super(message);
    this.name = "RateLimitError";
  }
}

/** Increment a fixed window; return false once the limit is exceeded. */
function take(map: Map<string, Window>, key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const w = map.get(key);
  if (!w || w.resetAt <= now) {
    map.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (w.count >= limit) return false;
  w.count += 1;
  return true;
}

/**
 * Throw RateLimitError if this call exceeds the token's budget. `tool` is the tool
 * name so the notification sub-limit can be applied selectively.
 */
export function enforceRateLimit(tokenKey: string, tool: string): void {
  if (tool === "send_notification") {
    if (!take(notifyPerHour, tokenKey, MCP.sendNotificationPerHour, 60 * 60_000)) {
      throw new RateLimitError(
        `Notification limit reached (${MCP.sendNotificationPerHour}/hour). Try again later.`,
      );
    }
  }
  if (!take(perMinute, tokenKey, MCP.perTokenCallsPerMin, 60_000)) {
    throw new RateLimitError(`Rate limit: ${MCP.perTokenCallsPerMin} calls/minute exceeded.`);
  }
  if (!take(perHour, tokenKey, MCP.perTokenCallsPerHour, 60 * 60_000)) {
    throw new RateLimitError(`Rate limit: ${MCP.perTokenCallsPerHour} calls/hour exceeded.`);
  }
}

/** Test helper — clear all windows between cases. */
export function resetRateLimits(): void {
  perMinute.clear();
  perHour.clear();
  notifyPerHour.clear();
}
