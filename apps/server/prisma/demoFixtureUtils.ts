import { HttpError } from "../src/lib/http";
import { prisma } from "../src/lib/prisma";
import { seedDemoPlayer } from "../src/game/service";

export const DEMO_PASSWORD = "demo12345";
export const SMOKE_USERNAME = "demo_smoke";

const SMOKE_COORDINATE_CANDIDATES = [
  { x: 28, y: 32 },
  { x: 32, y: 28 },
  { x: 28, y: 28 },
  { x: 36, y: 28 },
  { x: 28, y: 36 },
  { x: 36, y: 36 },
];

export async function seedBaseDemoPlayers() {
  await seedDemoPlayer({
    username: "demo_alpha",
    password: DEMO_PASSWORD,
    cityName: "Ashwatch",
    coordinate: { x: 32, y: 32 },
  });
  await seedDemoPlayer({
    username: "demo_beta",
    password: DEMO_PASSWORD,
    cityName: "Stonewake",
    coordinate: { x: 35, y: 32 },
  });
  await seedDemoPlayer({
    username: "demo_gamma",
    password: DEMO_PASSWORD,
    cityName: "Goldmere",
    coordinate: { x: 32, y: 35 },
  });
}

export async function seedSmokePlayer(options?: { reset?: boolean }) {
  if (options?.reset) {
    await prisma.user.deleteMany({
      where: {
        username: SMOKE_USERNAME,
      },
    });
  }

  let lastError: unknown = null;

  for (const coordinate of SMOKE_COORDINATE_CANDIDATES) {
    try {
      await seedDemoPlayer({
        username: SMOKE_USERNAME,
        password: DEMO_PASSWORD,
        cityName: "Ironvein",
        coordinate,
      });
      return;
    } catch (error) {
      lastError = error;
      if (!(error instanceof HttpError) || error.code !== "MAP_TILE_OCCUPIED") {
        throw error;
      }
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("Unable to place the smoke fixture city on any configured coordinate.");
}

export async function seedDemoAlliance() {
  const [alpha, beta, smoke] = await Promise.all([
    prisma.user.findUnique({ where: { username: "demo_alpha" }, select: { id: true } }),
    prisma.user.findUnique({ where: { username: "demo_beta" }, select: { id: true } }),
    prisma.user.findUnique({ where: { username: SMOKE_USERNAME }, select: { id: true } }),
  ]);

  if (!alpha || !beta) {
    return;
  }

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

  const members = [
    { userId: alpha.id, role: "LEADER" as const },
    { userId: beta.id, role: "MEMBER" as const },
    ...(smoke ? [{ userId: smoke.id, role: "MEMBER" as const }] : []),
  ];

  for (const member of members) {
    await prisma.allianceMember.upsert({
      where: { userId: member.userId },
      create: {
        allianceId: alliance.id,
        userId: member.userId,
        role: member.role,
      },
      update: {
        allianceId: alliance.id,
        role: member.role,
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
