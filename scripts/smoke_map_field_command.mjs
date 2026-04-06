import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

import {
  attachBrowserDiagnostics,
  ensureBaseUrlReachable,
  ensureMapReady,
  prepareSmokeFixture,
  readGameState,
  readMapUiState,
  waitFor,
} from "./smoke_support.mjs";

const MAP_TILE_WORLD_SIZE = 128;

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function parseArgs(argv) {
  const args = {
    baseUrl: "http://localhost:5173",
    username: "demo_smoke",
    password: "demo12345",
    screenshotPath: path.resolve("output", "map-field-command-e2e.png"),
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
    } else if (arg === "--screenshot" && next) {
      args.screenshotPath = path.resolve(next);
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

  await page.waitForURL("**/app/dashboard");
}

async function ensureMapLoaded(page, browserDiagnostics) {
  return ensureMapReady(page, browserDiagnostics, {
    label: "the field map",
  });
}

async function ensureAllianceReady(page) {
  return waitFor(async () => {
    const state = await readGameState(page);
    if (state?.screen === "/app/map" && state.alliance?.loaded) {
      return state;
    }
    return null;
  }, 30_000, "the alliance state to sync on the field map");
}

async function waitForTargetAction(page, label, actionName) {
  await waitFor(async () => {
    const state = await readMapUiState(page);
    if (!state?.targetSheetOpen || state?.selectedTargetName !== label) {
      return null;
    }
    return Array.isArray(state.availableActions) && state.availableActions.includes(actionName) ? state : null;
  }, 15_000, `${actionName} to become available for ${label}`);
}

async function ensureFieldCommandHook(page) {
  return waitFor(async () => {
    const available = await page.evaluate(() => ({
      open: Boolean(window.open_map_field_command),
      focus: Boolean(window.focus_map_target),
    }));
    return available.open && available.focus ? true : null;
  }, 10_000, "the field-command automation hooks");
}

async function getPrimaryMapCanvasRect(page) {
  const locator = page.locator("[data-map-canvas] canvas").first();
  await locator.waitFor({ state: "visible", timeout: 5_000 });
  const box = await locator.boundingBox();
  return box ?? null;
}

async function focusTargetForCanvasCommand(page, target) {
  await page.evaluate((payload) => {
    window.focus_map_target?.(payload);
  }, target);

  return waitFor(async () => {
    const state = await readGameState(page);
    const camera = state?.map?.camera;
    if (!camera) {
      return null;
    }
    const dx = Math.abs(camera.centerTileX - target.x);
    const dy = Math.abs(camera.centerTileY - target.y);
    return dx <= 2 && dy <= 2 ? state : null;
  }, 5_000, `the camera to focus ${target.label}`);
}

async function openFieldCommandWithRightClick(page, target) {
  const state = await focusTargetForCanvasCommand(page, target).catch(() => null);
  const canvas = await getPrimaryMapCanvasRect(page).catch(() => null);
  if (!canvas || !state?.map?.camera) {
    return false;
  }

  const screenCenterX = canvas.x + canvas.width / 2;
  const screenCenterY = canvas.y + canvas.height / 2;
  const offsetX = (target.x - state.map.camera.centerTileX) * MAP_TILE_WORLD_SIZE * state.map.camera.zoom;
  const offsetY = (target.y - state.map.camera.centerTileY) * MAP_TILE_WORLD_SIZE * state.map.camera.zoom;
  const clickX = screenCenterX + offsetX;
  const clickY = screenCenterY + offsetY;

  if (clickX < canvas.x || clickX > canvas.x + canvas.width || clickY < canvas.y || clickY > canvas.y + canvas.height) {
    return false;
  }

  await page.mouse.click(clickX, clickY, { button: "right" });

  const opened = await waitFor(async () => {
    const nextState = await readGameState(page);
    return nextState?.map?.fieldCommand?.label === target.label ? nextState : null;
  }, 3_000, "field command sheet after right click").catch(() => null);

  return Boolean(opened);
}

async function openFieldCommandWithHook(page, target) {
  await page.evaluate((payload) => {
    window.open_map_field_command?.(payload);
  }, target);

  const dialog = page.getByRole("dialog", {
    name: new RegExp(`Field Command: ${escapeRegExp(target.label)}`),
  });
  await dialog.waitFor({ timeout: 3_000 });

  return waitFor(async () => {
    const state = await readGameState(page);
    return state?.map?.fieldCommand?.label === target.label ? state : null;
  }, 3_000, "field command sheet after automation hook").catch(() => null);
}

async function main() {
  const args = parseArgs(process.argv);
  await fs.mkdir(path.dirname(args.screenshotPath), { recursive: true });
  await ensureBaseUrlReachable(args.baseUrl, "The field-command smoke web shell");
  await prepareSmokeFixture(args.username);

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1080 } });
  const browserDiagnostics = attachBrowserDiagnostics(page);

  try {
    await login(page, args.baseUrl, args.username, args.password);
    await page.goto(`${args.baseUrl}/app/map`, { waitUntil: "networkidle" });

    const initialState = await ensureMapLoaded(page, browserDiagnostics);
    await ensureAllianceReady(page);
    await ensureFieldCommandHook(page);
    const target =
      initialState.map.pois.find((poi) => poi.kind === "BARBARIAN_CAMP") ??
      initialState.map.pois[0] ??
      initialState.map.cities.find((city) => !city.isCurrentPlayer);

    if (!target) {
      throw new Error("No visible POI or enemy city was available for the field-command scenario.");
    }

    const targetPayload =
      "id" in target
        ? {
            kind: "POI",
            label: target.label,
            x: target.x,
            y: target.y,
            poiId: target.id,
          }
        : {
            kind: "CITY",
            label: target.cityName,
            x: target.x,
            y: target.y,
            cityId: target.cityId,
          };

    const interactionMode = (await openFieldCommandWithRightClick(page, targetPayload))
      ? "canvas-right-click"
      : "automation-hook";

    if (interactionMode === "automation-hook") {
      await openFieldCommandWithHook(page, targetPayload);
    }

    const fieldCommandDialog = page.getByRole("dialog", {
      name: new RegExp(`Field Command: ${escapeRegExp(targetPayload.label)}`),
    });
    await fieldCommandDialog.waitFor({ timeout: 5_000 });

    let targetTrayValidated = false;
    if (targetPayload.kind !== "TILE") {
      await fieldCommandDialog.locator("footer").getByRole("button", { name: "Open Target" }).click();

      const targetDialog = page.getByRole("dialog", {
        name: new RegExp(`Command Tray: ${escapeRegExp(targetPayload.label)}`),
      });
      await targetDialog.waitFor({ timeout: 5_000 });

      const targetPrimaryActionLabel =
        "id" in target ? (target.kind === "BARBARIAN_CAMP" ? "Attack Camp" : "Gather Here") : "Attack City";
      await waitForTargetAction(page, targetPayload.label, targetPrimaryActionLabel);
      await targetDialog.getByRole("button", { name: targetPrimaryActionLabel }).waitFor({ timeout: 5_000 });
      targetTrayValidated = true;

      await targetDialog.getByRole("button", { name: "Close" }).click();
      await targetDialog.waitFor({ state: "hidden", timeout: 5_000 });

      await page.reload({ waitUntil: "networkidle" });
      await ensureMapLoaded(page, browserDiagnostics);
      await ensureAllianceReady(page);
      await ensureFieldCommandHook(page);
      await openFieldCommandWithHook(page, targetPayload);
      await fieldCommandDialog.waitFor({ timeout: 5_000 });
    }

    const markerLabel = `Field ping ${Date.now().toString().slice(-4)}`;
    await fieldCommandDialog.locator("input[type='text']").fill(markerLabel);
    await page.getByRole("button", { name: "Post Marker" }).click();

    const finalState = await waitFor(async () => {
      const state = await readGameState(page);
      const marker = state?.alliance?.markers?.find((entry) => entry.label === markerLabel);
      return marker ? state : null;
    }, 10_000, "the new field marker to appear");

    const createdMarker = finalState.alliance.markers.find((entry) => entry.label === markerLabel) ?? null;
    if (!createdMarker?.expiresAt) {
      throw new Error("Expected the field marker to have an expiration timestamp.");
    }

    await page.screenshot({ path: args.screenshotPath, fullPage: true });

    const runtimeConsoleErrors = browserDiagnostics.state.consoleMessages
      .filter((entry) => entry.type === "error")
      .map((entry) => entry.text);
    if (runtimeConsoleErrors.length > 0 || browserDiagnostics.state.pageErrors.length > 0) {
      throw new Error(
        `Console errors detected:\n${[
          ...runtimeConsoleErrors,
          ...browserDiagnostics.state.pageErrors.map((entry) => entry.text),
        ].join("\n")}`,
      );
    }

    console.log(
      JSON.stringify(
        {
          ok: true,
          screenshot: args.screenshotPath,
          interactionMode,
          target: {
            kind: targetPayload.kind,
            label: targetPayload.label,
            x: targetPayload.x,
            y: targetPayload.y,
          },
          fieldCommand: finalState.map.fieldCommand,
          targetTrayValidated,
          marker: createdMarker,
        },
        null,
        2,
      ),
    );
  } finally {
    browserDiagnostics.detach();
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
