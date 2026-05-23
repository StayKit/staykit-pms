import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  // Use the automatic JSX runtime so test files don't need to import React.
  esbuild: { jsx: "automatic", jsxImportSource: "react" },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      // server-only throws when imported outside an RSC bundler; stub it for tests.
      "server-only": path.resolve(__dirname, "test/stubs/empty.ts"),
    },
  },
  test: {
    // One SQLite test DB is shared; run files sequentially to avoid cross-worker writes.
    fileParallelism: false,
    globals: true,
    environment: "node",
    environmentMatchGlobs: [["**/*.dom.test.{ts,tsx}", "jsdom"]],
    setupFiles: ["test/setup.ts"],
    globalSetup: ["test/global-setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
    env: {
      DATABASE_URL: "file:/tmp/staykit-test/test.db",
      OTP_PEPPER: "test-pepper",
      APP_BASE_URL: "http://localhost:3000",
      NODE_ENV: "test",
    },
    coverage: {
      provider: "v8",
      reporter: ["text", "text-summary", "html"],
      include: ["src/**/*.{ts,tsx}"],
      exclude: ["src/**/*.test.{ts,tsx}", "**/*.d.ts"],
      all: true,
      // 100% statements & lines. The small branch/function shortfall is a handful
      // of defensive guards (e.g. `value ?? fallback` on schema-guaranteed data,
      // non-Error catch arms) that aren't reachable with valid inputs.
      thresholds: {
        statements: 100,
        lines: 100,
        branches: 99,
        functions: 99,
      },
    },
  },
});
