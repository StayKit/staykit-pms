import { describe, it, expect, vi, afterEach } from "vitest";

// These exercise the module-load branches of db.ts (singleton + log level) by
// re-importing under different NODE_ENV values.
const g = globalThis as unknown as { prisma?: unknown };

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("resolveDatabaseUrl relative path with a query string", () => {
  it("preserves the query when rewriting to absolute", async () => {
    vi.stubEnv("DATABASE_URL", "file:./data/app.db?connection_limit=1");
    vi.resetModules();
    const { resolveDatabaseUrl } = await import("./db");
    expect(resolveDatabaseUrl()).toBe(`file:${process.cwd()}/data/app.db?connection_limit=1`);
  });
});

describe("PrismaClient singleton lifecycle", () => {
  it("caches the client on globalThis in development", async () => {
    delete g.prisma;
    vi.stubEnv("NODE_ENV", "development");
    vi.resetModules();
    const { prisma } = await import("./db");
    expect(prisma).toBeTruthy();
    expect(g.prisma).toBe(prisma);
  });

  it("does not cache the client on globalThis in production", async () => {
    delete g.prisma;
    vi.stubEnv("NODE_ENV", "production");
    vi.resetModules();
    const { prisma } = await import("./db");
    expect(prisma).toBeTruthy();
    expect(g.prisma).toBeUndefined();
  });

  it("reuses an already-cached global client", async () => {
    delete g.prisma;
    vi.stubEnv("NODE_ENV", "development");
    vi.resetModules();
    const first = (await import("./db")).prisma;
    vi.resetModules();
    const second = (await import("./db")).prisma;
    expect(second).toBe(first);
  });
});
