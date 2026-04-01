import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs/promises";

import {
  ensurePortAvailable,
  ensurePostgres,
  readLogTail,
  runNodeScript,
  startLoggedProcess,
  stopProcess,
  waitForHttp,
  waitForPort,
} from "./smoke_support.mjs";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputDir = path.join(rootDir, "output");
const serverPort = Number(process.env.FRONTIER_ALPHA_SERVER_PORT || 3103);
const webPort = Number(process.env.FRONTIER_ALPHA_WEB_PORT || 4173);
const databaseUrl =
  process.env.DATABASE_URL || "postgresql://postgres:postgres@localhost:5433/frontier_dominion?schema=public";
const baseUrl = `http://localhost:${webPort}`;

async function main() {
  await fs.mkdir(outputDir, { recursive: true });
  await ensurePortAvailable(serverPort, "The closed-alpha server");
  await ensurePortAvailable(webPort, "The closed-alpha web shell");
  await ensurePostgres({ rootDir, databaseUrl });

  const server = startLoggedProcess({
    rootDir,
    outputDir,
    name: "closed-alpha-server",
    command: "corepack pnpm --filter @frontier/server dev",
    env: {
      PORT: String(serverPort),
      DATABASE_URL: databaseUrl,
      JWT_SECRET: process.env.JWT_SECRET || "closed-alpha-local-secret-0123456789abcdef",
    LAUNCH_PHASE: "closed_alpha",
    REGISTRATION_MODE: "login_only",
    STORE_ENABLED: "false",
      COOKIE_SECURE: "false",
      AUTH_RATE_LIMIT_MAX: "999",
      COMMAND_RATE_LIMIT_MAX: "999",
    },
  });

  const web = startLoggedProcess({
    rootDir,
    outputDir,
    name: "closed-alpha-web",
    command: "corepack pnpm --filter @frontier/web dev -- --host 127.0.0.1",
    env: {
      FRONTIER_WEB_PORT: String(webPort),
      FRONTIER_API_PROXY_TARGET: `http://127.0.0.1:${serverPort}`,
      FRONTIER_WS_PROXY_TARGET: `ws://127.0.0.1:${serverPort}`,
      FRONTIER_RELEASE_VERSION: process.env.FRONTIER_RELEASE_VERSION || "closed-alpha-local",
    },
  });

  try {
    await waitForHttp(`http://127.0.0.1:${serverPort}/api/health`, "the closed-alpha server", 60_000);
    await waitForPort(webPort, "the closed-alpha web shell", 60_000);

    runNodeScript(rootDir, "scripts/smoke_closed_alpha_access.mjs", ["--base-url", baseUrl]);
    runNodeScript(rootDir, "scripts/smoke_kingdom_core.mjs", ["--base-url", baseUrl]);
    runNodeScript(rootDir, "scripts/smoke_map_field_command.mjs", ["--base-url", baseUrl]);

    console.log(
      JSON.stringify(
        {
          ok: true,
          baseUrl,
          serverPort,
          webPort,
          logs: {
            server: server.logFile,
            web: web.logFile,
          },
        },
        null,
        2,
      ),
    );
  } catch (error) {
    const [serverTail, webTail] = await Promise.all([readLogTail(server.logFile), readLogTail(web.logFile)]);
    if (serverTail) {
      console.error(`\n[closed-alpha-server tail]\n${serverTail}`);
    }
    if (webTail) {
      console.error(`\n[closed-alpha-web tail]\n${webTail}`);
    }
    throw error;
  } finally {
    await stopProcess(web.child);
    await stopProcess(server.child);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
