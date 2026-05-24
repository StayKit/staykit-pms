import { describe, it, expect, beforeEach } from "vitest";
import {
  enqueueJob,
  claimJobs,
  completeJob,
  failJob,
  jobBackoffMs,
  newWorkerId,
  MAX_JOB_ATTEMPTS,
} from "./queue";
import { prisma } from "@/lib/db";
import { resetDb } from "../../../test/factories";

beforeEach(async () => {
  await resetDb();
});

describe("jobBackoffMs", () => {
  it("is exponential and capped at one hour", () => {
    expect(jobBackoffMs(1)).toBe(2000);
    expect(jobBackoffMs(40)).toBe(60 * 60 * 1000);
  });
});

describe("newWorkerId", () => {
  it("includes the pid and is unique", () => {
    expect(newWorkerId()).toMatch(/^w_\d+_[0-9a-f]{8}$/);
    expect(newWorkerId()).not.toBe(newWorkerId());
  });
});

describe("job queue", () => {
  it("enqueues and claims only due jobs", async () => {
    await enqueueJob("TEST", { a: 1 });
    await enqueueJob("TEST", { a: 2 }, { runAfter: new Date(Date.now() + 60_000) });
    const claimed = await claimJobs(newWorkerId(), 5);
    expect(claimed).toHaveLength(1);
    expect(JSON.parse(claimed[0].payload).a).toBe(1);
    const row = await prisma.job.findUnique({ where: { id: claimed[0].id } });
    expect(row?.status).toBe("RUNNING");
    expect(row?.lockedBy).toBeTruthy();
  });

  it("does not double-claim a row across workers", async () => {
    await enqueueJob("TEST");
    const [a, b] = await Promise.all([claimJobs(newWorkerId()), claimJobs(newWorkerId())]);
    expect(a.length + b.length).toBe(1);
  });

  it("completeJob marks DONE", async () => {
    const job = await enqueueJob("TEST");
    await completeJob(job.id);
    const row = await prisma.job.findUnique({ where: { id: job.id } });
    expect(row?.status).toBe("DONE");
    expect(row?.completedAt).toBeTruthy();
  });

  it("failJob retries with backoff then moves to DLQ", async () => {
    const job = await enqueueJob("TEST", {}, { maxAttempts: 2 });
    await failJob(job.id, new Error("boom"));
    let row = await prisma.job.findUnique({ where: { id: job.id } });
    expect(row?.status).toBe("QUEUED");
    expect(row?.attempts).toBe(1);
    expect(row?.lastError).toBe("boom");
    expect(row!.runAfter.getTime()).toBeGreaterThan(Date.now());

    await failJob(job.id, "second");
    row = await prisma.job.findUnique({ where: { id: job.id } });
    expect(row?.status).toBe("DLQ");
    expect(row?.attempts).toBe(2);
  });

  it("failJob is a no-op for an unknown id", async () => {
    await expect(failJob("missing", new Error("x"))).resolves.toBeUndefined();
  });

  it("defaults maxAttempts to MAX_JOB_ATTEMPTS", async () => {
    const job = await enqueueJob("TEST");
    const row = await prisma.job.findUnique({ where: { id: job.id } });
    expect(row?.maxAttempts).toBe(MAX_JOB_ATTEMPTS);
  });
});
