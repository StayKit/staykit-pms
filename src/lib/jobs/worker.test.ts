import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  processJobs,
  maybeRunDaily,
  workerTick,
  registerJobHandler,
  __resetDailyGuard,
} from "./worker";
import { enqueueJob } from "./queue";
import { prisma } from "@/lib/db";
import { resetDb, seedBasic } from "../../../test/factories";

beforeEach(async () => {
  await resetDb();
  await seedBasic();
  __resetDailyGuard();
});

describe("processJobs", () => {
  it("runs a registered handler and marks the job DONE", async () => {
    const seen: unknown[] = [];
    registerJobHandler("TEST_OK", async (payload) => {
      seen.push(payload);
    });
    const job = await enqueueJob("TEST_OK", { hello: "world" });
    const n = await processJobs();
    expect(n).toBe(1);
    expect(seen).toEqual([{ hello: "world" }]);
    expect((await prisma.job.findUnique({ where: { id: job.id } }))?.status).toBe("DONE");
  });

  it("fails (and re-queues) a job whose handler throws", async () => {
    registerJobHandler("TEST_FAIL", async () => {
      throw new Error("nope");
    });
    const job = await enqueueJob("TEST_FAIL");
    await processJobs();
    const row = await prisma.job.findUnique({ where: { id: job.id } });
    expect(row?.status).toBe("QUEUED");
    expect(row?.attempts).toBe(1);
    expect(row?.lastError).toBe("nope");
  });

  it("fails a job with no registered handler", async () => {
    const job = await enqueueJob("UNKNOWN_KIND");
    await processJobs();
    const row = await prisma.job.findUnique({ where: { id: job.id } });
    expect(row?.attempts).toBe(1);
    expect(row?.lastError).toMatch(/No handler/);
  });
});

describe("maybeRunDaily", () => {
  it("does not run before 03:00 IST", async () => {
    // 20:00 UTC == 01:30 IST (next day) → hour 1.
    const ran = await maybeRunDaily(new Date("2026-06-10T20:00:00Z"));
    expect(ran).toBe(false);
  });

  it("runs once per IST day after 03:00", async () => {
    // 00:00 UTC == 05:30 IST → hour 5.
    const first = await maybeRunDaily(new Date("2026-06-10T00:00:00Z"));
    expect(first).toBe(true);
    const again = await maybeRunDaily(new Date("2026-06-10T01:00:00Z"));
    expect(again).toBe(false);
    // A new IST day runs again.
    const nextDay = await maybeRunDaily(new Date("2026-06-11T00:00:00Z"));
    expect(nextDay).toBe(true);
  });
});

describe("workerTick", () => {
  it("completes a full tick without throwing", async () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    await expect(workerTick()).resolves.toBeUndefined();
    spy.mockRestore();
  });
});
