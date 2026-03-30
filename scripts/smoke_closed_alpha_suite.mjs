import fs from "node:fs/promises";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync, spawn } from "node:child_process";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputDir = path.join(rootDir, "output");
const serverPort = Number(process.env.FRONTIER_ALPHA_SERVER_PORT || 3103);
const webPort = Number(process.env.FRONTIER_ALPHA_WEB_PORT || 4173);
const databaseUrl = process.env.DATABASE_URL || "postgresql://postgres:postgres@localhost:5433/frontier_dominion?schema=public";
const baseUrl = `http://localhost:${webPort}`;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function logPath(name) {
  return path.join(outputDir, `${name}.log`);
}

async function isPortOpen(port, host = "127.0.0.1") {
  return new Promise((resolve) => {
    const socket = net.createConnection({ port, host });
    socket.once("connect", () => {
      socket.end();
      resolve(true);
    });
    socket.once("error", () => resolve(false));
    socket.setTimeout(1_000, () => {
      socket.destroy();
      resolve(false);
    });
  });
}

async function ensurePostgres() {
  if (await isPortOpen(5433)) {
    return;
  }

  execFileSync("cmd.exe", ["/d", "/s", "/c", "docker compose up -d postgres"], {
    cwd: rootDir,
    stdio: "inherit",
  });

  const startedAt = Date.now();
  while (Date.now() - startedAt < 60_000) {
    if (await isPortOpen(5433)) {
      return;
    }
    await sleep(1_000);
  }

  throw new Error("Postgres did not become reachable on localhost:5433.");
}

function startProcess(name, command, env) {
  const logFile = logPath(name);
  const child = spawn("cmd.exe", ["/d", "/s", "/c", command], {
    cwd: rootDir,
    env: { ...process.env, ...env },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });

  void (async () => {
    const handle = await fs.open(logFile, "w");
    child.stdout.on("data", (chunk) => {
      void handle.write(chunk);
    });
    child.stderr.on("data", (chunk) => {
      void handle.write(chunk);
    });
    child.once("exit", () => {
      void handle.close();
    });
  })();

  return { child, logFile };
}

async function stopProcess(child) {
  if (!child || child.exitCode !== null || child.pid === undefined) {
    return;
  }

  try {
    execFileSync("taskkill", ["/pid", String(child.pid), "/t", "/f"], { stdio: "ignore" });
  } catch {
    child.kill();
  }
}

async function waitForHttp(url, label, timeoutMs) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return response;
      }
    } catch {
      // keep polling until the stack is live
    }
    await sleep(1_000);
  }

  throw new Error(`Timed out while waiting for ${label}.`);
}

async function waitForPort(port, label, timeoutMs) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (await isPortOpen(port, "localhost")) {
      return;
    }
    await sleep(1_000);
  }

  throw new Error(`Timed out while waiting for ${label}.`);
}

function runNodeScript(relativePath, args) {
  execFileSync(process.execPath, [path.join(rootDir, relativePath), ...args], {
    cwd: rootDir,
    stdio: "inherit",
    env: process.env,
  });
}

async function main() {
  await fs.mkdir(outputDir, { recursive: true });
  await ensurePostgres();

  const server = startProcess("closed-alpha-server", "corepack pnpm --filter @frontier/server dev", {
    PORT: String(serverPort),
    DATABASE_URL: databaseUrl,
    JWT_SECRET: process.env.JWT_SECRET || "closed-alpha-local-secret-0123456789abcdef",
    LAUNCH_PHASE: "closed_alpha",
    REGISTRATION_MODE: "login_only",
    STORE_ENABLED: "false",
    COOKIE_SECURE: "false",
    AUTH_RATE_LIMIT_MAX: "999",
    COMMAND_RATE_LIMIT_MAX: "999",
  });

  const web = startProcess("closed-alpha-web", "corepack pnpm --filter @frontier/web dev -- --host 127.0.0.1", {
    FRONTIER_WEB_PORT: String(webPort),
    FRONTIER_API_PROXY_TARGET: `http://127.0.0.1:${serverPort}`,
    FRONTIER_WS_PROXY_TARGET: `ws://127.0.0.1:${serverPort}`,
    FRONTIER_RELEASE_VERSION: process.env.FRONTIER_RELEASE_VERSION || "closed-alpha-local",
  });

  try {
    await waitForHttp(`http://127.0.0.1:${serverPort}/api/health`, "the closed-alpha server", 60_000);
    await waitForPort(webPort, "the closed-alpha web shell", 60_000);

    runNodeScript("scripts/smoke_closed_alpha_access.mjs", ["--base-url", baseUrl]);
    runNodeScript("scripts/smoke_kingdom_core.mjs", ["--base-url", baseUrl]);
    runNodeScript("scripts/smoke_map_field_command.mjs", ["--base-url", baseUrl]);

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
  } finally {
    await stopProcess(web.child);
    await stopProcess(server.child);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
