/**
 * In-process background worker (§B.10). A single setInterval poller — fine for
 * SQLite's single-writer model — that every few seconds:
 *   1. drains due notifications (NotificationLog QUEUED → SENT/DLQ),
 *   2. runs generic Job-table work via a kind→handler registry,
 *   3. once per day after 03:00 IST, runs the daily cron task bodies.
 * Started from src/instrumentation.ts on server boot.
 */
import { drainNotifications } from "../notify/dispatch";
import { claimJobs, completeJob, failJob, newWorkerId } from "./queue";
import { runDailyTasks } from "./tasks";

export type JobHandler = (payload: Record<string, unknown>) => Promise<void>;

/** Handlers for generic Job kinds. Extended by features (e.g. refund poll, Phase 2). */
export const JOB_HANDLERS: Record<string, JobHandler> = {};

export function registerJobHandler(kind: string, handler: JobHandler) {
  JOB_HANDLERS[kind] = handler;
}

const WORKER_ID = newWorkerId();
const TICK_MS = 5_000;

let timer: ReturnType<typeof setInterval> | null = null;
let ticking = false;
let lastDailyRun: string | null = null; // IST day (YYYY-MM-DD) the daily tasks last ran

/** Process one batch of generic jobs. */
export async function processJobs(limit = 5) {
  const jobs = await claimJobs(WORKER_ID, limit);
  for (const job of jobs) {
    const handler = JOB_HANDLERS[job.kind];
    try {
      if (!handler) throw new Error(`No handler for job kind "${job.kind}"`);
      await handler(JSON.parse(job.payload || "{}"));
      await completeJob(job.id);
    } catch (e) {
      await failJob(job.id, e);
    }
  }
  return jobs.length;
}

function istParts(now: Date): { day: string; hour: number } {
  const day = now.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
  const hour = Number(
    now.toLocaleString("en-US", { timeZone: "Asia/Kolkata", hour: "2-digit", hour12: false }),
  );
  return { day, hour };
}

/** Run the daily cron task bodies at most once per IST day, after 03:00 IST. */
export async function maybeRunDaily(now = new Date()) {
  const { day, hour } = istParts(now);
  if (lastDailyRun === day || hour < 3) return false;
  lastDailyRun = day;
  await runDailyTasks(now);
  return true;
}

/** One full poller tick. Exported for tests; never throws. */
export async function workerTick() {
  if (ticking) return;
  ticking = true;
  try {
    await drainNotifications();
    await processJobs();
    await maybeRunDaily();
  } catch (e) {
    console.error("[worker] tick error", e);
  } finally {
    ticking = false;
  }
}

export function startWorker() {
  if (timer) return; // already running
  // Prime lastDailyRun so a same-day restart doesn't re-run the snapshot immediately.
  timer = setInterval(workerTick, TICK_MS);
  if (typeof timer.unref === "function") timer.unref();
  console.log(`[worker] started (${WORKER_ID}), tick ${TICK_MS}ms`);
}

export function stopWorker() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}

/** Test-only: reset the daily-run guard. */
export function __resetDailyGuard() {
  lastDailyRun = null;
}
