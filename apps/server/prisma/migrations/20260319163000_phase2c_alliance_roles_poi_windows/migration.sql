ALTER TYPE "AllianceRole" ADD VALUE IF NOT EXISTS 'RECRUIT';

CREATE TABLE "AllianceDonation" (
    "id" TEXT NOT NULL,
    "allianceId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "wood" INTEGER NOT NULL DEFAULT 0,
    "stone" INTEGER NOT NULL DEFAULT 0,
    "food" INTEGER NOT NULL DEFAULT 0,
    "gold" INTEGER NOT NULL DEFAULT 0,
    "totalValue" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AllianceDonation_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AllianceDonation_allianceId_createdAt_idx" ON "AllianceDonation"("allianceId", "createdAt");
CREATE INDEX "AllianceDonation_userId_createdAt_idx" ON "AllianceDonation"("userId", "createdAt");

ALTER TABLE "AllianceDonation"
  ADD CONSTRAINT "AllianceDonation_allianceId_fkey"
  FOREIGN KEY ("allianceId") REFERENCES "Alliance"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AllianceDonation"
  ADD CONSTRAINT "AllianceDonation_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "BattleWindow" ADD COLUMN "objective" "MarchObjective" DEFAULT 'CITY_ATTACK';
UPDATE "BattleWindow" SET "objective" = 'CITY_ATTACK' WHERE "objective" IS NULL;
ALTER TABLE "BattleWindow" ALTER COLUMN "objective" SET NOT NULL;
ALTER TABLE "BattleWindow" ALTER COLUMN "targetCityId" DROP NOT NULL;
ALTER TABLE "BattleWindow" ADD COLUMN "targetPoiId" TEXT;

CREATE INDEX "BattleWindow_targetPoiId_closesAt_idx" ON "BattleWindow"("targetPoiId", "closesAt");

ALTER TABLE "BattleWindow"
  ADD CONSTRAINT "BattleWindow_targetPoiId_fkey"
  FOREIGN KEY ("targetPoiId") REFERENCES "MapPoi"("id") ON DELETE CASCADE ON UPDATE CASCADE;
