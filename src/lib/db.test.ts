import { describe, it, expect, afterEach, vi } from "vitest";
import { resolveDatabaseUrl, prisma } from "./db";

const original = process.env.DATABASE_URL;
afterEach(() => {
  process.env.DATABASE_URL = original;
  vi.unstubAllEnvs();
});

describe("resolveDatabaseUrl", () => {
  it("returns absolute file URLs unchanged (preserving the query)", () => {
    process.env.DATABASE_URL = "file:/var/data/app.db?connection_limit=1";
    expect(resolveDatabaseUrl()).toBe("file:/var/data/app.db?connection_limit=1");
  });

  it("rewrites a relative file URL to an absolute path against cwd", () => {
    process.env.DATABASE_URL = "file:./data/app.db";
    const out = resolveDatabaseUrl();
    expect(out).toBe(`file:${process.cwd()}/data/app.db`);
  });

  it("passes through non-file URLs (e.g. postgres) untouched", () => {
    process.env.DATABASE_URL = "postgresql://user:pass@host:5432/db";
    expect(resolveDatabaseUrl()).toBe("postgresql://user:pass@host:5432/db");
  });

  it("returns undefined when DATABASE_URL is unset", () => {
    delete process.env.DATABASE_URL;
    expect(resolveDatabaseUrl()).toBeUndefined();
  });
});

describe("prisma singleton", () => {
  it("is a usable client", async () => {
    const rows = await prisma.$queryRaw`SELECT 1 as one`;
    expect(rows).toBeTruthy();
  });
});
