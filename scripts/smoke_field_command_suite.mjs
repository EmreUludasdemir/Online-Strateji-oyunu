import path from "node:path";
import { fileURLToPath } from "node:url";

import { runRepoOwnedSmokeScenario } from "./smoke_support.mjs";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputDir = path.join(rootDir, "output");

async function main() {
  const result = await runRepoOwnedSmokeScenario({
    rootDir,
    outputDir,
    suiteName: "smoke:field-command",
    scenarioScript: "scripts/smoke_map_field_command.mjs",
    serverPort: Number(process.env.FRONTIER_FIELD_SMOKE_SERVER_PORT || 3104),
    webPort: Number(process.env.FRONTIER_FIELD_SMOKE_WEB_PORT || 4174),
    releaseVersion: process.env.FRONTIER_RELEASE_VERSION || "smoke-field-command-local",
  });

  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
