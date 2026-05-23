import path from "node:path";
import { PrismaClient } from "@prisma/client";

/**
 * Resolve a relative SQLite `file:` URL against the project root (process.cwd())
 * so the runtime and the Prisma CLI agree on one database file. (The CLI otherwise
 * resolves relative paths against the schema directory, which would diverge.)
 */
function resolveDatabaseUrl(): string | undefined {
  const url = process.env.DATABASE_URL;
  if (!url || !url.startsWith("file:")) return url;
  const [filePart, query] = url.slice("file:".length).split("?");
  if (path.isAbsolute(filePart)) return url;
  const abs = path.resolve(process.cwd(), filePart);
  return `file:${abs}${query ? "?" + query : ""}`;
}

/**
 * Single PrismaClient singleton (connection_limit=1 in the URL for SQLite's
 * single-writer model). In dev, reuse across HMR reloads to avoid exhausting
 * connections. Production hardening (WAL, busy_timeout, better-sqlite3 adapter)
 * is documented in docs/self-hosting.md.
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    datasourceUrl: resolveDatabaseUrl(),
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
