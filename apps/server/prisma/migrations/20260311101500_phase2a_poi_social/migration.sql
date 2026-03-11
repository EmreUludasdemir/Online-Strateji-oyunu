-- CreateEnum
CREATE TYPE "PoiKind" AS ENUM ('BARBARIAN_CAMP', 'RESOURCE_NODE');

-- CreateEnum
CREATE TYPE "PoiState" AS ENUM ('ACTIVE', 'OCCUPIED', 'DEPLETED', 'RESPAWNING');

-- CreateEnum
CREATE TYPE "PoiResourceType" AS ENUM ('WOOD', 'STONE', 'FOOD', 'GOLD');

-- CreateEnum
CREATE TYPE "MarchObjective" AS ENUM ('CITY_ATTACK', 'BARBARIAN_ATTACK', 'RESOURCE_GATHER');

-- CreateEnum
CREATE TYPE "MarchReportKind" AS ENUM ('BARBARIAN_BATTLE', 'RESOURCE_GATHER');

-- AlterEnum
ALTER TYPE "MarchState" ADD VALUE 'GATHERING';
ALTER TYPE "MarchState" ADD VALUE 'RETURNING';

-- AlterTable
ALTER TABLE "March"
ALTER COLUMN "targetCityId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "March" ADD COLUMN     "cargoAmount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "cargoResourceType" "PoiResourceType",
ADD COLUMN     "gatherStartedAt" TIMESTAMP(3),
ADD COLUMN     "objective" "MarchObjective" NOT NULL DEFAULT 'CITY_ATTACK',
ADD COLUMN     "returnEtaAt" TIMESTAMP(3),
ADD COLUMN     "targetPoiId" TEXT;

-- CreateTable
CREATE TABLE "MapPoi" (
    "id" TEXT NOT NULL,
    "kind" "PoiKind" NOT NULL,
    "state" "PoiState" NOT NULL DEFAULT 'ACTIVE',
    "label" TEXT NOT NULL,
    "level" INTEGER NOT NULL,
    "x" INTEGER NOT NULL,
    "y" INTEGER NOT NULL,
    "resourceType" "PoiResourceType",
    "remainingAmount" INTEGER,
    "maxAmount" INTEGER,
    "respawnsAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MapPoi_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarchReport" (
    "id" TEXT NOT NULL,
    "marchId" TEXT,
    "kind" "MarchReportKind" NOT NULL,
    "ownerUserId" TEXT NOT NULL,
    "ownerCityId" TEXT NOT NULL,
    "poiId" TEXT NOT NULL,
    "poiKind" "PoiKind" NOT NULL,
    "poiName" TEXT NOT NULL,
    "poiLevel" INTEGER NOT NULL,
    "resourceType" "PoiResourceType",
    "resourceAmount" INTEGER NOT NULL DEFAULT 0,
    "result" "BattleResult",
    "attackerPower" INTEGER,
    "defenderPower" INTEGER,
    "infantryCount" INTEGER NOT NULL DEFAULT 0,
    "archerCount" INTEGER NOT NULL DEFAULT 0,
    "cavalryCount" INTEGER NOT NULL DEFAULT 0,
    "lootWood" INTEGER NOT NULL DEFAULT 0,
    "lootStone" INTEGER NOT NULL DEFAULT 0,
    "lootFood" INTEGER NOT NULL DEFAULT 0,
    "lootGold" INTEGER NOT NULL DEFAULT 0,
    "attackerLossInfantry" INTEGER NOT NULL DEFAULT 0,
    "attackerLossArcher" INTEGER NOT NULL DEFAULT 0,
    "attackerLossCavalry" INTEGER NOT NULL DEFAULT 0,
    "defenderLossInfantry" INTEGER NOT NULL DEFAULT 0,
    "defenderLossArcher" INTEGER NOT NULL DEFAULT 0,
    "defenderLossCavalry" INTEGER NOT NULL DEFAULT 0,
    "fromX" INTEGER NOT NULL,
    "fromY" INTEGER NOT NULL,
    "toX" INTEGER NOT NULL,
    "toY" INTEGER NOT NULL,
    "distance" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MarchReport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MapPoi_x_y_key" ON "MapPoi"("x", "y");

-- CreateIndex
CREATE INDEX "MapPoi_kind_state_idx" ON "MapPoi"("kind", "state");

-- CreateIndex
CREATE INDEX "March_targetPoiId_state_idx" ON "March"("targetPoiId", "state");

-- CreateIndex
CREATE INDEX "March_returnEtaAt_state_idx" ON "March"("returnEtaAt", "state");

-- CreateIndex
CREATE INDEX "MarchReport_ownerUserId_createdAt_idx" ON "MarchReport"("ownerUserId", "createdAt");

-- CreateIndex
CREATE INDEX "MarchReport_poiId_createdAt_idx" ON "MarchReport"("poiId", "createdAt");

-- AddForeignKey
ALTER TABLE "March" ADD CONSTRAINT "March_targetPoiId_fkey" FOREIGN KEY ("targetPoiId") REFERENCES "MapPoi"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarchReport" ADD CONSTRAINT "MarchReport_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarchReport" ADD CONSTRAINT "MarchReport_ownerCityId_fkey" FOREIGN KEY ("ownerCityId") REFERENCES "City"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarchReport" ADD CONSTRAINT "MarchReport_poiId_fkey" FOREIGN KEY ("poiId") REFERENCES "MapPoi"("id") ON DELETE CASCADE ON UPDATE CASCADE;
