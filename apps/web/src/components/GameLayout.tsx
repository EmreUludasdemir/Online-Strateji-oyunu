import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  AllianceStateResponse,
  BuildingType,
  EntitlementsResponse,
  GameStateResponse,
  ResearchType,
  StoreCatalogResponse,
  TroopStock,
  TroopType,
  WorldChunkResponse,
} from "@frontier/shared";
import { useCallback, useEffect, useMemo, useState } from "react";
import { NavLink, Navigate, Outlet, useLocation, useNavigate, useOutletContext } from "react-router-dom";

import { api, ApiClientError } from "../api";
import type { CreateMarchPayload } from "../api";
import { trackAnalyticsEvent, trackAnalyticsOnce } from "../lib/analytics";
import { formatNumber } from "../lib/formatters";
import { copy } from "../lib/i18n";
import { getInvalidationKeys, getSocketToast, parseSocketEvent } from "../lib/socketEvents";
import type { ActiveMapChunkMeta, MapCameraState } from "./worldMapShared";
import styles from "./GameLayoutShell.module.css";
import { MobileBottomNav } from "./hud/MobileBottomNav";
import { QuickActions } from "./hud/QuickActions";
import { TopHud, type QueueSummaryItem } from "./hud/TopHud";
import { Badge } from "./ui/Badge";
import { BottomSheet } from "./ui/BottomSheet";
import { Button } from "./ui/Button";
import { InboxDrawer } from "./ui/InboxDrawer";
import { SectionCard } from "./ui/SectionCard";
import { ToastStack, type ToastItem } from "./ui/ToastStack";

interface HudState {
  activeRoute: "dashboard" | "map" | "reports" | "alliance";
  queueItems: QueueSummaryItem[];
}

export interface GameLayoutContext {
  state: GameStateResponse;
  hud: HudState;
  notifications: {
    unreadMailboxCount: number;
    toastCount: number;
  };
  selectedCityId: string | null;
  selectedPoiId: string | null;
  selectCity: (cityId: string | null) => void;
  selectPoi: (poiId: string | null) => void;
  upgrade: (buildingType: BuildingType) => Promise<void>;
  train: (troopType: TroopType, quantity: number) => Promise<void>;
  research: (researchType: ResearchType) => Promise<void>;
  sendMarch: (payload: CreateMarchPayload) => Promise<void>;
  recallMarch: (marchId: string) => Promise<void>;
  isUpgrading: boolean;
  isTraining: boolean;
  isResearching: boolean;
  isSendingMarch: boolean;
  isRecallingMarch: boolean;
  openInbox: () => void;
  openStorePreview: () => void;
  openCommanderPanel: (commanderId?: string) => void;
}

declare global {
  interface Window {
    render_game_to_text?: () => string;
    advanceTime?: (ms: number) => void;
    select_map_city?: (cityId: string | null) => void;
    select_map_poi?: (poiId: string | null) => void;
    open_map_field_command?: (command: {
      kind?: "TILE" | "CITY" | "POI";
      label?: string;
      x: number;
      y: number;
      cityId?: string;
      poiId?: string;
    }) => void;
    frontierMapCamera?: MapCameraState | null;
    frontierActiveChunk?: ActiveMapChunkMeta | null;
    frontierMapFieldCommand?: {
      kind: string;
      label: string;
      x: number;
      y: number;
    } | null;
  }
}

function getHudRoute(pathname: string): HudState["activeRoute"] {
  if (pathname.includes("/map")) {
    return "map";
  }
  if (pathname.includes("/reports")) {
    return "reports";
  }
  if (pathname.includes("/alliance")) {
    return "alliance";
  }
  return "dashboard";
}

function createQueueItems(state: GameStateResponse["city"]): QueueSummaryItem[] {
  return [
    state.activeUpgrade
      ? {
          id: "upgrade",
          label: "Build",
          value: `L${state.activeUpgrade.toLevel}`,
          hint: `${state.activeUpgrade.buildingType.replaceAll("_", " ")} upgrade running`,
        }
      : {
          id: "upgrade",
          label: "Build",
          value: "Idle",
          hint: "Ready for the next district upgrade",
        },
    state.activeTraining
      ? {
          id: "training",
          label: "Barracks",
          value: `${formatNumber(state.activeTraining.quantity)}`,
          hint: `${state.activeTraining.troopType.toLowerCase()} training`,
        }
      : {
          id: "training",
          label: "Barracks",
          value: "Ready",
          hint: "Open for a new training order",
        },
    state.activeResearch
      ? {
          id: "research",
          label: "Academy",
          value: `L${state.activeResearch.toLevel}`,
          hint: state.activeResearch.researchType.replaceAll("_", " ").toLowerCase(),
        }
      : {
          id: "research",
          label: "Marches",
          value: formatNumber(state.openMarchCount),
          hint: "Open march count",
        },
  ];
}

function useSocketNotifications(enabled: boolean, onToast: (toast: Omit<ToastItem, "id">) => void): void {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!enabled) {
      return undefined;
    }

    const protocol = window.location.protocol === "https:" ? "wss" : "ws";
    let socket: WebSocket | null = null;
    const timer = window.setTimeout(() => {
      socket = new WebSocket(`${protocol}://${window.location.hostname}:3101/ws`);

      socket.addEventListener("message", (event) => {
        const parsed = parseSocketEvent(JSON.parse(event.data) as unknown);
        if (!parsed) {
          console.warn("Unknown socket event payload", event.data);
          return;
        }

        for (const queryKey of getInvalidationKeys(parsed.type)) {
          queryClient.invalidateQueries({ queryKey });
        }

        if (parsed.type === "research.completed") {
          trackAnalyticsEvent("research_completed");
        }

        const toast = getSocketToast(parsed.type);
        if (toast) {
          onToast(toast);
        }
      });
    }, 300);

    return () => {
      window.clearTimeout(timer);
      socket?.close();
    };
  }, [enabled, onToast, queryClient]);
}

export function GameLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [selectedCityId, setSelectedCityId] = useState<string | null>(null);
  const [selectedPoiId, setSelectedPoiId] = useState<string | null>(null);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [inboxOpen, setInboxOpen] = useState(false);
  const [storePreviewOpen, setStorePreviewOpen] = useState(false);
  const [commanderPanelOpen, setCommanderPanelOpen] = useState(false);
  const [commanderPanelId, setCommanderPanelId] = useState<string | null>(null);
  const enqueueToast = useCallback((toast: Omit<ToastItem, "id">) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    setToasts((current) => [...current.slice(-3), { id, ...toast }]);
  }, []);
  const dismissToast = useCallback((toastId: string) => {
    setToasts((current) => current.filter((toast) => toast.id !== toastId));
  }, []);
  const selectCity = useCallback((cityId: string | null) => {
    setSelectedCityId(cityId);
    setSelectedPoiId(null);
  }, []);
  const selectPoi = useCallback((poiId: string | null) => {
    setSelectedPoiId(poiId);
    setSelectedCityId(null);
  }, []);

  const sessionQuery = useQuery({
    queryKey: ["session"],
    queryFn: api.session,
    retry: false,
  });

  const stateQuery = useQuery({
    queryKey: ["game-state"],
    queryFn: api.gameState,
    enabled: Boolean(sessionQuery.data?.user),
    refetchInterval: 10_000,
  });

  const mailboxQuery = useQuery({
    queryKey: ["mailbox"],
    queryFn: api.mailbox,
    enabled: Boolean(sessionQuery.data?.user),
  });

  const storeCatalogQuery = useQuery({
    queryKey: ["store-catalog"],
    queryFn: api.storeCatalog,
    enabled: Boolean(sessionQuery.data?.user),
  });

  const entitlementsQuery = useQuery({
    queryKey: ["entitlements"],
    queryFn: api.entitlements,
    enabled: Boolean(sessionQuery.data?.user),
  });

  const logoutMutation = useMutation({
    mutationFn: api.logout,
    onSuccess: async () => {
      queryClient.clear();
      navigate("/login", { replace: true });
    },
  });

  const upgradeMutation = useMutation({
    mutationFn: (buildingType: BuildingType) => api.startUpgrade(buildingType),
    onSuccess: async (_response, buildingType) => {
      await queryClient.invalidateQueries({ queryKey: ["game-state"] });
      if (stateQuery.data?.player.id) {
        trackAnalyticsOnce(`first_upgrade:${stateQuery.data.player.id}`, "first_upgrade", {
          buildingType,
        });
      }
      enqueueToast({
        tone: "success",
        title: "Upgrade Started",
        body: "A new build order has been placed in the city queue.",
      });
    },
  });

  const trainMutation = useMutation({
    mutationFn: (payload: { troopType: TroopType; quantity: number }) => api.trainTroops(payload),
    onSuccess: async (_response, payload) => {
      await queryClient.invalidateQueries({ queryKey: ["game-state"] });
      if (stateQuery.data?.player.id) {
        trackAnalyticsOnce(`first_troop_train:${stateQuery.data.player.id}`, "first_troop_train", {
          troopType: payload.troopType,
          quantity: payload.quantity,
        });
      }
      enqueueToast({
        tone: "success",
        title: "Training Queued",
        body: "New troops have been entered into the barracks queue.",
      });
    },
  });

  const researchMutation = useMutation({
    mutationFn: (payload: { researchType: ResearchType }) => api.startResearch(payload),
    onSuccess: async (_response, payload) => {
      await queryClient.invalidateQueries({ queryKey: ["game-state"] });
      await queryClient.invalidateQueries({ queryKey: ["world-chunk"] });
      trackAnalyticsEvent("research_started", {
        researchType: payload.researchType,
      });
      enqueueToast({
        tone: "info",
        title: "Research Started",
        body: "The academy has started a new doctrine study.",
      });
    },
  });

  const marchMutation = useMutation({
    mutationFn: (payload: CreateMarchPayload) => api.createMarch(payload),
    onSuccess: async ({ march }, payload) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["game-state"] }),
        queryClient.invalidateQueries({ queryKey: ["world-chunk"] }),
      ]);
      if (stateQuery.data?.player.id) {
        trackAnalyticsOnce(`first_march:${stateQuery.data.player.id}`, "first_march", {
          objective: march.objective,
          targetType: "targetCityId" in payload ? "CITY" : "POI",
        });
      }
      trackAnalyticsEvent("march_confirmed", {
        objective: march.objective,
        target: march.targetPoiName ?? march.targetCityName ?? "unknown",
      });
      const targetName = march.targetPoiName ?? march.targetCityName ?? "target";
      const missionLabel = march.objective === "RESOURCE_GATHER" ? "Gather March" : "March Dispatched";
      enqueueToast({
        tone: "info",
        title: missionLabel,
        body: `${targetName} departure confirmed. ETA ${march.remainingSeconds}s.`,
      });
    },
  });

  const recallMutation = useMutation({
    mutationFn: (marchId: string) => api.recallMarch(marchId),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["game-state"] }),
        queryClient.invalidateQueries({ queryKey: ["world-chunk"] }),
      ]);
      enqueueToast({
        tone: "warning",
        title: "March Recalled",
        body: "Troops are returning to the city.",
      });
    },
  });

  const upgradeCommanderMutation = useMutation({
    mutationFn: (commanderId: string) => api.upgradeCommander(commanderId),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["game-state"] }),
        queryClient.invalidateQueries({ queryKey: ["commanders"] }),
      ]);
      enqueueToast({
        tone: "success",
        title: "Commander Upgraded",
        body: "Command records have been updated.",
      });
    },
  });

  const claimMailboxMutation = useMutation({
    mutationFn: (mailboxId: string) => api.claimMailbox(mailboxId),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["mailbox"] }),
        queryClient.invalidateQueries({ queryKey: ["inventory"] }),
        queryClient.invalidateQueries({ queryKey: ["game-state"] }),
      ]);
      enqueueToast({
        tone: "success",
        title: "Inbox Reward Claimed",
        body: "Resources and entitlements have been refreshed.",
      });
    },
  });

  useSocketNotifications(Boolean(stateQuery.data), enqueueToast);

  const openInbox = useCallback(() => {
    setInboxOpen(true);
    trackAnalyticsEvent("inbox_opened");
  }, []);

  const openStorePreview = useCallback(() => {
    setStorePreviewOpen(true);
    trackAnalyticsEvent("store_opened");
  }, []);

  const openCommanderPanel = useCallback((commanderId?: string) => {
    setCommanderPanelId(commanderId ?? null);
    setCommanderPanelOpen(true);
  }, []);

  const contextValue = useMemo<GameLayoutContext | null>(() => {
    if (!stateQuery.data) {
      return null;
    }

    return {
      state: stateQuery.data,
      hud: {
        activeRoute: getHudRoute(location.pathname),
        queueItems: createQueueItems(stateQuery.data.city),
      },
      notifications: {
        unreadMailboxCount: mailboxQuery.data?.unreadCount ?? 0,
        toastCount: toasts.length,
      },
      selectedCityId,
      selectedPoiId,
      selectCity,
      selectPoi,
      upgrade: async (buildingType: BuildingType) => {
        await upgradeMutation.mutateAsync(buildingType);
      },
      train: async (troopType: TroopType, quantity: number) => {
        await trainMutation.mutateAsync({ troopType, quantity });
      },
      research: async (researchType: ResearchType) => {
        await researchMutation.mutateAsync({ researchType });
      },
      sendMarch: async (payload) => {
        await marchMutation.mutateAsync(payload);
      },
      recallMarch: async (marchId: string) => {
        await recallMutation.mutateAsync(marchId);
      },
      isUpgrading: upgradeMutation.isPending,
      isTraining: trainMutation.isPending,
      isResearching: researchMutation.isPending,
      isSendingMarch: marchMutation.isPending,
      isRecallingMarch: recallMutation.isPending,
      openInbox,
      openStorePreview,
      openCommanderPanel,
    };
  }, [
    location.pathname,
    mailboxQuery.data?.unreadCount,
    marchMutation,
    openCommanderPanel,
    openInbox,
    openStorePreview,
    recallMutation,
    researchMutation,
    selectCity,
    selectPoi,
    selectedCityId,
    selectedPoiId,
    stateQuery.data,
    toasts.length,
    trainMutation,
    upgradeMutation,
  ]);

  useEffect(() => {
    if (!stateQuery.data) {
      return;
    }

    window.render_game_to_text = () => {
      const cachedChunks = queryClient
        .getQueriesData<WorldChunkResponse>({ queryKey: ["world-chunk"] })
        .map(([, payload]) => payload)
        .filter((payload): payload is WorldChunkResponse => Boolean(payload));
      const activeChunkMeta = window.frontierActiveChunk ?? null;
      const worldChunk =
        (activeChunkMeta
          ? cachedChunks.find(
              (chunk) =>
                chunk.center.x === activeChunkMeta.centerTileX &&
                chunk.center.y === activeChunkMeta.centerTileY &&
                chunk.radius === activeChunkMeta.radius,
            )
          : null) ??
        cachedChunks.at(-1) ??
        null;
      const allianceState = queryClient.getQueryData<AllianceStateResponse>(["alliance-state"]);
      const selectedCity = worldChunk?.cities.find((city) => city.cityId === selectedCityId) ?? null;
      const selectedPoi = worldChunk?.pois.find((poi) => poi.id === selectedPoiId) ?? null;
      const cameraView = window.frontierMapCamera ?? null;
      const fieldCommand = window.frontierMapFieldCommand ?? null;

      return JSON.stringify({
        screen: location.pathname,
        city: {
          name: stateQuery.data.city.cityName,
          coordinates: stateQuery.data.city.coordinates,
          resources: stateQuery.data.city.resources,
          activeUpgrade: stateQuery.data.city.activeUpgrade,
          activeTraining: stateQuery.data.city.activeTraining,
          activeResearch: stateQuery.data.city.activeResearch,
          activeMarches: stateQuery.data.city.activeMarches,
          troops: stateQuery.data.city.troops.map((troop) => ({
            type: troop.type,
            quantity: troop.quantity,
          })),
          commanders: stateQuery.data.city.commanders.map((commander) => ({
            id: commander.id,
            name: commander.name,
            isPrimary: commander.isPrimary,
          })),
          research: stateQuery.data.city.research.map((research) => ({
            type: research.type,
            level: research.level,
            isActive: research.isActive,
          })),
        },
        alliance: {
          summary: stateQuery.data.alliance,
          loaded: Boolean(allianceState),
          name: allianceState?.alliance?.name ?? null,
          tag: allianceState?.alliance?.tag ?? null,
          memberCount: allianceState?.alliance?.memberCount ?? 0,
          openHelpRequests: allianceState?.alliance?.helpRequests.length ?? 0,
          treasury: allianceState?.alliance?.treasury ?? null,
          markers: allianceState?.alliance?.markers ?? [],
        },
        selectedCity,
        selectedPoi,
        map: {
          loaded: Boolean(worldChunk),
          camera: cameraView,
          fieldCommand,
          center: worldChunk?.center,
          radius: worldChunk?.radius ?? null,
          tiles: {
            visible: worldChunk?.tiles.filter((tile) => tile.state === "VISIBLE").length ?? 0,
            discovered: worldChunk?.tiles.filter((tile) => tile.state !== "HIDDEN").length ?? 0,
          },
          cities:
            worldChunk?.cities.map((city) => ({
              cityId: city.cityId,
              ownerName: city.ownerName,
              x: city.x,
              y: city.y,
              fogState: city.fogState,
              canSendMarch: city.canSendMarch,
              isCurrentPlayer: city.isCurrentPlayer,
              battleWindowClosesAt: city.battleWindowClosesAt,
              stagedMarchCount: city.stagedMarchCount,
              projectedOutcome: city.projectedOutcome,
            })) ?? [],
          pois:
            worldChunk?.pois.map((poi) => ({
              id: poi.id,
              kind: poi.kind,
              label: poi.label,
              level: poi.level,
              state: poi.state,
              resourceType: poi.resourceType,
              remainingAmount: poi.remainingAmount,
              fogState: poi.fogState,
              x: poi.x,
              y: poi.y,
              canSendMarch: poi.canSendMarch,
              canGather: poi.canGather,
              occupantMarchId: poi.occupantMarchId,
              projectedOutcome: poi.projectedOutcome,
            })) ?? [],
          marches: worldChunk?.marches ?? [],
          allianceMarkers: allianceState?.alliance?.markers ?? [],
        },
        coordinateSystem: {
          origin: "top-left",
          xAxis: "increases to the right",
          yAxis: "increases downward",
        },
      });
    };

    window.advanceTime = (ms: number) => {
      window.setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ["game-state"] });
        queryClient.invalidateQueries({ queryKey: ["world-chunk"] });
        queryClient.invalidateQueries({ queryKey: ["battle-reports"] });
      }, ms);
    };

    window.select_map_city = (cityId: string | null) => {
      selectCity(cityId);
    };

    window.select_map_poi = (poiId: string | null) => {
      selectPoi(poiId);
    };

    return () => {
      delete window.render_game_to_text;
      delete window.advanceTime;
      delete window.select_map_city;
      delete window.select_map_poi;
      delete window.open_map_field_command;
    };
  }, [location.pathname, queryClient, selectCity, selectPoi, selectedCityId, selectedPoiId, stateQuery.data]);

  useEffect(() => {
    trackAnalyticsEvent("hud_tab_opened", {
      tab: getHudRoute(location.pathname),
    });
  }, [location.pathname]);

  if (sessionQuery.isError) {
    return <div className={styles.feedback}>Session could not be restored.</div>;
  }

  if (sessionQuery.data && !sessionQuery.data.user) {
    return <Navigate to="/login" replace />;
  }

  if (stateQuery.isError) {
    const error = stateQuery.error;
    if (error instanceof ApiClientError && error.status === 401) {
      return <Navigate to="/login" replace />;
    }

    return <div className={styles.feedback}>Game state could not be loaded.</div>;
  }

  if (sessionQuery.isPending || stateQuery.isPending) {
    return <div className={styles.feedback}>Loading HUD...</div>;
  }

  if (!contextValue) {
    return <div className={styles.feedback}>Loading HUD...</div>;
  }

  const resources = [
    { label: copy.resources.wood, value: contextValue.state.city.resources.wood },
    { label: copy.resources.stone, value: contextValue.state.city.resources.stone },
    { label: copy.resources.food, value: contextValue.state.city.resources.food },
    { label: copy.resources.gold, value: contextValue.state.city.resources.gold },
  ];
  const mailboxEntries = mailboxQuery.data?.entries ?? [];
  const storeCatalog = storeCatalogQuery.data?.catalog;
  const entitlements = entitlementsQuery.data?.entitlements ?? [];
  const allianceLabel = contextValue.state.alliance
    ? `[${contextValue.state.alliance.tag}] ${contextValue.state.alliance.name}`
    : "Independent Province";
  const commanders = contextValue.state.city.commanders;
  const focusedCommander =
    commanders.find((commander) => commander.id === commanderPanelId) ?? commanders[0] ?? null;

  return (
    <div className={styles.shell}>
      <aside className={styles.sidebar}>
        <div className={styles.brandCard}>
          <p className={styles.brandKicker}>Frontier Dominion</p>
          <h1 className={styles.brandTitle}>{contextValue.state.city.cityName}</h1>
          <p className={styles.brandMeta}>Governor {contextValue.state.player.username}</p>
          <p className={styles.brandMeta}>{allianceLabel}</p>
        </div>

        <nav className={styles.nav}>
          <NavLink to="/app/dashboard" className={({ isActive }) => (isActive ? styles.navLinkActive : styles.navLink)}>
            {copy.hud.dashboard}
          </NavLink>
          <NavLink to="/app/map" className={({ isActive }) => (isActive ? styles.navLinkActive : styles.navLink)}>
            {copy.hud.map}
          </NavLink>
          <NavLink to="/app/reports" className={({ isActive }) => (isActive ? styles.navLinkActive : styles.navLink)}>
            {copy.hud.reports}
          </NavLink>
          <NavLink to="/app/alliance" className={({ isActive }) => (isActive ? styles.navLinkActive : styles.navLink)}>
            {copy.hud.alliance}
          </NavLink>
        </nav>

        <div className={styles.summaryCard}>
          <p className={styles.brandKicker}>HUD Overview</p>
          <div className={styles.summaryList}>
            <div>
              <span className={styles.summaryLabel}>View Radius</span>
              <strong className={styles.summaryValue}>{formatNumber(contextValue.state.city.visionRadius)} tiles</strong>
            </div>
            <div>
              <span className={styles.summaryLabel}>Marches</span>
              <strong className={styles.summaryValue}>{formatNumber(contextValue.state.city.openMarchCount)}</strong>
            </div>
            <div>
              <span className={styles.summaryLabel}>Inbox</span>
              <strong className={styles.summaryValue}>{formatNumber(mailboxQuery.data?.unreadCount ?? 0)} unread</strong>
            </div>
          </div>
        </div>

        <div className={styles.sidebarFooter}>
          <Button type="button" variant="ghost" onClick={() => logoutMutation.mutate()}>
            Log Out
          </Button>
        </div>
      </aside>

      <div className={styles.main}>
        <TopHud
          resources={resources}
          queueItems={contextValue.hud.queueItems}
          meta={
            <div className={styles.summaryCard}>
              <p className={styles.brandKicker}>Battle Line</p>
              <div className={styles.summaryList}>
                <div>
                  <span className={styles.summaryLabel}>Attack</span>
                  <strong className={styles.summaryValue}>{formatNumber(contextValue.state.city.attackPower)}</strong>
                </div>
                <div>
                  <span className={styles.summaryLabel}>Defense</span>
                  <strong className={styles.summaryValue}>{formatNumber(contextValue.state.city.defensePower)}</strong>
                </div>
              </div>
            </div>
          }
          actions={
            <QuickActions
              onInbox={openInbox}
              onStore={openStorePreview}
              onCommander={() => openCommanderPanel()}
            />
          }
        />

        <main className={styles.content}>
          <Outlet context={contextValue} />
        </main>

        <MobileBottomNav />
      </div>

      <ToastStack toasts={toasts} onDismiss={dismissToast} />

      <InboxDrawer
        open={inboxOpen}
        entries={mailboxEntries}
        unreadCount={mailboxQuery.data?.unreadCount ?? 0}
        onClaim={(mailboxId) => claimMailboxMutation.mutate(mailboxId)}
        onClose={() => setInboxOpen(false)}
      />

      <BottomSheet
        open={commanderPanelOpen}
        title="Command Staff"
        mode="aside"
        onClose={() => setCommanderPanelOpen(false)}
      >
        <div className={styles.sheetGrid}>
          {focusedCommander ? (
            <SectionCard
              kicker="Selected Commander"
              title={`${focusedCommander.name} L${focusedCommander.level}`}
              aside={<Badge tone="warning">{focusedCommander.starLevel} stars</Badge>}
            >
              <div className={styles.sheetList}>
                <div className={styles.sheetRow}>
                  <span className={styles.sheetMeta}>XP</span>
                  <strong>{formatNumber(focusedCommander.xp)} / {formatNumber(focusedCommander.xpToNextLevel)}</strong>
                </div>
                <div className={styles.sheetRow}>
                  <span className={styles.sheetMeta}>Talent Track</span>
                  <strong>{focusedCommander.talentTrack.toLowerCase()}</strong>
                </div>
              </div>
            </SectionCard>
          ) : null}
          {commanders.map((commander) => (
            <SectionCard
              key={commander.id}
              kicker={commander.isPrimary ? "Primary Commander" : "Reserve Officer"}
              title={`${commander.name} L${commander.level}`}
              aside={<Badge tone="info">{commander.talentTrack.toLowerCase()}</Badge>}
            >
              <div className={styles.sheetRow}>
                <span className={styles.sheetMeta}>
                  XP {formatNumber(commander.xp)}/{formatNumber(commander.xpToNextLevel)}
                </span>
                <Button type="button" variant="secondary" size="small" onClick={() => setCommanderPanelId(commander.id)}>
                  Details
                </Button>
              </div>
              <div className={styles.sheetRow}>
                <span className={styles.sheetMeta}>
                  +{commander.attackBonusPct}% atk | +{commander.defenseBonusPct}% def
                </span>
                <Button
                  type="button"
                  variant="primary"
                  size="small"
                  disabled={upgradeCommanderMutation.isPending || commander.xp < commander.xpToNextLevel}
                  onClick={() => upgradeCommanderMutation.mutate(commander.id)}
                >
                  Upgrade
                </Button>
              </div>
            </SectionCard>
          ))}
        </div>
      </BottomSheet>

      <BottomSheet
        open={storePreviewOpen}
        title={copy.store.title}
        mode="aside"
        onClose={() => setStorePreviewOpen(false)}
      >
        <div className={styles.sheetGrid}>
          <SectionCard
            kicker="Offers"
            title={copy.store.offers}
            aside={<Badge tone="warning">{formatNumber(storeCatalog?.offers.length ?? 0)}</Badge>}
          >
            <div className={styles.sheetList}>
              {(storeCatalog?.offers ?? []).slice(0, 4).map((offer) => (
                <div key={offer.offerId} className={styles.sheetRow}>
                  <div>
                    <strong>{offer.title}</strong>
                    <p className={styles.sheetMeta}>{offer.description}</p>
                  </div>
                  <Badge tone="info">{offer.productIds.length} products</Badge>
                </div>
              ))}
            </div>
          </SectionCard>
          <SectionCard
            kicker="Entitlements"
            title={copy.store.entitlements}
            aside={<Badge tone="success">{formatNumber(entitlements.length)}</Badge>}
          >
            <div className={styles.sheetList}>
              {entitlements.length === 0 ? (
                <p className={styles.sheetMeta}>This wave only exposes the catalog preview.</p>
              ) : (
                entitlements.slice(0, 5).map((entitlement) => (
                  <div key={entitlement.id} className={styles.sheetRow}>
                    <strong>{entitlement.productId}</strong>
                    <Badge tone="info">{entitlement.status.toLowerCase()}</Badge>
                  </div>
                ))
              )}
            </div>
          </SectionCard>
        </div>
      </BottomSheet>
    </div>
  );
}

export function useGameLayoutContext() {
  return useOutletContext<GameLayoutContext>();
}

