import path from "node:path";
import { fileURLToPath } from "node:url";

import { runRepoOwnedSmokeScenario } from "./smoke_support.mjs";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputDir = path.join(rootDir, "output");

async function main() {
  const result = await runRepoOwnedSmokeScenario({
    rootDir,
    outputDir,
    suiteName: "smoke:e2e",
    scenarioScript: "scripts/smoke_kingdom_core.mjs",
    serverPort: Number(process.env.FRONTIER_SMOKE_SERVER_PORT || 3102),
    webPort: Number(process.env.FRONTIER_SMOKE_WEB_PORT || 4172),
    releaseVersion: process.env.FRONTIER_RELEASE_VERSION || "smoke-e2e-local",
  });

  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
