import "dotenv/config";

import { prisma } from "../src/lib/prisma";
import { seedBaseDemoPlayers, seedDemoAlliance, seedSmokePlayer, SMOKE_USERNAME } from "./demoFixtureUtils";

function parseUsername(argv: string[]) {
  const index = argv.findIndex((value) => value === "--username");
  if (index >= 0 && argv[index + 1]) {
    return argv[index + 1];
  }
  return SMOKE_USERNAME;
}

async function main() {
  const username = parseUsername(process.argv);
  if (username !== SMOKE_USERNAME) {
    throw new Error(`resetSmokeFixture only supports the ${SMOKE_USERNAME} fixture user.`);
  }

  await seedBaseDemoPlayers();
  await seedSmokePlayer({ reset: true });
  await seedDemoAlliance();

  console.log(`Smoke fixture reset for ${SMOKE_USERNAME}.`);
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
