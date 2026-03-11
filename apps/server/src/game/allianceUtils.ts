import type { Prisma } from "@prisma/client";

export async function getAllianceMemberIdsTx(tx: Prisma.TransactionClient, allianceId: string): Promise<string[]> {
  const members = await tx.allianceMember.findMany({
    where: { allianceId },
    select: { userId: true },
  });

  return members.map((member) => member.userId);
}

export async function appendAllianceLogTx(
  tx: Prisma.TransactionClient,
  allianceId: string,
  kind: string,
  body: string,
  actorUserId?: string | null,
) {
  await tx.allianceLogEntry.create({
    data: {
      allianceId,
      actorUserId: actorUserId ?? null,
      kind,
      body,
    },
  });
}

export async function addAllianceContributionTx(tx: Prisma.TransactionClient, allianceId: string, userId: string, points: number) {
  if (points <= 0) {
    return;
  }

  await tx.allianceContribution.upsert({
    where: {
      allianceId_userId: {
        allianceId,
        userId,
      },
    },
    create: {
      allianceId,
      userId,
      points,
    },
    update: {
      points: {
        increment: points,
      },
    },
  });
}
