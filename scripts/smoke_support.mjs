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

export function prepareSmokeFixture(username, rootDir = process.cwd()) {
  if (username !== "demo_smoke") {
    return;
  }

  const serverDir = path.join(rootDir, "apps", "server");
  const tsxCli = path.join(serverDir, "node_modules", "tsx", "dist", "cli.mjs");
  if (!fs.existsSync(tsxCli)) {
    throw new Error(
      `Smoke fixture reset requires ${tsxCli}. Run corepack pnpm install before re-running the smoke suite.`,
    );
  }

  execFileSync(process.execPath, [tsxCli, "prisma/resetSmokeFixture.ts", "--username", username], {
    cwd: serverDir,
    stdio: "inherit",
  });
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

export async function ensurePostgres({ rootDir, databaseUrl, service = "postgres" }) {
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
      `DATABASE_URL points to ${endpoint.host}:${endpoint.port}, but that database is unreachable. Start that Postgres instance before running smoke:alpha.`,
    );
  }

  if (endpoint.port !== 5433) {
    throw new Error(
      `DATABASE_URL points to localhost:${endpoint.port}, but smoke:alpha can only auto-start the bundled Postgres service on localhost:5433. Start your custom Postgres manually or use the default alpha DATABASE_URL.`,
    );
  }

  try {
    execFileSync("docker", ["info"], { cwd: rootDir, stdio: "ignore" });
  } catch (error) {
    const guidance = isDockerDesktopUnavailable(error)
      ? "Docker Desktop is not running."
      : "Docker is not available from this shell.";
    throw new Error(
      `Postgres is not reachable on localhost:5433 and ${guidance} Start Docker Desktop or set DATABASE_URL to a running Postgres instance before retrying smoke:alpha.`,
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

export function runNodeScript(rootDir, relativePath, args) {
  execFileSync(process.execPath, [path.join(rootDir, relativePath), ...args], {
    cwd: rootDir,
    stdio: "inherit",
    env: process.env,
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
