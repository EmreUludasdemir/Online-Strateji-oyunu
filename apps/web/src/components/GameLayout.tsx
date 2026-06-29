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
import { getSavedTutorialState, saveTutorialState, TUTORIAL_STEPS } from "../lib/tutorialFlow";
import type { TutorialState, TutorialStepId } from "../lib/tutorialFlow";
import { useTheme } from "./ThemeProvider";
import type { ActiveMapChunkMeta, MapCameraState } from "./worldMapShared";
import styles from "./GameLayoutShell.module.css";
import { TutorialOverlay } from "./hud/TutorialOverlay";
import { MobileBottomNav } from "./hud/MobileBottomNav";
import { QuickActions } from "./hud/QuickActions";
import { TopHud, type QueueSummaryItem } from "./hud/TopHud";
import { Badge } from "./ui/Badge";
import { BottomSheet } from "./ui/BottomSheet";
import { Button } from "./ui/Button";
import { InboxDrawer } from "./ui/InboxDrawer";
import { SectionCard } from "./ui/SectionCard";
import { ToastStack, type ToastItem } from "./ui/ToastStack";
import { TooltipTitle, TooltipBody, TooltipMetric } from "./ui/Tooltip";

interface HudState {
  activeRoute: "dashboard" | "map" | "reports" | "alliance" | "army";
  queueItems: readonly QueueSummaryItem[];
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
  tutorialState: import("../lib/tutorialFlow").TutorialState;
  completeTutorialStep: (stepId: import("../lib/tutorialFlow").TutorialStepId) => void;
  skipTutorial: () => void;
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
    confirm_map_command_composer?: () => Promise<void> | void;
    prime_map_chunk?: () => Promise<void> | void;
    frontierMapCamera?: MapCameraState | null;
    frontierActiveChunk?: ActiveMapChunkMeta | null;
    frontierMapFieldCommand?: {
      kind: string;
      label: string;
      x: number;
      y: number;
      openSource: "canvas" | "automation-hook" | null;
    } | null;
    frontierMapUi?: {
      targetSheetOpen: boolean;
      composerMode: string | null;
      composerActionLabel: string | null;
      selectedMarchId: string | null;
      selectedTargetName: string | null;
      selectedTargetKind: "CITY" | "POI" | null;
      availableActions: string[];
      fieldCommandKind: string | null;
      fieldCommandLabel: string | null;
      fieldCommandOpenSource: "canvas" | "automation-hook" | null;
      mapMode?: string;
      selectedProvinceId?: string | null;
      selectedProvinceRealm?: string | null;
      selectedProvinceDiplomaticRisk?: string | null;
      selectedProvinceControlStatus?: string | null;
      selectedProvinceInfluence?: number | null;
      selectedProvinceClaim?: number | null;
      expansionLogCount?: number;
      diplomacyDrawerOpen?: boolean;
      selectedRealmId?: string | null;
      selectedRealmName?: string | null;
    } | null;
    frontierMapKingdom?: {
      currentTier: {
        id: string;
        label: string;
        shortLabel: string;
        description: string;
      };
      passCount: number;
      sanctuaryCount: number;
      nearestPasses: Array<{
        id: string;
        label: string;
        tier: string;
        x: number;
        y: number;
        distance: number;
      }>;
    } | null;
    focus_map_target?: (command: {
      kind?: "TILE" | "CITY" | "POI";
      label?: string;
      x: number;
      y: number;
      cityId?: string;
      poiId?: string;
    }) => void;
    get_visible_smoke_targets?: () => {
      pois: Array<{ id: string; label: string; kind: string; x: number; y: number }>;
      cities: Array<{ cityId: string; cityName: string; x: number; y: number }>;
      cameraReady: boolean;
      camera: MapCameraState | null;
      projectionReady: boolean;
    };
    project_map_target_for_smoke?: (command: {
      kind?: "TILE" | "CITY" | "POI";
      label?: string;
      x: number;
      y: number;
      cityId?: string;
      poiId?: string;
    }) => {
      worldX: number;
      worldY: number;
      canvasX: number;
      canvasY: number;
      withinViewport: boolean;
      viewport: {
        width: number;
        height: number;
      };
      camera: {
        scrollX: number;
        scrollY: number;
        zoom: number;
        centerWorldX: number;
        centerWorldY: number;
        centerTileX: number;
        centerTileY: number;
      };
    } | null;
    frontierLastError?: {
      message: string;
      stack: string | null;
      componentStack: string | null;
      route: string;
      at: string;
    } | null;
    frontierMapDiagnostics?: {
      routeMountedAt: string;
      chunkRequest: ActiveMapChunkMeta;
      camera: MapCameraState;
      activeChunkMeta: ActiveMapChunkMeta | null;
      worldChunkQuery: {
        status: "pending" | "error" | "success";
        fetchStatus: "idle" | "fetching" | "paused";
        failureCount: number;
        hasData: boolean;
        errorMessage: string | null;
      };
      dataUpdatedAt: string | null;
      errorUpdatedAt: string | null;
      lastFetchAttemptAt: string | null;
      lastFetchSuccessAt: string | null;
      lastFetchErrorAt: string | null;
      readyPhase: "bootstrapping" | "fetching" | "loaded" | "error";
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
  if (pathname.includes("/army")) {
    return "army";
  }
  return "dashboard";
}

function createQueueItems(state: GameStateResponse["city"]): QueueSummaryItem[] {
  return [
    state.activeUpgrade
      ? {
          id: "upgrade",
          label: "Yapı",
          value: `L${state.activeUpgrade.toLevel}`,
          hint: `${state.activeUpgrade.buildingType.replaceAll("_", " ")} geliştirmesi sürüyor`,
        }
      : {
          id: "upgrade",
          label: "Yapı",
          value: "Boş",
          hint: "Yeni oba buyruğuna hazır",
        },
    state.activeTraining
      ? {
          id: "training",
          label: "Ordu",
          value: `${formatNumber(state.activeTraining.quantity)}`,
          hint: `${state.activeTraining.troopType.toLowerCase()} talimi sürüyor`,
        }
      : {
          id: "training",
          label: "Ordu",
          value: "Hazır",
          hint: "Yeni talim buyruğuna hazır",
        },
    state.activeResearch
      ? {
          id: "research",
          label: "Bilge",
          value: `L${state.activeResearch.toLevel}`,
          hint: state.activeResearch.researchType.replaceAll("_", " ").toLowerCase(),
        }
      : {
          id: "research",
          label: "Sefer",
          value: formatNumber(state.openMarchCount),
          hint: "Açık sefer kolu",
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

  const [tutorialState, setTutorialState] = useState<TutorialState>(getSavedTutorialState);
  
  const completeTutorialStep = useCallback((stepId: TutorialStepId) => {
    setTutorialState((prev) => {
      // Find the next step
      const keys = Object.keys(TUTORIAL_STEPS) as TutorialStepId[];
      const currentIndex = keys.indexOf(stepId);
      if (currentIndex !== -1 && currentIndex < keys.length - 1) {
        const nextStep = keys[currentIndex + 1];
        const newState = { ...prev, currentStepId: nextStep };
        saveTutorialState(newState);
        return newState;
      }
      return prev;
    });
  }, []);

  const skipTutorial = useCallback(() => {
    setTutorialState((prev) => {
      const newState = { ...prev, isSkipped: true };
      saveTutorialState(newState);
      return newState;
    });
  }, []);
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
    onError: (error) => {
      const message = error instanceof ApiClientError ? error.message : "Çıkış yapılamadı";
      enqueueToast({ tone: "error", title: "Çıkış Hatası", body: message });
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
        title: "Yükseltme Başladı",
        body: "Yeni yapı buyruğu oba kuyruğuna alındı.",
      });
    },
    onError: (error) => {
      const message = error instanceof ApiClientError ? error.message : "Yükseltme başlatılamadı";
      enqueueToast({ tone: "error", title: "Yükseltme Hatası", body: message });
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
        title: "Talim Kuyruğa Alındı",
        body: "Yeni birlikler kışla kuyruğuna girdi.",
      });
    },
    onError: (error) => {
      const message = error instanceof ApiClientError ? error.message : "Talim kuyruğa alınamadı";
      enqueueToast({ tone: "error", title: "Talim Hatası", body: message });
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
        title: "Töre Çalışması Başladı",
        body: "Bilge ocağı yeni çalışmaya başladı.",
      });
    },
    onError: (error) => {
      const message = error instanceof ApiClientError ? error.message : "Töre çalışması başlatılamadı";
      enqueueToast({ tone: "error", title: "Bilge Hatası", body: message });
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
      const missionLabel = march.objective === "RESOURCE_GATHER" ? "Hasat Seferi" : "Sefer Gönderildi";
      enqueueToast({
        tone: "info",
        title: missionLabel,
        body: `${targetName} çıkışı onaylandı. ETA ${march.remainingSeconds}s.`,
      });
    },
    onError: (error) => {
      const message = error instanceof ApiClientError ? error.message : "Sefer gönderilemedi";
      enqueueToast({ tone: "error", title: "Sefer Hatası", body: message });
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
        title: "Sefer Geri Çağrıldı",
        body: "Birlikler obaya dönüyor.",
      });
    },
    onError: (error) => {
      const message = error instanceof ApiClientError ? error.message : "Sefer geri çağrılamadı";
      enqueueToast({ tone: "error", title: "Geri Çağırma Hatası", body: message });
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
    onError: (error) => {
      const message = error instanceof ApiClientError ? error.message : "Failed to upgrade commander";
      enqueueToast({ tone: "error", title: "Commander Upgrade Failed", body: message });
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
    onError: (error) => {
      const message = error instanceof ApiClientError ? error.message : "Failed to claim reward";
      enqueueToast({ tone: "error", title: "Claim Failed", body: message });
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

  useEffect(() => {
    if (!bootstrapQuery.data?.storeEnabled && storePreviewOpen) {
      setStorePreviewOpen(false);
    }
  }, [bootstrapQuery.data?.storeEnabled, storePreviewOpen]);

  const contextValue = useMemo<GameLayoutContext | null>(() => {
    if (!stateQuery.data || !bootstrapQuery.data) {
      return null;
    }

    return {
      bootstrap: bootstrapQuery.data,
      state: stateQuery.data,
      hud: {
        activeRoute: getHudRoute(location.pathname) as HudState["activeRoute"],
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
      tutorialState,
      completeTutorialStep,
      skipTutorial,
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
    tutorialState,
    completeTutorialStep,
    skipTutorial,
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
      const mapKingdom = window.frontierMapKingdom ?? null;
      const mapDiagnostics = window.frontierMapDiagnostics ?? null;
      const lastError = window.frontierLastError ?? null;

      return JSON.stringify({
        screen: location.pathname,
        shell: {
          bootstrapReady: Boolean(bootstrapQuery.data),
          sessionReady: !sessionQuery.isPending && !sessionQuery.isError,
          authenticated: Boolean(sessionQuery.data?.user),
          gameStateReady: Boolean(stateQuery.data),
        },
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
          readyPhase: mapDiagnostics?.readyPhase ?? (worldChunk ? "loaded" : "bootstrapping"),
          camera: cameraView,
          fieldCommand,
          ui: mapUi,
          kingdom: mapKingdom,
          diagnostics: mapDiagnostics,
          lastError,
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
    };
  }, [
    bootstrapQuery.data,
    location.pathname,
    queryClient,
    selectCity,
    selectPoi,
    selectedCityId,
    selectedPoiId,
    sessionQuery.data?.user,
    sessionQuery.isError,
    sessionQuery.isPending,
    stateQuery.data,
    themeMode,
  ]);

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
    {
      label: copy.resources.wood,
      value: contextValue.state.city.resources.wood,
      tooltip: (
        <>
          <TooltipTitle>{copy.resources.wood} Deposu</TooltipTitle>
          <TooltipBody>Orman kamplarından ve kalas atölyelerinden toplanan ham kereste. Temel yapılar için gereklidir.</TooltipBody>
          <TooltipMetric label="Saatlik Üretim" value="+15.0K / sa" />
        </>
      ),
    },
    {
      label: copy.resources.stone,
      value: contextValue.state.city.resources.stone,
      tooltip: (
        <>
          <TooltipTitle>{copy.resources.stone} Taş Ocağı</TooltipTitle>
          <TooltipBody>Güçlü surlar ve ileri düzey savunma yapıları inşa etmek için işlenen sağlam kayaçlar.</TooltipBody>
          <TooltipMetric label="Saatlik Üretim" value="+8.2K / sa" />
        </>
      ),
    },
    {
      label: copy.resources.food,
      value: contextValue.state.city.resources.food,
      tooltip: (
        <>
          <TooltipTitle>{copy.resources.food} Ambarı</TooltipTitle>
          <TooltipBody>Askerlerin talimi, beslenmesi ve sefere çıkmaları için vazgeçilmez temel erzak.</TooltipBody>
          <TooltipMetric label="Saatlik Üretim" value="+32.4K / sa" />
        </>
      ),
    },
    {
      label: copy.resources.gold,
      value: contextValue.state.city.resources.gold,
      tooltip: (
        <>
          <TooltipTitle>{copy.resources.gold} Hazinesi</TooltipTitle>
          <TooltipBody>Kervanlardan toplanan ve değerli ticari mallara dayalı servet. Bilge ocağı araştırmaları için elzemdir.</TooltipBody>
          <TooltipMetric label="Saatlik Üretim" value="+2.1K / sa" />
        </>
      ),
    },
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
    : "Bağımsız Oba";
  const provinceStatus = contextValue.state.city.peaceShieldUntil ? "Kut kalkanı açık" : "Akına hazır";
  const woundedTotal =
    contextValue.state.city.woundedTroops.INFANTRY +
    contextValue.state.city.woundedTroops.ARCHER +
    contextValue.state.city.woundedTroops.CAVALRY;
  const sidebarSummary = [
    { label: "Toy Sancağı", value: allianceLabel },
    { label: "Sefer Kolu", value: formatNumber(contextValue.state.city.openMarchCount) },
    { label: "Okunmamış Ulak", value: formatNumber(mailboxQuery.data?.unreadCount ?? 0) },
    { label: "Oba Durumu", value: provinceStatus },
    ...(woundedTotal > 0
      ? [{ label: "Yaralı İyileşmesi", value: `${formatNumber(woundedTotal)} şifahane` }]
      : []),
  ];
  const navigationItems = [
    { id: "map", to: "/app/map", eyebrow: "Bozkır Sahası", label: "Sefer Haritası", code: "MAP" },
    { id: "alliance", to: "/app/alliance", eyebrow: "Toy Divanı", label: "Toy Meclisi", code: "TOY" },
    { id: "dashboard", to: "/app/dashboard", eyebrow: "Oba Yurdu", label: "Oba Merkezi", code: "OBA" },
    { id: "army", to: "/app/army", eyebrow: "Talimgah", label: "Kışla", code: "ORD" },
    { id: "reports", to: "/app/reports", eyebrow: "Akın Defteri", label: "Savaş Divanı", code: "AKN" },
  ] as const;
  const archiveItems = [
    { id: "research", to: "/app/research", eyebrow: "Bilge Otağı", label: "Töre Araştırması", code: "BIL" },
    { id: "leaderboards", to: "/app/leaderboards", eyebrow: "Kut Divanı", label: "Kut Sıralaması", code: "KUT" },
    { id: "messages", to: "/app/messages", eyebrow: "Ulak Hattı", label: "Ulak Odası", code: "ULK" },
    ...(storeEnabled ? [{ id: "market", to: "/app/market", eyebrow: "Kervan Yolu", label: "Kervan Pazarı", code: "KRV" }] : []),
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
              <h1 className={styles.brandKicker}>Bozkır Kağanlığı</h1>
              <p className={[styles.topReleaseMeta, styles.desktopOnly].join(" ")}>
                Bozkır Kağanlığı | <span data-release-badge>{releaseLabel}</span> | <span data-version-stamp>v{__APP_VERSION__}</span>
              </p>
            </div>
            <span className={styles.desktopOnly}>
              <Badge tone="warning">
                <span data-release-badge>{releaseLabel}</span>
              </Badge>
            </span>
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
            <span className={styles.brandMonogram}>BK</span>
            <div className={styles.brandCopy}>
              <p className={styles.brandEyebrow}>Kağanlık Arşivi</p>
              <h2 className={styles.brandTitle}>Bozkır Kağanlığı</h2>
              <div className={styles.releaseRow}>
                <span className={styles.releaseBadge} data-release-badge>
                  {releaseLabel}
                </span>
                <span className={styles.versionStamp} data-version-stamp>
                  v{__APP_VERSION__}
                </span>
              </div>
            </div>
          </div>
          <p className={styles.brandMeta}>{contextValue.state.city.cityName} oba defteri</p>
        </div>

        <nav className={styles.nav}>
          {navigationItems.map((item) => {
            const isMapTarget = tutorialState?.currentStepId === "navigate_map" && item.id === "map";
            const isReportTarget = tutorialState?.currentStepId === "read_report" && item.id === "reports";
            const isTutorialTarget = isMapTarget || isReportTarget;
            const targetId = isMapTarget ? "tutorial-target-nav-map" : isReportTarget ? "tutorial-target-navigate-reports" : undefined;

            return (
              <NavLink
                key={item.to}
                to={item.to}
                data-nav-item={item.id}
                data-tutorial-target={targetId}
                className={({ isActive }) => [
                  isActive ? styles.navLinkActive : styles.navLink,
                  isTutorialTarget ? "is-tutorial-active" : ""
                ].filter(Boolean).join(" ")}
              >
                <span className={styles.navIcon}>{item.code}</span>
                <span className={styles.navCopy}>
                  <span className={styles.navEyebrow}>{item.eyebrow}</span>
                  <span className={styles.navTitle}>{item.label}</span>
                </span>
              </NavLink>
            );
          })}
        </nav>

        <section className={styles.utilitySection}>
          <p className={styles.utilityHeading}>İç Otağlar</p>
          <div className={styles.utilityGrid}>
            {archiveItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                data-archive-item={item.id}
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
          <p className={styles.summaryKicker}>Kağanlık İşaretleri</p>
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
            Akın Aç
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
              Tema Destesi
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="small"
              className={styles.footerAction}
              onClick={() => logoutMutation.mutate()}
            >
              Çıkış
            </Button>
          </div>
        </div>
      </aside>

      <div className={styles.main}>
        <main className={styles.content}>
          <Outlet context={contextValue} />
        </main>
        <MobileBottomNav tutorialState={tutorialState} />
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
        title="Başbuğlar"
        mode="aside"
        onClose={() => setCommanderPanelOpen(false)}
      >
        <div className={styles.sheetGrid}>
          {focusedCommander ? (
            <SectionCard
              kicker="Seçili Başbuğ"
              title={`${focusedCommander.name} L${focusedCommander.level}`}
              aside={<Badge tone="warning">{focusedCommander.starLevel} yıldız</Badge>}
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
              kicker={commander.isPrimary ? "Baş Başbuğ" : "Yedek Başbuğ"}
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

      {storeEnabled ? (
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
              Kervan Pazarı
            </Button>
          </div>
        </div>
      </BottomSheet>

      ) : null}
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

      <TutorialOverlay 
        tutorialState={tutorialState} 
        completeTutorialStep={completeTutorialStep} 
        skipTutorial={skipTutorial} 
      />
    </div>
  );
}

export function useGameLayoutContext() {
  return useOutletContext<GameLayoutContext>();
}


