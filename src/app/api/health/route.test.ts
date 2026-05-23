import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db", () => ({
  prisma: { $queryRaw: vi.fn(), job: { count: vi.fn() } },
}));

import { GET } from "./route";
import { prisma } from "@/lib/db";

const q = prisma.$queryRaw as unknown as ReturnType<typeof vi.fn>;
const jobCount = prisma.job.count as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => vi.clearAllMocks());

describe("GET /api/health", () => {
  it("returns 200 with ok=true and the queue depth when the DB is reachable", async () => {
    q.mockResolvedValue([{ 1: 1 }]);
    jobCount.mockResolvedValue(3);
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.checks).toMatchObject({ db: "ok", jobQueueDepth: 3 });
  });

  it("returns 503 with ok=false when the DB ping fails", async () => {
    q.mockRejectedValue(new Error("db down"));
    jobCount.mockRejectedValue(new Error("db down"));
    const res = await GET();
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.checks).toMatchObject({ db: "error", jobQueueDepth: null });
  });
});
