-- CreateEnum
CREATE TYPE "QueueStatus" AS ENUM ('ACTIVE', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "TroopType" AS ENUM ('INFANTRY', 'ARCHER', 'CAVALRY');

-- CreateEnum
CREATE TYPE "ResearchType" AS ENUM ('MILITARY_DRILL', 'LOGISTICS', 'AGRONOMY', 'STONEWORK', 'GOLD_TRADE', 'SCOUTING');

-- CreateEnum
CREATE TYPE "MarchState" AS ENUM ('ENROUTE', 'RESOLVED', 'RECALLED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "BuildingType" ADD VALUE 'BARRACKS';
ALTER TYPE "BuildingType" ADD VALUE 'ACADEMY';
ALTER TYPE "BuildingType" ADD VALUE 'WATCHTOWER';

-- AlterTable
ALTER TABLE "BattleReport" ADD COLUMN     "attackerLossArcher" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "attackerLossCavalry" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "attackerLossInfantry" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "defenderLossArcher" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "defenderLossCavalry" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "defenderLossInfantry" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "TroopGarrison" (
    "id" TEXT NOT NULL,
    "cityId" TEXT NOT NULL,
    "troopType" "TroopType" NOT NULL,
    "quantity" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TroopGarrison_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TroopTrainingQueue" (
    "id" TEXT NOT NULL,
    "cityId" TEXT NOT NULL,
    "troopType" "TroopType" NOT NULL,
    "quantity" INTEGER NOT NULL,
    "status" "QueueStatus" NOT NULL DEFAULT 'ACTIVE',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completesAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TroopTrainingQueue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Commander" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "templateKey" TEXT NOT NULL,
    "level" INTEGER NOT NULL,
    "attackBonus" DOUBLE PRECISION NOT NULL,
    "defenseBonus" DOUBLE PRECISION NOT NULL,
    "marchSpeedBonus" DOUBLE PRECISION NOT NULL,
    "carryBonus" DOUBLE PRECISION NOT NULL,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Commander_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ResearchLevel" (
    "id" TEXT NOT NULL,
    "cityId" TEXT NOT NULL,
    "researchType" "ResearchType" NOT NULL,
    "level" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ResearchLevel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ResearchQueue" (
    "id" TEXT NOT NULL,
    "cityId" TEXT NOT NULL,
    "researchType" "ResearchType" NOT NULL,
    "fromLevel" INTEGER NOT NULL,
    "toLevel" INTEGER NOT NULL,
    "status" "QueueStatus" NOT NULL DEFAULT 'ACTIVE',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completesAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ResearchQueue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FogTile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "x" INTEGER NOT NULL,
    "y" INTEGER NOT NULL,
    "discoveredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FogTile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "March" (
    "id" TEXT NOT NULL,
    "ownerUserId" TEXT NOT NULL,
    "ownerCityId" TEXT NOT NULL,
    "targetCityId" TEXT NOT NULL,
    "commanderId" TEXT NOT NULL,
    "state" "MarchState" NOT NULL DEFAULT 'ENROUTE',
    "infantryCount" INTEGER NOT NULL,
    "archerCount" INTEGER NOT NULL,
    "cavalryCount" INTEGER NOT NULL,
    "attackerPowerSnapshot" INTEGER NOT NULL,
    "defenderPowerSnapshot" INTEGER,
    "battleResult" "BattleResult",
    "startsAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "etaAt" TIMESTAMP(3) NOT NULL,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "March_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TroopGarrison_cityId_troopType_key" ON "TroopGarrison"("cityId", "troopType");

-- CreateIndex
CREATE INDEX "TroopTrainingQueue_cityId_status_idx" ON "TroopTrainingQueue"("cityId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ResearchLevel_cityId_researchType_key" ON "ResearchLevel"("cityId", "researchType");

-- CreateIndex
CREATE INDEX "ResearchQueue_cityId_status_idx" ON "ResearchQueue"("cityId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "FogTile_userId_x_y_key" ON "FogTile"("userId", "x", "y");

-- CreateIndex
CREATE INDEX "March_ownerUserId_state_idx" ON "March"("ownerUserId", "state");

-- CreateIndex
CREATE INDEX "March_targetCityId_state_idx" ON "March"("targetCityId", "state");

-- CreateIndex
CREATE INDEX "March_etaAt_state_idx" ON "March"("etaAt", "state");

-- AddForeignKey
ALTER TABLE "TroopGarrison" ADD CONSTRAINT "TroopGarrison_cityId_fkey" FOREIGN KEY ("cityId") REFERENCES "City"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TroopTrainingQueue" ADD CONSTRAINT "TroopTrainingQueue_cityId_fkey" FOREIGN KEY ("cityId") REFERENCES "City"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Commander" ADD CONSTRAINT "Commander_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResearchLevel" ADD CONSTRAINT "ResearchLevel_cityId_fkey" FOREIGN KEY ("cityId") REFERENCES "City"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResearchQueue" ADD CONSTRAINT "ResearchQueue_cityId_fkey" FOREIGN KEY ("cityId") REFERENCES "City"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FogTile" ADD CONSTRAINT "FogTile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "March" ADD CONSTRAINT "March_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "March" ADD CONSTRAINT "March_ownerCityId_fkey" FOREIGN KEY ("ownerCityId") REFERENCES "City"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "March" ADD CONSTRAINT "March_targetCityId_fkey" FOREIGN KEY ("targetCityId") REFERENCES "City"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "March" ADD CONSTRAINT "March_commanderId_fkey" FOREIGN KEY ("commanderId") REFERENCES "Commander"("id") ON DELETE CASCADE ON UPDATE CASCADE;
