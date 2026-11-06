import path from "node:path";
import { defineConfig } from "vitest/config";

/**
 * DB-backed integration tests. They run against a dedicated `*_test` PostgreSQL
 * database (see tests/integration/setup.ts for the safety guard) and must never
 * run in parallel because every test truncates the shared database.
 */
export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/integration/**/*.test.ts"],
    setupFiles: ["tests/integration/setup.ts"],
    globals: false,
    restoreMocks: true,
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname),
      "server-only": path.resolve(__dirname, "tests/stubs/server-only.ts"),
    },
  },
});
