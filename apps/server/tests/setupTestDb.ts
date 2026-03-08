import "dotenv/config";

import { execSync } from "node:child_process";

process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  "postgresql://postgres:postgres@localhost:5433/frontier_dominion?schema=test";
process.env.JWT_SECRET ??= "test-secret-frontier-dominion";

execSync("corepack pnpm exec prisma db push --force-reset --skip-generate", {
  stdio: "inherit",
  env: process.env,
});
