import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  AllianceStateResponse,
  BuildingType,
  EntitlementsResponse,
  GameStateResponse,
  PublicBootstrapResponse,
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
import { getLaunchPhaseLabel, usePublicBootstrap } from "../lib/bootstrap";
import { formatNumber } from "../lib/formatters";
import { summarizeRewardLines } from "../lib/rewardSummaries";
import { copy } from "../lib/i18n";
import { getInvalidationKeys, getSocketToast, parseSocketEvent } from "../lib/socketEvents";
import { useTheme } from "./ThemeProvider";
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
  bootstrap: PublicBootstrapResponse;
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
    frontierMapUi?: {
      targetSheetOpen: boolean;
      composerMode: string | null;
      selectedMarchId: string | null;
      selectedTargetName: string | null;
      fieldCommandKind: string | null;
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
      socket = new WebSocket(`${protocol}://${window.location.host}/ws`);

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
  const [themeSheetOpen, setThemeSheetOpen] = useState(false);
  const { mode: themeMode, setMode: setThemeMode } = useTheme();
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

  const bootstrapQuery = usePublicBootstrap();

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
    enabled: Boolean(sessionQuery.data?.user) && Boolean(bootstrapQuery.data?.storeEnabled),
  });

  const entitlementsQuery = useQuery({
    queryKey: ["entitlements"],
    queryFn: api.entitlements,
    enabled: Boolean(sessionQuery.data?.user) && Boolean(bootstrapQuery.data?.storeEnabled),
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
    if (!bootstrapQuery.data?.storeEnabled) {
      return;
    }

    setStorePreviewOpen(true);
    trackAnalyticsEvent("store_opened");
  }, [bootstrapQuery.data?.storeEnabled]);

  const openCommanderPanel = useCallback((commanderId?: string) => {
    setCommanderPanelId(commanderId ?? null);
    setCommanderPanelOpen(true);
  }, []);

  const contextValue = useMemo<GameLayoutContext | null>(() => {
    if (!stateQuery.data || !bootstrapQuery.data) {
      return null;
    }

    return {
      bootstrap: bootstrapQuery.data,
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
    bootstrapQuery.data,
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
      const mapUi = window.frontierMapUi ?? null;

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
        settings: {
          themeMode,
        },
        selectedCity,
        selectedPoi,
        map: {
          loaded: Boolean(worldChunk),
          camera: cameraView,
          fieldCommand,
          ui: mapUi,
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
  }, [location.pathname, queryClient, selectCity, selectPoi, selectedCityId, selectedPoiId, stateQuery.data, themeMode]);

  useEffect(() => {
    trackAnalyticsEvent("hud_tab_opened", {
      tab: getHudRoute(location.pathname),
    });
  }, [location.pathname]);

  if (bootstrapQuery.isError) {
    return <div className={styles.feedback}>Launch configuration could not be loaded.</div>;
  }

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

  if (bootstrapQuery.isPending || sessionQuery.isPending || stateQuery.isPending) {
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
  const storeEnabled = contextValue.bootstrap.storeEnabled;
  const releaseLabel = getLaunchPhaseLabel(contextValue.bootstrap);
  const mailboxEntries = mailboxQuery.data?.entries ?? [];
  const storeCatalog = storeCatalogQuery.data?.catalog;
  const marketProducts = storeCatalog?.products ?? [];
  const marketProductLookup = new Map(marketProducts.map((product) => [product.productId, product]));
  const marketOffers = (storeCatalog?.offers ?? []).slice(0, 4).map((offer) => ({
    ...offer,
    linkedProducts: offer.productIds.map((productId) => marketProductLookup.get(productId)).filter(Boolean),
  }));
  const featuredProducts = marketProducts.slice(0, 3);
  const entitlements = entitlementsQuery.data?.entitlements ?? [];
  const allianceLabel = contextValue.state.alliance
    ? `[${contextValue.state.alliance.tag}] ${contextValue.state.alliance.name}`
    : "Independent Province";
  const provinceStatus = contextValue.state.city.peaceShieldUntil ? "Peace shield active" : "Battle ready";
  const sidebarSummary = [
    { label: "Alliance Banner", value: allianceLabel },
    { label: "Open Marches", value: formatNumber(contextValue.state.city.openMarchCount) },
    { label: "Unread Dispatches", value: formatNumber(mailboxQuery.data?.unreadCount ?? 0) },
    { label: "Province Status", value: provinceStatus },
  ];
  const navigationItems = [
    { to: "/app/map", eyebrow: "Field Theater", label: "Strategic Map", code: "MAP" },
    { to: "/app/alliance", eyebrow: "Diplomacy Wing", label: "Grand Alliance", code: "ALLY" },
    { to: "/app/dashboard", eyebrow: "Inner Province", label: "City Dashboard", code: "CITY" },
    { to: "/app/reports", eyebrow: "Battle Ledger", label: "War Council", code: "WAR" },
  ] as const;
  const archiveItems = [
    { to: "/app/research", eyebrow: "Academy Wing", label: "Imperial Research", code: "ARC" },
    { to: "/app/leaderboards", eyebrow: "Ranking Bureau", label: "Imperial Leaderboards", code: "RANK" },
    { to: "/app/messages", eyebrow: "Dispatch Hall", label: "Message Center", code: "MSG" },
    ...(storeEnabled ? [{ to: "/app/market", eyebrow: "Trade Exchange", label: "Imperial Market", code: "MKT" }] : []),
  ] as const;
  const commanders = contextValue.state.city.commanders;
  const focusedCommander =
    commanders.find((commander) => commander.id === commanderPanelId) ?? commanders[0] ?? null;

  return (
    <div className={styles.shell}>
      <TopHud
        brand={
          <div className={styles.topBrand}>
            <div>
              <h1 className={styles.brandKicker}>Frontier Dominion</h1>
              <p className={styles.topReleaseMeta}>{releaseLabel} | v{__APP_VERSION__}</p>
            </div>
            <Badge tone="warning">{releaseLabel}</Badge>
          </div>
        }
        resources={resources}
        actions={
          <QuickActions
            onInbox={openInbox}
            onStore={openStorePreview}
            onCommander={() => openCommanderPanel()}
            showStore={storeEnabled}
          />
        }
      />

      <aside className={styles.sidebar}>
        <div className={styles.sidebarHeader}>
          <div className={styles.brandFrame}>
            <span className={styles.brandMonogram}>FD</span>
            <div className={styles.brandCopy}>
              <p className={styles.brandEyebrow}>Sovereign Archive</p>
              <h2 className={styles.brandTitle}>Frontier Dominion</h2>
              <div className={styles.releaseRow}>
                <span className={styles.releaseBadge}>{releaseLabel}</span>
                <span className={styles.versionStamp}>v{__APP_VERSION__}</span>
              </div>
            </div>
          </div>
          <p className={styles.brandMeta}>{contextValue.state.city.cityName} command ledger</p>
        </div>

        <nav className={styles.nav}>
          {navigationItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) => (isActive ? styles.navLinkActive : styles.navLink)}
            >
              <span className={styles.navIcon}>{item.code}</span>
              <span className={styles.navCopy}>
                <span className={styles.navEyebrow}>{item.eyebrow}</span>
                <span className={styles.navTitle}>{item.label}</span>
              </span>
            </NavLink>
          ))}
        </nav>

        <section className={styles.utilitySection}>
          <p className={styles.utilityHeading}>Imperial Rooms</p>
          <div className={styles.utilityGrid}>
            {archiveItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) => (isActive ? styles.utilityLinkActive : styles.utilityLink)}
              >
                <span className={styles.utilityCode}>{item.code}</span>
                <span className={styles.utilityCopy}>
                  <span className={styles.utilityEyebrow}>{item.eyebrow}</span>
                  <span className={styles.utilityTitle}>{item.label}</span>
                </span>
              </NavLink>
            ))}
          </div>
        </section>

        <section className={styles.summaryCard}>
          <p className={styles.summaryKicker}>Dominion Signals</p>
          <h3 className={styles.summaryHeadline}>{allianceLabel}</h3>
          <div className={styles.summaryList}>
            {sidebarSummary.map((entry) => (
              <div key={entry.label}>
                <span className={styles.summaryLabel}>{entry.label}</span>
                <span className={styles.summaryValue}>{entry.value}</span>
              </div>
            ))}
          </div>
        </section>

        <div className={styles.sidebarFooter}>
          <Button type="button" variant="primary" className={styles.declareWarBtn}>
            Declare War
          </Button>
          <div className={styles.supportActions}>
            <span className={styles.versionLine}>{releaseLabel} | v{__APP_VERSION__}</span>
            <Button
              type="button"
              variant="ghost"
              size="small"
              className={styles.footerAction}
              onClick={() => setThemeSheetOpen(true)}
            >
              Theme Deck
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="small"
              className={styles.footerAction}
              onClick={() => logoutMutation.mutate()}
            >
              Log Out
            </Button>
          </div>
        </div>
      </aside>

      <div className={styles.main}>
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
          <SectionCard kicker="Progression View" title="Open the full chamber">
            <div className={styles.sheetRow}>
              <span className={styles.sheetMeta}>Skill tree, roster growth, and doctrine cards live on the full commander page.</span>
              <Button
                type="button"
                variant="secondary"
                size="small"
                onClick={() => {
                  setCommanderPanelOpen(false);
                  navigate("/app/commanders");
                }}
              >
                Open Page
              </Button>
            </div>
          </SectionCard>
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
            kicker="Exchange Floor"
            title="Imperial market pulse"
            aside={<Badge tone="warning">{formatNumber(featuredProducts.length)}</Badge>}
          >
            {featuredProducts.length === 0 ? (
              <p className={styles.sheetMeta}>The market catalog is not available yet.</p>
            ) : (
              <div className={styles.marketTickerGrid}>
                {featuredProducts.map((product) => {
                  const rewardLines = summarizeRewardLines(product.reward);
                  return (
                    <article key={product.productId} className={styles.marketTicker}>
                      <span className={styles.marketTickerLabel}>{product.label}</span>
                      <strong className={styles.marketTickerValue}>{product.priceLabel}</strong>
                      <p className={styles.marketTickerNote}>{rewardLines[0] ?? product.description}</p>
                    </article>
                  );
                })}
              </div>
            )}
          </SectionCard>

          <SectionCard
            kicker="Trade Caravans"
            title={copy.store.offers}
            aside={<Badge tone="info">{formatNumber(marketOffers.length)}</Badge>}
          >
            <div className={styles.marketLedger}>
              {marketOffers.length === 0 ? (
                <p className={styles.sheetMeta}>No live caravans are posted right now.</p>
              ) : (
                marketOffers.map((offer) => (
                  <article key={offer.offerId} className={styles.marketLedgerRow}>
                    <div>
                      <strong>{offer.title}</strong>
                      <p className={styles.sheetMeta}>{offer.description}</p>
                      <p className={styles.marketManifest}>
                        {offer.linkedProducts[0] ? summarizeRewardLines(offer.linkedProducts[0].reward)[0] ?? offer.linkedProducts[0].description : "Catalog preview only"}
                      </p>
                    </div>
                    <div className={styles.marketLedgerMeta}>
                      <Badge tone="warning">{offer.productIds.length} products</Badge>
                      {offer.segmentTags[0] ? <span>{offer.segmentTags.join(" | ")}</span> : null}
                    </div>
                  </article>
                ))
              )}
            </div>
          </SectionCard>

          <SectionCard
            kicker="Imperial Warrants"
            title={copy.store.entitlements}
            aside={<Badge tone="success">{formatNumber(entitlements.length)}</Badge>}
          >
            <div className={styles.sheetList}>
              {entitlements.length === 0 ? (
                <p className={styles.sheetMeta}>This wave only exposes the catalog preview.</p>
              ) : (
                entitlements.slice(0, 5).map((entitlement) => (
                  <div key={entitlement.id} className={styles.sheetRow}>
                    <div>
                      <strong>{entitlement.productId}</strong>
                      <p className={styles.sheetMeta}>{entitlement.entitlementKey}</p>
                    </div>
                    <Badge tone="info">{entitlement.status.toLowerCase()}</Badge>
                  </div>
                ))
              )}
            </div>
          </SectionCard>

          <div className={styles.sheetRow}>
            <span className={styles.sheetMeta}>Open the full market floor for offer rotation and warrant history.</span>
            <Button
              type="button"
              variant="secondary"
              size="small"
              onClick={() => {
                setStorePreviewOpen(false);
                navigate("/app/market");
              }}
            >
              Open Market
            </Button>
          </div>
        </div>
      </BottomSheet>

      <BottomSheet
        open={themeSheetOpen}
        title="Display Theme"
        mode="aside"
        onClose={() => setThemeSheetOpen(false)}
      >
        <div className={styles.sheetGrid}>
          <SectionCard kicker="Theme Mode" title="Choose contrast and lighting">
            <div className={styles.sheetList}>
              {[
                { mode: "day" as const, label: "Day mode", hint: "Brighter parchment surfaces for daylight play." },
                { mode: "night" as const, label: "Night mode", hint: "Warm low-light palette for long sessions." },
                { mode: "highContrast" as const, label: "High contrast", hint: "Sharper contrast for visibility and accessibility." },
              ].map((option) => (
                <div key={option.mode} className={styles.sheetRow}>
                  <div>
                    <strong>{option.label}</strong>
                    <p className={styles.sheetMeta}>{option.hint}</p>
                  </div>
                  <Button
                    type="button"
                    variant={themeMode === option.mode ? "primary" : "secondary"}
                    size="small"
                    onClick={() => setThemeMode(option.mode)}
                  >
                    {themeMode === option.mode ? "Active" : "Use"}
                  </Button>
                </div>
              ))}
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


