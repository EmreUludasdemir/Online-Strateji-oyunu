import "dotenv/config";

import { prisma } from "../src/lib/prisma";
import { seedDemoPlayer } from "../src/game/service";

async function main() {
  await seedDemoPlayer({
    username: "demo_alpha",
    password: "demo12345",
    cityName: "Ashwatch",
    coordinate: { x: 10, y: 10 },
  });
  await seedDemoPlayer({
    username: "demo_beta",
    password: "demo12345",
    cityName: "Stonewake",
    coordinate: { x: 12, y: 10 },
  });
  await seedDemoPlayer({
    username: "demo_gamma",
    password: "demo12345",
    cityName: "Goldmere",
    coordinate: { x: 10, y: 12 },
  });
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
