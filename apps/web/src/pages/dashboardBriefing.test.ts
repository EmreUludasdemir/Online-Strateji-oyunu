import type { GameStateResponse, LiveEventView, MailboxEntryView, TaskView } from "@frontier/shared";
import { describe, expect, it } from "vitest";

import { buildDashboardBriefing } from "./dashboardBriefing";

function makeState(overrides?: Partial<GameStateResponse["city"]> & { alliance?: GameStateResponse["alliance"] }) {
  const { alliance, ...cityOverrides } = overrides ?? {};

  return {
    player: {
      id: "player-1",
      username: "demo_alpha",
      cityId: "city-1",
      cityName: "Ironvein",
    },
    city: {
      cityId: "city-1",
      cityName: "Ironvein",
      coordinates: { x: 28, y: 32 },
      resources: {
        wood: 1200,
        stone: 1100,
        food: 1400,
        gold: 260,
      },
      resourcesUpdatedAt: "2026-04-20T08:00:00.000Z",
      buildings: [
        {
          type: "TOWN_HALL",
          label: "Town Hall",
          description: "Capital district.",
          level: 5,
          nextLevel: 6,
          upgradeCost: { wood: 100, stone: 90, food: 80, gold: 10 },
          upgradeDurationSeconds: 60,
          isUpgradeActive: false,
        },
        {
          type: "BARRACKS",
          label: "Barracks",
          description: "Troop training center.",
          level: 4,
          nextLevel: 5,
          upgradeCost: { wood: 90, stone: 80, food: 70, gold: 8 },
          upgradeDurationSeconds: 60,
          isUpgradeActive: false,
        },
        {
          type: "ACADEMY",
          label: "Academy",
          description: "Doctrine hall.",
          level: 4,
          nextLevel: 5,
          upgradeCost: { wood: 90, stone: 80, food: 70, gold: 8 },
          upgradeDurationSeconds: 60,
          isUpgradeActive: false,
        },
      ],
      activeUpgrade: null,
      activeTraining: null,
      activeResearch: null,
      troops: [
        {
          type: "INFANTRY",
          label: "Infantry",
          quantity: 18,
          attack: 12,
          defense: 14,
          speed: 1,
          carry: 2,
          trainingCost: { wood: 12, stone: 8, food: 10, gold: 0 },
          trainingDurationSeconds: 60,
        },
      ],
      woundedTroops: {
        INFANTRY: 0,
        ARCHER: 0,
        CAVALRY: 0,
      },
      commanders: [],
      research: [
        {
          type: "LOGISTICS",
          label: "Logistics",
          description: "Improve march tempo.",
          level: 2,
          nextLevel: 3,
          maxLevel: 10,
          startCost: { wood: 120, stone: 90, food: 100, gold: 10 },
          durationSeconds: 90,
          isActive: false,
        },
      ],
      activeMarches: [],
      openMarchCount: 0,
      visionRadius: 7,
      attackPower: 320,
      defensePower: 300,
      hospitalHealingCapacity: 0,
      peaceShieldUntil: null,
      ...cityOverrides,
    },
    alliance: alliance === undefined ? {
      id: "alliance-1",
      name: "Frontier Dawn",
      tag: "FDN",
      description: "Alpha alliance",
      role: "MEMBER",
      memberCount: 14,
      treasury: {
        wood: 0,
        stone: 0,
        food: 0,
        gold: 0,
      },
    } : alliance,
  } as GameStateResponse;
}

function makeTask(overrides?: Partial<TaskView>): TaskView {
  return {
    id: "task-1",
    taskKey: "tutorial_upgrade",
    kind: "TUTORIAL",
    title: "Raise the Town Hall",
    description: "Upgrade the Town Hall once.",
    progress: 1,
    target: 1,
    isCompleted: true,
    isClaimed: false,
    reward: {
      resources: { wood: 120, stone: 80, food: 60, gold: 0 },
      items: [],
      commanderXp: 0,
      seasonPassXp: 20,
    },
    completedAt: "2026-04-20T08:10:00.000Z",
    claimedAt: null,
    ...overrides,
  };
}

function makeMailbox(overrides?: Partial<MailboxEntryView>): MailboxEntryView {
  return {
    id: "mailbox-1",
    kind: "SYSTEM_REWARD",
    title: "Alpha Supply Cache",
    body: "Claim the daily cache.",
    createdAt: "2026-04-20T08:00:00.000Z",
    claimedAt: null,
    canClaim: true,
    reward: {
      resources: { wood: 80, stone: 40, food: 60, gold: 10 },
      items: [],
      commanderXp: 0,
      seasonPassXp: 10,
    },
    scoutReport: null,
    ...overrides,
  };
}

function makeEvent(overrides?: Partial<LiveEventView>): LiveEventView {
  return {
    eventKey: "BARBARIAN_HUNT",
    label: "Field Sortie",
    description: "Complete marches on the frontier.",
    score: 70,
    target: 100,
    reward: {
      resources: { wood: 100, stone: 0, food: 100, gold: 0 },
      items: [],
      commanderXp: 0,
      seasonPassXp: 50,
    },
    ...overrides,
  };
}

describe("buildDashboardBriefing", () => {
  it("prioritizes earned rewards before setup actions", () => {
    const result = buildDashboardBriefing({
      state: makeState(),
      tutorialTasks: [makeTask()],
      dailyTasks: [],
      mailboxEntries: [makeMailbox()],
      unreadMailboxCount: 2,
      liveEvents: [makeEvent()],
    });

    expect(result.badgeLabel).toBe("Harvest window");
    expect(result.actions.map((action) => action.command.type)).toEqual([
      "claim_mailbox",
      "claim_task",
      "upgrade",
      "train",
    ]);
    expect(result.stats.find((entry) => entry.id === "claimables")?.value).toBe("2");
  });

  it("surfaces live-ops and social follow-up when queues are already moving", () => {
    const result = buildDashboardBriefing({
      state: makeState({
        activeUpgrade: {
          id: "upgrade-1",
          buildingType: "TOWN_HALL",
          startedAt: "2026-04-20T08:00:00.000Z",
          completesAt: "2026-04-20T08:10:00.000Z",
          toLevel: 6,
          remainingSeconds: 240,
        },
        activeTraining: {
          id: "train-1",
          troopType: "INFANTRY",
          quantity: 12,
          startedAt: "2026-04-20T08:00:00.000Z",
          completesAt: "2026-04-20T08:10:00.000Z",
          remainingSeconds: 240,
          totalCost: { wood: 120, stone: 80, food: 100, gold: 0 },
        },
        activeResearch: {
          id: "research-1",
          researchType: "LOGISTICS",
          startedAt: "2026-04-20T08:00:00.000Z",
          completesAt: "2026-04-20T08:10:00.000Z",
          toLevel: 3,
          remainingSeconds: 240,
        },
        alliance: null,
      }),
      tutorialTasks: [],
      dailyTasks: [],
      mailboxEntries: [],
      unreadMailboxCount: 0,
      liveEvents: [makeEvent({ score: 90, target: 100 })],
    });

    expect(result.badgeLabel).toBe("Pressure window");
    expect(result.actions.map((action) => action.id)).toContain("event-BARBARIAN_HUNT");
    expect(result.actions.map((action) => action.id)).toContain("join-alliance");
    expect(result.stats.find((entry) => entry.id === "alliance-pulse")?.value).toBe("Independent");
  });
});
