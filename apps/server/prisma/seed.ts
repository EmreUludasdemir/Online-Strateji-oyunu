import "dotenv/config";

import { prisma } from "../src/lib/prisma";
import { seedDemoPlayer } from "../src/game/service";

async function seedDemoAlliance() {
  const [alpha, beta] = await Promise.all([
    prisma.user.findUnique({ where: { username: "demo_alpha" }, select: { id: true } }),
    prisma.user.findUnique({ where: { username: "demo_beta" }, select: { id: true } }),
  ]);

  if (!alpha || !beta) {
    return;
  }

  const alphaMembership = await prisma.allianceMember.findUnique({
    where: { userId: alpha.id },
    select: { id: true },
  });
  const betaMembership = await prisma.allianceMember.findUnique({
    where: { userId: beta.id },
    select: { id: true },
  });

  const alliance = await prisma.alliance.upsert({
    where: { tag: "BRZ" },
    create: {
      name: "Bronze Concord",
      tag: "BRZ",
      description: "A practical frontier compact focused on short queue help and nearby march pressure.",
    },
    update: {
      description: "A practical frontier compact focused on short queue help and nearby march pressure.",
    },
  });

  if (!alphaMembership) {
    await prisma.allianceMember.create({
      data: {
        allianceId: alliance.id,
        userId: alpha.id,
        role: "LEADER",
      },
    });
  }

  if (!betaMembership) {
    await prisma.allianceMember.create({
      data: {
        allianceId: alliance.id,
        userId: beta.id,
        role: "MEMBER",
      },
    });
  }

  const existingMessages = await prisma.allianceChatMessage.count({
    where: {
      allianceId: alliance.id,
    },
  });

  if (existingMessages === 0) {
    await prisma.allianceChatMessage.createMany({
      data: [
        {
          allianceId: alliance.id,
          userId: alpha.id,
          content: "Queue help first, then pressure Stonewake's neighbors.",
        },
        {
          allianceId: alliance.id,
          userId: beta.id,
          content: "Barracks are open. I can answer the next help request.",
        },
      ],
    });
  }
}

async function main() {
  await seedDemoPlayer({
    username: "demo_alpha",
    password: "demo12345",
    cityName: "Ashwatch",
    coordinate: { x: 32, y: 32 },
  });
  await seedDemoPlayer({
    username: "demo_beta",
    password: "demo12345",
    cityName: "Stonewake",
    coordinate: { x: 35, y: 32 },
  });
  await seedDemoPlayer({
    username: "demo_gamma",
    password: "demo12345",
    cityName: "Goldmere",
    coordinate: { x: 32, y: 35 },
  });
  await seedDemoAlliance();
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
