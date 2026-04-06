import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

import { ensureBaseUrlReachable, prepareSmokeFixture, waitFor } from "./smoke_support.mjs";

function parseArgs(argv) {
  const args = {
    baseUrl: "http://localhost:5173",
    username: "demo_smoke",
    password: "demo12345",
    screenshotPath: path.resolve("output", "kingdom-core-e2e.png"),
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

async function readGameState(page) {
  return page.evaluate(() => {
    if (!window.render_game_to_text) {
      return null;
    }
    return JSON.parse(window.render_game_to_text());
  });
}

async function readMapUiState(page) {
  return page.evaluate(() => window.frontierMapUi ?? null);
}

async function confirmComposerAction(page, composerTitle, actionName) {
  await waitFor(async () => {
    const state = await readMapUiState(page);
    if (!state?.composerMode) {
      return null;
    }
    return state.composerActionLabel === actionName ? state : null;
  }, 10_000, `${actionName} composer readiness`);

  const dialog = getComposerDialog(page, composerTitle);
  await dialog.waitFor({ timeout: 5_000 });

  try {
    await page.evaluate(() => window.confirm_map_command_composer?.());
  } catch {
    await clickDialogAction(page, () => getComposerDialog(page, composerTitle), actionName);
  }
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

async function ensureMapLoaded(page) {
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const loadedState = await waitFor(async () => {
      const state = await readGameState(page);
      if (state?.screen === "/app/map" && state.map.loaded) {
        return state;
      }
      return null;
    }, 15_000, "the map chunk to load").catch(() => null);

    if (loadedState) {
      return loadedState;
    }

    const canPrimeChunk = await waitFor(async () => {
      return (await page.evaluate(() => Boolean(window.prime_map_chunk))).valueOf() ? true : null;
    }, 5_000, "the map chunk primer").catch(() => false);

    if (attempt === 1) {
      if (canPrimeChunk) {
        await page.evaluate(() => window.prime_map_chunk?.()).catch(() => null);
        await page.waitForTimeout(1_000);
      }
      await page.reload({ waitUntil: "networkidle" });
    }
  }

  throw new Error("Timed out while waiting for the map chunk to load.");
}

async function ensureAllianceLoaded(page) {
  return waitFor(async () => {
    const state = await readGameState(page);
    if (state?.screen === "/app/alliance" && state.alliance?.loaded && state.alliance?.memberCount >= 2) {
      return state;
    }
    return null;
  }, 15_000, "the alliance chamber to load");
}

async function waitForMarchResolution(page) {
  const state = await readGameState(page);
  const activeMarch = state?.city?.activeMarches?.[0] ?? null;
  if (!activeMarch) {
    return;
  }

  const timeoutMs = Math.max(120_000, (activeMarch.remainingSeconds + 90) * 1_000);
  await waitFor(async () => {
    const nextState = await readGameState(page);
    return nextState?.city?.activeMarches?.length === 0 ? nextState : null;
  }, timeoutMs, "the active march to resolve");
}

async function waitForScoutInbox(page, targetName) {
  const title = `Scout report: ${targetName}`;
  await page.locator("[data-quick-action='inbox']").click();
  await waitFor(async () => {
    const titleMatch = await page.getByText(title, { exact: true }).count();
    return titleMatch > 0 ? title : null;
  }, 60_000, `a scout report for ${targetName}`);
  return title;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function getTargetDialog(page, label) {
  return page.getByRole("dialog", { name: new RegExp(`Command Tray: ${escapeRegExp(label)}`) });
}

function getComposerDialog(page, title) {
  return page.getByRole("dialog", { name: title });
}

async function clickDialogAction(page, getDialog, actionName) {
  let lastError = null;
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    try {
      const dialog = getDialog();
      await dialog.waitFor({ timeout: 6_000 });
      const button = dialog.getByRole("button", { name: actionName });
      await button.click({ timeout: 5_000 });
      return;
    } catch (error) {
      lastError = error;
      try {
        await page.getByRole("button", { name: actionName }).click({ timeout: 3_000 });
        return;
      } catch (fallbackError) {
        lastError = fallbackError;
      }
      await page.waitForTimeout(250 * attempt);
    }
  }

  throw lastError instanceof Error ? lastError : new Error(`Dialog action ${actionName} could not be clicked.`);
}

async function waitForTargetTray(page, label) {
  await waitFor(async () => {
    const state = await readMapUiState(page);
    return state?.targetSheetOpen && state?.selectedTargetName === label ? state : null;
  }, 15_000, `the target tray for ${label}`);
}

async function ensureActionVisible(page, label, actionName, reseatTarget) {
  let lastError = null;
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    try {
      await waitFor(async () => {
        const state = await readMapUiState(page);
        if (!state?.targetSheetOpen || state?.selectedTargetName !== label) {
          return null;
        }
        if (!Array.isArray(state.availableActions) || !state.availableActions.includes(actionName)) {
          return null;
        }
        return state;
      }, 15_000, `${actionName} to become available for ${label}`);
      const dialog = getTargetDialog(page, label);
      await dialog.waitFor({ timeout: 5_000 });
      await dialog.getByRole("button", { name: actionName }).waitFor({ timeout: 5_000 });
      return;
    } catch (error) {
      lastError = error;
      await reseatTarget();
      await page.waitForTimeout(300 * attempt);
    }
  }

  throw lastError instanceof Error ? lastError : new Error(`Action ${actionName} never became visible for ${label}.`);
}

async function dispatchMarch(page) {
  const mapState = await ensureMapLoaded(page);
  const totalTroops = mapState.city.troops.reduce((sum, troop) => sum + troop.quantity, 0);
  const targetPoi = mapState.map.pois.find((poi) => poi.canSendMarch) ?? mapState.map.pois.find((poi) => poi.canGather);

  if (targetPoi) {
    await page.evaluate((poiId) => {
      window.select_map_poi?.(poiId);
    }, targetPoi.id);

    await waitFor(async () => {
      const state = await readGameState(page);
      return state?.selectedPoi?.id === targetPoi.id ? state : null;
    }, 5_000, "the target point of interest to become selected");
    await waitForTargetTray(page, targetPoi.label);

    if (totalTroops <= 0) {
      await ensureActionVisible(page, targetPoi.label, "Send Scout", async () => {
        await page.evaluate((poiId) => {
          window.select_map_poi?.(poiId);
        }, targetPoi.id);
      });
      await clickDialogAction(page, () => getTargetDialog(page, targetPoi.label), "Send Scout");
      const scoutDialog = getComposerDialog(page, "Scout Mission");
      await scoutDialog.waitFor({ timeout: 5_000 });
      await confirmComposerAction(page, "Scout Mission", "Send Scout");
      return {
        mission: "SCOUT",
        targetName: targetPoi.label,
        march: null,
      };
    }

    const targetActionName = targetPoi.canGather ? "Gather Here" : "Attack Camp";
    const composerTitle = targetPoi.canGather ? "Gathering Orders" : "Camp Assault";
    const confirmActionName = targetPoi.canGather ? "Start Gathering" : "March to Camp";

    await ensureActionVisible(page, targetPoi.label, targetActionName, async () => {
      await page.evaluate((poiId) => {
        window.select_map_poi?.(poiId);
      }, targetPoi.id);
    });
    await clickDialogAction(page, () => getTargetDialog(page, targetPoi.label), targetActionName);
    const composerDialog = getComposerDialog(page, composerTitle);
    await composerDialog.waitFor({ timeout: 5_000 });
    await confirmComposerAction(page, composerTitle, confirmActionName);

    const sentState = await waitFor(async () => {
      const state = await readGameState(page);
      return state?.city?.activeMarches?.length > 0 ? state : null;
    }, 10_000, "a new poi march to be accepted");

    return {
      mission: targetPoi.canGather ? "RESOURCE_GATHER" : "BARBARIAN_ATTACK",
      targetName: targetPoi.label,
      march: sentState.city.activeMarches[0],
    };
  }

  const targetCity = mapState.map.cities.find((city) => !city.isCurrentPlayer && city.canSendMarch);
  if (!targetCity) {
    throw new Error("No valid POI or city march target was visible in the current chunk.");
  }

  await page.evaluate((cityId) => {
    window.select_map_city?.(cityId);
  }, targetCity.cityId);

  await waitFor(async () => {
    const state = await readGameState(page);
    return state?.selectedCity?.cityId === targetCity.cityId ? state : null;
  }, 5_000, "the target settlement to become selected");
  await waitForTargetTray(page, targetCity.cityName);

  if (totalTroops <= 0) {
    await ensureActionVisible(page, targetCity.cityName, "Send Scout", async () => {
      await page.evaluate((cityId) => {
        window.select_map_city?.(cityId);
      }, targetCity.cityId);
    });
    await clickDialogAction(page, () => getTargetDialog(page, targetCity.cityName), "Send Scout");
    const scoutDialog = getComposerDialog(page, "Scout Mission");
    await scoutDialog.waitFor({ timeout: 5_000 });
    await confirmComposerAction(page, "Scout Mission", "Send Scout");
    return {
      mission: "SCOUT",
      targetName: targetCity.cityName,
      march: null,
    };
  }

  await ensureActionVisible(page, targetCity.cityName, "Attack City", async () => {
    await page.evaluate((cityId) => {
      window.select_map_city?.(cityId);
    }, targetCity.cityId);
  });
  await clickDialogAction(page, () => getTargetDialog(page, targetCity.cityName), "Attack City");
  const composerDialog = getComposerDialog(page, "March Orders");
  await composerDialog.waitFor({ timeout: 5_000 });
  await confirmComposerAction(page, "March Orders", "Send March");

  const sentState = await waitFor(async () => {
    const state = await readGameState(page);
    return state?.city?.activeMarches?.length > 0 ? state : null;
  }, 10_000, "a new march to be accepted");

  return {
    mission: "CITY_ATTACK",
    targetName: targetCity.cityName,
    march: sentState.city.activeMarches[0],
  };
}

async function main() {
  const args = parseArgs(process.argv);
  await fs.mkdir(path.dirname(args.screenshotPath), { recursive: true });
  await ensureBaseUrlReachable(args.baseUrl, "The kingdom-core smoke web shell");
  await prepareSmokeFixture(args.username);

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1080 } });
  const consoleErrors = [];
  page.on("console", (message) => {
    if (message.type() === "error") {
      consoleErrors.push(message.text());
    }
  });

  try {
    await login(page, args.baseUrl, args.username, args.password);

    const dashboardState = await waitFor(async () => {
      const state = await readGameState(page);
      if (
        state?.screen === "/app/dashboard" &&
        state.city.troops?.length === 3 &&
        state.city.commanders?.length >= 1 &&
        state.city.research?.length === 6
      ) {
        return state;
      }
      return null;
    }, 15_000, "dashboard state");

    await page.goto(`${args.baseUrl}/app/alliance`, { waitUntil: "networkidle" });
    const allianceState = await ensureAllianceLoaded(page);

    await page.goto(`${args.baseUrl}/app/map`, { waitUntil: "networkidle" });
    await ensureMapLoaded(page);
    await waitForMarchResolution(page);
    const marchDispatch = await dispatchMarch(page);
    let resultHeading;

    if (marchDispatch.mission === "SCOUT") {
      resultHeading = await waitForScoutInbox(page, marchDispatch.targetName);
      await page.screenshot({ path: args.screenshotPath, fullPage: true });
    } else {
      await waitForMarchResolution(page);
      await page.goto(`${args.baseUrl}/app/reports`, { waitUntil: "networkidle" });
      await page.getByRole("heading").first().waitFor();
      await page.screenshot({ path: args.screenshotPath, fullPage: true });

      resultHeading = await page.locator("h3").first().textContent();
      if (!resultHeading) {
        throw new Error("No report heading was rendered after the march resolved.");
      }
    }

    if (consoleErrors.length > 0) {
      throw new Error(`Console errors detected:\n${consoleErrors.join("\n")}`);
    }

    console.log(
      JSON.stringify(
        {
          ok: true,
          screenshot: args.screenshotPath,
          dashboardCity: dashboardState.city.name,
          alliance: `${allianceState.alliance.tag}:${allianceState.alliance.memberCount}`,
          mission: marchDispatch.mission,
          marchTarget: marchDispatch.targetName,
          resultHeading,
        },
        null,
        2,
      ),
    );
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
