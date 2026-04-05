import path from "node:path";
import { fileURLToPath } from "node:url";

import { runRepoOwnedSmokeScenario } from "./smoke_support.mjs";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputDir = path.join(rootDir, "output");
const serverPort = Number(process.env.FRONTIER_ALPHA_SERVER_PORT || 3103);
const webPort = Number(process.env.FRONTIER_ALPHA_WEB_PORT || 4173);
const databaseUrl =
  process.env.DATABASE_URL || "postgresql://postgres:postgres@localhost:5433/frontier_dominion?schema=public";

async function main() {
  const result = await runRepoOwnedSmokeScenario({
    rootDir,
    outputDir,
    suiteName: "smoke:alpha",
    serverPort,
    webPort,
    databaseUrl,
    releaseVersion: process.env.FRONTIER_RELEASE_VERSION || "closed-alpha-local",
    serverEnv: {
      LAUNCH_PHASE: "closed_alpha",
      REGISTRATION_MODE: "login_only",
      STORE_ENABLED: "false",
    },
    scenarioSteps: [
      { script: "scripts/smoke_closed_alpha_access.mjs" },
      { script: "scripts/smoke_kingdom_core.mjs" },
      { script: "scripts/smoke_map_field_command.mjs" },
    ],
  });

  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
