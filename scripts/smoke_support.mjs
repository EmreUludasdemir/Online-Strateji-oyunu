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

function getLocalHostCandidates(host) {
  if (!isLocalHost(host)) {
    return [host];
  }

  return Array.from(new Set([host, "127.0.0.1", "localhost", "::1"]));
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

function pushBoundedEntry(collection, entry, limit = 20) {
  collection.push(entry);
  if (collection.length > limit) {
    collection.splice(0, collection.length - limit);
  }
}

export function attachBrowserDiagnostics(page) {
  const state = {
    consoleMessages: [],
    pageErrors: [],
    requestFailures: [],
    worldChunkResponses: [],
  };

  const handleConsole = (message) => {
    if (!["error", "warning"].includes(message.type())) {
      return;
    }

    pushBoundedEntry(state.consoleMessages, {
      at: new Date().toISOString(),
      type: message.type(),
      text: message.text(),
    });
  };

  const handlePageError = (error) => {
    pushBoundedEntry(state.pageErrors, {
      at: new Date().toISOString(),
      text: error instanceof Error ? `${error.name}: ${error.message}` : String(error),
      stack: error instanceof Error ? error.stack ?? null : null,
    });
  };

  const handleRequestFailed = (request) => {
    pushBoundedEntry(state.requestFailures, {
      at: new Date().toISOString(),
      method: request.method(),
      resourceType: request.resourceType(),
      url: request.url(),
      failure: request.failure()?.errorText ?? null,
    });
  };

  const handleResponse = (response) => {
    if (!response.url().includes("/api/game/world/chunk")) {
      return;
    }

    pushBoundedEntry(state.worldChunkResponses, {
      at: new Date().toISOString(),
      ok: response.ok(),
      status: response.status(),
      url: response.url(),
    });
  };

  page.on("console", handleConsole);
  page.on("pageerror", handlePageError);
  page.on("requestfailed", handleRequestFailed);
  page.on("response", handleResponse);

  return {
    state,
    detach() {
      page.off("console", handleConsole);
      page.off("pageerror", handlePageError);
      page.off("requestfailed", handleRequestFailed);
      page.off("response", handleResponse);
    },
  };
}

export async function readGameState(page) {
  return page.evaluate(() => {
    if (!window.render_game_to_text) {
      return null;
    }
    return JSON.parse(window.render_game_to_text());
  });
}

export async function readMapUiState(page) {
  return page.evaluate(() => window.frontierMapUi ?? null);
}

export async function readSmokeAutomationSnapshot(page) {
  return page.evaluate(() => {
    const renderText = typeof window.render_game_to_text === "function" ? window.render_game_to_text() : null;
    let rendered = null;
    let renderParseError = null;

    if (renderText) {
      try {
        rendered = JSON.parse(renderText);
      } catch (error) {
        renderParseError = error instanceof Error ? error.message : String(error);
      }
    }

    const errorBoundaryNode = document.querySelector("[data-error-boundary='true']");

    return {
      route: window.location.pathname,
      url: window.location.href,
      hooks: {
        renderGameToText: typeof window.render_game_to_text === "function",
        primeMapChunk: typeof window.prime_map_chunk === "function",
        focusMapTarget: typeof window.focus_map_target === "function",
        openMapFieldCommand: typeof window.open_map_field_command === "function",
      },
      errorBoundary: errorBoundaryNode?.textContent?.replace(/\s+/g, " ").trim().slice(0, 2_000) ?? null,
      frontierLastError: window.frontierLastError ?? null,
      frontierMapDiagnostics: window.frontierMapDiagnostics ?? null,
      frontierMapUi: window.frontierMapUi ?? null,
      rendered,
      renderParseError,
    };
  });
}

function summarizeRenderedState(rendered) {
  if (!rendered) {
    return null;
  }

  return {
    screen: rendered.screen ?? null,
    shell: rendered.shell ?? null,
    selectedCity: rendered.selectedCity
      ? {
          cityId: rendered.selectedCity.cityId,
          cityName: rendered.selectedCity.cityName,
        }
      : null,
    selectedPoi: rendered.selectedPoi
      ? {
          id: rendered.selectedPoi.id,
          label: rendered.selectedPoi.label,
        }
      : null,
    map: rendered.map
      ? {
          loaded: Boolean(rendered.map.loaded),
          readyPhase: rendered.map.readyPhase ?? null,
          center: rendered.map.center ?? null,
          radius: rendered.map.radius ?? null,
          tiles: rendered.map.tiles ?? null,
          cityCount: Array.isArray(rendered.map.cities) ? rendered.map.cities.length : 0,
          poiCount: Array.isArray(rendered.map.pois) ? rendered.map.pois.length : 0,
          marchCount: Array.isArray(rendered.map.marches) ? rendered.map.marches.length : 0,
          fieldCommand: rendered.map.fieldCommand ?? null,
          diagnostics: rendered.map.diagnostics ?? null,
          lastError: rendered.map.lastError ?? null,
        }
      : null,
  };
}

export function formatMapFailureDump(snapshot, browserDiagnostics) {
  return JSON.stringify(
    {
      route: snapshot?.route ?? null,
      url: snapshot?.url ?? null,
      hooks: snapshot?.hooks ?? null,
      errorBoundary: snapshot?.errorBoundary ?? null,
      frontierLastError: snapshot?.frontierLastError ?? null,
      frontierMapDiagnostics: snapshot?.frontierMapDiagnostics ?? null,
      frontierMapUi: snapshot?.frontierMapUi ?? null,
      rendered: summarizeRenderedState(snapshot?.rendered ?? null),
      renderParseError: snapshot?.renderParseError ?? null,
      worldChunkResponses: browserDiagnostics?.state?.worldChunkResponses ?? [],
      requestFailures: browserDiagnostics?.state?.requestFailures ?? [],
      consoleMessages: browserDiagnostics?.state?.consoleMessages ?? [],
      pageErrors: browserDiagnostics?.state?.pageErrors ?? [],
    },
    null,
    2,
  );
}

function isTerminalMapFailure(snapshot) {
  return Boolean(
    snapshot?.frontierLastError || snapshot?.errorBoundary || snapshot?.frontierMapDiagnostics?.readyPhase === "error",
  );
}

async function throwMapDiagnosticsError(message, page, browserDiagnostics) {
  const snapshot = await readSmokeAutomationSnapshot(page).catch(() => null);
  throw new Error(`${message}\n${formatMapFailureDump(snapshot, browserDiagnostics)}`);
}

export async function ensureMapReady(
  page,
  browserDiagnostics,
  {
    route = "/app/map",
    routeTimeoutMs = 10_000,
    automationTimeoutMs = 10_000,
    readyTimeoutMs = 15_000,
    primeTimeoutMs = 8_000,
    label = "the map",
  } = {},
) {
  try {
    await waitFor(async () => {
      const snapshot = await readSmokeAutomationSnapshot(page);
      return snapshot.route === route ? snapshot : null;
    }, routeTimeoutMs, `${label} route`);
  } catch {
    await throwMapDiagnosticsError(`Timed out while waiting for ${label} route.`, page, browserDiagnostics);
  }

  try {
    await waitFor(async () => {
      const snapshot = await readSmokeAutomationSnapshot(page);
      if (snapshot.route !== route) {
        return null;
      }
      if (isTerminalMapFailure(snapshot)) {
        throw new Error(`Detected a terminal failure before ${label} automation hooks were ready.\n${formatMapFailureDump(snapshot, browserDiagnostics)}`);
      }
      return snapshot.hooks.renderGameToText && snapshot.hooks.primeMapChunk ? snapshot : null;
    }, automationTimeoutMs, `${label} automation surface`);
  } catch (error) {
    if (error instanceof Error && !error.message.startsWith("Timed out while waiting")) {
      throw error;
    }
    await throwMapDiagnosticsError(`Timed out while waiting for ${label} automation surface.`, page, browserDiagnostics);
  }

  const waitForLoaded = async (timeoutMs, waitLabel) => {
    try {
      return await waitFor(async () => {
        const snapshot = await readSmokeAutomationSnapshot(page);
        if (snapshot.route !== route) {
          return null;
        }
        if (isTerminalMapFailure(snapshot)) {
          throw new Error(`Detected a terminal failure while waiting for ${label} readiness.\n${formatMapFailureDump(snapshot, browserDiagnostics)}`);
        }
        if (snapshot.rendered?.screen === route && snapshot.rendered?.map?.loaded) {
          return snapshot.rendered;
        }
        return null;
      }, timeoutMs, waitLabel);
    } catch (error) {
      if (error instanceof Error && !error.message.startsWith("Timed out while waiting")) {
        throw error;
      }
      return null;
    }
  };

  const loadedState = await waitForLoaded(readyTimeoutMs, `${label} readiness`);
  if (loadedState) {
    return loadedState;
  }

  await page.evaluate(() => window.prime_map_chunk?.()).catch(() => null);
  await page.waitForTimeout(1_000);

  const primedState = await waitForLoaded(primeTimeoutMs, `${label} readiness after chunk priming`);
  if (primedState) {
    return primedState;
  }

  await throwMapDiagnosticsError(`Timed out while waiting for ${label} to load.`, page, browserDiagnostics);
}

export function getDefaultSmokeDatabaseUrl() {
  return process.env.DATABASE_URL || "postgresql://postgres:postgres@localhost:5433/frontier_dominion?schema=public";
}

export async function prepareSmokeFixture(username, rootDir = process.cwd()) {
  if (username !== "demo_smoke") {
    return;
  }

  const lockFile = path.join(rootDir, "output", ".smoke-fixture-reset.lock");
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

  await fsPromises.mkdir(path.dirname(lockFile), { recursive: true });

  let lockHandle = null;
  try {
    lockHandle = await waitFor(
      async () => {
        try {
          return await fsPromises.open(lockFile, "wx");
        } catch (error) {
          const code = error && typeof error === "object" && "code" in error ? error.code : null;
          if (code === "EEXIST") {
            return null;
          }
          throw error;
        }
      },
      20_000,
      "the smoke fixture reset lock",
      250,
    );

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
  } finally {
    if (lockHandle) {
      await lockHandle.close().catch(() => undefined);
      await fsPromises.unlink(lockFile).catch(() => undefined);
    }
  }
}

export async function isPortOpen(port, host = "127.0.0.1") {
  for (const candidateHost of getLocalHostCandidates(host)) {
    const isOpen = await new Promise((resolve) => {
      const socket = net.createConnection({ port, host: candidateHost });
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

    if (isOpen) {
      return true;
    }
  }

  return false;
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

function normalizeManagedProcesses(processHandle, processHandles = []) {
  const normalized = [...processHandles];
  if (processHandle) {
    normalized.push({ label: "managed process", handle: processHandle });
  }
  return normalized;
}

function getProcessFailureMessage(label, processHandle, processHandles = []) {
  for (const managedProcess of normalizeManagedProcesses(processHandle, processHandles)) {
    if (managedProcess.handle && managedProcess.handle.exitCode !== null) {
      return `${label} could not finish startup because ${managedProcess.label} exited with code ${managedProcess.handle.exitCode}. Inspect the smoke log tail for the failing process and verify the repo-owned stack configuration before retrying.`;
    }
  }

  return null;
}

function classifySmokeFailure(error) {
  const message = error instanceof Error ? error.message : String(error ?? "");
  if (message.includes("Docker Desktop is not running")) {
    return "Docker unavailable";
  }
  if (message.includes("Docker is not available from this shell")) {
    return "Docker unavailable";
  }
  if (message.includes("DATABASE_URL points to") && message.includes("unreachable")) {
    return "Custom DATABASE_URL unreachable";
  }
  if (message.includes("TEST_DATABASE_URL") && message.includes("not reachable")) {
    return "Custom TEST_DATABASE_URL unreachable";
  }
  if (message.includes("Postgres is not reachable") || message.includes("Test database is not reachable")) {
    return "Database unavailable";
  }
  if (message.includes("exited during startup") || message.includes("could not finish startup") || message.includes("Timed out while waiting")) {
    return "Startup failure";
  }
  if (message.includes("Smoke scenario")) {
    return "Scenario failure";
  }
  return "Unknown failure";
}

export async function waitForManagedPort({ port, host = "127.0.0.1", label, timeoutMs, processHandle, processHandles }) {
  await waitFor(async () => {
    const failureMessage = getProcessFailureMessage(label, processHandle, processHandles);
    if (failureMessage) {
      throw new Error(failureMessage);
    }

    return (await isPortOpen(port, host)) ? true : null;
  }, timeoutMs, label, 1_000);
}

export async function waitForManagedHttp({ url, label, timeoutMs, processHandle, processHandles, validateResponse }) {
  await waitFor(async () => {
    const failureMessage = getProcessFailureMessage(label, processHandle, processHandles);
    if (failureMessage) {
      throw new Error(failureMessage);
    }

    try {
      const response = await fetch(url);
      if (!response.ok) {
        return null;
      }
      if (validateResponse) {
        return (await validateResponse(response.clone())) ? response : null;
      }
      return response;
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
  const allowedOrigins = Array.from(
    new Set(
      [
        process.env.ALLOWED_ORIGINS,
        serverEnv.ALLOWED_ORIGINS,
        `http://localhost:${webPort}`,
        `http://127.0.0.1:${webPort}`,
      ]
        .flatMap((value) => String(value ?? "").split(","))
        .map((value) => value.trim())
        .filter(Boolean),
    ),
  ).join(",");
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
      ALLOWED_ORIGINS: allowedOrigins,
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
      processHandles: [{ label: `${suiteName} server`, handle: server.child }],
    });
    await waitForManagedPort({
      port: webPort,
      label: `the ${suiteName} web shell`,
      timeoutMs: 60_000,
      processHandles: [{ label: `${suiteName} web shell`, handle: web.child }],
    });
    await waitForManagedHttp({
      url: new URL("/login", baseUrl).toString(),
      label: `the ${suiteName} web shell`,
      timeoutMs: 60_000,
      processHandles: [{ label: `${suiteName} web shell`, handle: web.child }],
    });
    await waitForManagedHttp({
      url: new URL("/api/public/bootstrap", baseUrl).toString(),
      label: `the ${suiteName} bootstrap api`,
      timeoutMs: 60_000,
      processHandles: [
        { label: `${suiteName} server`, handle: server.child },
        { label: `${suiteName} web shell`, handle: web.child },
      ],
      validateResponse: async (response) => {
        const payload = await response.json().catch(() => null);
        return Boolean(
          payload &&
            typeof payload.launchPhase === "string" &&
            typeof payload.registrationMode === "string" &&
            typeof payload.storeEnabled === "boolean",
        );
      },
    });
    await sleep(750);

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
        await sleep(350);
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
    const failureClass = classifySmokeFailure(error);
    console.error(`\n[${suiteName} failure class] ${failureClass}`);
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
