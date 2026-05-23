import { execSync } from "node:child_process";
import { mkdirSync, rmSync } from "node:fs";

/**
 * Create a fresh SQLite test database and push the Prisma schema to it once,
 * before the suite runs. Per the engineering spec (B.15) integration tests use a
 * real temp-file SQLite DB (`:memory:` doesn't support WAL).
 */
const DB_DIR = "/tmp/staykit-test";
const DB_URL = "file:/tmp/staykit-test/test.db";

export default function setup() {
  // Fresh directory ⇒ a brand-new empty DB; a plain `db push` creates the schema
  // (no destructive `--force-reset` needed, which keeps Prisma's AI-safety guard happy).
  rmSync(DB_DIR, { recursive: true, force: true });
  mkdirSync(DB_DIR, { recursive: true });
  execSync("npx prisma db push --skip-generate", {
    stdio: "ignore",
    env: { ...process.env, DATABASE_URL: DB_URL },
  });

  return () => {
    rmSync(DB_DIR, { recursive: true, force: true });
  };
}
