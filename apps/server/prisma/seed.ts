import "dotenv/config";

import { prisma } from "../src/lib/prisma";
import { seedGrandStrategy } from "../src/grand/seed";
import { seedBaseDemoPlayers, seedDemoAlliance, seedSmokePlayer } from "./demoFixtureUtils";

async function main() {
  await seedBaseDemoPlayers();
  await seedSmokePlayer();
  await seedDemoAlliance();
  await seedGrandStrategy();
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
