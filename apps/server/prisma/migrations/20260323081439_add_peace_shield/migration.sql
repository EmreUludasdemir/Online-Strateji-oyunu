/*
  Warnings:

  - Added the required column `originX` to the `March` table without a default value. This is not possible if the table is not empty.
  - Added the required column `originY` to the `March` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "CommanderTalentTrack" AS ENUM ('CONQUEST', 'PEACEKEEPING', 'GATHERING');

-- CreateEnum
CREATE TYPE "TaskKind" AS ENUM ('TUTORIAL', 'DAILY');

-- CreateEnum
CREATE TYPE "ScoutState" AS ENUM ('ENROUTE', 'RESOLVED', 'RECALLED');

-- CreateEnum
CREATE TYPE "ScoutTargetKind" AS ENUM ('CITY', 'POI');

-- CreateEnum
CREATE TYPE "RallyState" AS ENUM ('OPEN', 'LAUNCHED', 'RESOLVED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "MailboxKind" AS ENUM ('SCOUT_REPORT', 'BATTLE_REPORT', 'RALLY_REPORT', 'SYSTEM_REWARD', 'PURCHASE_REWARD');

-- CreateEnum
CREATE TYPE "PurchaseStatus" AS ENUM ('VALIDATED', 'DUPLICATE', 'REJECTED');

-- AlterTable
ALTER TABLE "City" ADD COLUMN     "peaceShieldUntil" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Commander" ADD COLUMN     "assignedPreset" TEXT,
ADD COLUMN     "starLevel" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "talentPointsSpent" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "talentTrack" "CommanderTalentTrack" NOT NULL DEFAULT 'CONQUEST',
ADD COLUMN     "xp" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "March" ADD COLUMN     "originX" INTEGER NOT NULL,
ADD COLUMN     "originY" INTEGER NOT NULL,
ADD COLUMN     "supportBonusPct" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "TutorialProgress" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "currentStep" INTEGER NOT NULL DEFAULT 0,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "TutorialProgress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlayerTask" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "taskKey" TEXT NOT NULL,
    "kind" "TaskKind" NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "progress" INTEGER NOT NULL DEFAULT 0,
    "target" INTEGER NOT NULL,
    "cycleKey" TEXT NOT NULL DEFAULT 'permanent',
    "completedAt" TIMESTAMP(3),
    "claimedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlayerTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryItem" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "itemKey" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InventoryItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScoutMission" (
    "id" TEXT NOT NULL,
    "ownerUserId" TEXT NOT NULL,
    "ownerCityId" TEXT NOT NULL,
    "originX" INTEGER NOT NULL,
    "originY" INTEGER NOT NULL,
    "targetKind" "ScoutTargetKind" NOT NULL,
    "targetCityId" TEXT,
    "targetPoiId" TEXT,
    "state" "ScoutState" NOT NULL DEFAULT 'ENROUTE',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "etaAt" TIMESTAMP(3) NOT NULL,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScoutMission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScoutReport" (
    "id" TEXT NOT NULL,
    "scoutMissionId" TEXT NOT NULL,
    "ownerUserId" TEXT NOT NULL,
    "ownerCityId" TEXT NOT NULL,
    "targetKind" "ScoutTargetKind" NOT NULL,
    "targetCityId" TEXT,
    "targetPoiId" TEXT,
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ScoutReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Rally" (
    "id" TEXT NOT NULL,
    "allianceId" TEXT NOT NULL,
    "leaderUserId" TEXT NOT NULL,
    "leaderCityId" TEXT NOT NULL,
    "targetCityId" TEXT,
    "targetPoiId" TEXT,
    "commanderId" TEXT NOT NULL,
    "objective" "MarchObjective" NOT NULL DEFAULT 'CITY_ATTACK',
    "state" "RallyState" NOT NULL DEFAULT 'OPEN',
    "supportBonusPct" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "opensAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "launchAt" TIMESTAMP(3) NOT NULL,
    "launchedMarchId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Rally_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RallyMember" (
    "id" TEXT NOT NULL,
    "rallyId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "cityId" TEXT NOT NULL,
    "infantryCount" INTEGER NOT NULL DEFAULT 0,
    "archerCount" INTEGER NOT NULL DEFAULT 0,
    "cavalryCount" INTEGER NOT NULL DEFAULT 0,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RallyMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AllianceMarker" (
    "id" TEXT NOT NULL,
    "allianceId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "x" INTEGER NOT NULL,
    "y" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),

    CONSTRAINT "AllianceMarker_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AllianceAnnouncement" (
    "id" TEXT NOT NULL,
    "allianceId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "updatedByUserId" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AllianceAnnouncement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AllianceLogEntry" (
    "id" TEXT NOT NULL,
    "allianceId" TEXT NOT NULL,
    "actorUserId" TEXT,
    "kind" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AllianceLogEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AllianceContribution" (
    "id" TEXT NOT NULL,
    "allianceId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "points" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AllianceContribution_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MailboxEntry" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" "MailboxKind" NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "reward" JSONB,
    "scoutReportId" TEXT,
    "claimedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MailboxEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Purchase" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "purchaseToken" TEXT NOT NULL,
    "rawReceipt" TEXT NOT NULL,
    "status" "PurchaseStatus" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Purchase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Entitlement" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "entitlementKey" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "consumedAt" TIMESTAMP(3),

    CONSTRAINT "Entitlement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnalyticsEvent" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "event" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AnalyticsEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SeasonPassProgress" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "seasonKey" TEXT NOT NULL,
    "xp" INTEGER NOT NULL DEFAULT 0,
    "premiumUnlocked" BOOLEAN NOT NULL DEFAULT false,
    "claimedFreeTiers" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "claimedPremiumTiers" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SeasonPassProgress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LiveEventScore" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "eventKey" TEXT NOT NULL,
    "score" INTEGER NOT NULL DEFAULT 0,
    "claimedRewardTiers" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LiveEventScore_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IdempotencyKey" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IdempotencyKey_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TutorialProgress_userId_key" ON "TutorialProgress"("userId");

-- CreateIndex
CREATE INDEX "PlayerTask_userId_kind_claimedAt_idx" ON "PlayerTask"("userId", "kind", "claimedAt");

-- CreateIndex
CREATE UNIQUE INDEX "PlayerTask_userId_taskKey_cycleKey_key" ON "PlayerTask"("userId", "taskKey", "cycleKey");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryItem_userId_itemKey_key" ON "InventoryItem"("userId", "itemKey");

-- CreateIndex
CREATE INDEX "ScoutMission_ownerUserId_state_idx" ON "ScoutMission"("ownerUserId", "state");

-- CreateIndex
CREATE INDEX "ScoutMission_etaAt_state_idx" ON "ScoutMission"("etaAt", "state");

-- CreateIndex
CREATE UNIQUE INDEX "ScoutReport_scoutMissionId_key" ON "ScoutReport"("scoutMissionId");

-- CreateIndex
CREATE INDEX "ScoutReport_ownerUserId_createdAt_idx" ON "ScoutReport"("ownerUserId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Rally_launchedMarchId_key" ON "Rally"("launchedMarchId");

-- CreateIndex
CREATE INDEX "Rally_allianceId_state_launchAt_idx" ON "Rally"("allianceId", "state", "launchAt");

-- CreateIndex
CREATE UNIQUE INDEX "RallyMember_rallyId_userId_key" ON "RallyMember"("rallyId", "userId");

-- CreateIndex
CREATE INDEX "AllianceMarker_allianceId_createdAt_idx" ON "AllianceMarker"("allianceId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "AllianceAnnouncement_allianceId_key" ON "AllianceAnnouncement"("allianceId");

-- CreateIndex
CREATE INDEX "AllianceLogEntry_allianceId_createdAt_idx" ON "AllianceLogEntry"("allianceId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "AllianceContribution_allianceId_userId_key" ON "AllianceContribution"("allianceId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "MailboxEntry_scoutReportId_key" ON "MailboxEntry"("scoutReportId");

-- CreateIndex
CREATE INDEX "MailboxEntry_userId_claimedAt_createdAt_idx" ON "MailboxEntry"("userId", "claimedAt", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Purchase_purchaseToken_key" ON "Purchase"("purchaseToken");

-- CreateIndex
CREATE INDEX "Purchase_userId_createdAt_idx" ON "Purchase"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Entitlement_userId_entitlementKey_key" ON "Entitlement"("userId", "entitlementKey");

-- CreateIndex
CREATE INDEX "AnalyticsEvent_userId_createdAt_idx" ON "AnalyticsEvent"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "AnalyticsEvent_event_createdAt_idx" ON "AnalyticsEvent"("event", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "SeasonPassProgress_userId_seasonKey_key" ON "SeasonPassProgress"("userId", "seasonKey");

-- CreateIndex
CREATE UNIQUE INDEX "LiveEventScore_userId_eventKey_key" ON "LiveEventScore"("userId", "eventKey");

-- CreateIndex
CREATE UNIQUE INDEX "IdempotencyKey_userId_scope_key_key" ON "IdempotencyKey"("userId", "scope", "key");

-- AddForeignKey
ALTER TABLE "TutorialProgress" ADD CONSTRAINT "TutorialProgress_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlayerTask" ADD CONSTRAINT "PlayerTask_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryItem" ADD CONSTRAINT "InventoryItem_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScoutMission" ADD CONSTRAINT "ScoutMission_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScoutMission" ADD CONSTRAINT "ScoutMission_ownerCityId_fkey" FOREIGN KEY ("ownerCityId") REFERENCES "City"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScoutMission" ADD CONSTRAINT "ScoutMission_targetCityId_fkey" FOREIGN KEY ("targetCityId") REFERENCES "City"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScoutMission" ADD CONSTRAINT "ScoutMission_targetPoiId_fkey" FOREIGN KEY ("targetPoiId") REFERENCES "MapPoi"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScoutReport" ADD CONSTRAINT "ScoutReport_scoutMissionId_fkey" FOREIGN KEY ("scoutMissionId") REFERENCES "ScoutMission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScoutReport" ADD CONSTRAINT "ScoutReport_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScoutReport" ADD CONSTRAINT "ScoutReport_ownerCityId_fkey" FOREIGN KEY ("ownerCityId") REFERENCES "City"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScoutReport" ADD CONSTRAINT "ScoutReport_targetCityId_fkey" FOREIGN KEY ("targetCityId") REFERENCES "City"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScoutReport" ADD CONSTRAINT "ScoutReport_targetPoiId_fkey" FOREIGN KEY ("targetPoiId") REFERENCES "MapPoi"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Rally" ADD CONSTRAINT "Rally_allianceId_fkey" FOREIGN KEY ("allianceId") REFERENCES "Alliance"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Rally" ADD CONSTRAINT "Rally_leaderUserId_fkey" FOREIGN KEY ("leaderUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Rally" ADD CONSTRAINT "Rally_leaderCityId_fkey" FOREIGN KEY ("leaderCityId") REFERENCES "City"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Rally" ADD CONSTRAINT "Rally_targetCityId_fkey" FOREIGN KEY ("targetCityId") REFERENCES "City"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Rally" ADD CONSTRAINT "Rally_targetPoiId_fkey" FOREIGN KEY ("targetPoiId") REFERENCES "MapPoi"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Rally" ADD CONSTRAINT "Rally_commanderId_fkey" FOREIGN KEY ("commanderId") REFERENCES "Commander"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Rally" ADD CONSTRAINT "Rally_launchedMarchId_fkey" FOREIGN KEY ("launchedMarchId") REFERENCES "March"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RallyMember" ADD CONSTRAINT "RallyMember_rallyId_fkey" FOREIGN KEY ("rallyId") REFERENCES "Rally"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RallyMember" ADD CONSTRAINT "RallyMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RallyMember" ADD CONSTRAINT "RallyMember_cityId_fkey" FOREIGN KEY ("cityId") REFERENCES "City"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AllianceMarker" ADD CONSTRAINT "AllianceMarker_allianceId_fkey" FOREIGN KEY ("allianceId") REFERENCES "Alliance"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AllianceMarker" ADD CONSTRAINT "AllianceMarker_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AllianceAnnouncement" ADD CONSTRAINT "AllianceAnnouncement_allianceId_fkey" FOREIGN KEY ("allianceId") REFERENCES "Alliance"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AllianceAnnouncement" ADD CONSTRAINT "AllianceAnnouncement_updatedByUserId_fkey" FOREIGN KEY ("updatedByUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AllianceLogEntry" ADD CONSTRAINT "AllianceLogEntry_allianceId_fkey" FOREIGN KEY ("allianceId") REFERENCES "Alliance"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AllianceLogEntry" ADD CONSTRAINT "AllianceLogEntry_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AllianceContribution" ADD CONSTRAINT "AllianceContribution_allianceId_fkey" FOREIGN KEY ("allianceId") REFERENCES "Alliance"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AllianceContribution" ADD CONSTRAINT "AllianceContribution_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MailboxEntry" ADD CONSTRAINT "MailboxEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MailboxEntry" ADD CONSTRAINT "MailboxEntry_scoutReportId_fkey" FOREIGN KEY ("scoutReportId") REFERENCES "ScoutReport"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Purchase" ADD CONSTRAINT "Purchase_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Entitlement" ADD CONSTRAINT "Entitlement_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnalyticsEvent" ADD CONSTRAINT "AnalyticsEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SeasonPassProgress" ADD CONSTRAINT "SeasonPassProgress_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LiveEventScore" ADD CONSTRAINT "LiveEventScore_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IdempotencyKey" ADD CONSTRAINT "IdempotencyKey_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
