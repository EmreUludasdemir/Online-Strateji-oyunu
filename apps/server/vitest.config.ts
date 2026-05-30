import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    setupFiles: ["./tests/vitest.setup.ts"],
    testTimeout: 30_000,
    // These integration tests share a single Postgres test schema. Running test
    // files in parallel causes cross-file races on the shared DB (one file's
    // beforeEach cleanup wiping another file's in-flight rows). Force the files
    // to run sequentially in a single worker so the shared schema is safe.
    fileParallelism: false,
    pool: "forks",
    poolOptions: {
      forks: {
        singleFork: true,
      },
    },
  },
});
