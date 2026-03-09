-- CreateEnum
CREATE TYPE "AllianceRole" AS ENUM ('LEADER', 'OFFICER', 'MEMBER');

-- CreateEnum
CREATE TYPE "AllianceHelpKind" AS ENUM ('BUILDING_UPGRADE', 'TRAINING', 'RESEARCH');

-- CreateTable
CREATE TABLE "Alliance" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "tag" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Alliance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AllianceMember" (
    "id" TEXT NOT NULL,
    "allianceId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "AllianceRole" NOT NULL DEFAULT 'MEMBER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AllianceMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AllianceChatMessage" (
    "id" TEXT NOT NULL,
    "allianceId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AllianceChatMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AllianceHelpRequest" (
    "id" TEXT NOT NULL,
    "allianceId" TEXT NOT NULL,
    "requesterUserId" TEXT NOT NULL,
    "cityId" TEXT NOT NULL,
    "kind" "AllianceHelpKind" NOT NULL,
    "targetId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "helpCount" INTEGER NOT NULL DEFAULT 0,
    "maxHelps" INTEGER NOT NULL DEFAULT 3,
    "isOpen" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "fulfilledAt" TIMESTAMP(3),

    CONSTRAINT "AllianceHelpRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AllianceHelpResponse" (
    "id" TEXT NOT NULL,
    "helpRequestId" TEXT NOT NULL,
    "helperUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AllianceHelpResponse_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Alliance_name_key" ON "Alliance"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Alliance_tag_key" ON "Alliance"("tag");

-- CreateIndex
CREATE UNIQUE INDEX "AllianceMember_userId_key" ON "AllianceMember"("userId");

-- CreateIndex
CREATE INDEX "AllianceMember_allianceId_role_idx" ON "AllianceMember"("allianceId", "role");

-- CreateIndex
CREATE UNIQUE INDEX "AllianceMember_allianceId_userId_key" ON "AllianceMember"("allianceId", "userId");

-- CreateIndex
CREATE INDEX "AllianceChatMessage_allianceId_createdAt_idx" ON "AllianceChatMessage"("allianceId", "createdAt");

-- CreateIndex
CREATE INDEX "AllianceHelpRequest_allianceId_isOpen_idx" ON "AllianceHelpRequest"("allianceId", "isOpen");

-- CreateIndex
CREATE UNIQUE INDEX "AllianceHelpRequest_kind_targetId_key" ON "AllianceHelpRequest"("kind", "targetId");

-- CreateIndex
CREATE UNIQUE INDEX "AllianceHelpResponse_helpRequestId_helperUserId_key" ON "AllianceHelpResponse"("helpRequestId", "helperUserId");

-- AddForeignKey
ALTER TABLE "AllianceMember" ADD CONSTRAINT "AllianceMember_allianceId_fkey" FOREIGN KEY ("allianceId") REFERENCES "Alliance"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AllianceMember" ADD CONSTRAINT "AllianceMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AllianceChatMessage" ADD CONSTRAINT "AllianceChatMessage_allianceId_fkey" FOREIGN KEY ("allianceId") REFERENCES "Alliance"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AllianceChatMessage" ADD CONSTRAINT "AllianceChatMessage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AllianceHelpRequest" ADD CONSTRAINT "AllianceHelpRequest_allianceId_fkey" FOREIGN KEY ("allianceId") REFERENCES "Alliance"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AllianceHelpRequest" ADD CONSTRAINT "AllianceHelpRequest_requesterUserId_fkey" FOREIGN KEY ("requesterUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AllianceHelpRequest" ADD CONSTRAINT "AllianceHelpRequest_cityId_fkey" FOREIGN KEY ("cityId") REFERENCES "City"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AllianceHelpResponse" ADD CONSTRAINT "AllianceHelpResponse_helpRequestId_fkey" FOREIGN KEY ("helpRequestId") REFERENCES "AllianceHelpRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AllianceHelpResponse" ADD CONSTRAINT "AllianceHelpResponse_helperUserId_fkey" FOREIGN KEY ("helperUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
