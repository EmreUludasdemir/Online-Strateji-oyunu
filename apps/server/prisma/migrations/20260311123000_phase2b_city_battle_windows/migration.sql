ALTER TYPE "MarchState" ADD VALUE IF NOT EXISTS 'STAGING';

CREATE TABLE "BattleWindow" (
    "id" TEXT NOT NULL,
    "targetCityId" TEXT NOT NULL,
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closesAt" TIMESTAMP(3) NOT NULL,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BattleWindow_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "March" ADD COLUMN "battleWindowId" TEXT;

CREATE INDEX "BattleWindow_targetCityId_closesAt_idx" ON "BattleWindow"("targetCityId", "closesAt");
CREATE INDEX "BattleWindow_resolvedAt_closesAt_idx" ON "BattleWindow"("resolvedAt", "closesAt");
CREATE INDEX "March_battleWindowId_state_idx" ON "March"("battleWindowId", "state");

ALTER TABLE "BattleWindow" ADD CONSTRAINT "BattleWindow_targetCityId_fkey" FOREIGN KEY ("targetCityId") REFERENCES "City"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "March" ADD CONSTRAINT "March_battleWindowId_fkey" FOREIGN KEY ("battleWindowId") REFERENCES "BattleWindow"("id") ON DELETE SET NULL ON UPDATE CASCADE;
