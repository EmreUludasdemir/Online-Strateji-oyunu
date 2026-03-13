import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

function parseArgs(argv) {
  const args = {
    baseUrl: "http://localhost:5173",
    username: "demo_alpha",
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

async function waitFor(check, timeoutMs, label) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const result = await check();
    if (result) {
      return result;
    }
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }

  throw new Error(`Timed out while waiting for ${label}.`);
}

async function readGameState(page) {
  return page.evaluate(() => {
    if (!window.render_game_to_text) {
      return null;
    }
    return JSON.parse(window.render_game_to_text());
  });
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
    await page.getByRole("button", { name: "Log in" }).click();
  }

  await page.waitForURL("**/app/dashboard");
}

async function ensureMapLoaded(page) {
  return waitFor(async () => {
    const state = await readGameState(page);
    if (state?.screen === "/app/map" && state.map.loaded) {
      return state;
    }
    return null;
  }, 15_000, "the map chunk to load");
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
  await page.getByRole("button", { name: "Open Inbox" }).click();
  await waitFor(async () => {
    const titleMatch = await page.getByText(title, { exact: true }).count();
    return titleMatch > 0 ? title : null;
  }, 60_000, `a scout report for ${targetName}`);
  return title;
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

    if (totalTroops <= 0) {
      await page.getByRole("button", { name: "Send Scout" }).first().click();
      await page.getByLabel("Scout Mission").getByRole("button", { name: "Send Scout" }).click();
      return {
        mission: "SCOUT",
        targetName: targetPoi.label,
        march: null,
      };
    }

    await page.getByRole("button", { name: "Proceed" }).click();
    const actionName = targetPoi.canGather ? "Start Gathering" : "March to Camp";
    await page.getByRole("button", { name: actionName }).click();

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

  if (totalTroops <= 0) {
    await page.getByRole("button", { name: "Send Scout" }).first().click();
    await page.getByLabel("Scout Mission").getByRole("button", { name: "Send Scout" }).click();
    return {
      mission: "SCOUT",
      targetName: targetCity.cityName,
      march: null,
    };
  }

  await page.getByRole("button", { name: "Proceed" }).click();
  await page.getByRole("button", { name: "Send March" }).click();

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

    await page.getByRole("link", { name: "Alliance" }).click();
    await page.waitForURL("**/app/alliance");
    const allianceState = await ensureAllianceLoaded(page);

    await page.getByRole("link", { name: "Map" }).click();
    await page.waitForURL("**/app/map");
    await ensureMapLoaded(page);
    await waitForMarchResolution(page);
    const marchDispatch = await dispatchMarch(page);
    let resultHeading;

    if (marchDispatch.mission === "SCOUT") {
      resultHeading = await waitForScoutInbox(page, marchDispatch.targetName);
      await page.screenshot({ path: args.screenshotPath, fullPage: true });
    } else {
      await waitForMarchResolution(page);
      await page.getByRole("link", { name: "Reports" }).click();
      await page.waitForURL("**/app/reports");
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

