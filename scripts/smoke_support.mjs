import fs from "node:fs";
import fsPromises from "node:fs/promises";
import net from "node:net";
import path from "node:path";
import { execFileSync, spawn } from "node:child_process";

export function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function waitFor(check, timeoutMs, label, intervalMs = 500) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const result = await check();
    if (result) {
      return result;
    }
    await sleep(intervalMs);
  }

  throw new Error(`Timed out while waiting for ${label}.`);
}

export function getDefaultSmokeDatabaseUrl() {
  return process.env.DATABASE_URL || "postgresql://postgres:postgres@localhost:5433/frontier_dominion?schema=public";
}

export async function prepareSmokeFixture(username, rootDir = process.cwd()) {
  if (username !== "demo_smoke") {
    return;
  }

  const databaseUrl = getDefaultSmokeDatabaseUrl();
  await ensurePostgres({
    rootDir,
    databaseUrl,
    purpose: "the deterministic smoke fixture reset",
    autoStart: true,
  });

  const serverDir = path.join(rootDir, "apps", "server");
  const tsxCli = path.join(serverDir, "node_modules", "tsx", "dist", "cli.mjs");
  if (!fs.existsSync(tsxCli)) {
    throw new Error(
      `Smoke fixture reset requires ${tsxCli}. Run corepack pnpm install before re-running the smoke suite.`,
    );
  }

  try {
    execFileSync(process.execPath, [tsxCli, "prisma/resetSmokeFixture.ts", "--username", username], {
      cwd: serverDir,
      stdio: "inherit",
      env: {
        ...process.env,
        DATABASE_URL: databaseUrl,
      },
    });
  } catch (error) {
    throw new Error(
      `Smoke fixture reset failed for ${username}. Verify DATABASE_URL (${databaseUrl}) and local Postgres health before retrying. Root cause: ${
        error instanceof Error ? error.message : String(error)
      }.`,
    );
  }
}

export async function isPortOpen(port, host = "127.0.0.1") {
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

export async function ensurePortAvailable(port, label, host = "127.0.0.1") {
  if (await isPortOpen(port, host)) {
    throw new Error(
      `${label} cannot start because ${host}:${port} is already in use. Stop the conflicting process or override the smoke port env vars before retrying.`,
    );
  }
}

function resolveDatabaseEndpoint(databaseUrl) {
  try {
    const parsed = new URL(databaseUrl);
    const port = parsed.port ? Number(parsed.port) : 5432;
    return {
      host: parsed.hostname || "127.0.0.1",
      port: Number.isFinite(port) ? port : 5432,
    };
  } catch {
    return {
      host: "127.0.0.1",
      port: 5433,
    };
  }
}

function isLocalHost(host) {
  return host === "localhost" || host === "127.0.0.1";
}

function isDockerDesktopUnavailable(error) {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return (
    message.includes("dockerDesktopLinuxEngine") ||
    message.includes("Cannot connect to the Docker daemon") ||
    message.includes("The system cannot find the file specified")
  );
}

export async function ensurePostgres({
  rootDir,
  databaseUrl,
  service = "postgres",
  purpose = "the smoke suite",
  autoStart = false,
}) {
  const endpoint = resolveDatabaseEndpoint(databaseUrl);
  if (await isPortOpen(endpoint.port, endpoint.host)) {
    return {
      host: endpoint.host,
      port: endpoint.port,
      source: "existing",
    };
  }

  if (!isLocalHost(endpoint.host)) {
    throw new Error(
      `DATABASE_URL points to ${endpoint.host}:${endpoint.port}, but that database is unreachable. Start that Postgres instance before running ${purpose}.`,
    );
  }

  if (!autoStart || endpoint.port !== 5433) {
    throw new Error(
      `DATABASE_URL points to localhost:${endpoint.port}, but the repo can only auto-start the bundled Postgres service on localhost:5433. Start your custom Postgres manually or use the default local DATABASE_URL before running ${purpose}.`,
    );
  }

  try {
    execFileSync("docker", ["info"], { cwd: rootDir, stdio: "ignore" });
  } catch (error) {
    const guidance = isDockerDesktopUnavailable(error)
      ? "Docker Desktop is not running."
      : "Docker is not available from this shell.";
    throw new Error(
      `Postgres is not reachable on localhost:5433 and ${guidance} Start Docker Desktop or set DATABASE_URL to a running Postgres instance before retrying ${purpose}.`,
    );
  }

  try {
    execFileSync("cmd.exe", ["/d", "/s", "/c", `docker compose up -d ${service}`], {
      cwd: rootDir,
      stdio: "inherit",
    });
  } catch (error) {
    throw new Error(
      `Failed to start the bundled Postgres service with docker compose. Check Docker Desktop, compose logs, or DATABASE_URL. Root cause: ${error instanceof Error ? error.message : String(error)}.`,
    );
  }

  await waitFor(
    () => isPortOpen(endpoint.port, endpoint.host),
    60_000,
    "the bundled Postgres service on localhost:5433",
    1_000,
  );

  return {
    host: endpoint.host,
    port: endpoint.port,
    source: "docker-compose",
  };
}

export async function ensureBaseUrlReachable(baseUrl, label, timeoutMs = 15_000) {
  let loginUrl;
  try {
    loginUrl = new URL("/login", baseUrl).toString();
  } catch {
    throw new Error(`Invalid base URL provided to ${label}: ${baseUrl}`);
  }

  try {
    await waitForHttp(loginUrl, label, timeoutMs);
  } catch {
    throw new Error(
      `${label} is not reachable at ${loginUrl}. Start the repo web shell/server for that base URL or pass --base-url to an active instance before retrying.`,
    );
  }
}

export function startLoggedProcess({ rootDir, outputDir, name, command, env = {} }) {
  const logFile = path.join(outputDir, `${name}.log`);
  const child = spawn("cmd.exe", ["/d", "/s", "/c", command], {
    cwd: rootDir,
    env: { ...process.env, ...env },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });

  void (async () => {
    const handle = await fsPromises.open(logFile, "w");
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

export async function stopProcess(child) {
  if (!child || child.exitCode !== null || child.pid === undefined) {
    return;
  }

  try {
    execFileSync("taskkill", ["/pid", String(child.pid), "/t", "/f"], { stdio: "ignore" });
  } catch {
    child.kill();
  }
}

export async function waitForHttp(url, label, timeoutMs) {
  return waitFor(async () => {
    try {
      const response = await fetch(url);
      return response.ok ? response : null;
    } catch {
      return null;
    }
  }, timeoutMs, label, 1_000);
}

export async function waitForPort(port, label, timeoutMs, host = "127.0.0.1") {
  await waitFor(() => isPortOpen(port, host), timeoutMs, label, 1_000);
}

function getProcessFailureMessage(label, processHandle) {
  if (!processHandle || processHandle.exitCode === null) {
    return null;
  }

  return `${label} exited during startup with code ${processHandle.exitCode}. Inspect the smoke log tail for the failing process and verify the repo-owned stack configuration before retrying.`;
}

export async function waitForManagedPort({ port, host = "127.0.0.1", label, timeoutMs, processHandle }) {
  await waitFor(async () => {
    const failureMessage = getProcessFailureMessage(label, processHandle);
    if (failureMessage) {
      throw new Error(failureMessage);
    }

    return (await isPortOpen(port, host)) ? true : null;
  }, timeoutMs, label, 1_000);
}

export async function waitForManagedHttp({ url, label, timeoutMs, processHandle }) {
  await waitFor(async () => {
    const failureMessage = getProcessFailureMessage(label, processHandle);
    if (failureMessage) {
      throw new Error(failureMessage);
    }

    try {
      const response = await fetch(url);
      return response.ok ? response : null;
    } catch {
      return null;
    }
  }, timeoutMs, label, 1_000);
}

export function runNodeScript(rootDir, relativePath, args, envOverrides = {}) {
  execFileSync(process.execPath, [path.join(rootDir, relativePath), ...args], {
    cwd: rootDir,
    stdio: "inherit",
    env: { ...process.env, ...envOverrides },
  });
}

export async function readLogTail(logFile, lineCount = 40) {
  try {
    const contents = await fsPromises.readFile(logFile, "utf8");
    const lines = contents.split(/\r?\n/).filter(Boolean);
    return lines.slice(-lineCount).join("\n");
  } catch {
    return null;
  }
}

export async function runRepoOwnedSmokeScenario({
  rootDir,
  outputDir,
  suiteName,
  scenarioScript,
  scenarioSteps = null,
  serverPort,
  webPort,
  databaseUrl = getDefaultSmokeDatabaseUrl(),
  serverEnv = {},
  webEnv = {},
  scenarioArgs = [],
  releaseVersion = suiteName.replace(/[^a-z0-9-]+/gi, "-").toLowerCase(),
}) {
  await fsPromises.mkdir(outputDir, { recursive: true });

  const baseUrl = `http://localhost:${webPort}`;
  await ensurePortAvailable(serverPort, `The ${suiteName} server`);
  await ensurePortAvailable(webPort, `The ${suiteName} web shell`);
  await ensurePostgres({ rootDir, databaseUrl, purpose: suiteName, autoStart: true });

  const server = startLoggedProcess({
    rootDir,
    outputDir,
    name: `${releaseVersion}-server`,
    command: "corepack pnpm --filter @frontier/server dev",
    env: {
      PORT: String(serverPort),
      DATABASE_URL: databaseUrl,
      JWT_SECRET: process.env.JWT_SECRET || "repo-owned-smoke-secret-0123456789abcdef",
      COOKIE_SECURE: "false",
      AUTH_RATE_LIMIT_MAX: "999",
      COMMAND_RATE_LIMIT_MAX: "999",
      ...serverEnv,
    },
  });

  const web = startLoggedProcess({
    rootDir,
    outputDir,
    name: `${releaseVersion}-web`,
    command: "corepack pnpm --filter @frontier/web dev -- --host 127.0.0.1",
    env: {
      FRONTIER_WEB_PORT: String(webPort),
      FRONTIER_API_PROXY_TARGET: `http://127.0.0.1:${serverPort}`,
      FRONTIER_WS_PROXY_TARGET: `ws://127.0.0.1:${serverPort}`,
      FRONTIER_RELEASE_VERSION: process.env.FRONTIER_RELEASE_VERSION || releaseVersion,
      ...webEnv,
    },
  });

  try {
    await waitForManagedHttp({
      url: `http://127.0.0.1:${serverPort}/api/health`,
      label: `the ${suiteName} server`,
      timeoutMs: 60_000,
      processHandle: server.child,
    });
    await waitForManagedPort({
      port: webPort,
      label: `the ${suiteName} web shell`,
      timeoutMs: 60_000,
      processHandle: web.child,
    });
    await waitForManagedHttp({
      url: new URL("/login", baseUrl).toString(),
      label: `the ${suiteName} web shell`,
      timeoutMs: 60_000,
      processHandle: web.child,
    });

    const steps =
      scenarioSteps ??
      (scenarioScript
        ? [
            {
              script: scenarioScript,
              args: scenarioArgs,
            },
          ]
        : []);

    assert(steps.length > 0, `${suiteName} requires at least one smoke scenario script.`);

    for (const step of steps) {
      try {
        runNodeScript(rootDir, step.script, ["--base-url", baseUrl, ...(step.args ?? [])], {
          DATABASE_URL: databaseUrl,
        });
      } catch (error) {
        throw new Error(
          `Smoke scenario ${step.script} failed inside ${suiteName}. Verify the repo-owned stack logs and scenario artifact output before retrying. Root cause: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }
  } catch (error) {
    const [serverTail, webTail] = await Promise.all([readLogTail(server.logFile), readLogTail(web.logFile)]);
    if (serverTail) {
      console.error(`\n[${suiteName} server tail]\n${serverTail}`);
    }
    if (webTail) {
      console.error(`\n[${suiteName} web tail]\n${webTail}`);
    }
    throw error;
  } finally {
    await stopProcess(web.child);
    await stopProcess(server.child);
  }

  return {
    ok: true,
    baseUrl,
    serverPort,
    webPort,
    logs: {
      server: server.logFile,
      web: web.logFile,
    },
  };
}
