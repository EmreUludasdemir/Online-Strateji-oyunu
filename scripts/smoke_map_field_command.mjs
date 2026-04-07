import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

import {
  attachBrowserDiagnostics,
  ensureBaseUrlReachable,
  ensureMapReady,
  prepareSmokeFixture,
  readGameState,
  readSmokeAutomationSnapshot,
  waitFor,
} from "./smoke_support.mjs";

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

function roundNumber(value) {
  return Number.isFinite(value) ? Number(value.toFixed(2)) : null;
}

function summarizeBrowserDiagnostics(browserDiagnostics) {
  return {
    worldChunkResponses: browserDiagnostics.state.worldChunkResponses,
    requestFailures: browserDiagnostics.state.requestFailures,
    consoleMessages: browserDiagnostics.state.consoleMessages,
    pageErrors: browserDiagnostics.state.pageErrors,
  };
}

function getFieldCommandSource(snapshot) {
  return (
    snapshot?.frontierMapFieldCommand?.openSource ??
    snapshot?.frontierMapUi?.fieldCommandOpenSource ??
    snapshot?.rendered?.map?.fieldCommand?.openSource ??
    null
  );
}

function getFieldCommandLabel(snapshot) {
  return (
    snapshot?.frontierMapFieldCommand?.label ??
    snapshot?.frontierMapUi?.fieldCommandLabel ??
    snapshot?.rendered?.map?.fieldCommand?.label ??
    null
  );
}

function buildTargetPayload(target) {
  if ("id" in target) {
    return {
      kind: "POI",
      label: target.label,
      x: target.x,
      y: target.y,
      poiId: target.id,
    };
  }

  return {
    kind: "CITY",
    label: target.cityName,
    x: target.x,
    y: target.y,
    cityId: target.cityId,
  };
}

function pickTarget(visibleTargets, initialState) {
  const visiblePoi =
    visibleTargets?.pois?.find((poi) => poi.kind === "BARBARIAN_CAMP") ??
    visibleTargets?.pois?.[0] ??
    null;
  if (visiblePoi) {
    return {
      payload: {
        kind: "POI",
        label: visiblePoi.label,
        x: visiblePoi.x,
        y: visiblePoi.y,
        poiId: visiblePoi.id,
      },
      source: "visible-targets",
    };
  }

  const visibleCity = visibleTargets?.cities?.[0] ?? null;
  if (visibleCity) {
    return {
      payload: {
        kind: "CITY",
        label: visibleCity.cityName,
        x: visibleCity.x,
        y: visibleCity.y,
        cityId: visibleCity.cityId,
      },
      source: "visible-targets",
    };
  }

  const fallbackTarget =
    initialState.map.pois.find((poi) => poi.kind === "BARBARIAN_CAMP") ??
    initialState.map.pois[0] ??
    initialState.map.cities.find((city) => !city.isCurrentPlayer) ??
    null;

  if (!fallbackTarget) {
    return null;
  }

  return {
    payload: buildTargetPayload(fallbackTarget),
    source: "rendered-map-state",
  };
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
    const snapshot = await readFieldCommandSmokeSnapshot(page);
    if (!snapshot.frontierMapUi?.targetSheetOpen || snapshot.frontierMapUi?.selectedTargetName !== label) {
      return null;
    }
    return Array.isArray(snapshot.frontierMapUi.availableActions) &&
      snapshot.frontierMapUi.availableActions.includes(actionName)
      ? snapshot
      : null;
  }, 15_000, `${actionName} to become available for ${label}`);
}

async function ensureFieldCommandHook(page) {
  return waitFor(async () => {
    const snapshot = await page.evaluate(() => ({
      hooks: {
        openMapFieldCommand: typeof window.open_map_field_command === "function",
        focusMapTarget: typeof window.focus_map_target === "function",
        getVisibleSmokeTargets: typeof window.get_visible_smoke_targets === "function",
        projectMapTargetForSmoke: typeof window.project_map_target_for_smoke === "function",
      },
      visibleTargets: typeof window.get_visible_smoke_targets === "function" ? window.get_visible_smoke_targets() : null,
    }));

    return snapshot.hooks.openMapFieldCommand &&
      snapshot.hooks.focusMapTarget &&
      snapshot.hooks.getVisibleSmokeTargets &&
      snapshot.hooks.projectMapTargetForSmoke &&
      snapshot.visibleTargets
      ? snapshot
      : null;
  }, 10_000, "the field-command automation hooks");
}

async function armCanvasEventCapture(page) {
  return page.evaluate(() => {
    const canvas = document.querySelector("[data-map-canvas] canvas");
    if (!canvas) {
      return false;
    }

    const globalKey = "__frontierSmokeCanvasEvents";
    if (!Array.isArray(window[globalKey])) {
      window[globalKey] = [];
    } else {
      window[globalKey].length = 0;
    }

    if (canvas.dataset.smokeCaptureAttached !== "true") {
      const pushEvent = (event) => {
        const entry = {
          type: event.type,
          button: "button" in event ? event.button : null,
          buttons: "buttons" in event ? event.buttons : null,
          clientX: "clientX" in event ? Number(event.clientX.toFixed(2)) : null,
          clientY: "clientY" in event ? Number(event.clientY.toFixed(2)) : null,
          pointerType: "pointerType" in event ? event.pointerType : null,
          ctrlKey: Boolean(event.ctrlKey),
          shiftKey: Boolean(event.shiftKey),
          altKey: Boolean(event.altKey),
          metaKey: Boolean(event.metaKey),
          defaultPrevented: event.defaultPrevented,
        };
        window[globalKey].push(entry);
        if (window[globalKey].length > 24) {
          window[globalKey].splice(0, window[globalKey].length - 24);
        }
      };

      for (const type of ["pointermove", "pointerdown", "mousedown", "mouseup", "auxclick", "contextmenu"]) {
        canvas.addEventListener(type, pushEvent, true);
      }
      canvas.dataset.smokeCaptureAttached = "true";
    }

    return true;
  });
}

async function readCanvasEventCapture(page) {
  return page.evaluate(() => {
    const globalKey = "__frontierSmokeCanvasEvents";
    return Array.isArray(window[globalKey]) ? window[globalKey] : [];
  });
}

async function readFieldCommandSmokeSnapshot(page, target = null) {
  const baseSnapshot = await readSmokeAutomationSnapshot(page).catch(() => null);
  const fieldSnapshot = await page
    .evaluate((payload) => {
      const canvas = document.querySelector("[data-map-canvas] canvas");
      const rect = canvas?.getBoundingClientRect() ?? null;
      return {
        route: window.location.pathname,
        visibleTargets: typeof window.get_visible_smoke_targets === "function" ? window.get_visible_smoke_targets() : null,
        projectedTarget:
          payload && typeof window.project_map_target_for_smoke === "function"
            ? window.project_map_target_for_smoke(payload)
            : null,
        frontierMapFieldCommand: window.frontierMapFieldCommand ?? null,
        frontierMapUi: window.frontierMapUi ?? null,
        canvasRect: rect
          ? {
              x: Number(rect.x.toFixed(2)),
              y: Number(rect.y.toFixed(2)),
              width: Number(rect.width.toFixed(2)),
              height: Number(rect.height.toFixed(2)),
            }
          : null,
      };
    }, target)
    .catch(() => ({
      route: null,
      visibleTargets: null,
      projectedTarget: null,
      frontierMapFieldCommand: null,
      frontierMapUi: null,
      canvasRect: null,
    }));

  return {
    ...(baseSnapshot ?? {}),
    ...fieldSnapshot,
    route: fieldSnapshot.route ?? baseSnapshot?.route ?? null,
    frontierMapFieldCommand: fieldSnapshot.frontierMapFieldCommand ?? baseSnapshot?.frontierMapFieldCommand ?? null,
    frontierMapUi: fieldSnapshot.frontierMapUi ?? baseSnapshot?.frontierMapUi ?? null,
  };
}

function formatFieldCommandFailureDump({
  stage,
  target,
  targetSource,
  canvasClickDiagnostics,
  snapshot,
  browserDiagnostics,
}) {
  return JSON.stringify(
    {
      stage,
      route: snapshot?.route ?? null,
      hooks: snapshot?.hooks ?? null,
      targetSource: targetSource ?? null,
      target:
        target == null
          ? null
          : {
              kind: target.kind,
              label: target.label,
              x: target.x,
              y: target.y,
              cityId: target.cityId ?? null,
              poiId: target.poiId ?? null,
            },
      canvasRect: snapshot?.canvasRect ?? null,
      visibleTargets: snapshot?.visibleTargets ?? null,
      projectedTarget: snapshot?.projectedTarget ?? null,
      frontierMapDiagnostics: snapshot?.frontierMapDiagnostics ?? null,
      frontierMapUi: snapshot?.frontierMapUi ?? null,
      frontierMapFieldCommand: snapshot?.frontierMapFieldCommand ?? null,
      frontierLastError: snapshot?.frontierLastError ?? null,
      errorBoundary: snapshot?.errorBoundary ?? null,
      rendered: snapshot?.rendered ?? null,
      canvasClickDiagnostics: canvasClickDiagnostics ?? null,
      browser: summarizeBrowserDiagnostics(browserDiagnostics),
    },
    null,
    2,
  );
}

async function throwFieldCommandDiagnosticsError(
  page,
  browserDiagnostics,
  message,
  { stage, target = null, targetSource = null, canvasClickDiagnostics = null } = {},
) {
  const snapshot = await readFieldCommandSmokeSnapshot(page, target).catch(() => null);
  throw new Error(
    `${message}\n${formatFieldCommandFailureDump({
      stage,
      target,
      targetSource,
      canvasClickDiagnostics,
      snapshot,
      browserDiagnostics,
    })}`,
  );
}

async function focusTargetForCanvasCommand(page, target) {
  let previousProjection = null;
  let stableProjectionCount = 0;

  await page.evaluate((payload) => {
    window.focus_map_target?.(payload);
  }, target);

  return waitFor(async () => {
    const snapshot = await readFieldCommandSmokeSnapshot(page, target);
    if (!snapshot.visibleTargets?.cameraReady || !snapshot.visibleTargets?.projectionReady) {
      previousProjection = null;
      stableProjectionCount = 0;
      return null;
    }
    if (!snapshot.projectedTarget?.withinViewport) {
      previousProjection = null;
      stableProjectionCount = 0;
      return null;
    }

    const currentProjection = snapshot.projectedTarget;
    if (
      previousProjection &&
      Math.abs(previousProjection.canvasX - currentProjection.canvasX) <= 1 &&
      Math.abs(previousProjection.canvasY - currentProjection.canvasY) <= 1 &&
      Math.abs(previousProjection.camera.scrollX - currentProjection.camera.scrollX) <= 1 &&
      Math.abs(previousProjection.camera.scrollY - currentProjection.camera.scrollY) <= 1
    ) {
      stableProjectionCount += 1;
    } else {
      stableProjectionCount = 1;
    }

    previousProjection = currentProjection;
    return stableProjectionCount >= 2 ? snapshot : null;
  }, 6_000, `the camera to focus ${target.label}`, 200);
}

async function waitForFieldCommandOpen(page, targetLabel, timeoutMs, label) {
  return waitFor(async () => {
    const snapshot = await readFieldCommandSmokeSnapshot(page);
    return getFieldCommandLabel(snapshot) === targetLabel ? snapshot : null;
  }, timeoutMs, label, 200).catch(() => null);
}

function buildCanvasClickDiagnostics({
  target,
  targetSource,
  visibleTargets,
  projection,
  canvasRect,
  relativeClick,
  pageClick,
  withinBounds,
  rightClickSent,
  fieldCommandOpened,
  openSource,
  failureReason,
  clickAttempts,
}) {
  return {
    target: {
      kind: target.kind,
      label: target.label,
      x: target.x,
      y: target.y,
      cityId: target.cityId ?? null,
      poiId: target.poiId ?? null,
    },
    targetSource,
    visibleTargets,
    projectedTarget: projection
      ? {
          worldX: projection.worldX,
          worldY: projection.worldY,
          canvasX: projection.canvasX,
          canvasY: projection.canvasY,
          withinViewport: projection.withinViewport,
          viewport: projection.viewport,
          camera: projection.camera,
        }
      : null,
    canvasRect,
    relativeClick,
    pageClick,
    withinBounds,
    rightClickSent,
    fieldCommandOpened,
    openSource,
    failureReason,
    clickAttempts,
  };
}

async function openFieldCommandWithRightClick(page, target, targetSource) {
  const diagnostics = {
    focusAttempted: true,
    focusSucceeded: false,
    canvasFound: false,
    cameraReady: false,
    projectionReady: false,
    withinBounds: false,
    rightClickSent: false,
    fieldCommandOpened: false,
    openSource: null,
    failureReason: null,
    visibleTargets: null,
    canvasRect: null,
    projectedTarget: null,
    relativeClick: null,
    pageClick: null,
    clickAttempts: [],
    clickDiagnostics: null,
  };

  const focusSnapshot = await focusTargetForCanvasCommand(page, target).catch(() => null);
  diagnostics.focusSucceeded = Boolean(focusSnapshot);

  await page.waitForTimeout(450);

  const snapshot = (await readFieldCommandSmokeSnapshot(page, target).catch(() => null)) ?? focusSnapshot;
  diagnostics.visibleTargets = snapshot?.visibleTargets ?? null;
  diagnostics.projectedTarget = snapshot?.projectedTarget ?? null;
  diagnostics.canvasRect = snapshot?.canvasRect ?? null;
  diagnostics.canvasFound = Boolean(snapshot?.canvasRect);
  diagnostics.cameraReady = Boolean(snapshot?.visibleTargets?.cameraReady);
  diagnostics.projectionReady = Boolean(snapshot?.visibleTargets?.projectionReady && snapshot?.projectedTarget);

  if (!snapshot?.canvasRect) {
    diagnostics.failureReason = "canvas-not-found";
    diagnostics.clickDiagnostics = buildCanvasClickDiagnostics({
      target,
      targetSource,
      visibleTargets: diagnostics.visibleTargets,
      projection: diagnostics.projectedTarget,
      canvasRect: null,
      relativeClick: null,
      pageClick: null,
      withinBounds: false,
      rightClickSent: false,
      fieldCommandOpened: false,
      openSource: null,
      failureReason: diagnostics.failureReason,
      clickAttempts: diagnostics.clickAttempts,
    });
    return { success: false, diagnostics, snapshot };
  }

  if (!snapshot.visibleTargets?.cameraReady || !snapshot.visibleTargets?.projectionReady || !snapshot.projectedTarget) {
    diagnostics.failureReason = "camera-not-ready";
    diagnostics.clickDiagnostics = buildCanvasClickDiagnostics({
      target,
      targetSource,
      visibleTargets: diagnostics.visibleTargets,
      projection: diagnostics.projectedTarget,
      canvasRect: diagnostics.canvasRect,
      relativeClick: null,
      pageClick: null,
      withinBounds: false,
      rightClickSent: false,
      fieldCommandOpened: false,
      openSource: null,
      failureReason: diagnostics.failureReason,
      clickAttempts: diagnostics.clickAttempts,
    });
    return { success: false, diagnostics, snapshot };
  }

  const viewportWidth = Math.max(snapshot.projectedTarget.viewport.width, 1);
  const viewportHeight = Math.max(snapshot.projectedTarget.viewport.height, 1);
  const scaleX = snapshot.canvasRect.width / viewportWidth;
  const scaleY = snapshot.canvasRect.height / viewportHeight;
  const relativeClick = {
    x: roundNumber(snapshot.projectedTarget.canvasX * scaleX),
    y: roundNumber(snapshot.projectedTarget.canvasY * scaleY),
  };
  const pageClick = {
    x: roundNumber(snapshot.canvasRect.x + relativeClick.x),
    y: roundNumber(snapshot.canvasRect.y + relativeClick.y),
  };
  const withinBounds =
    snapshot.projectedTarget.withinViewport &&
    relativeClick.x >= 0 &&
    relativeClick.x <= snapshot.canvasRect.width &&
    relativeClick.y >= 0 &&
    relativeClick.y <= snapshot.canvasRect.height;

  diagnostics.relativeClick = relativeClick;
  diagnostics.pageClick = pageClick;
  diagnostics.withinBounds = withinBounds;

  if (!withinBounds) {
    diagnostics.failureReason = "projection-out-of-bounds";
    diagnostics.clickDiagnostics = buildCanvasClickDiagnostics({
      target,
      targetSource,
      visibleTargets: diagnostics.visibleTargets,
      projection: diagnostics.projectedTarget,
      canvasRect: diagnostics.canvasRect,
      relativeClick,
      pageClick,
      withinBounds: false,
      rightClickSent: false,
      fieldCommandOpened: false,
      openSource: null,
      failureReason: diagnostics.failureReason,
      clickAttempts: diagnostics.clickAttempts,
    });
    return { success: false, diagnostics, snapshot };
  }

  const canvasLocator = page.locator("[data-map-canvas] canvas").first();
  await canvasLocator.waitFor({ state: "visible", timeout: 5_000 });
  await armCanvasEventCapture(page);
  await canvasLocator.hover({ position: relativeClick, force: true });

  diagnostics.clickAttempts.push({
    method: "locator-right-click",
    relativeClick,
    pageClick,
  });

  await canvasLocator.click({
    button: "right",
    force: true,
    position: relativeClick,
    timeout: 2_000,
  });
  diagnostics.rightClickSent = true;

  let openedSnapshot = await waitForFieldCommandOpen(
    page,
    target.label,
    1_800,
    "field command sheet after locator right click",
  );

  if (!openedSnapshot) {
    diagnostics.clickAttempts.push({
      method: "page-mouse-right-click",
      relativeClick,
      pageClick,
    });

    await page.mouse.move(pageClick.x, pageClick.y);
    await page.mouse.click(pageClick.x, pageClick.y, { button: "right" });
    openedSnapshot = await waitForFieldCommandOpen(
      page,
      target.label,
      1_800,
      "field command sheet after page-mouse right click",
    );
  }

  if (!openedSnapshot) {
    diagnostics.clickAttempts.push({
      method: "page-mouse-press",
      relativeClick,
      pageClick,
    });

    await page.mouse.move(pageClick.x, pageClick.y);
    await page.mouse.down({ button: "right" });
    await page.waitForTimeout(120);
    await page.mouse.up({ button: "right" });
    openedSnapshot = await waitForFieldCommandOpen(
      page,
      target.label,
      1_800,
      "field command sheet after page-mouse press",
    );
  }

  diagnostics.fieldCommandOpened = Boolean(openedSnapshot);
  diagnostics.openSource = getFieldCommandSource(openedSnapshot);
  diagnostics.canvasDomEvents = await readCanvasEventCapture(page).catch(() => []);

  if (!openedSnapshot) {
    diagnostics.failureReason = "pointer-open-timeout";
    diagnostics.clickDiagnostics = buildCanvasClickDiagnostics({
      target,
      targetSource,
      visibleTargets: diagnostics.visibleTargets,
      projection: diagnostics.projectedTarget,
      canvasRect: diagnostics.canvasRect,
      relativeClick,
      pageClick,
      withinBounds: true,
      rightClickSent: true,
      fieldCommandOpened: false,
      openSource: null,
      failureReason: diagnostics.failureReason,
      clickAttempts: diagnostics.clickAttempts,
    });
    return { success: false, diagnostics, snapshot };
  }

  diagnostics.clickDiagnostics = buildCanvasClickDiagnostics({
    target,
    targetSource,
    visibleTargets: diagnostics.visibleTargets,
    projection: diagnostics.projectedTarget,
    canvasRect: diagnostics.canvasRect,
    relativeClick,
    pageClick,
    withinBounds: true,
    rightClickSent: true,
    fieldCommandOpened: true,
    openSource: diagnostics.openSource,
    failureReason: null,
    clickAttempts: diagnostics.clickAttempts,
  });

  return { success: diagnostics.openSource === "canvas", diagnostics, snapshot: openedSnapshot };
}

async function openFieldCommandWithHook(page, target) {
  const hookReady = await waitFor(async () => {
    const available = await page.evaluate(() => ({
      openMapFieldCommand: typeof window.open_map_field_command === "function",
    }));
    return available.openMapFieldCommand ? true : null;
  }, 5_000, "the field-command hook before automation fallback", 200).catch(() => null);

  if (!hookReady) {
    return null;
  }

  await page.evaluate((payload) => {
    window.open_map_field_command?.(payload);
  }, target);

  await page.waitForTimeout(150);
  const openedSnapshot = await waitForFieldCommandOpen(
    page,
    target.label,
    3_000,
    "field command sheet after automation hook",
  );
  if (!openedSnapshot) {
    return null;
  }

  const dialog = page.getByRole("dialog", {
    name: new RegExp(`Field Command: ${escapeRegExp(target.label)}`),
  });
  await dialog.waitFor({ timeout: 3_000 });
  return openedSnapshot;
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
    const hookSnapshot = await ensureFieldCommandHook(page);
    const selectedTarget = pickTarget(hookSnapshot.visibleTargets, initialState);

    if (!selectedTarget) {
      await throwFieldCommandDiagnosticsError(
        page,
        browserDiagnostics,
        "No visible POI or enemy city was available for the field-command scenario.",
        { stage: "target-selection" },
      );
    }

    const targetPayload = selectedTarget.payload;
    const initialVisibleTargets = hookSnapshot.visibleTargets;

    const rightClickResult = await openFieldCommandWithRightClick(page, targetPayload, selectedTarget.source);
    const initialInteractionSnapshot = rightClickResult.snapshot
      ? await readFieldCommandSmokeSnapshot(page, targetPayload).catch(() => rightClickResult.snapshot)
      : null;

    let interactionMode = rightClickResult.success ? "canvas-originated" : "automation-hook";
    let openingSnapshot = initialInteractionSnapshot;
    const canvasClickDiagnostics = rightClickResult.diagnostics;

    if (!rightClickResult.success) {
      openingSnapshot = await openFieldCommandWithHook(page, targetPayload);
      if (!openingSnapshot) {
        await throwFieldCommandDiagnosticsError(
          page,
          browserDiagnostics,
          "Field Command did not open via canvas right-click or automation hook.",
          {
            stage: "field-command-open",
            target: targetPayload,
            targetSource: selectedTarget.source,
            canvasClickDiagnostics,
          },
        );
      }
      interactionMode = "automation-hook";
    }

    const fieldCommandDialog = page.getByRole("dialog", {
      name: new RegExp(`Field Command: ${escapeRegExp(targetPayload.label)}`),
    });
    await fieldCommandDialog.waitFor({ timeout: 5_000 });

    let targetTrayValidated = false;
    let postReloadOpenSource = null;
    if (targetPayload.kind !== "TILE") {
      await fieldCommandDialog.locator("footer").getByRole("button", { name: "Open Target" }).click();

      const targetDialog = page.getByRole("dialog", {
        name: new RegExp(`Command Tray: ${escapeRegExp(targetPayload.label)}`),
      });
      await targetDialog.waitFor({ timeout: 5_000 });

      const targetPrimaryActionLabel =
        targetPayload.kind === "POI" && initialState.map.pois.some((poi) => poi.id === targetPayload.poiId && poi.kind === "BARBARIAN_CAMP")
          ? "Attack Camp"
          : targetPayload.kind === "POI"
            ? "Gather Here"
            : "Attack City";
      await waitForTargetAction(page, targetPayload.label, targetPrimaryActionLabel);
      await targetDialog.getByRole("button", { name: targetPrimaryActionLabel }).waitFor({ timeout: 5_000 });
      targetTrayValidated = true;

      await targetDialog.getByRole("button", { name: "Close" }).click();
      await targetDialog.waitFor({ state: "hidden", timeout: 5_000 });

      await page.reload({ waitUntil: "networkidle" });
      await ensureMapLoaded(page, browserDiagnostics);
      await ensureAllianceReady(page);
      await ensureFieldCommandHook(page);
      const reopenedSnapshot = await openFieldCommandWithHook(page, targetPayload);
      if (!reopenedSnapshot) {
        await throwFieldCommandDiagnosticsError(
          page,
          browserDiagnostics,
          "Field Command did not reopen after target-tray validation.",
          {
            stage: "field-command-reopen",
            target: targetPayload,
            targetSource: selectedTarget.source,
            canvasClickDiagnostics,
          },
        );
      }
      postReloadOpenSource = getFieldCommandSource(reopenedSnapshot);
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
      await throwFieldCommandDiagnosticsError(
        page,
        browserDiagnostics,
        "Expected the field marker to have an expiration timestamp.",
        {
          stage: "marker-validation",
          target: targetPayload,
          targetSource: selectedTarget.source,
          canvasClickDiagnostics,
        },
      );
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

    const completionSnapshot = await readFieldCommandSmokeSnapshot(page, targetPayload);
    const initialOpenSource = interactionMode === "canvas-originated" ? "canvas" : getFieldCommandSource(openingSnapshot);

    console.log(
      JSON.stringify(
        {
          ok: true,
          screenshot: args.screenshotPath,
          currentRoute: completionSnapshot.route,
          interactionMode,
          initialFieldCommandOpenSource: initialOpenSource,
          postReloadOpenSource,
          fallbackReason: interactionMode === "automation-hook" ? canvasClickDiagnostics.failureReason : null,
          targetSource: selectedTarget.source,
          chosenTarget: {
            kind: targetPayload.kind,
            label: targetPayload.label,
            x: targetPayload.x,
            y: targetPayload.y,
            cityId: targetPayload.cityId ?? null,
            poiId: targetPayload.poiId ?? null,
          },
          visibleTargets: initialVisibleTargets,
          projectedTarget: canvasClickDiagnostics.projectedTarget,
          canvasRect: canvasClickDiagnostics.canvasRect,
          cameraState: canvasClickDiagnostics.projectedTarget?.camera ?? initialVisibleTargets?.camera ?? null,
          canvasClickDiagnostics,
          frontierMapUi: completionSnapshot.frontierMapUi,
          frontierMapFieldCommand: completionSnapshot.frontierMapFieldCommand,
          targetTrayValidated,
          marker: createdMarker,
          browser: summarizeBrowserDiagnostics(browserDiagnostics),
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
