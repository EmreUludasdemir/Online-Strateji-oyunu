import "dotenv/config";

import { execSync } from "node:child_process";
import net from "node:net";

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

async function main() {
  const endpoint = resolveDatabaseEndpoint(databaseUrl);
  if (isLocalHost(endpoint.host) && !(await isPortOpen(endpoint.port, endpoint.host))) {
    throw new Error(
      `Test database is not reachable on ${endpoint.host}:${endpoint.port}. Start the local Postgres service (for example \`docker compose up -d postgres\`) or point TEST_DATABASE_URL to a running test database before executing pnpm test.`,
    );
  }

  try {
    execSync("corepack pnpm exec prisma db push --force-reset --skip-generate", {
      stdio: "inherit",
      env: process.env,
    });
  } catch (error) {
    throw new Error(
      `Prisma test database reset failed for ${endpoint.host}:${endpoint.port}. Verify TEST_DATABASE_URL and local Postgres health before retrying. Root cause: ${error instanceof Error ? error.message : String(error)}.`,
    );
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
