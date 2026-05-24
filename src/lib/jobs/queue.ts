/**
 * Generic background-job queue backed by the `Job` table. Used for delayed/retryable
 * work that isn't a notification (notifications drain straight from NotificationLog).
 * SQLite's single-writer model plus a claim-by-update makes this safe for the
 * single-process worker; the same interface swaps to BullMQ+Redis at scale (§B.10).
 */
import { randomBytes } from "node:crypto";
import { prisma } from "../db";

export const MAX_JOB_ATTEMPTS = 8;

/** Exponential backoff (ms) for a failed job: 2^attempts seconds, capped at 1h. */
export function jobBackoffMs(attempts: number): number {
  return Math.min(2 ** attempts * 1000, 60 * 60 * 1000);
}

export interface EnqueueJobOptions {
  /** Earliest time the job may run. Defaults to now. */
  runAfter?: Date;
  maxAttempts?: number;
}

export async function enqueueJob(
  kind: string,
  payload: Record<string, unknown> = {},
  opts: EnqueueJobOptions = {},
) {
  return prisma.job.create({
    data: {
      kind,
      payload: JSON.stringify(payload),
      runAfter: opts.runAfter ?? new Date(),
      maxAttempts: opts.maxAttempts ?? MAX_JOB_ATTEMPTS,
    },
  });
}

/**
 * Atomically claim up to `limit` due jobs for this worker. Each candidate is moved
 * QUEUED → RUNNING with a guarded updateMany so a racing tick can't grab the same row.
 */
export async function claimJobs(workerId: string, limit = 5) {
  const due = await prisma.job.findMany({
    where: { status: "QUEUED", runAfter: { lte: new Date() } },
    orderBy: { runAfter: "asc" },
    take: limit,
  });

  const claimed: typeof due = [];
  for (const job of due) {
    const res = await prisma.job.updateMany({
      where: { id: job.id, status: "QUEUED" },
      data: { status: "RUNNING", lockedAt: new Date(), lockedBy: workerId },
    });
    if (res.count === 1) claimed.push(job);
  }
  return claimed;
}

export async function completeJob(id: string) {
  return prisma.job.update({
    where: { id },
    data: { status: "DONE", completedAt: new Date(), lastError: null },
  });
}

/** Record a failure: retry with backoff, or move to the DLQ once attempts are spent. */
export async function failJob(id: string, error: unknown) {
  const job = await prisma.job.findUnique({ where: { id } });
  if (!job) return;
  const attempts = job.attempts + 1;
  const dead = attempts >= job.maxAttempts;
  return prisma.job.update({
    where: { id },
    data: {
      attempts,
      status: dead ? "DLQ" : "QUEUED",
      lastError: error instanceof Error ? error.message : String(error),
      lockedAt: null,
      lockedBy: null,
      runAfter: dead ? job.runAfter : new Date(Date.now() + jobBackoffMs(attempts)),
    },
  });
}

export function newWorkerId(): string {
  return `w_${process.pid}_${randomBytes(4).toString("hex")}`;
}
