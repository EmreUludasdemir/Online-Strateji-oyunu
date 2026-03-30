import "dotenv/config";

import { afterAll, beforeEach } from "vitest";

process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  "postgresql://postgres:postgres@localhost:5433/frontier_dominion?schema=test";
process.env.JWT_SECRET ??= "test-secret-frontier-dominion";
process.env.AUTH_RATE_LIMIT_MAX ??= "999";
process.env.COMMAND_RATE_LIMIT_MAX ??= "999";
process.env.LAUNCH_PHASE ??= "public";
process.env.REGISTRATION_MODE ??= "open";
process.env.STORE_ENABLED ??= "true";
process.env.NODE_ENV = "test";

import { prisma } from "../src/lib/prisma";

beforeEach(async () => {
  await prisma.$transaction([
    prisma.battleReport.deleteMany(),
    prisma.buildingUpgrade.deleteMany(),
    prisma.building.deleteMany(),
    prisma.city.deleteMany(),
    prisma.user.deleteMany(),
  ]);
});

afterAll(async () => {
  await prisma.$disconnect();
});
