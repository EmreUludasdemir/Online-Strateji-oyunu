import "dotenv/config";

import { execSync } from "node:child_process";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

const databaseUrl =
  process.env.TEST_DATABASE_URL ??
  "postgresql://postgres:postgres@localhost:5433/frontier_dominion?schema=test";

process.env.DATABASE_URL = databaseUrl;
process.env.JWT_SECRET ??= "test-secret-frontier-dominion";

function resolveDatabaseEndpoint(connectionString: string) {
  try {
    const parsed = new URL(connectionString);
    return {
      host: parsed.hostname || "127.0.0.1",
      port: parsed.port ? Number(parsed.port) : 5432,
    };
  } catch {
    return {
      host: "127.0.0.1",
      port: 5433,
    };
  }
}

function isLocalHost(host: string) {
  return host === "localhost" || host === "127.0.0.1";
}

function isDockerDesktopUnavailable(error: unknown) {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return (
    message.includes("dockerDesktopLinuxEngine") ||
    message.includes("Cannot connect to the Docker daemon") ||
    message.includes("The system cannot find the file specified")
  );
}

async function isPortOpen(port: number, host: string) {
  return new Promise<boolean>((resolve) => {
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

async function waitForPort(port: number, host: string, timeoutMs: number) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (await isPortOpen(port, host)) {
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }

  throw new Error(`Timed out while waiting for Postgres on ${host}:${port}.`);
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isDatabaseBootError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return (
    message.includes("Can't reach database server") ||
    message.includes("ECONNREFUSED") ||
    message.includes("Timed out") ||
    message.includes("P1001")
  );
}

async function resetTestDatabase(endpoint: { host: string; port: number }) {
  const resetCommand = "corepack pnpm exec prisma db push --force-reset --skip-generate";
  const maxAttempts = 5;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      execSync(resetCommand, {
        stdio: "inherit",
        env: process.env,
      });
      return;
    } catch (error) {
      if (attempt >= maxAttempts || !isDatabaseBootError(error)) {
        throw error;
      }

      console.warn(
        `Test database on ${endpoint.host}:${endpoint.port} is still warming up. Retrying Prisma reset (${attempt + 1}/${maxAttempts})...`,
      );
      await sleep(2_000 + attempt * 500);
    }
  }
}

async function main() {
  const endpoint = resolveDatabaseEndpoint(databaseUrl);
  if (isLocalHost(endpoint.host) && !(await isPortOpen(endpoint.port, endpoint.host))) {
    if (endpoint.port !== 5433) {
      throw new Error(
        `Test database is not reachable on ${endpoint.host}:${endpoint.port}. The repo can only auto-start the bundled Postgres service on localhost:5433, so start your custom test database manually or point TEST_DATABASE_URL back to the default local service before executing pnpm test.`,
      );
    }

    const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

    try {
      execSync("docker info", { cwd: rootDir, stdio: "ignore" });
      execSync("cmd.exe /d /s /c \"docker compose up -d postgres\"", { cwd: rootDir, stdio: "inherit" });
      await waitForPort(endpoint.port, endpoint.host, 60_000);
      await sleep(1_000);
    } catch (error) {
      const guidance = isDockerDesktopUnavailable(error)
        ? "Docker Desktop is not running."
        : "Docker is not available from this shell.";
      throw new Error(
        `Test database is not reachable on ${endpoint.host}:${endpoint.port} and ${guidance} Start Docker Desktop, run \`corepack pnpm db:up\`, or point TEST_DATABASE_URL to a running Postgres instance before executing pnpm test.`,
      );
    }
  }

  try {
    await resetTestDatabase(endpoint);
  } catch (error) {
    throw new Error(
      `Prisma test database reset failed for ${endpoint.host}:${endpoint.port}. Verify TEST_DATABASE_URL (${databaseUrl}), local Postgres health, and Docker startup before retrying. Root cause: ${error instanceof Error ? error.message : String(error)}.`,
    );
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
