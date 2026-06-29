// @vitest-environment jsdom

import { afterEach, describe, expect, it } from "vitest";

import {
  completeTutorialRequirement,
  completeTutorialStep,
  createTutorialState,
  getCurrentTutorialStep,
  getSavedTutorialState,
  getTutorialAdvisorMessage,
  getTutorialHighlightTarget,
  getTutorialProgressPercent,
  getTutorialStorageKey,
  normalizeTutorialState,
  resetTutorialState,
  saveTutorialState,
  shouldHighlightTutorialTarget,
  skipTutorialState,
  TUTORIAL_STEPS,
} from "./tutorialFlow";
import type { TutorialState } from "./tutorialFlow";

afterEach(() => {
  localStorage.removeItem(getTutorialStorageKey());
});

describe("tutorialFlow", () => {
  it("creates the first-time tutorial state", () => {
    const state = createTutorialState("2026-06-29T00:00:00.000Z");

    expect(state.currentStepId).toBe("welcome");
    expect(state.completedStepIds).toEqual([]);
    expect(state.isSkipped).toBe(false);
    expect(state.isPaused).toBe(false);
    expect(getCurrentTutorialStep(state).title).toBe("Başlangıç Buyruğu");
  });

  it("progresses manual steps in order", () => {
    const started = createTutorialState("2026-06-29T00:00:00.000Z");
    const afterWelcome = completeTutorialStep(started, "welcome", "2026-06-29T00:01:00.000Z");
    const afterResources = completeTutorialStep(afterWelcome, "resource_bar", "2026-06-29T00:02:00.000Z");

    expect(afterWelcome.currentStepId).toBe("resource_bar");
    expect(afterResources.currentStepId).toBe("open_city");
    expect(afterResources.completedStepIds).toEqual(["welcome", "resource_bar"]);
    expect(getTutorialProgressPercent(afterResources)).toBeGreaterThan(0);
  });

  it("completes route requirements only on the required route", () => {
    const state: TutorialState = {
      ...createTutorialState("2026-06-29T00:00:00.000Z"),
      currentStepId: "open_city",
      completedStepIds: ["welcome", "resource_bar"],
    };

    const wrongRoute = completeTutorialRequirement(state, "visit_route", { route: "/app/map" });
    const rightRoute = completeTutorialRequirement(state, "visit_route", { route: "/app/city" });

    expect(wrongRoute.currentStepId).toBe("open_city");
    expect(rightRoute.currentStepId).toBe("upgrade_townhall");
  });

  it("completes action requirements only for the active action type", () => {
    const state: TutorialState = {
      ...createTutorialState("2026-06-29T00:00:00.000Z"),
      currentStepId: "upgrade_townhall",
      completedStepIds: ["welcome", "resource_bar", "open_city"],
    };

    const wrongAction = completeTutorialRequirement(state, "training_started", { targetId: "INFANTRY" });
    const rightAction = completeTutorialRequirement(state, "upgrade_started", { targetId: "TOWN_HALL" });

    expect(wrongAction.currentStepId).toBe("upgrade_townhall");
    expect(rightAction.currentStepId).toBe("open_army");
  });

  it("supports skip behavior without losing current progress", () => {
    const state = completeTutorialStep(createTutorialState(), "welcome");
    const skipped = skipTutorialState(state);

    expect(skipped.isSkipped).toBe(true);
    expect(skipped.currentStepId).toBe("resource_bar");
  });

  it("persists, restores, and resets tutorial state from localStorage", () => {
    const state = completeTutorialStep(createTutorialState("2026-06-29T00:00:00.000Z"), "welcome");
    saveTutorialState(state);

    expect(getSavedTutorialState().currentStepId).toBe("resource_bar");

    const reset = resetTutorialState("2026-06-29T00:10:00.000Z");
    expect(reset.currentStepId).toBe("welcome");
    expect(getSavedTutorialState().currentStepId).toBe("welcome");
  });

  it("migrates legacy tutorial state ids", () => {
    const state = normalizeTutorialState({ currentStepId: "navigate_map", isSkipped: false });

    expect(state.currentStepId).toBe("open_map");
    expect(state.version).toBe(2);
  });

  it("selects advisor and highlight target for active steps", () => {
    const state = {
      ...createTutorialState("2026-06-29T00:00:00.000Z"),
      currentStepId: "resource_bar" as const,
    };

    expect(getTutorialAdvisorMessage(state).speaker).toBe("divan");
    expect(getTutorialHighlightTarget(state)?.id).toBe("tutorial-target-resource-bar");
    expect(shouldHighlightTutorialTarget(state, "tutorial-target-resource-bar")).toBe(true);
    expect(TUTORIAL_STEPS.resource_bar.targetElementId).toBe("tutorial-target-resource-bar");
  });
});
