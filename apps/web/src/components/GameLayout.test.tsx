// @vitest-environment jsdom

import type { GameStateResponse, PublicBootstrapResponse } from "@frontier/shared";
import { QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";

vi.mock("../api", () => {
  class MockApiClientError extends Error {
    status: number;

    details: string[];

    constructor(message = "API error", status = 500, details: string[] = []) {
      super(message);
      this.status = status;
      this.details = details;
    }
  }

  return {
    ApiClientError: MockApiClientError,
    api: {
      session: vi.fn(),
      gameState: vi.fn(),
      mailbox: vi.fn(),
      storeCatalog: vi.fn(),
      entitlements: vi.fn(),
      logout: vi.fn(),
      startUpgrade: vi.fn(),
      trainTroops: vi.fn(),
      startResearch: vi.fn(),
      createMarch: vi.fn(),
      recallMarch: vi.fn(),
      upgradeCommander: vi.fn(),
      claimMailbox: vi.fn(),
    },
  };
});

vi.mock("../lib/bootstrap", () => ({
  getLaunchPhaseLabel: vi.fn((bootstrap: PublicBootstrapResponse | undefined) =>
    bootstrap?.launchPhase === "closed_alpha" ? "Closed Alpha" : "Public Build",
  ),
  usePublicBootstrap: vi.fn(),
}));

vi.mock("../lib/analytics", () => ({
  trackAnalyticsEvent: vi.fn(),
  trackAnalyticsOnce: vi.fn(),
}));

vi.mock("./ThemeProvider", () => ({
  useTheme: vi.fn(() => ({
    mode: "night",
    setMode: vi.fn(),
  })),
}));

import { api } from "../api";
import { usePublicBootstrap } from "../lib/bootstrap";
import { cleanupRendered, createTestQueryClient, flushUi, renderInDom } from "../test/testHarness";
import { GameLayout } from "./GameLayout";

const baseState: GameStateResponse = {
  player: {
    id: "player-alpha",
    username: "demo_smoke",
    cityId: "city-alpha",
    cityName: "Aurelian Hold",
  },
  city: {
    cityId: "city-alpha",
    cityName: "Aurelian Hold",
    coordinates: { x: 18, y: 22 },
    resources: {
      wood: 1200,
      stone: 940,
      food: 1500,
      gold: 310,
    },
    resourcesUpdatedAt: "2026-04-01T10:00:00.000Z",
    buildings: [],
    activeUpgrade: null,
    activeTraining: null,
    activeResearch: null,
    activeMarches: [],
    troops: [
      {
        type: "INFANTRY",
        label: "Infantry",
        quantity: 18,
        attack: 12,
        defense: 16,
        speed: 1,
        carry: 2,
        trainingCost: { wood: 12, stone: 6, food: 10, gold: 0 },
        trainingDurationSeconds: 60,
      },
      {
        type: "ARCHER",
        label: "Archer",
        quantity: 12,
        attack: 14,
        defense: 9,
        speed: 1.1,
        carry: 2,
        trainingCost: { wood: 14, stone: 4, food: 9, gold: 0 },
        trainingDurationSeconds: 60,
      },
      {
        type: "CAVALRY",
        label: "Cavalry",
        quantity: 8,
        attack: 16,
        defense: 10,
        speed: 1.3,
        carry: 2,
        trainingCost: { wood: 18, stone: 8, food: 12, gold: 2 },
        trainingDurationSeconds: 75,
      },
    ],
    commanders: [
      {
        id: "commander-1",
        name: "Aurelia",
        templateKey: "aurelia",
        level: 12,
        xp: 1200,
        xpToNextLevel: 2400,
        starLevel: 4,
        talentTrack: "GATHERING",
        talentPointsSpent: 12,
        assignedSkills: [],
        assignedPreset: null,
        attackBonusPct: 12,
        defenseBonusPct: 10,
        marchSpeedBonusPct: 6,
        carryBonusPct: 8,
        isPrimary: true,
      },
    ],
    research: [
      {
        type: "LOGISTICS",
        label: "Logistics",
        description: "Improve march readiness.",
        level: 3,
        nextLevel: 4,
        maxLevel: 10,
        startCost: { wood: 200, stone: 120, food: 160, gold: 24 },
        durationSeconds: 180,
        isActive: false,
      },
      {
        type: "MILITARY_DRILL",
        label: "Military Drill",
        description: "Improve troop handling.",
        level: 2,
        nextLevel: 3,
        maxLevel: 10,
        startCost: { wood: 220, stone: 130, food: 170, gold: 28 },
        durationSeconds: 210,
        isActive: false,
      },
    ],
    peaceShieldUntil: null,
    openMarchCount: 2,
    visionRadius: 8,
    attackPower: 420,
    defensePower: 395,
    woundedTroops: { INFANTRY: 0, ARCHER: 0, CAVALRY: 0 },
    hospitalHealingCapacity: 0,
  },
  alliance: {
    id: "alliance-1",
    name: "Frontier Dawn",
    tag: "FDN",
    description: "Closed-alpha house",
    role: "LEADER",
    memberCount: 12,
    treasury: {
      wood: 5200,
      stone: 4100,
      food: 5600,
      gold: 980,
    },
  },
};

const sessionResponse = {
  user: {
    id: "player-alpha",
    username: "demo_smoke",
    cityId: "city-alpha",
    cityName: "Aurelian Hold",
  },
};

const mailboxResponse = {
  unreadCount: 2,
  entries: [],
};

const storeCatalogResponse = {
  catalog: {
    products: [],
    offers: [],
  },
};

const entitlementsResponse = {
  entitlements: [],
};

function makeBootstrap(overrides: Partial<PublicBootstrapResponse>): PublicBootstrapResponse {
  return {
    launchPhase: "closed_alpha",
    registrationMode: "login_only",
    storeEnabled: false,
    ...overrides,
  };
}

async function waitForRender(check: () => boolean, label: string) {
  const deadline = Date.now() + 3_000;
  while (Date.now() < deadline) {
    await flushUi();
    if (check()) {
      return;
    }
  }

  throw new Error(`Timed out while waiting for ${label}.`);
}

async function renderLayout(bootstrap: PublicBootstrapResponse) {
  const client = createTestQueryClient();
  vi.mocked(usePublicBootstrap).mockReturnValue({
    data: bootstrap,
    isPending: false,
    isError: false,
    error: null,
  } as never);
  vi.mocked(api.session).mockResolvedValue(sessionResponse as never);
  vi.mocked(api.gameState).mockResolvedValue(baseState as never);
  vi.mocked(api.mailbox).mockResolvedValue(mailboxResponse as never);
  vi.mocked(api.storeCatalog).mockResolvedValue(storeCatalogResponse as never);
  vi.mocked(api.entitlements).mockResolvedValue(entitlementsResponse as never);

  return renderInDom(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/app/dashboard"]}>
        <Routes>
          <Route path="/app" element={<GameLayout />}>
            <Route path="dashboard" element={<div>Dashboard body</div>} />
          </Route>
          <Route path="/login" element={<div>Login page</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("GameLayout release guards", () => {
  let view: Awaited<ReturnType<typeof renderLayout>> | null = null;

  beforeEach(() => {
    vi.stubGlobal(
      "WebSocket",
      class {
        addEventListener() {
          return undefined;
        }

        close() {
          return undefined;
        }
      },
    );
    vi.stubGlobal("__APP_VERSION__", "test-build");
  });

  afterEach(async () => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
    await cleanupRendered(view);
    view = null;
  });

  it("keeps market navigation hidden in closed alpha while showing release metadata", async () => {
    view = await renderLayout(makeBootstrap({ storeEnabled: false, launchPhase: "closed_alpha" }));
    await waitForRender(() => view?.container.textContent?.includes("Sovereign Archive") ?? false, "the shell to render");

    expect(view.container.querySelector("[data-release-badge]")?.textContent).toContain("Closed Alpha");
    expect(view.container.querySelector("[data-version-stamp]")?.textContent).toContain("vtest-build");
    expect(view.container.querySelector("[data-nav-item='map']")?.textContent).toContain("Strategic Map");
    expect(view.container.querySelector("[data-archive-item='messages']")?.textContent).toContain("Message Center");
    expect(view.container.querySelector("[data-archive-item='market']")).toBeNull();
  });

  it("restores market archive navigation when commerce flags are enabled", async () => {
    view = await renderLayout(makeBootstrap({ launchPhase: "public", registrationMode: "open", storeEnabled: true }));
    await waitForRender(
      () => view?.container.querySelector("[data-archive-item='market']") !== null,
      "the market archive link to render",
    );

    expect(view.container.querySelector("[data-release-badge]")?.textContent).toContain("Public Build");
    expect(view.container.querySelector("[data-archive-item='market']")?.textContent).toContain("Imperial Market");
  });
});
