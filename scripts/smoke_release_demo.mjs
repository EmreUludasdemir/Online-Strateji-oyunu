import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

import {
  attachBrowserDiagnostics,
  ensureBaseUrlReachable,
  ensureMapReady,
  readGameState,
  waitFor,
} from "./smoke_support.mjs";

function parseArgs(argv) {
  const args = {
    baseUrl: "http://localhost:5173",
    username: "demo_alpha",
    password: "demo12345",
    outputDir: path.resolve("output", "release-demo-smoke"),
  };

  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];
    if (arg === "--base-url" && next) {
      args.baseUrl = next;
      index += 1;
    } else if (arg === "--username" && next) {
      args.username = next;
      index += 1;
    } else if (arg === "--password" && next) {
      args.password = next;
      index += 1;
    } else if (arg === "--output-dir" && next) {
      args.outputDir = path.resolve(next);
      index += 1;
    }
  }

  return args;
}

async function login(page, baseUrl, username, password) {
  await page.goto(`${baseUrl}/login`, { waitUntil: "networkidle" });
  if (page.url().includes("/app/")) {
    return;
  }

  const demoButton = page.locator(`[data-demo-login='${username}']`);
  if (await demoButton.count()) {
    await demoButton.click();
  } else {
    await page.getByLabel("Username").fill(username);
    await page.getByLabel("Password").fill(password);
    await page.locator("form").getByRole("button", { name: "Log in" }).click();
  }

  await page.waitForURL("**/app/dashboard", { timeout: 15_000 });
}

async function waitForScreen(page, screen) {
  return waitFor(async () => {
    const state = await readGameState(page);
    return state?.screen === screen && state.shell?.authenticated && state.shell?.gameStateReady ? state : null;
  }, 15_000, `${screen} to render authenticated game state`);
}

async function navigateAndVerify(page, baseUrl, route) {
  await page.goto(`${baseUrl}${route}`, { waitUntil: "networkidle" });
  return waitForScreen(page, route);
}

async function verifyAudioToggle(page) {
  const toggle = page.locator("[data-quick-action='sound']");
  await toggle.waitFor({ timeout: 10_000 });
  const before = await page.evaluate(() => window.frontierAudio?.state?.() ?? null);
  await toggle.click();
  const afterFirstClick = await page.evaluate(() => window.frontierAudio?.state?.() ?? null);
  await toggle.click();
  const afterSecondClick = await page.evaluate(() => window.frontierAudio?.state?.() ?? null);
  const persisted = await page.evaluate(() => window.localStorage.getItem("frontier_audio_settings"));

  if (!before || !afterFirstClick || !afterSecondClick) {
    throw new Error("Audio smoke could not read window.frontierAudio state.");
  }
  if (afterFirstClick.muted === before.muted) {
    throw new Error("Sound toggle did not change the muted state on first click.");
  }
  if (afterSecondClick.muted !== before.muted) {
    throw new Error("Sound toggle did not restore the original muted state on second click.");
  }
  if (!persisted) {
    throw new Error("Sound toggle did not persist audio settings to localStorage.");
  }

  await page.evaluate(() => window.frontierAudio?.play?.("ui_click"));
  const cueState = await page.evaluate(() => window.frontierAudio?.state?.() ?? null);
  if (!cueState?.lastCueId) {
    throw new Error("Audio cue smoke did not record a lastCueId.");
  }

  return {
    initialMuted: before.muted,
    restoredMuted: afterSecondClick.muted,
    lastCueId: cueState.lastCueId,
  };
}

async function verifyTutorial(page) {
  await page.evaluate(() => window.frontierTutorial?.reset?.());
  const tutorial = await waitFor(async () => {
    const state = await readGameState(page);
    return state?.tutorial?.currentStepId === "welcome" && !state.tutorial.isSkipped ? state.tutorial : null;
  }, 10_000, "the tutorial reset welcome state");

  const directState = await page.evaluate(() => window.frontierTutorial?.state?.() ?? null);
  if (directState?.currentStepId !== "welcome") {
    throw new Error("window.frontierTutorial.state() did not expose the welcome tutorial step.");
  }

  return {
    currentStepId: tutorial.currentStepId,
    progressPercent: tutorial.progressPercent,
    targetRoute: tutorial.targetRoute,
  };
}

async function selectProvinceWithAction(page) {
  const candidates = [
    [33, 32],
    [32, 32],
    [34, 32],
    [33, 33],
    [31, 32],
    [35, 33],
    [30, 31],
  ];

  for (const [x, y] of candidates) {
    await page.evaluate(([tileX, tileY]) => window.select_map_province?.(tileX, tileY), [x, y]);
    const selected = await waitFor(async () => {
      const state = await readGameState(page);
      return state?.map?.ui?.selectedProvinceId ? state : null;
    }, 4_000, `province ${x},${y} selection`).catch(() => null);
    if (!selected) {
      continue;
    }

    const enabledActionCount = await page.locator("button[data-expansion-action]:not([disabled])").count();
    if (enabledActionCount > 0) {
      return {
        x,
        y,
        selectedProvinceId: selected.map.ui.selectedProvinceId,
        initialExpansionLogCount: selected.map.ui.expansionLogCount ?? 0,
      };
    }
  }

  throw new Error("No selectable province with an enabled expansion action was found.");
}

async function verifyMapPoliticalLoop(page, baseUrl, browserDiagnostics, outputDir) {
  await navigateAndVerify(page, baseUrl, "/app/map");
  const mapState = await ensureMapReady(page, browserDiagnostics, { label: "the release demo map" });
  await page.locator("[data-map-mode='ALLIANCE']").click();

  const selectedProvince = await selectProvinceWithAction(page);
  const actionButton = page.locator("button[data-expansion-action]:not([disabled])").first();
  const action = await actionButton.getAttribute("data-expansion-action");
  await actionButton.click();

  const afterAction = await waitFor(async () => {
    const state = await readGameState(page);
    const nextCount = state?.map?.ui?.expansionLogCount ?? 0;
    return nextCount > selectedProvince.initialExpansionLogCount ? state : null;
  }, 10_000, "the expansion action to append to the map log");

  await page.keyboard.press("Escape");
  await page.getByRole("dialog").waitFor({ state: "hidden", timeout: 5_000 }).catch(() => null);

  await page.locator("[data-map-action='open-diplomacy-drawer']").click();
  const diplomacy = await waitFor(async () => {
    const state = await readGameState(page);
    return state?.map?.ui?.diplomacyDrawerOpen ? state.map.ui : null;
  }, 10_000, "the diplomacy drawer to open");

  await page.screenshot({
    path: path.join(outputDir, "desktop-map-political.png"),
    fullPage: false,
  });

  return {
    loaded: mapState.map?.loaded ?? true,
    selectedProvince,
    expansionAction: action,
    expansionLogCount: afterAction.map.ui.expansionLogCount,
    diplomacyDrawerOpen: diplomacy.diplomacyDrawerOpen,
  };
}

function summarizeBrowserDiagnostics(browserDiagnostics) {
  return {
    consoleMessages: browserDiagnostics.state.consoleMessages,
    pageErrors: browserDiagnostics.state.pageErrors,
    requestFailures: browserDiagnostics.state.requestFailures,
    worldChunkResponses: browserDiagnostics.state.worldChunkResponses,
  };
}

async function main() {
  const args = parseArgs(process.argv);
  await fs.mkdir(args.outputDir, { recursive: true });
  await ensureBaseUrlReachable(args.baseUrl, "the release demo web shell");

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const browserDiagnostics = attachBrowserDiagnostics(page);
  const analyticsRateLimitResponses = [];
  page.on("response", (response) => {
    if (response.status() === 429 && response.url().includes("/api/game/analytics")) {
      analyticsRateLimitResponses.push({
        at: new Date().toISOString(),
        status: response.status(),
        url: response.url(),
      });
    }
  });

  try {
    await login(page, args.baseUrl, args.username, args.password);

    const dashboardState = await waitForScreen(page, "/app/dashboard");
    const audio = await verifyAudioToggle(page);
    const tutorial = await verifyTutorial(page);
    await page.screenshot({
      path: path.join(args.outputDir, "desktop-dashboard.png"),
      fullPage: false,
    });
    await page.evaluate(() => window.frontierTutorial?.skip?.());

    await navigateAndVerify(page, args.baseUrl, "/app/city");
    await navigateAndVerify(page, args.baseUrl, "/app/army");
    const map = await verifyMapPoliticalLoop(page, args.baseUrl, browserDiagnostics, args.outputDir);
    await navigateAndVerify(page, args.baseUrl, "/app/reports");
    await page.screenshot({
      path: path.join(args.outputDir, "desktop-reports.png"),
      fullPage: false,
    });

    await page.setViewportSize({ width: 390, height: 844 });
    await navigateAndVerify(page, args.baseUrl, "/app/dashboard");
    await page.locator("[data-quick-action='sound']").waitFor({ timeout: 10_000 });
    await page.screenshot({
      path: path.join(args.outputDir, "mobile-dashboard.png"),
      fullPage: false,
    });
    await navigateAndVerify(page, args.baseUrl, "/app/map");
    await ensureMapReady(page, browserDiagnostics, { label: "the mobile release demo map" });
    await page.screenshot({
      path: path.join(args.outputDir, "mobile-map.png"),
      fullPage: false,
    });

    const runtimeConsoleErrors = browserDiagnostics.state.consoleMessages
      .filter((entry) => entry.type === "error")
      .filter(
        (entry) =>
          !(
            analyticsRateLimitResponses.length > 0 &&
            entry.text.includes("429") &&
            entry.text.includes("Too Many Requests")
          ),
      )
      .map((entry) => entry.text);
    if (runtimeConsoleErrors.length > 0 || browserDiagnostics.state.pageErrors.length > 0) {
      throw new Error(
        `Console/page errors detected:\n${[
          ...runtimeConsoleErrors,
          ...browserDiagnostics.state.pageErrors.map((entry) => entry.text),
        ].join("\n")}`,
      );
    }

    const report = {
      ok: true,
      screenshots: args.outputDir,
      dashboard: {
        city: dashboardState.city?.name ?? null,
        resources: dashboardState.city?.resources ?? null,
      },
      audio,
      tutorial,
      map,
      browser: summarizeBrowserDiagnostics(browserDiagnostics),
      ignoredAnalyticsRateLimits: analyticsRateLimitResponses,
    };
    await fs.writeFile(path.join(args.outputDir, "release-demo-report.json"), JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
  } finally {
    browserDiagnostics.detach();
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
