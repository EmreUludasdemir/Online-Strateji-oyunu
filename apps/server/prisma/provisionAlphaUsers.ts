import "dotenv/config";

import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";

import { seedDemoPlayer } from "../src/game/service";
import { hashPassword } from "../src/lib/auth";
import { prisma } from "../src/lib/prisma";

const coordinateSchema = z.object({
  x: z.number().int().min(0),
  y: z.number().int().min(0),
});

const alphaUserSchema = z.object({
  username: z.string().min(3).max(24),
  password: z.string().min(8).max(72),
  cityName: z.string().min(3).max(48).optional(),
  coordinate: coordinateSchema.optional(),
});

const alphaUserListSchema = z.array(alphaUserSchema).min(1);

type AlphaUserInput = z.infer<typeof alphaUserSchema>;

function readInputPath(argv: string[]): string {
  const inputFlagIndex = argv.findIndex((argument) => argument === "--input");
  if (inputFlagIndex === -1 || !argv[inputFlagIndex + 1]) {
    throw new Error("Usage: pnpm alpha:provision -- --input /absolute/path/users.json");
  }

  return path.resolve(argv[inputFlagIndex + 1]);
}

async function provisionUser(input: AlphaUserInput) {
  await seedDemoPlayer({
    username: input.username,
    password: input.password,
    cityName: input.cityName,
    coordinate: input.coordinate,
  });

  const passwordHash = await hashPassword(input.password);
  const user = await prisma.user.update({
    where: { username: input.username },
    data: { passwordHash },
    include: {
      city: {
        select: {
          name: true,
          x: true,
          y: true,
        },
      },
    },
  });

  console.info(
    JSON.stringify({
      username: user.username,
      cityName: user.city?.name ?? input.cityName ?? null,
      coordinate: user.city ? { x: user.city.x, y: user.city.y } : input.coordinate ?? null,
      status: "ready",
    }),
  );
}

async function main() {
  const inputPath = readInputPath(process.argv.slice(2));
  const payload = await fs.readFile(inputPath, "utf8");
  const users = alphaUserListSchema.parse(JSON.parse(payload));

  for (const user of users) {
    await provisionUser(user);
  }
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
