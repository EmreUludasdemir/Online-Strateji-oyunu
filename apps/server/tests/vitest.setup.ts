import "dotenv/config";

import { afterAll, beforeEach } from "vitest";

process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  "postgresql://postgres:postgres@localhost:5433/frontier_dominion?schema=test";
process.env.JWT_SECRET ??= "test-secret-frontier-dominion";
// Force test-control flags so host env values (e.g. LAUNCH_PHASE=closed_alpha,
// REGISTRATION_MODE=login_only) can never leak in and break the suite. These
// must be assigned unconditionally — `??=` would defer to any host value.
process.env.AUTH_RATE_LIMIT_MAX = "1000";
process.env.COMMAND_RATE_LIMIT_MAX = "1000";
process.env.LAUNCH_PHASE = "public";
process.env.REGISTRATION_MODE = "open";
process.env.STORE_ENABLED = "true";
process.env.NODE_ENV = "test";

import { prisma } from "../src/lib/prisma";

beforeEach(async () => {
  // Full per-test reset across every domain table so the suite is re-runnable
  // without the destructive `prisma db push --force-reset` wrapper. Deletions
  // are ordered children-before-parents so they never trip an FK constraint,
  // regardless of each relation's onDelete behaviour. POIs are re-seeded on
  // demand by ensureWorldPoisTx, so wiping mapPoi here is safe.
  await prisma.$transaction([
    // --- Deepest dependents (reference rows that themselves reference others)
    prisma.allianceHelpResponse.deleteMany(),
    prisma.rallyMember.deleteMany(),
    prisma.mailboxEntry.deleteMany(),
    prisma.marchReport.deleteMany(),
    prisma.battleReport.deleteMany(),
    prisma.scoutReport.deleteMany(),
    prisma.rally.deleteMany(),
    prisma.march.deleteMany(),
    prisma.scoutMission.deleteMany(),
    prisma.battleWindow.deleteMany(),
    prisma.allianceHelpRequest.deleteMany(),
    // --- City-scoped assets and queues
    prisma.buildingUpgrade.deleteMany(),
    prisma.building.deleteMany(),
    prisma.troopTrainingQueue.deleteMany(),
    prisma.troopGarrison.deleteMany(),
    prisma.researchQueue.deleteMany(),
    prisma.researchLevel.deleteMany(),
    // --- Alliance social (non-rally)
    prisma.allianceChatMessage.deleteMany(),
    prisma.allianceDonation.deleteMany(),
    prisma.allianceMarker.deleteMany(),
    prisma.allianceAnnouncement.deleteMany(),
    prisma.allianceLogEntry.deleteMany(),
    prisma.allianceContribution.deleteMany(),
    prisma.allianceMember.deleteMany(),
    // --- User-scoped meta
    prisma.fogTile.deleteMany(),
    prisma.tutorialProgress.deleteMany(),
    prisma.playerTask.deleteMany(),
    prisma.inventoryItem.deleteMany(),
    prisma.purchase.deleteMany(),
    prisma.entitlement.deleteMany(),
    prisma.analyticsEvent.deleteMany(),
    prisma.seasonPassProgress.deleteMany(),
    prisma.liveEventScore.deleteMany(),
    prisma.idempotencyKey.deleteMany(),
    prisma.commander.deleteMany(),
    // --- Parents
    prisma.city.deleteMany(),
    prisma.alliance.deleteMany(),
    prisma.mapPoi.deleteMany(),
    prisma.user.deleteMany(),
    // --- Grand-strategy domain (children before parents to satisfy FKs).
    prisma.war.deleteMany(),
    prisma.countryRelation.deleteMany(),
    prisma.army.deleteMany(),
    prisma.provinceOwnership.deleteMany(),
    prisma.worldTick.deleteMany(),
    prisma.province.deleteMany(),
    prisma.country.deleteMany(),
  ]);
});

afterAll(async () => {
  await prisma.$disconnect();
});
