import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  AllianceMarkerView,
  MapCity,
  MarchView,
  PoiView,
  ReportEntryView,
  ScoutMutationResponse,
  TroopStock,
  TroopType,
  WorldChunkResponse,
} from "@frontier/shared";
import type { MouseEvent } from "react";
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import { api } from "../api";
import { useGameLayoutContext } from "../components/GameLayout";
import { BattleWindowPanel } from "../components/map/BattleWindowPanel";
import type { MapFieldCommand, MapHoverState, MapReportMarkerView, WorldMapHandle } from "../components/WorldMap";
import { Badge } from "../components/ui/Badge";
import { BottomSheet } from "../components/ui/BottomSheet";
import { Button } from "../components/ui/Button";
import { PageNotice } from "../components/ui/PageNotice";
import { SectionCard } from "../components/ui/SectionCard";
import { getKingdomPasses, getKingdomRingRadii, getKingdomSanctuaries, getKingdomTier } from "../components/kingdomMap";
import { buildChunkPrefetchRequests, mergeWorldChunks } from "../components/worldMapData";
import { getWorldRegionForTile, getWorldRegions, type WorldRegion } from "../components/worldRegions";
import {
  MAP_CAMERA_DEFAULT_ZOOM,
  type ActiveMapChunkMeta,
  type MapCameraState,
  type MapDetailLevel,
  type ScoutTrailView,
  getMapDetailLevel,
  getMapRadiusForDetail,
} from "../components/worldMapShared";
import { trackAnalyticsEvent } from "../lib/analytics";
import { copy } from "../lib/i18n";
import { formatNumber, formatRelativeTimer, formatTimeRemaining } from "../lib/formatters";
import { useNow } from "../lib/useNow";
import styles from "./MapPage.module.css";

const WorldMap = lazy(() => import("../components/WorldMap"));

type MapFilter = "ALL" | "CITIES" | "CAMPS" | "NODES";
type ComposerMode = "CITY_ATTACK" | "BARBARIAN_ATTACK" | "RESOURCE_GATHER" | "SCOUT" | "RALLY" | null;
type MapReadyPhase = "bootstrapping" | "fetching" | "loaded" | "error";

interface ScoutAnimationTarget {
  kind: "CITY" | "POI";
  x: number;
  y: number;
  label: string;
}

interface ShortcutDefinition {
  id: string;
  label: string;
  keys: string;
}

const BASE_MARCH_SECONDS_PER_TILE = 20;
const MIN_MARCH_SECONDS = 15;

const detailGuideSteps: Array<{ id: MapDetailLevel; label: string; hint: string }> = [
  { id: "far", label: "Devlet Haritası", hint: "Ülkeler, tier halkaları, geçitler ve toy hatları" },
  { id: "mid", label: "Bozkır Okuması", hint: "Sis blokları, rotalar, hedefler ve raporlar" },
  { id: "near", label: "Kuşatma Odağı", hint: "Taktik karolar, keşif izleri ve geçitler" },
];

function createTroopPayload(stateTroops: Array<{ type: TroopType; quantity: number }>): TroopStock {
  return {
    INFANTRY: Math.min(18, stateTroops.find((troop) => troop.type === "INFANTRY")?.quantity ?? 0),
    ARCHER: Math.min(12, stateTroops.find((troop) => troop.type === "ARCHER")?.quantity ?? 0),
    CAVALRY: Math.min(8, stateTroops.find((troop) => troop.type === "CAVALRY")?.quantity ?? 0),
  };
}

function getTargetDistance(
  origin: { x: number; y: number },
  selectedCity: MapCity | null,
  selectedPoi: PoiView | null,
) {
  if (selectedCity?.distance != null) {
    return selectedCity.distance;
  }

  if (selectedPoi?.distance != null) {
    return selectedPoi.distance;
  }

  const target = selectedCity
    ? { x: selectedCity.x, y: selectedCity.y }
    : selectedPoi
      ? { x: selectedPoi.x, y: selectedPoi.y }
      : null;

  if (!target) {
    return null;
  }

  return Math.abs(origin.x - target.x) + Math.abs(origin.y - target.y);
}

function estimateMarchDurationMs(
  distance: number,
  troops: TroopStock,
  troopViews: Array<{ type: TroopType; speed: number }>,
  commanderSpeedBonusPct: number,
  logisticsLevel: number,
  cavalryTacticsLevel = 0,
) {
  const totalTroops = Object.values(troops).reduce((sum, value) => sum + value, 0);
  if (distance <= 0 || totalTroops <= 0) {
    return MIN_MARCH_SECONDS * 1000;
  }

  const weightedSpeed =
    troopViews.reduce((sum, troop) => {
      const speed =
        troop.type === "CAVALRY" ? troop.speed * (1 + cavalryTacticsLevel * 0.06) : troop.speed;
      return sum + speed * troops[troop.type];
    }, 0) / totalTroops;
  const speedModifier = Math.max(0.6, weightedSpeed) * (1 + commanderSpeedBonusPct / 100 + logisticsLevel * 0.08);

  return Math.max(
    MIN_MARCH_SECONDS * 1000,
    Math.ceil((distance * BASE_MARCH_SECONDS_PER_TILE * 1000) / speedModifier),
  );
}

function estimateTroopCarry(
  troops: TroopStock,
  troopViews: Array<{ type: TroopType; carry: number }>,
  commanderCarryBonusPct: number,
) {
  const baseCarry = troopViews.reduce((sum, troop) => sum + troop.carry * troops[troop.type], 0);
  return Math.round(baseCarry * (1 + commanderCarryBonusPct / 100));
}

function estimateTroopPower(
  troops: TroopStock,
  troopViews: Array<{ type: TroopType; attack: number; defense: number }>,
  researchBonuses?: { militaryDrill?: number; metallurgy?: number; archery?: number; cavalryTactics?: number },
) {
  const drill = 1 + (researchBonuses?.militaryDrill ?? 0) * 0.05 + (researchBonuses?.metallurgy ?? 0) * 0.05;
  return troopViews.reduce((sum, troop) => {
    const archerBonus = troop.type === "ARCHER" ? 1 + (researchBonuses?.archery ?? 0) * 0.08 : 1;
    const cavalryBonus = troop.type === "CAVALRY" ? 1 + (researchBonuses?.cavalryTactics ?? 0) * 0.08 : 1;
    return sum + (troop.attack * archerBonus * cavalryBonus * drill + troop.defense) * troops[troop.type];
  }, 0);
}

function getComposerTitle(mode: ComposerMode) {
  if (mode === "SCOUT") {
    return "Keşif Buyruğu";
  }
  if (mode === "RALLY") {
    return "Toy Çağrısı";
  }
  if (mode === "RESOURCE_GATHER") {
    return "Hasat Buyruğu";
  }
  if (mode === "BARBARIAN_ATTACK") {
    return "Kamp Akını";
  }
  return "Sefer Buyruğu";
}

function getComposerActionLabel(mode: ComposerMode) {
  if (mode === "SCOUT") {
    return "Keşifçi gönder";
  }
  if (mode === "RALLY") {
    return "Toy aç";
  }
  if (mode === "RESOURCE_GATHER") {
    return "Hasadı başlat";
  }
  if (mode === "BARBARIAN_ATTACK") {
    return "Kampa akın";
  }
  return "Sefer gönder";
}

function getMarchTimingLabel(
  march: { state: string; etaAt: string; battleWindowClosesAt: string | null; returnEtaAt: string | null },
  now: number,
): string {
  if (march.state === "STAGING" && march.battleWindowClosesAt) {
    return `Pencere ${formatRelativeTimer(march.battleWindowClosesAt, now)}`;
  }
  if (march.state === "GATHERING") {
    return `Hasat ${formatRelativeTimer(march.etaAt, now)}`;
  }
  if (march.state === "RETURNING" && march.returnEtaAt) {
    return `Dönüş ${formatRelativeTimer(march.returnEtaAt, now)}`;
  }
  return `ETA ${formatRelativeTimer(march.etaAt, now)}`;
}

function getMarchObjectiveLabel(objective: MarchView["objective"]) {
  if (objective === "CITY_ATTACK") {
    return "Oba akını";
  }
  if (objective === "BARBARIAN_ATTACK") {
    return "Kamp akını";
  }
  return "Hasat seferi";
}

function getMarchStatusTone(state: MarchView["state"]): "warning" | "info" | "success" {
  if (state === "STAGING") {
    return "warning";
  }
  if (state === "RETURNING") {
    return "info";
  }
  return "success";
}

function getMarchStateLabel(state: MarchView["state"]) {
  if (state === "STAGING") return "hazırlık";
  if (state === "RETURNING") return "dönüş";
  if (state === "GATHERING") return "hasat";
  return "yolda";
}

function getPoiStateLabel(state: PoiView["state"]) {
  if (state === "OCCUPIED") return "dolu";
  if (state === "DEPLETED") return "tükendi";
  return "açık";
}

function getFieldCommandKindLabel(kind: MapFieldCommand["kind"]) {
  if (kind === "CITY") return "oba";
  if (kind === "POI") return "hedef";
  return "karo";
}

function getPoiKindLabel(kind: PoiView["kind"]) {
  if (kind === "BARBARIAN_CAMP") return "akın kampı";
  return "kaynak damarı";
}

function getReportKindLabel(kind: ReportEntryView["kind"]) {
  if (kind === "CITY_BATTLE") return "oba çarpışması";
  if (kind === "BARBARIAN_BATTLE") return "kamp akını";
  return "hasat dönüşü";
}

function getMarchCargoSummary(cargo: MarchView["cargo"]) {
  if (cargo.resourceType) {
    return `${copy.poiResources[cargo.resourceType]} ${formatNumber(cargo.amount)}`;
  }
  if (cargo.amount > 0) {
    return `${formatNumber(cargo.amount)} load`;
  }
  return "Empty hold";
}

function getProgressPercent(startAt: string | null, endAt: string | null, now: number) {
  if (!startAt || !endAt) {
    return 0;
  }

  const startMs = new Date(startAt).getTime();
  const endMs = new Date(endAt).getTime();
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) {
    return 0;
  }

  return Math.max(0, Math.min(100, Math.round(((now - startMs) / (endMs - startMs)) * 100)));
}

function getMarchProgressPercent(march: MarchView, now: number) {
  if (march.state === "RETURNING") {
    return getProgressPercent(march.etaAt, march.returnEtaAt, now);
  }
  if (march.state === "GATHERING") {
    return getProgressPercent(march.gatherStartedAt ?? march.startedAt, march.etaAt, now);
  }
  if (march.state === "STAGING") {
    return getProgressPercent(march.startedAt, march.battleWindowClosesAt, now);
  }
  return getProgressPercent(march.startedAt, march.etaAt, now);
}

function createInitialCameraState(x: number, y: number): MapCameraState {
  return {
    centerTileX: x,
    centerTileY: y,
    zoom: MAP_CAMERA_DEFAULT_ZOOM,
    detailLevel: getMapDetailLevel(MAP_CAMERA_DEFAULT_ZOOM),
  };
}

function isSameCameraState(left: MapCameraState, right: MapCameraState) {
  return (
    left.centerTileX === right.centerTileX &&
    left.centerTileY === right.centerTileY &&
    left.detailLevel === right.detailLevel &&
    Math.abs(left.zoom - right.zoom) < 0.02
  );
}

function canRetargetMarch(march: MarchView, selectedCity: MapCity | null, selectedPoi: PoiView | null) {
  if (march.state !== "ENROUTE") {
    return false;
  }

  if (march.objective === "CITY_ATTACK") {
    return Boolean(selectedCity && !selectedCity.isCurrentPlayer && selectedCity.cityId !== march.targetCityId);
  }

  if (march.objective === "BARBARIAN_ATTACK") {
    return Boolean(selectedPoi?.kind === "BARBARIAN_CAMP" && selectedPoi.id !== march.targetPoiId);
  }

  if (march.objective === "RESOURCE_GATHER") {
    return Boolean(selectedPoi?.kind === "RESOURCE_NODE" && selectedPoi.id !== march.targetPoiId);
  }

  return false;
}

function getScoutTarget(selectedCity: MapCity | null, selectedPoi: PoiView | null): ScoutAnimationTarget | null {
  if (selectedCity && !selectedCity.isCurrentPlayer) {
    return {
      kind: "CITY",
      x: selectedCity.x,
      y: selectedCity.y,
      label: selectedCity.cityName,
    };
  }

  if (selectedPoi) {
    return {
      kind: "POI",
      x: selectedPoi.x,
      y: selectedPoi.y,
      label: selectedPoi.label,
    };
  }

  return null;
}

function getMinimapStateColor(state: "VISIBLE" | "DISCOVERED" | "HIDDEN") {
  if (state === "VISIBLE") {
    return "#25342f";
  }
  if (state === "DISCOVERED") {
    return "#2a2420";
  }
  return "#17100d";
}

function getMinimapRegionOpacity(state: "VISIBLE" | "DISCOVERED" | "HIDDEN") {
  if (state === "VISIBLE") {
    return 0.58;
  }
  if (state === "DISCOVERED") {
    return 0.34;
  }
  return 0.12;
}

function isEditableElement(target: EventTarget | null) {
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement ||
    (target instanceof HTMLElement && target.isContentEditable)
  );
}

function formatMarkerAge(isoTime: string, now: number) {
  const elapsedMs = Math.max(0, now - new Date(isoTime).getTime());
  const elapsedMinutes = Math.floor(elapsedMs / 60_000);
  if (elapsedMinutes < 1) {
    return "just now";
  }
  if (elapsedMinutes < 60) {
    return `${elapsedMinutes}m ago`;
  }
  const elapsedHours = Math.floor(elapsedMinutes / 60);
  if (elapsedHours < 24) {
    return `${elapsedHours}h ago`;
  }
  const elapsedDays = Math.floor(elapsedHours / 24);
  return `${elapsedDays}d ago`;
}

function toIsoTimestamp(timestamp: number) {
  return timestamp > 0 ? new Date(timestamp).toISOString() : null;
}

function getReportMarkerTone(report: ReportEntryView): "success" | "warning" | "info" {
  if (report.kind === "RESOURCE_GATHER") {
    return "info";
  }
  return report.result === "ATTACKER_WIN" ? "success" : "warning";
}

export function MapPage() {
  const now = useNow();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const {
    state,
    hud,
    selectedCityId,
    selectedPoiId,
    selectCity,
    selectPoi,
    sendMarch,
    recallMarch,
    isSendingMarch,
    isRecallingMarch,
  } = useGameLayoutContext();
  const mapCommandRef = useRef<WorldMapHandle | null>(null);
  const scoutTrailTimersRef = useRef<number[]>([]);
  const minimapPingTimerRef = useRef<number | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const markerInputRef = useRef<HTMLInputElement | null>(null);
  const handleComposerConfirmRef = useRef<(() => Promise<void>) | null>(null);
  const markerCycleIndexRef = useRef(0);
  const routeMountedAtRef = useRef(new Date().toISOString());
  const previousChunkFetchStatusRef = useRef<"idle" | "fetching" | "paused" | null>(null);
  const lastFetchAttemptAtRef = useRef<string | null>(null);
  const lastFetchSuccessAtRef = useRef<string | null>(null);
  const lastFetchErrorAtRef = useRef<string | null>(null);

  const [filter, setFilter] = useState<MapFilter>("ALL");
  const [showPaths, setShowPaths] = useState(true);
  const [showScoutTrails, setShowScoutTrails] = useState(true);
  const [showReports, setShowReports] = useState(true);
  const [targetSheetOpen, setTargetSheetOpen] = useState(false);
  const [openedTargetKey, setOpenedTargetKey] = useState<string | null>(null);
  const [composerMode, setComposerMode] = useState<ComposerMode>(null);
  const [commanderId, setCommanderId] = useState(state.city.commanders[0]?.id ?? "");
  const [troopPayload, setTroopPayload] = useState<TroopStock>(() => createTroopPayload(state.city.troops));
  const [searchTerm, setSearchTerm] = useState("");
  const [markerDraft, setMarkerDraft] = useState("");
  const [mapNotice, setMapNotice] = useState<string | null>(null);
  const [fieldCommand, setFieldCommand] = useState<MapFieldCommand | null>(null);
  const [fieldCommandOpenSource, setFieldCommandOpenSource] = useState<"canvas" | "automation-hook" | null>(null);
  const [fieldMarkerDraft, setFieldMarkerDraft] = useState("");
  const [cameraView, setCameraView] = useState<MapCameraState>(() =>
    createInitialCameraState(state.city.coordinates.x, state.city.coordinates.y),
  );
  const [hoverInfo, setHoverInfo] = useState<MapHoverState | null>(null);
  const handleHoverChange = useCallback((next: MapHoverState | null) => {
    setHoverInfo(next);
  }, []);
  const [chunkRequest, setChunkRequest] = useState<ActiveMapChunkMeta>(() => ({
    centerTileX: state.city.coordinates.x,
    centerTileY: state.city.coordinates.y,
    radius: getMapRadiusForDetail(getMapDetailLevel(MAP_CAMERA_DEFAULT_ZOOM)),
  }));
  const [chunkCacheVersion, setChunkCacheVersion] = useState(0);
  const [selectedMarchId, setSelectedMarchId] = useState<string | null>(null);
  const [scoutTrails, setScoutTrails] = useState<ScoutTrailView[]>([]);

  const worldChunkQuery = useQuery({
    queryKey: ["world-chunk", chunkRequest.centerTileX, chunkRequest.centerTileY, chunkRequest.radius],
    queryFn: () =>
      api.worldChunk({
        centerX: chunkRequest.centerTileX,
        centerY: chunkRequest.centerTileY,
        radius: chunkRequest.radius,
      }),
    placeholderData: (previous) => previous,
    staleTime: 5_000,
  });

  useEffect(() => {
    if (worldChunkQuery.fetchStatus === "fetching" && previousChunkFetchStatusRef.current !== "fetching") {
      lastFetchAttemptAtRef.current = new Date().toISOString();
    }
    previousChunkFetchStatusRef.current = worldChunkQuery.fetchStatus;
  }, [worldChunkQuery.fetchStatus]);

  useEffect(() => {
    if (worldChunkQuery.dataUpdatedAt > 0) {
      lastFetchSuccessAtRef.current = new Date(worldChunkQuery.dataUpdatedAt).toISOString();
    }
  }, [worldChunkQuery.dataUpdatedAt]);

  useEffect(() => {
    if (worldChunkQuery.errorUpdatedAt > 0) {
      lastFetchErrorAtRef.current = new Date(worldChunkQuery.errorUpdatedAt).toISOString();
    }
  }, [worldChunkQuery.errorUpdatedAt]);

  const reportsQuery = useQuery({
    queryKey: ["battle-reports"],
    queryFn: api.reports,
    staleTime: 10_000,
  });

  const allianceQuery = useQuery({
    queryKey: ["alliance-state"],
    queryFn: api.allianceState,
    staleTime: 5_000,
  });

  const prefetchRequests = useMemo(
    () => buildChunkPrefetchRequests(chunkRequest, worldChunkQuery.data?.size ?? 64),
    [chunkRequest, worldChunkQuery.data?.size],
  );

  const scoutMutation = useMutation({
    mutationFn: api.createScout,
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["world-chunk"] }),
        queryClient.invalidateQueries({ queryKey: ["mailbox"] }),
      ]);
    },
  });

  const rallyMutation = useMutation({
    mutationFn: api.createRally,
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["world-chunk"] }),
        queryClient.invalidateQueries({ queryKey: ["rallies"] }),
        queryClient.invalidateQueries({ queryKey: ["alliance-state"] }),
      ]);
    },
  });

  const createMarkerMutation = useMutation({
    mutationFn: api.createAllianceMarker,
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["alliance-state"] }),
        queryClient.invalidateQueries({ queryKey: ["game-state"] }),
      ]);
      setMapNotice("Toy işareti bozkır haritasına bırakıldı.");
      setMarkerDraft("");
    },
  });

  const deleteMarkerMutation = useMutation({
    mutationFn: (markerId: string) => api.deleteAllianceMarker(markerId),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["alliance-state"] }),
        queryClient.invalidateQueries({ queryKey: ["game-state"] }),
        queryClient.invalidateQueries({ queryKey: ["world-chunk"] }),
      ]);
      setMapNotice("İşaret bozkır haritasından kaldırıldı.");
    },
  });

  const retargetMutation = useMutation({
    mutationFn: ({
      marchId,
      targetCityId,
      targetPoiId,
    }: {
      marchId: string;
      targetCityId?: string;
      targetPoiId?: string;
    }) => api.retargetMarch(marchId, { targetCityId, targetPoiId }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["world-chunk"] }),
        queryClient.invalidateQueries({ queryKey: ["game-state"] }),
      ]);
    },
  });

  const queueScoutTrail = useCallback(
    (response: ScoutMutationResponse, target: ScoutAnimationTarget) => {
      const durationMs = Math.max(1_600, Math.min(4_200, Math.round((response.scout.remainingSeconds || 4) * 300)));
      const trail: ScoutTrailView = {
        id: response.scout.id,
        from: {
          x: state.city.coordinates.x,
          y: state.city.coordinates.y,
        },
        to: {
          x: target.x,
          y: target.y,
        },
        startedAt: new Date().toISOString(),
        durationMs,
        targetKind: target.kind,
        targetLabel: target.label,
      };

      setScoutTrails((current) => [...current.filter((entry) => entry.id !== trail.id), trail]);
      const timeout = window.setTimeout(() => {
        setScoutTrails((current) => current.filter((entry) => entry.id !== trail.id));
      }, durationMs + 600);
      scoutTrailTimersRef.current.push(timeout);
    },
    [state.city.coordinates.x, state.city.coordinates.y],
  );

  useEffect(() => {
    return () => {
      for (const timeout of scoutTrailTimersRef.current) {
        window.clearTimeout(timeout);
      }
      scoutTrailTimersRef.current = [];
      if (minimapPingTimerRef.current) {
        window.clearTimeout(minimapPingTimerRef.current);
        minimapPingTimerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!mapNotice) {
      return undefined;
    }

    const timer = window.setTimeout(() => setMapNotice(null), 2_800);
    return () => window.clearTimeout(timer);
  }, [mapNotice]);

  useEffect(() => {
    setTroopPayload(createTroopPayload(state.city.troops));
    setCommanderId(state.city.commanders[0]?.id ?? "");
  }, [state.city.commanders, state.city.troops]);

  useEffect(() => {
    const nextCamera = createInitialCameraState(state.city.coordinates.x, state.city.coordinates.y);
    setCameraView(nextCamera);
    setChunkRequest({
      centerTileX: state.city.coordinates.x,
      centerTileY: state.city.coordinates.y,
      radius: getMapRadiusForDetail(nextCamera.detailLevel),
    });
  }, [state.city.coordinates.x, state.city.coordinates.y, state.player.id]);

  useEffect(() => {
    const nextRadius = getMapRadiusForDetail(cameraView.detailLevel);
    const movedEnough =
      Math.abs(cameraView.centerTileX - chunkRequest.centerTileX) >= 2 ||
      Math.abs(cameraView.centerTileY - chunkRequest.centerTileY) >= 2;
    const radiusChanged = nextRadius !== chunkRequest.radius;

    if (!movedEnough && !radiusChanged) {
      return undefined;
    }

    const timer = window.setTimeout(() => {
      setChunkRequest((current) => {
        const updated = {
          centerTileX: cameraView.centerTileX,
          centerTileY: cameraView.centerTileY,
          radius: nextRadius,
        };
        return current.centerTileX === updated.centerTileX &&
          current.centerTileY === updated.centerTileY &&
          current.radius === updated.radius
          ? current
          : updated;
      });
    }, 150);

    return () => window.clearTimeout(timer);
  }, [cameraView, chunkRequest.centerTileX, chunkRequest.centerTileY, chunkRequest.radius]);

  useEffect(() => {
    let cancelled = false;
    const neighbors = prefetchRequests.slice(1);

    if (neighbors.length === 0) {
      return undefined;
    }

    void Promise.allSettled(
      neighbors.map((request) =>
        queryClient.prefetchQuery({
          queryKey: ["world-chunk", request.centerTileX, request.centerTileY, request.radius],
          queryFn: () =>
            api.worldChunk({
              centerX: request.centerTileX,
              centerY: request.centerTileY,
              radius: request.radius,
            }),
          staleTime: 5_000,
        }),
      ),
    ).then(() => {
      if (!cancelled) {
        setChunkCacheVersion((current) => current + 1);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [prefetchRequests, queryClient]);

  useEffect(() => {
    window.frontierMapCamera = cameraView;
    return () => {
      window.frontierMapCamera = null;
    };
  }, [cameraView]);

  useEffect(() => {
    window.frontierMapFieldCommand = fieldCommand
      ? {
          kind: fieldCommand.kind,
          label: fieldCommand.label,
          x: fieldCommand.x,
          y: fieldCommand.y,
          openSource: fieldCommandOpenSource,
        }
      : null;

    return () => {
      window.frontierMapFieldCommand = null;
    };
  }, [fieldCommand, fieldCommandOpenSource]);

  useEffect(() => {
    window.open_map_field_command = (command) => {
      setTargetSheetOpen(false);
      setComposerMode(null);
      setSelectedMarchId(null);
      setFieldCommandOpenSource("automation-hook");
      setFieldCommand({
        kind: command.kind ?? "TILE",
        label: command.label ?? `Bozkır ${command.x},${command.y}`,
        x: command.x,
        y: command.y,
        cityId: command.cityId,
        poiId: command.poiId,
      });
      setFieldMarkerDraft(command.label ?? `Bozkır ${command.x},${command.y}`);
    };

    return () => {
      delete window.open_map_field_command;
    };
  }, []);

  useEffect(() => {
    window.focus_map_target = (command) => {
      if (command.kind === "CITY" && command.cityId) {
        mapCommandRef.current?.focusCity(command.cityId);
        return;
      }

      if (command.kind === "POI" && command.poiId) {
        mapCommandRef.current?.focusPoi(command.poiId);
        return;
      }

      mapCommandRef.current?.focusTile(command.x, command.y);
    };

    return () => {
      delete window.focus_map_target;
    };
  }, []);

  useEffect(() => {
    window.project_map_target_for_smoke = (command) => {
      return mapCommandRef.current?.projectTileToViewport(command.x, command.y) ?? null;
    };

    return () => {
      delete window.project_map_target_for_smoke;
    };
  }, []);

  useEffect(() => {
    if (!worldChunkQuery.data) {
      return undefined;
    }

    window.frontierActiveChunk = {
      centerTileX: worldChunkQuery.data.center.x,
      centerTileY: worldChunkQuery.data.center.y,
      radius: worldChunkQuery.data.radius,
    };

    return () => {
      window.frontierActiveChunk = null;
    };
  }, [worldChunkQuery.data]);

  const handleCameraChange = useCallback((view: MapCameraState) => {
    setCameraView((current) => (isSameCameraState(current, view) ? current : view));
  }, []);

  const worldChunk = useMemo(() => {
    const cachedChunks = queryClient
      .getQueriesData<WorldChunkResponse>({ queryKey: ["world-chunk"] })
      .map(([, payload]) => payload)
      .filter((payload): payload is WorldChunkResponse => Boolean(payload));

    return mergeWorldChunks(chunkRequest, worldChunkQuery.data ?? null, cachedChunks);
  }, [chunkCacheVersion, chunkRequest, queryClient, worldChunkQuery.data]);

  useEffect(() => {
    window.get_visible_smoke_targets = () => {
      const projectionReady = Boolean(mapCommandRef.current?.projectTileToViewport(cameraView.centerTileX, cameraView.centerTileY));
      if (!worldChunk) {
        return { pois: [], cities: [], cameraReady: false, camera: cameraView, projectionReady };
      }
      return {
        pois: worldChunk.pois.map((poi) => ({
          id: poi.id,
          label: poi.label,
          kind: poi.kind,
          x: poi.x,
          y: poi.y,
        })),
        cities: worldChunk.cities
          .filter((city) => !city.isCurrentPlayer)
          .map((city) => ({
            cityId: city.cityId,
            cityName: city.cityName,
            x: city.x,
            y: city.y,
          })),
        cameraReady: projectionReady,
        camera: cameraView,
        projectionReady,
      };
    };

    return () => {
      delete window.get_visible_smoke_targets;
    };
  }, [cameraView, worldChunk]);
  const readyPhase: MapReadyPhase = worldChunk
    ? "loaded"
    : worldChunkQuery.isError
      ? "error"
      : worldChunkQuery.fetchStatus === "fetching" || worldChunkQuery.status === "pending"
        ? "fetching"
        : "bootstrapping";
  const mapDiagnostics = useMemo(
    () => ({
      routeMountedAt: routeMountedAtRef.current,
      chunkRequest,
      camera: cameraView,
      activeChunkMeta: worldChunkQuery.data
        ? {
            centerTileX: worldChunkQuery.data.center.x,
            centerTileY: worldChunkQuery.data.center.y,
            radius: worldChunkQuery.data.radius,
          }
        : null,
      worldChunkQuery: {
        status: worldChunkQuery.status,
        fetchStatus: worldChunkQuery.fetchStatus,
        failureCount: worldChunkQuery.failureCount,
        hasData: Boolean(worldChunkQuery.data),
        errorMessage: worldChunkQuery.error instanceof Error ? worldChunkQuery.error.message : null,
      },
      dataUpdatedAt: toIsoTimestamp(worldChunkQuery.dataUpdatedAt),
      errorUpdatedAt: toIsoTimestamp(worldChunkQuery.errorUpdatedAt),
      lastFetchAttemptAt: lastFetchAttemptAtRef.current,
      lastFetchSuccessAt: lastFetchSuccessAtRef.current,
      lastFetchErrorAt: lastFetchErrorAtRef.current,
      readyPhase,
    }),
    [
      cameraView,
      chunkRequest,
      readyPhase,
      worldChunkQuery.data,
      worldChunkQuery.dataUpdatedAt,
      worldChunkQuery.error,
      worldChunkQuery.errorUpdatedAt,
      worldChunkQuery.failureCount,
      worldChunkQuery.fetchStatus,
      worldChunkQuery.status,
    ],
  );

  const selectedCity = useMemo(
    () => worldChunk?.cities.find((city) => city.cityId === selectedCityId) ?? null,
    [selectedCityId, worldChunk],
  );
  const selectedPoi = useMemo(
    () => worldChunk?.pois.find((poi) => poi.id === selectedPoiId) ?? null,
    [selectedPoiId, worldChunk],
  );
  const selectedMarch = useMemo(
    () => state.city.activeMarches.find((march) => march.id === selectedMarchId) ?? null,
    [selectedMarchId, state.city.activeMarches],
  );
  const activeBattleWindow = selectedCity?.battleWindow ?? selectedPoi?.battleWindow ?? null;
  const reportMarkers = useMemo<MapReportMarkerView[]>(() => {
    if (!worldChunk || !reportsQuery.data) {
      return [];
    }

    const tileStates = new Map(worldChunk.tiles.map((tile) => [`${tile.x}:${tile.y}`, tile.state] as const));
    return reportsQuery.data.reports
      .filter((report) => {
        const state = tileStates.get(`${report.location.to.x}:${report.location.to.y}`);
        return state === "VISIBLE" || state === "DISCOVERED";
      })
      .slice(0, 18)
      .map((report) => ({
        id: report.id,
        kind: report.kind,
        label:
          report.kind === "CITY_BATTLE"
            ? `${report.attackerCityName} -> ${report.defenderCityName}`
            : report.kind === "BARBARIAN_BATTLE"
              ? `${report.poiName} resolved`
              : `${report.poiName} return`,
        x: report.location.to.x,
        y: report.location.to.y,
        resultTone: getReportMarkerTone(report),
      }));
  }, [reportsQuery.data, worldChunk]);

  const visibleTiles = worldChunk?.tiles.filter((tile) => tile.state === "VISIBLE").length ?? 0;
  const discoveredTiles = worldChunk?.tiles.filter((tile) => tile.state !== "HIDDEN").length ?? 0;
  const totalAssignedTroops = Object.values(troopPayload).reduce((sum, value) => sum + value, 0);
  const activeMarchCount = worldChunk?.marches.length ?? state.city.activeMarches.length;
  const logisticsLevel = state.city.research.find((entry) => entry.type === "LOGISTICS")?.level ?? 0;
  const cavalryTacticsLevel = state.city.research.find((entry) => entry.type === "CAVALRY_TACTICS")?.level ?? 0;
  const researchBonuses = {
    militaryDrill: state.city.research.find((entry) => entry.type === "MILITARY_DRILL")?.level ?? 0,
    metallurgy: state.city.research.find((entry) => entry.type === "METALLURGY")?.level ?? 0,
    archery: state.city.research.find((entry) => entry.type === "ARCHERY")?.level ?? 0,
    cavalryTactics: cavalryTacticsLevel,
  };
  const selectedCommander =
    state.city.commanders.find((commander) => commander.id === commanderId) ?? state.city.commanders[0] ?? null;
  const alliance = allianceQuery.data?.alliance ?? null;
  const alliedOwnerNames = useMemo(() => alliance?.members.map((member) => member.username) ?? [], [alliance]);
  const allianceMarkers = alliance?.markers ?? [];
  const [minimapPing, setMinimapPing] = useState<{ x: number; y: number } | null>(null);
  const minimapWorldSize = worldChunk?.size ?? 64;
  const minimapTiles = worldChunk?.tiles ?? [];
  const currentTier = useMemo(
    () => getKingdomTier(cameraView.centerTileX, cameraView.centerTileY, minimapWorldSize),
    [cameraView.centerTileX, cameraView.centerTileY, minimapWorldSize],
  );
  const kingdomPasses = useMemo(() => getKingdomPasses(minimapWorldSize), [minimapWorldSize]);
  const kingdomSanctuaries = useMemo(() => getKingdomSanctuaries(minimapWorldSize), [minimapWorldSize]);
  const kingdomRingRadii = useMemo(() => getKingdomRingRadii(minimapWorldSize), [minimapWorldSize]);
  const nearbyKingdomPasses = useMemo(
    () =>
      kingdomPasses
        .map((pass) => ({
          ...pass,
          distance: Math.hypot(pass.x - cameraView.centerTileX, pass.y - cameraView.centerTileY),
        }))
        .sort((left, right) => left.distance - right.distance)
        .slice(0, 3),
    [cameraView.centerTileX, cameraView.centerTileY, kingdomPasses],
  );
  const kingdomMapState = useMemo(
    () => ({
      currentTier: {
        id: currentTier.id,
        label: currentTier.label,
        shortLabel: currentTier.shortLabel,
        description: currentTier.description,
      },
      passCount: kingdomPasses.length,
      sanctuaryCount: kingdomSanctuaries.length,
      nearestPasses: nearbyKingdomPasses.map((pass) => ({
        id: pass.id,
        label: pass.label,
        tier: pass.tier,
        x: pass.x,
        y: pass.y,
        distance: Number(pass.distance.toFixed(1)),
      })),
    }),
    [currentTier, kingdomPasses.length, kingdomSanctuaries.length, nearbyKingdomPasses],
  );
  useEffect(() => {
    window.frontierMapKingdom = kingdomMapState;
    return () => {
      window.frontierMapKingdom = null;
    };
  }, [kingdomMapState]);
  const minimapStep = useMemo(() => Math.max(1, Math.ceil(minimapWorldSize / 32)), [minimapWorldSize]);
  const minimapCells = useMemo(() => {
    const tileMap = new Map(minimapTiles.map((tile) => [`${tile.x}:${tile.y}`, tile.state] as const));
    const cells: Array<{ x: number; y: number; state: "VISIBLE" | "DISCOVERED" | "HIDDEN"; region: WorldRegion }> = [];

    for (let y = 0; y < minimapWorldSize; y += minimapStep) {
      for (let x = 0; x < minimapWorldSize; x += minimapStep) {
        let state: "VISIBLE" | "DISCOVERED" | "HIDDEN" = "HIDDEN";
        for (let sampleY = y; sampleY < Math.min(minimapWorldSize, y + minimapStep); sampleY += 1) {
          for (let sampleX = x; sampleX < Math.min(minimapWorldSize, x + minimapStep); sampleX += 1) {
            const sampleState = tileMap.get(`${sampleX}:${sampleY}`);
            if (sampleState === "VISIBLE") {
              state = "VISIBLE";
              break;
            } else if (sampleState === "DISCOVERED") {
              state = "DISCOVERED";
            }
          }
          if (state === "VISIBLE") {
            break;
          }
        }
        cells.push({ x, y, state, region: getWorldRegionForTile(x, y, minimapWorldSize) });
      }
    }

    return cells;
  }, [minimapStep, minimapTiles, minimapWorldSize]);
  const worldRegions = useMemo(() => getWorldRegions(minimapWorldSize), [minimapWorldSize]);
  const visibleAllianceMarkers = useMemo(() => allianceMarkers.slice(0, 4), [allianceMarkers]);
  const recentAllianceMarkers = useMemo(() => allianceMarkers.slice(0, 6), [allianceMarkers]);
  const selectedMarkerTarget = useMemo(() => {
    if (selectedCity && !selectedCity.isCurrentPlayer) {
      return {
        label: selectedCity.cityName,
        x: selectedCity.x,
        y: selectedCity.y,
      };
    }

    if (selectedPoi) {
      return {
        label: selectedPoi.label,
        x: selectedPoi.x,
        y: selectedPoi.y,
      };
    }

    return null;
  }, [selectedCity, selectedPoi]);
  const selectedTargetName = selectedCity
    ? selectedCity.cityName
    : selectedPoi
      ? selectedPoi.label
      : null;
  const selectedCityIsAllied = Boolean(
    selectedCity &&
      !selectedCity.isCurrentPlayer &&
      alliedOwnerNames.includes(selectedCity.ownerName),
  );
  const selectedTargetSubtitle = selectedCity
    ? selectedCity.isCurrentPlayer
      ? `Ana oba | ${selectedCity.x}, ${selectedCity.y}`
      : `${selectedCityIsAllied ? "Toy obası" : "Düşman obası"} | ${selectedCity.x}, ${selectedCity.y}`
    : selectedPoi
      ? `${selectedPoi.kind === "BARBARIAN_CAMP" ? "Kamp hedefi" : "Kaynak hattı"} | ${selectedPoi.x}, ${selectedPoi.y}`
      : "Sürükle: kaydır | Tekerlek: yakınlaş | Sağ tık: saha buyruğu";
  const selectedTargetDistance = getTargetDistance(state.city.coordinates, selectedCity, selectedPoi);
  const estimatedMarchEtaMs =
    composerMode && composerMode !== "SCOUT" && selectedTargetDistance != null && selectedCommander
      ? estimateMarchDurationMs(
          selectedTargetDistance,
          troopPayload,
          state.city.troops,
          selectedCommander.marchSpeedBonusPct,
          logisticsLevel,
          cavalryTacticsLevel,
        )
      : null;
  const estimatedCarry =
    composerMode && composerMode !== "SCOUT" && selectedCommander
      ? estimateTroopCarry(troopPayload, state.city.troops, selectedCommander.carryBonusPct)
      : 0;
  const estimatedPower =
    composerMode && composerMode !== "SCOUT"
      ? estimateTroopPower(troopPayload, state.city.troops, researchBonuses)
      : 0;
  const previewMarchEtaMs =
    selectedTargetDistance != null && selectedCommander
      ? estimateMarchDurationMs(
          selectedTargetDistance,
          troopPayload,
          state.city.troops,
          selectedCommander.marchSpeedBonusPct,
          logisticsLevel,
          cavalryTacticsLevel,
        )
      : null;
  const previewCarry = selectedCommander ? estimateTroopCarry(troopPayload, state.city.troops, selectedCommander.carryBonusPct) : 0;
  const previewPower = estimateTroopPower(troopPayload, state.city.troops, researchBonuses);
  const composerTitle = getComposerTitle(composerMode);
  const composerActionLabel = getComposerActionLabel(composerMode);
  const targetPrimaryMode = selectedCity
    ? "CITY_ATTACK"
    : selectedPoi?.kind === "BARBARIAN_CAMP"
      ? "BARBARIAN_ATTACK"
      : "RESOURCE_GATHER";
  const targetPrimaryActionLabel = selectedCity
    ? "Obaya akın"
    : selectedPoi?.kind === "BARBARIAN_CAMP"
      ? "Kampa akın"
      : "Burada topla";
  const availableTargetActions = selectedCity
    ? ["Keşifçi gönder", "Toy çağır", "Obaya akın"]
    : selectedPoi?.kind === "BARBARIAN_CAMP"
      ? ["Keşifçi gönder", "Toy çağır", "Kampa akın"]
      : selectedPoi
        ? ["Keşifçi gönder", "Burada topla"]
        : [];
  const fieldCommandCanOpenTarget = Boolean(
    fieldCommand && ((fieldCommand.kind === "CITY" && fieldCommand.cityId) || (fieldCommand.kind === "POI" && fieldCommand.poiId)),
  );
  const fieldCommandCanScout = fieldCommandCanOpenTarget;
  const fieldCommandDistance = fieldCommand
    ? Math.abs(state.city.coordinates.x - fieldCommand.x) + Math.abs(state.city.coordinates.y - fieldCommand.y)
    : null;
  const selectedMarchTroopTotal = selectedMarch
    ? Object.values(selectedMarch.troops).reduce((sum, value) => sum + value, 0)
    : 0;
  const selectedMarchRetargetable = Boolean(selectedMarch && canRetargetMarch(selectedMarch, selectedCity, selectedPoi));
  const selectedMarchRetargetLabel = !selectedMarchRetargetable
    ? "Hedef kilitli"
    : selectedCity
      ? `${selectedCity.cityName} hedefine çevir`
      : selectedPoi
        ? `${selectedPoi.label} hedefine çevir`
        : "Seferi yönlendir";
  const selectedMarchCargoLabel = !selectedMarch
    ? "Boş ambar"
    : selectedMarch.cargo.resourceType
      ? `${copy.poiResources[selectedMarch.cargo.resourceType]} ${formatNumber(selectedMarch.cargo.amount)}`
      : selectedMarch.cargo.amount > 0
        ? formatNumber(selectedMarch.cargo.amount)
        : "Boş ambar";
  const selectedMarchPower = selectedMarch ? estimateTroopPower(selectedMarch.troops, state.city.troops) : 0;
  const overlaySelectionTone = selectedMarch
    ? "info"
    : selectedCity
      ? selectedCity.isCurrentPlayer
        ? "success"
        : selectedCityIsAllied
          ? "info"
          : "warning"
      : selectedPoi
        ? selectedPoi.kind === "RESOURCE_NODE"
          ? "success"
          : "warning"
        : "info";
  const overlaySelectionLabel = selectedMarch
    ? "Sefer izleniyor"
    : selectedCity
      ? selectedCity.isCurrentPlayer
        ? "Ana oba"
        : selectedCityIsAllied
          ? "Toy obası"
          : "Düşman obası"
      : selectedPoi
        ? selectedPoi.kind === "BARBARIAN_CAMP"
          ? "Kamp hedefi"
          : "Kaynak noktası"
        : "Serbest kamera";
  const targetSheetVisible = targetSheetOpen && !composerMode && !fieldCommand && !selectedMarch;
  const fieldCommandVisible = Boolean(fieldCommand) && !composerMode && !selectedMarch;
  const selectedMarchVisible = Boolean(selectedMarch) && !composerMode && !fieldCommand;
  const alliedBattleParticipants = useMemo(() => {
    if (!activeBattleWindow || !alliance?.tag) {
      return 0;
    }

    return activeBattleWindow.participants.filter((participant) => participant.ownerAllianceTag === alliance.tag).length;
  }, [activeBattleWindow, alliance?.tag]);
  const latestAllianceMarker = recentAllianceMarkers[0] ?? null;
  const latestVisibleReport = reportMarkers[0] ?? null;
  const marchStateCounts = useMemo(() => {
    const counts = {
      ENROUTE: 0,
      STAGING: 0,
      GATHERING: 0,
      RETURNING: 0,
    };

    for (const march of state.city.activeMarches) {
      if (march.state === "ENROUTE" || march.state === "STAGING" || march.state === "GATHERING" || march.state === "RETURNING") {
        counts[march.state] += 1;
      }
    }

    return counts;
  }, [state.city.activeMarches]);
  const operationsSummary = useMemo<
    Array<{
      id: string;
      label: string;
      value: string;
      note: string;
      badge: string;
      tone: "warning" | "info" | "success";
    }>
  >(
    () => [
      {
        id: "orders",
        label: "Canlı buyruk",
        value: formatNumber(state.city.activeMarches.length),
        note:
          state.city.activeMarches.length > 0
            ? `${formatNumber(marchStateCounts.ENROUTE)} yolda / ${formatNumber(marchStateCounts.RETURNING)} dönüyor`
            : "Bozkırda aktif kol yok.",
        badge: state.city.activeMarches.length > 0 ? "Canlı" : "Sakin",
        tone: state.city.activeMarches.length > 0 ? "info" : "warning",
      },
      {
        id: "windows",
        label: "Savaş penceresi",
        value: formatNumber(marchStateCounts.STAGING + (activeBattleWindow ? 1 : 0)),
        note: activeBattleWindow
          ? `${activeBattleWindow.label} / ${formatNumber(alliedBattleParticipants)} toy sancağı`
          : marchStateCounts.STAGING > 0
            ? `${formatNumber(marchStateCounts.STAGING)} bekleyen sefer kapanışı izliyor.`
            : "Şu an çekişmeli saha yok.",
        badge: activeBattleWindow || marchStateCounts.STAGING > 0 ? "Çekişmeli" : "Dengeli",
        tone: activeBattleWindow || marchStateCounts.STAGING > 0 ? "warning" : "success",
      },
      {
        id: "signals",
        label: "İşaret hattı",
        value: formatNumber(recentAllianceMarkers.length),
        note: latestAllianceMarker
          ? `${latestAllianceMarker.label} / ${formatMarkerAge(latestAllianceMarker.createdAt, now)}`
          : "Toy işaretleri subaylar işaret bıraktığında burada görünür.",
        badge: recentAllianceMarkers.length > 0 ? "Bağlı" : "Boş",
        tone: recentAllianceMarkers.length > 0 ? "success" : "info",
      },
      {
        id: "intel",
        label: "Saha bilgisi",
        value: formatNumber(reportMarkers.length),
        note: latestVisibleReport
          ? `${latestVisibleReport.label} / ${getReportKindLabel(latestVisibleReport.kind)}`
          : "Mevcut harita merceğinde görünür rapor işareti yok.",
        badge: reportMarkers.length > 0 ? "Rapor" : "Temiz",
        tone: reportMarkers.length > 0 ? "warning" : "info",
      },
    ],
    [
      activeBattleWindow,
      alliedBattleParticipants,
      latestAllianceMarker,
      latestVisibleReport,
      marchStateCounts.ENROUTE,
      marchStateCounts.RETURNING,
      marchStateCounts.STAGING,
      now,
      recentAllianceMarkers.length,
      reportMarkers.length,
      state.city.activeMarches.length,
    ],
  );
  const theaterStatusTone = activeBattleWindow ? "warning" : selectedMarch ? "info" : selectedTargetName ? "success" : "info";
  const theaterStatusLabel = activeBattleWindow
    ? "Çekişmeli saha"
    : selectedMarch
      ? "Sefer yolda"
      : selectedTargetName
        ? "Hedef kilitli"
        : "Serbest bozkır";
  const mapInteractionMode = composerMode
    ? "Buyruk hazırlığı"
    : fieldCommand
      ? "Saha buyruğu"
      : selectedMarch
        ? "Sefer takibi"
        : targetSheetVisible
          ? "Hedef inceleme"
          : selectedTargetName
            ? "Hedef kilidi"
            : "Serbest kamera";
  const mapInteractionHint = composerMode
    ? "Başbuğ, birlik yükü ve onay aynı hatta kalır; sefer emri bilinçli verilir."
    : fieldCommand
      ? "Sağ tık işareti eyleme dönüşür: odağı al, hedef tepsisine gir veya toy işareti yap."
      : selectedMarch
        ? "İzlenen kolun süre, yük ve yön kararları harita akarken sabit kalır."
        : selectedTargetName
          ? "Seçim kilidi hedefi okunur tutar; zoom katmanı gereksiz gürültüyü geri iter."
          : "Sürükle, yakınlaş, sis içinde keşifçi gönder; geçit ve katman sınırlarında acele etme.";
  const interactionTone = composerMode ? "warning" : selectedMarch ? "info" : fieldCommand ? "success" : "info";
  const tacticalObjectiveLabel = selectedMarch
    ? getMarchObjectiveLabel(selectedMarch.objective)
    : composerMode
      ? composerTitle
      : selectedCity
        ? "Oba akını"
        : selectedPoi
          ? selectedPoi.kind === "BARBARIAN_CAMP"
            ? "Kamp akını"
            : "Kaynak hasadı"
          : "Serbest tarama";
  const tacticalEtaLabel = selectedMarch
    ? getMarchTimingLabel(selectedMarch, now)
    : previewMarchEtaMs != null
      ? formatTimeRemaining(new Date(now + previewMarchEtaMs).toISOString(), now)
      : "Rota bekliyor";
  const tacticalPowerLabel = selectedMarch
    ? formatNumber(selectedMarchPower)
    : composerMode === "SCOUT"
      ? "Birlik gerekmez"
      : formatNumber(previewPower);
  const tacticalCarryLabel = selectedMarch ? selectedMarchCargoLabel : formatNumber(previewCarry);
  const tacticalThreatValue = activeBattleWindow
    ? activeBattleWindow.label
    : selectedCity
      ? selectedCity.projectedOutcome === "ATTACKER_WIN"
        ? "Dış sur zayıf"
        : "Savunma güçlü"
      : selectedPoi
        ? selectedPoi.kind === "BARBARIAN_CAMP"
          ? "Düşman kampı"
          : "Açık hasat hattı"
        : "Temiz saha";
  const tacticalThreatNote = latestAllianceMarker
    ? `İşaret ${latestAllianceMarker.label}`
    : latestVisibleReport
      ? `Rapor ${latestVisibleReport.label}`
      : "Bu mercekte yakın işaret yok";
  const tacticalReadouts = [
    {
      id: "objective",
      label: "Hedef",
      value: tacticalObjectiveLabel,
      note: selectedTargetName ?? "Bozkırda bir hedef seç",
      tone: overlaySelectionTone,
    },
    {
      id: "eta",
      label: "Sefer ETA",
      value: tacticalEtaLabel,
      note: selectedTargetDistance != null ? `Obadan ${formatNumber(selectedTargetDistance)} karo` : "Rota kilitli değil",
      tone: previewMarchEtaMs != null || selectedMarch ? "warning" : "info",
    },
    {
      id: "power",
      label: "Güç",
      value: tacticalPowerLabel,
      note: selectedMarch ? `${formatNumber(selectedMarchTroopTotal)} birlik yolda` : `${formatNumber(totalAssignedTroops)} birlik hazır`,
      tone: selectedMarch || totalAssignedTroops > 0 ? "success" : "info",
    },
    {
      id: "carry",
      label: selectedMarch ? "Yük" : "Taşıma",
      value: tacticalCarryLabel,
      note: selectedPoi?.kind === "RESOURCE_NODE" ? "Yüksek taşıma hasatta avantajdır" : "Yük sefer boyunca görünür",
      tone: selectedPoi?.kind === "RESOURCE_NODE" || selectedMarch?.objective === "RESOURCE_GATHER" ? "success" : "info",
    },
    {
      id: "threat",
      label: "Tehdit",
      value: tacticalThreatValue,
      note: tacticalThreatNote,
      tone: activeBattleWindow || selectedCity ? "warning" : latestAllianceMarker ? "success" : "info",
    },
  ] as const;
  const minimapViewport = useMemo(() => {
    const halfSpan = Math.max(3, chunkRequest.radius);
    return {
      x: Math.max(0, cameraView.centerTileX - halfSpan),
      y: Math.max(0, cameraView.centerTileY - halfSpan),
      width: Math.min(minimapWorldSize, halfSpan * 2 + 1),
      height: Math.min(minimapWorldSize, halfSpan * 2 + 1),
    };
  }, [cameraView.centerTileX, cameraView.centerTileY, chunkRequest.radius, minimapWorldSize]);

  useEffect(() => {
    window.confirm_map_command_composer = async () => {
      await handleComposerConfirmRef.current?.();
    };

    return () => {
      delete window.confirm_map_command_composer;
    };
  }, []);

  useEffect(() => {
    window.prime_map_chunk = async () => {
      await queryClient.fetchQuery({
        queryKey: ["world-chunk", chunkRequest.centerTileX, chunkRequest.centerTileY, chunkRequest.radius],
        queryFn: () =>
          api.worldChunk({
            centerX: chunkRequest.centerTileX,
            centerY: chunkRequest.centerTileY,
            radius: chunkRequest.radius,
          }),
        staleTime: 5_000,
      });
      setChunkCacheVersion((current) => current + 1);
    };

    return () => {
      delete window.prime_map_chunk;
    };
  }, [chunkRequest.centerTileX, chunkRequest.centerTileY, chunkRequest.radius, queryClient]);

  useEffect(() => {
    window.frontierMapUi = {
      targetSheetOpen: targetSheetVisible,
      composerMode,
      composerActionLabel: composerMode ? composerActionLabel : null,
      selectedMarchId,
      selectedTargetName,
      selectedTargetKind: selectedCity ? "CITY" : selectedPoi ? "POI" : null,
      availableActions: targetSheetVisible ? availableTargetActions : [],
      fieldCommandKind: fieldCommand?.kind ?? null,
      fieldCommandLabel: fieldCommand?.label ?? null,
      fieldCommandOpenSource,
    };

    return () => {
      window.frontierMapUi = null;
    };
  }, [
    availableTargetActions,
    composerMode,
    composerActionLabel,
    fieldCommand?.kind,
    fieldCommand?.label,
    fieldCommandOpenSource,
    selectedCity,
    selectedMarchId,
    selectedPoi,
    selectedTargetName,
    targetSheetVisible,
  ]);

  useEffect(() => {
    window.frontierMapDiagnostics = mapDiagnostics;
    return () => {
      window.frontierMapDiagnostics = null;
    };
  }, [mapDiagnostics]);

  const targetCards = useMemo(() => {
    if (!worldChunk) {
      return [];
    }

    const cityCards = worldChunk.cities
      .filter((city) => !city.isCurrentPlayer && (filter === "ALL" || filter === "CITIES"))
      .map((city) => ({
        id: city.cityId,
        label: city.cityName,
        meta: `${city.ownerName} | ${city.distance ?? "-"} karo`,
        kind: "CITY" as const,
        city,
      }));

    const poiCards = worldChunk.pois
      .filter(
        (poi) =>
          filter === "ALL" ||
          (filter === "CAMPS" && poi.kind === "BARBARIAN_CAMP") ||
          (filter === "NODES" && poi.kind === "RESOURCE_NODE"),
      )
      .map((poi) => ({
        id: poi.id,
        label: poi.label,
        meta: `${getPoiKindLabel(poi.kind)} | ${poi.distance ?? "-"} karo`,
        kind: "POI" as const,
        poi,
      }));

    return [...cityCards, ...poiCards].slice(0, 12);
  }, [filter, worldChunk]);

  useEffect(() => {
    if (selectedCity && !selectedCity.isCurrentPlayer) {
      trackAnalyticsEvent("target_sheet_opened", { targetType: "CITY", targetId: selectedCity.cityId });
    }
    if (selectedPoi) {
      trackAnalyticsEvent("target_sheet_opened", { targetType: "POI", targetId: selectedPoi.id });
    }
  }, [selectedCity, selectedPoi]);

  useEffect(() => {
    const nextTargetKey =
      selectedCity && !selectedCity.isCurrentPlayer ? `city:${selectedCity.cityId}` : selectedPoi ? `poi:${selectedPoi.id}` : null;
    if (!nextTargetKey || nextTargetKey === openedTargetKey) {
      return;
    }

    setSelectedMarchId(null);
    setTargetSheetOpen(true);
    setOpenedTargetKey(nextTargetKey);
  }, [openedTargetKey, selectedCity, selectedPoi]);

  useEffect(() => {
    if (!selectedMarchId) {
      return;
    }

    if (!state.city.activeMarches.some((march) => march.id === selectedMarchId)) {
      setSelectedMarchId(null);
    }
  }, [selectedMarchId, state.city.activeMarches]);

  const handleCitySelect = useCallback(
    (city: MapCity, options?: { focus?: boolean }) => {
      setSelectedMarchId(null);
      setComposerMode(null);
      setFieldCommand(null);
      selectCity(city.cityId);
      setOpenedTargetKey(null);
      if (options?.focus) {
        mapCommandRef.current?.focusCity(city.cityId);
      }
      if (!city.isCurrentPlayer) {
        setTargetSheetOpen(true);
      }
    },
    [selectCity],
  );

  const handlePoiSelect = useCallback(
    (poi: PoiView, options?: { focus?: boolean }) => {
      setSelectedMarchId(null);
      setComposerMode(null);
      setFieldCommand(null);
      selectPoi(poi.id);
      setOpenedTargetKey(null);
      if (options?.focus) {
        mapCommandRef.current?.focusPoi(poi.id);
      }
      setTargetSheetOpen(true);
    },
    [selectPoi],
  );

  const handleMarchSelect = useCallback((marchId: string) => {
    setTargetSheetOpen(false);
    setComposerMode(null);
    setFieldCommand(null);
    setSelectedMarchId(marchId);
    mapCommandRef.current?.focusMarch(marchId);
  }, []);

  const openComposer = useCallback((mode: ComposerMode) => {
    setFieldCommand(null);
    setSelectedMarchId(null);
    setTargetSheetOpen(false);
    setComposerMode(mode);
  }, []);

  const handleMinimapClick = useCallback(
    (event: MouseEvent<HTMLButtonElement>) => {
      const bounds = event.currentTarget.getBoundingClientRect();
      const ratioX = (event.clientX - bounds.left) / bounds.width;
      const ratioY = (event.clientY - bounds.top) / bounds.height;
      const nextX = Math.max(0, Math.min(minimapWorldSize - 1, Math.floor(ratioX * minimapWorldSize)));
      const nextY = Math.max(0, Math.min(minimapWorldSize - 1, Math.floor(ratioY * minimapWorldSize)));
      setMinimapPing({ x: nextX, y: nextY });
      if (minimapPingTimerRef.current) {
        window.clearTimeout(minimapPingTimerRef.current);
      }
      minimapPingTimerRef.current = window.setTimeout(() => {
        setMinimapPing(null);
        minimapPingTimerRef.current = null;
      }, 900);
      mapCommandRef.current?.focusTile(nextX, nextY);
    },
    [minimapWorldSize],
  );

  const handleMarkerFocus = useCallback((marker: AllianceMarkerView) => {
    setMinimapPing({ x: marker.x, y: marker.y });
    if (minimapPingTimerRef.current) {
      window.clearTimeout(minimapPingTimerRef.current);
    }
    minimapPingTimerRef.current = window.setTimeout(() => {
      setMinimapPing(null);
      minimapPingTimerRef.current = null;
    }, 900);
    mapCommandRef.current?.focusTile(marker.x, marker.y);
  }, []);

  const handleOpenReport = useCallback(
    (reportId: string) => {
      navigate(`/app/reports?focus=${encodeURIComponent(reportId)}`);
    },
    [navigate],
  );

  const handleMarkerDelete = useCallback(
    (event: MouseEvent<HTMLButtonElement>, marker: AllianceMarkerView) => {
      event.stopPropagation();
      void deleteMarkerMutation.mutateAsync(marker.id);
    },
    [deleteMarkerMutation],
  );

  const postAllianceMarker = useCallback(
    async (payload: { label: string; x: number; y: number }) => {
      if (!alliance) {
        setMapNotice("Join an alliance to drop map markers.");
        return false;
      }

      await createMarkerMutation.mutateAsync(payload);
      return true;
    },
    [alliance, createMarkerMutation],
  );

  const handleQuickMarkerCreate = useCallback(
    async (mode: "CAMERA" | "TARGET") => {
      const target =
        mode === "TARGET" && selectedMarkerTarget
          ? selectedMarkerTarget
          : {
              label: `Bozkır ${cameraView.centerTileX},${cameraView.centerTileY}`,
              x: cameraView.centerTileX,
              y: cameraView.centerTileY,
            };

      await postAllianceMarker({
        label: markerDraft.trim() || target.label,
        x: target.x,
        y: target.y,
      });
    },
    [cameraView.centerTileX, cameraView.centerTileY, markerDraft, postAllianceMarker, selectedMarkerTarget],
  );

  const handleFocusSearch = useCallback(() => {
    searchInputRef.current?.focus();
    searchInputRef.current?.select();
  }, []);

  const handleFocusMarkerInput = useCallback(() => {
    markerInputRef.current?.focus();
    markerInputRef.current?.select();
  }, []);

  const handleCycleMarker = useCallback(
    (direction: 1 | -1) => {
      if (recentAllianceMarkers.length === 0) {
        return;
      }

      const nextIndex =
        (markerCycleIndexRef.current + direction + recentAllianceMarkers.length) % recentAllianceMarkers.length;
      markerCycleIndexRef.current = nextIndex;
      handleMarkerFocus(recentAllianceMarkers[nextIndex]);
    },
    [handleMarkerFocus, recentAllianceMarkers],
  );

  const closeMapPanels = useCallback(() => {
    setFieldCommand(null);
    setComposerMode(null);
    setTargetSheetOpen(false);
    setSelectedMarchId(null);
  }, []);

  const handleFieldCommandOpen = useCallback((command: MapFieldCommand) => {
    setTargetSheetOpen(false);
    setComposerMode(null);
    setSelectedMarchId(null);
    setFieldCommandOpenSource("canvas");
    setFieldCommand(command);
    setFieldMarkerDraft(command.label);
    trackAnalyticsEvent("target_sheet_opened", {
      targetType: "FIELD_COMMAND",
      commandKind: command.kind,
      x: command.x,
      y: command.y,
    });
  }, []);

  const handleFieldCommandFocus = useCallback(() => {
    if (!fieldCommand) {
      return;
    }
    mapCommandRef.current?.focusTile(fieldCommand.x, fieldCommand.y);
    setFieldCommand(null);
  }, [fieldCommand]);

  const handleFieldCommandOpenTarget = useCallback(() => {
    if (!fieldCommand || !worldChunk) {
      return;
    }

    if (fieldCommand.kind === "CITY" && fieldCommand.cityId) {
      const city = worldChunk.cities.find((entry) => entry.cityId === fieldCommand.cityId);
      if (city) {
        handleCitySelect(city, { focus: true });
        setFieldCommand(null);
      }
      return;
    }

    if (fieldCommand.kind === "POI" && fieldCommand.poiId) {
      const poi = worldChunk.pois.find((entry) => entry.id === fieldCommand.poiId);
      if (poi) {
        handlePoiSelect(poi, { focus: true });
        setFieldCommand(null);
      }
    }
  }, [fieldCommand, handleCitySelect, handlePoiSelect, worldChunk]);

  const handleFieldCommandScout = useCallback(() => {
    if (!fieldCommand) {
      return;
    }

    if (fieldCommand.kind === "CITY" && fieldCommand.cityId) {
      selectCity(fieldCommand.cityId);
      setOpenedTargetKey(`city:${fieldCommand.cityId}`);
      mapCommandRef.current?.focusCity(fieldCommand.cityId);
      openComposer("SCOUT");
      setFieldCommand(null);
      return;
    }

    if (fieldCommand.kind === "POI" && fieldCommand.poiId) {
      selectPoi(fieldCommand.poiId);
      setOpenedTargetKey(`poi:${fieldCommand.poiId}`);
      mapCommandRef.current?.focusPoi(fieldCommand.poiId);
      openComposer("SCOUT");
      setFieldCommand(null);
    }
  }, [fieldCommand, openComposer, selectCity, selectPoi]);

  const handleFieldMarkerCreate = useCallback(async () => {
    if (!fieldCommand) {
      return;
    }

    const created = await postAllianceMarker({
      label: fieldMarkerDraft.trim() || fieldCommand.label,
      x: fieldCommand.x,
      y: fieldCommand.y,
    });

    if (created) {
      setFieldCommand(null);
    }
  }, [fieldCommand, fieldMarkerDraft, postAllianceMarker]);

  const searchResults = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    if (!term || !worldChunk) {
      return [];
    }

    const cityResults = worldChunk.cities
      .filter((city) => !city.isCurrentPlayer)
      .map((city) => ({
        id: `city:${city.cityId}`,
        label: city.cityName,
        meta: `${city.ownerName} | ${city.distance ?? "-"} karo`,
        action: () => handleCitySelect(city, { focus: true }),
      }));

    const poiResults = worldChunk.pois.map((poi) => ({
      id: `poi:${poi.id}`,
      label: poi.label,
      meta: `${getPoiKindLabel(poi.kind)} | ${poi.distance ?? "-"} karo`,
      action: () => handlePoiSelect(poi, { focus: true }),
    }));

    const markerResults = allianceMarkers.map((marker) => ({
      id: `marker:${marker.id}`,
      label: marker.label,
      meta: `${marker.x}, ${marker.y}`,
      action: () => handleMarkerFocus(marker),
    }));

    return [...cityResults, ...poiResults, ...markerResults]
      .filter((entry) => entry.label.toLowerCase().includes(term) || entry.meta.toLowerCase().includes(term))
      .slice(0, 8);
  }, [allianceMarkers, handleCitySelect, handleMarkerFocus, handlePoiSelect, searchTerm, worldChunk]);

  const shortcuts = useMemo<ShortcutDefinition[]>(
    () => [
      { id: "search", label: "Aramaya odaklan", keys: "/" },
      { id: "marker", label: "İşaret etiketi", keys: "M" },
      { id: "camera", label: "Kamerayı işaretle", keys: "C" },
      { id: "recenter", label: "Obaya dön", keys: "R" },
      { id: "zoom-in", label: "Yakınlaş", keys: "+" },
      { id: "zoom-out", label: "Uzaklaş", keys: "-" },
      { id: "marker-prev", label: "Önceki işaret", keys: "[" },
      { id: "marker-next", label: "Sonraki işaret", keys: "]" },
      { id: "filters", label: "Filtreler", keys: "1-4" },
      { id: "close", label: "Panelleri kapat", keys: "Esc" },
    ],
    [],
  );

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) {
        return;
      }

      const editable = isEditableElement(event.target);

      if (event.key === "Escape") {
        if (event.target instanceof HTMLElement) {
          event.target.blur();
        }
        closeMapPanels();
        return;
      }

      if (editable) {
        return;
      }

      if (event.code === "Slash" || event.code === "KeyF") {
        event.preventDefault();
        handleFocusSearch();
        return;
      }

      if (event.code === "KeyM") {
        event.preventDefault();
        handleFocusMarkerInput();
        return;
      }

      if (event.code === "KeyC") {
        event.preventDefault();
        void handleQuickMarkerCreate("CAMERA");
        return;
      }

      if (event.code === "KeyR") {
        event.preventDefault();
        mapCommandRef.current?.focusTile(state.city.coordinates.x, state.city.coordinates.y);
        return;
      }

      if (event.code === "Equal" || event.code === "NumpadAdd") {
        event.preventDefault();
        mapCommandRef.current?.zoomIn();
        return;
      }

      if (event.code === "Minus" || event.code === "NumpadSubtract") {
        event.preventDefault();
        mapCommandRef.current?.zoomOut();
        return;
      }

      if (event.code === "BracketLeft") {
        event.preventDefault();
        handleCycleMarker(-1);
        return;
      }

      if (event.code === "BracketRight") {
        event.preventDefault();
        handleCycleMarker(1);
        return;
      }

      if (event.code === "Digit1") {
        setFilter("ALL");
      } else if (event.code === "Digit2") {
        setFilter("CITIES");
      } else if (event.code === "Digit3") {
        setFilter("CAMPS");
      } else if (event.code === "Digit4") {
        setFilter("NODES");
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    closeMapPanels,
    handleCycleMarker,
    handleFocusMarkerInput,
    handleFocusSearch,
    handleQuickMarkerCreate,
    state.city.coordinates.x,
    state.city.coordinates.y,
  ]);

  if (worldChunkQuery.isPending && !worldChunk) {
    return (
      <section className={styles.page}>
        <PageNotice title="Loading map" body="Camera rails, visible chunks, and command overlays are still assembling." />
      </section>
    );
  }

  if (worldChunkQuery.isError && !worldChunk) {
    return (
      <section className={styles.page}>
        <PageNotice
          title="Unable to load this world chunk"
          body="The strategic map could not pull the active frontier chunk. Retry once world state and network reachability settle."
          tone="danger"
        />
      </section>
    );
  }

  if (!worldChunk) {
    return <div className={styles.hero}>Harita açılıyor...</div>;
  }

  const handleComposerConfirm = async () => {
    if (composerMode === "SCOUT") {
      const target = getScoutTarget(selectedCity, selectedPoi);
      const response = await scoutMutation.mutateAsync({ targetCityId: selectedCity?.cityId, targetPoiId: selectedPoi?.id });
      if (target) {
        queueScoutTrail(response, target);
      }
      setComposerMode(null);
      setTargetSheetOpen(false);
      return;
    }

    if (composerMode === "RALLY") {
      await rallyMutation.mutateAsync({
        objective: selectedCity ? "CITY_ATTACK" : undefined,
        targetCityId: selectedCity?.cityId,
        targetPoiId: selectedPoi?.id,
        commanderId,
        troops: troopPayload,
      });
      setComposerMode(null);
      setTargetSheetOpen(false);
      return;
    }

    if (selectedCity && composerMode === "CITY_ATTACK") {
      await sendMarch({ targetCityId: selectedCity.cityId, commanderId, troops: troopPayload });
      setComposerMode(null);
      setTargetSheetOpen(false);
      return;
    }

    if (selectedPoi && (composerMode === "BARBARIAN_ATTACK" || composerMode === "RESOURCE_GATHER")) {
      await sendMarch({ objective: composerMode, targetPoiId: selectedPoi.id, commanderId, troops: troopPayload });
      setComposerMode(null);
      setTargetSheetOpen(false);
    }
  };
  handleComposerConfirmRef.current = handleComposerConfirm;

  return (
    <section className={styles.page}>
      <section className={styles.battlefieldLayout}>
        <div className={styles.mapStage}>
          <article className={styles.mapFrame}>
            <div className={styles.tacticalHud}>
              {selectedTargetName ? (
                <section className={styles.intelPanel}>
                  <div className={styles.intelPanelHeader}>
                    <div>
                      <p className={styles.hudEyebrow}>Aktif Seçim</p>
                      <h3 className={styles.hudTitle}>{selectedTargetName}</h3>
                    </div>
                    <div className={styles.statusCluster}>
                      <Badge tone={overlaySelectionTone}>{overlaySelectionLabel}</Badge>
                      {selectedTargetDistance != null ? (
                        <p className={styles.hudMeta}>{formatNumber(selectedTargetDistance)} karo</p>
                      ) : null}
                    </div>
                  </div>
                </section>
              ) : null}
              <div className={styles.controlsDeck}>
                <div className={styles.controls}>
                  <Button
                    type="button"
                    size="small"
                    variant="secondary"
                    aria-label={copy.map.zoomIn}
                    onClick={() => mapCommandRef.current?.zoomIn()}
                  >
                    +
                  </Button>
                  <Button
                    type="button"
                    size="small"
                    variant="secondary"
                    aria-label={copy.map.zoomOut}
                    onClick={() => mapCommandRef.current?.zoomOut()}
                  >
                    -
                  </Button>
                  <Button
                    type="button"
                    size="small"
                    variant="secondary"
                    onClick={() => mapCommandRef.current?.focusTile(state.city.coordinates.x, state.city.coordinates.y)}
                  >
                    Merkezle
                  </Button>
                </div>
                <div className={styles.chipRow}>
                  <Button type="button" size="small" variant={filter === "ALL" ? "primary" : "secondary"} onClick={() => setFilter("ALL")}>
                    Hepsi
                  </Button>
                  <Button type="button" size="small" variant={filter === "CITIES" ? "primary" : "secondary"} onClick={() => setFilter("CITIES")}>
                    Obalar
                  </Button>
                  <Button type="button" size="small" variant={filter === "CAMPS" ? "primary" : "secondary"} onClick={() => setFilter("CAMPS")}>
                    Kamplar
                  </Button>
                  <Button type="button" size="small" variant={filter === "NODES" ? "primary" : "secondary"} onClick={() => setFilter("NODES")}>
                    Bereketler
                  </Button>
                  <Button type="button" size="small" variant={showPaths ? "primary" : "secondary"} onClick={() => setShowPaths((current) => !current)}>
                    Yollar
                  </Button>
                  <Button
                    type="button"
                    size="small"
                    variant={showScoutTrails ? "primary" : "secondary"}
                    onClick={() => setShowScoutTrails((current) => !current)}
                  >
                    Keşifçiler
                  </Button>
                  <Button
                    type="button"
                    size="small"
                    variant={showReports ? "primary" : "secondary"}
                    onClick={() => setShowReports((current) => !current)}
                  >
                    Akınlar
                  </Button>
                </div>
              </div>
            </div>
            <aside className={styles.minimapCard}>
              <div className={styles.minimapHeader}>
                <strong className={styles.cardTitle}>Bozkır Merceği</strong>
                <Badge tone="info">{cameraView.detailLevel}</Badge>
              </div>
              <div className={styles.minimapFrame}>
                <svg
                  className={styles.minimap}
                  viewBox={`0 0 ${worldChunk.size} ${worldChunk.size}`}
                  role="img"
                  aria-label="Bozkır minimap"
                >
                  {minimapCells.map((cell) => (
                    <g key={`${cell.x}:${cell.y}`}>
                      <rect
                        x={cell.x}
                        y={cell.y}
                        width={minimapStep}
                        height={minimapStep}
                        fill={getMinimapStateColor(cell.state)}
                      />
                      <rect
                        x={cell.x}
                        y={cell.y}
                        width={minimapStep}
                        height={minimapStep}
                        fill={cell.region.color}
                        opacity={getMinimapRegionOpacity(cell.state)}
                      />
                    </g>
                  ))}
                  <circle
                    cx={minimapWorldSize / 2}
                    cy={minimapWorldSize / 2}
                    r={kingdomRingRadii.inner}
                    fill="none"
                    stroke="#a888d8"
                    strokeOpacity="0.42"
                    strokeWidth="0.7"
                  />
                  <circle
                    cx={minimapWorldSize / 2}
                    cy={minimapWorldSize / 2}
                    r={kingdomRingRadii.outer}
                    fill="none"
                    stroke="#6ca7d8"
                    strokeOpacity="0.34"
                    strokeWidth="0.7"
                  />
                  {worldRegions.map((region) => (
                    <g key={region.id}>
                      <rect
                        x={region.x0}
                        y={region.y0}
                        width={region.x1 - region.x0 + 1}
                        height={region.y1 - region.y0 + 1}
                        fill="none"
                        stroke={region.color}
                        strokeOpacity="0.28"
                        strokeWidth="0.6"
                        strokeDasharray="1.2 1.4"
                      />
                      <text
                        x={region.anchorX}
                        y={region.anchorY}
                        textAnchor="middle"
                        fontSize="2.35"
                        fill={region.color}
                        opacity="0.72"
                      >
                        {region.shortLabel}
                      </text>
                    </g>
                  ))}
                  {kingdomPasses.map((pass) => (
                    <g key={pass.id}>
                      <rect
                        x={pass.x - 0.55}
                        y={pass.y - 0.2}
                        width="1.1"
                        height="0.4"
                        rx="0.2"
                        fill={pass.tier === "TIER_3" ? "#d7b4ff" : "#9fd2ff"}
                        opacity="0.86"
                        transform={`rotate(${(pass.angle * 180) / Math.PI} ${pass.x} ${pass.y})`}
                      />
                      <title>{pass.label}</title>
                    </g>
                  ))}
                  {kingdomSanctuaries.map((sanctuary) => (
                    <g key={sanctuary.id}>
                      <polygon
                        points={`${sanctuary.x},${sanctuary.y - 0.85} ${sanctuary.x + 0.75},${sanctuary.y} ${sanctuary.x},${sanctuary.y + 0.85} ${sanctuary.x - 0.75},${sanctuary.y}`}
                        fill={sanctuary.color}
                        fillOpacity={sanctuary.id === "crown-temple" ? "0.95" : "0.72"}
                        stroke="#f8f0dd"
                        strokeWidth="0.18"
                      />
                      <title>{sanctuary.label}</title>
                    </g>
                  ))}
                  {worldChunk.pois.map((poi) => (
                    <circle
                      key={poi.id}
                      cx={poi.x + 0.5}
                      cy={poi.y + 0.5}
                      r={poi.kind === "BARBARIAN_CAMP" ? 0.72 : 0.5}
                      fill={poi.kind === "BARBARIAN_CAMP" ? "#d47b5a" : "#e2bb72"}
                      opacity={poi.id === selectedPoiId ? 1 : 0.72}
                    />
                  ))}
                  {worldChunk.cities.map((city) => (
                    <circle
                      key={city.cityId}
                      cx={city.x + 0.5}
                      cy={city.y + 0.5}
                      r={city.isCurrentPlayer ? 0.95 : 0.75}
                      fill={
                        city.isCurrentPlayer ? "#72ced1" : alliedOwnerNames.includes(city.ownerName) ? "#5fc8da" : "#f4d79c"
                      }
                      opacity={city.cityId === selectedCityId ? 1 : 0.84}
                    />
                  ))}
                  {allianceMarkers.map((marker) => (
                    <g key={marker.id}>
                      <polygon
                        points={`${marker.x + 0.5},${marker.y - 0.35} ${marker.x + 1.1},${marker.y + 0.5} ${marker.x + 0.5},${marker.y + 1.35} ${marker.x - 0.1},${marker.y + 0.5}`}
                        fill="#72ced1"
                        fillOpacity="0.92"
                        stroke="#f4d79c"
                        strokeWidth="0.24"
                      />
                      <circle cx={marker.x + 0.5} cy={marker.y + 0.5} r="0.24" fill="#f8f0dd" opacity="0.95" />
                      <title>{marker.label}</title>
                    </g>
                  ))}
                  <rect
                    x={minimapViewport.x}
                    y={minimapViewport.y}
                    width={minimapViewport.width}
                    height={minimapViewport.height}
                    fill="none"
                    stroke="#f8f0dd"
                    strokeWidth="1"
                    rx="1.4"
                    opacity="0.95"
                  />
                  <circle
                    cx={cameraView.centerTileX + 0.5}
                    cy={cameraView.centerTileY + 0.5}
                    r="1.15"
                    fill="#7dd3fc"
                    opacity="0.92"
                  />
                  {minimapPing ? (
                    <>
                      <circle
                        className={styles.minimapPing}
                        cx={minimapPing.x + 0.5}
                        cy={minimapPing.y + 0.5}
                        r="1.4"
                        fill="none"
                        stroke="#7dd3fc"
                        strokeWidth="0.9"
                      />
                      <circle
                        className={styles.minimapPingCore}
                        cx={minimapPing.x + 0.5}
                        cy={minimapPing.y + 0.5}
                        r="0.95"
                        fill="#f4d79c"
                        opacity="0.92"
                      />
                    </>
                  ) : null}
                </svg>
                <button
                  type="button"
                  className={styles.minimapHotspot}
                aria-label="Minimap ile merkeze al"
                  onClick={handleMinimapClick}
                />
              </div>
              <p className={styles.minimapHint}>
                Renkler devletleri, halkalar tier bölgelerini, parlak kapılar da dağ geçitlerini gösterir.
              </p>
              {visibleAllianceMarkers.length > 0 ? (
                <div className={styles.minimapMarkerRow}>
                  {visibleAllianceMarkers.map((marker) => (
                    <button
                      key={marker.id}
                      type="button"
                      className={styles.minimapMarkerButton}
                      onClick={() => handleMarkerFocus(marker)}
                    >
                      {marker.label}
                    </button>
                  ))}
                </div>
              ) : null}
            </aside>
            <Suspense fallback={<div className={styles.hero}>Harita açılıyor...</div>}>
              <WorldMap
                worldSize={worldChunk.size}
                initialCenter={state.city.coordinates}
                tiles={worldChunk.tiles}
                cities={worldChunk.cities}
                pois={worldChunk.pois}
                marches={worldChunk.marches}
                scoutTrails={scoutTrails}
                reportMarkers={reportMarkers}
                playerCityBuildings={state.city.buildings.map((building) => ({
                  type: building.type,
                  level: building.level,
                }))}
                filter={filter}
                showPaths={showPaths}
                showScoutTrails={showScoutTrails}
                showReports={showReports}
                alliedOwnerNames={alliedOwnerNames}
                allianceTag={alliance?.tag ?? null}
                allianceMarkers={allianceMarkers}
                selectedCityId={selectedCityId}
                selectedPoiId={selectedPoiId}
                selectedMarchId={selectedMarchId}
                onSelectCity={(cityId) => {
                  const city = worldChunk.cities.find((entry) => entry.cityId === cityId);
                  if (city) {
                    handleCitySelect(city);
                  }
                }}
                onSelectPoi={(poiId) => {
                  const poi = worldChunk.pois.find((entry) => entry.id === poiId);
                  if (poi) {
                    handlePoiSelect(poi);
                  }
                }}
                onSelectMarch={handleMarchSelect}
                onOpenReport={handleOpenReport}
                onOpenFieldCommand={handleFieldCommandOpen}
                onCameraChange={handleCameraChange}
                onHoverChange={handleHoverChange}
                commandHandleRef={mapCommandRef}
              />
            </Suspense>
            <div className={styles.mapCompass} aria-hidden="true">
              <span className={styles.mapCompassRing} />
              <span className={styles.mapCompassNorth}>K</span>
              <span className={styles.mapCompassMeta}>
                {cameraView.centerTileX},{cameraView.centerTileY}
              </span>
            </div>
            {hoverInfo ? (
              <div
                className={[styles.mapTooltip, styles[`mapTooltipTone${hoverInfo.tone[0].toUpperCase()}${hoverInfo.tone.slice(1)}` as keyof typeof styles]]
                  .filter(Boolean)
                  .join(" ")}
                style={{
                  transform: `translate3d(${hoverInfo.screenX + 14}px, ${hoverInfo.screenY + 18}px, 0)`,
                }}
                role="status"
                aria-live="polite"
              >
                <strong className={styles.mapTooltipTitle}>{hoverInfo.label}</strong>
                <span className={styles.mapTooltipSubtitle}>{hoverInfo.subtitle}</span>
              </div>
            ) : null}
          </article>
        </div>

        <aside className={styles.sideRail}>
          <SectionCard kicker="OBA TEZGAHLARI" title="Oba Kuyrukları" className={styles.marchSection}>
            <div className={styles.queueList}>
              {hud.queueItems.map((item) => (
                <article key={item.id} className={styles.queueCard}>
                  <div className={styles.queueMeta}>
                    <strong className={styles.cardTitle}>{item.label}</strong>
                    <Badge tone={item.value === "Boş" || item.value === "Hazır" ? "warning" : "info"}>
                      {item.value}
                    </Badge>
                  </div>
                  <p className={styles.muted}>{item.hint}</p>
                </article>
              ))}
            </div>
          </SectionCard>

          <SectionCard kicker={copy.map.activeMarches} title="Sefer Defteri" className={styles.marchSection}>
            <div className={styles.marchList}>
              {state.city.activeMarches.length === 0 ? (
                <p className={styles.commandHint}>Aktif sefer yok.</p>
              ) : null}
              {state.city.activeMarches.map((march) => {
                const troopTotal = Object.values(march.troops).reduce((sum, value) => sum + value, 0);
                const progressPercent = getMarchProgressPercent(march, now);
                const cargoSummary = getMarchCargoSummary(march.cargo);
                const isSelected = selectedMarchId === march.id;

                return (
                  <article
                    key={march.id}
                    className={[styles.marchCard, isSelected ? styles.marchCardActive : ""].filter(Boolean).join(" ")}
                    role="button"
                    tabIndex={0}
                    onClick={() => handleMarchSelect(march.id)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        handleMarchSelect(march.id);
                      }
                    }}
                  >
                    <div className={styles.marchMeta}>
                      <strong className={styles.cardTitle}>{march.targetPoiName ?? march.targetCityName ?? "Hedef"}</strong>
                      <Badge tone={getMarchStatusTone(march.state)}>{getMarchStateLabel(march.state)}</Badge>
                    </div>
                    <div className={styles.marchSignalRow}>
                      <span className={styles.marchObjectivePill}>{getMarchObjectiveLabel(march.objective)}</span>
                      <span className={styles.marchSignalMeta}>{march.commanderName}</span>
                    </div>
                    <div className={styles.progressRail} aria-hidden="true">
                      <span style={{ width: `${progressPercent}%` }} />
                    </div>
                    <p className={styles.muted}>
                      {getMarchTimingLabel(march, now)} | Mesafe {formatNumber(march.distance)} karo
                    </p>
                    <div className={styles.marchFootnote}>
                      <span>{formatNumber(troopTotal)} birlik</span>
                      <span>{cargoSummary}</span>
                    </div>
                    <div className={styles.actionRow}>
                      <Button
                        type="button"
                        size="small"
                        variant="ghost"
                        disabled={isRecallingMarch}
                        onClick={(event) => {
                          event.stopPropagation();
                          recallMarch(march.id);
                        }}
                      >
                        {isRecallingMarch ? "Bekle" : "Geri çağır"}
                      </Button>
                      <Button
                        type="button"
                        size="small"
                        variant="secondary"
                        disabled={retargetMutation.isPending || !canRetargetMarch(march, selectedCity, selectedPoi)}
                        onClick={(event) => {
                          event.stopPropagation();
                          retargetMutation.mutate({
                            marchId: march.id,
                            targetCityId: march.objective === "CITY_ATTACK" ? selectedCity?.cityId : undefined,
                            targetPoiId: march.objective !== "CITY_ATTACK" ? selectedPoi?.id : undefined,
                          });
                        }}
                      >
                        {copy.map.retarget}
                      </Button>
                    </div>
                  </article>
                );
              })}
            </div>
          </SectionCard>

          <section className={styles.commandStrip}>
            <article className={styles.commandCard}>
              <div className={styles.commandHeader}>
                <strong className={styles.cardTitle}>Bozkır Arama</strong>
                <Badge tone="info">{searchResults.length} eşleşme</Badge>
              </div>
              <input
                ref={searchInputRef}
                className={styles.commandInput}
                type="search"
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder="Oba, kamp, kaynak veya işaret ara"
              />
              {searchResults.length > 0 ? (
                <div className={styles.searchResults}>
                  {searchResults.map((entry) => (
                    <button
                      key={entry.id}
                      type="button"
                      className={styles.searchButton}
                      onClick={() => {
                        entry.action();
                        setSearchTerm("");
                      }}
                    >
                      <strong>{entry.label}</strong>
                      <span>{entry.meta}</span>
                    </button>
                  ))}
                </div>
              ) : (
                <p className={styles.commandHint}>Mevcut bölgedeki obalar, hedefler ve toy işaretleri arasında hızlı geçiş yap.</p>
              )}
            </article>
            <article className={styles.commandCard}>
              <div className={styles.commandHeader}>
                <strong className={styles.cardTitle}>Toy Sancakları</strong>
                <Badge tone={alliance ? "success" : "warning"}>{alliance ? alliance.tag : "Toy yok"}</Badge>
              </div>
              <input
                ref={markerInputRef}
                className={styles.commandInput}
                type="text"
                value={markerDraft}
                onChange={(event) => setMarkerDraft(event.target.value)}
                placeholder={selectedMarkerTarget ? `${selectedMarkerTarget.label} etiketi` : "İşaret etiketi"}
              />
              <div className={styles.actionRow}>
                <Button
                  type="button"
                  size="small"
                  variant="secondary"
                  disabled={createMarkerMutation.isPending}
                  onClick={() => handleQuickMarkerCreate("CAMERA")}
                >
                  {createMarkerMutation.isPending ? "Gönderiliyor" : "Kamerayı işaretle"}
                </Button>
                <Button
                  type="button"
                  size="small"
                  variant="primary"
                  disabled={createMarkerMutation.isPending || !selectedMarkerTarget}
                  onClick={() => handleQuickMarkerCreate("TARGET")}
                >
                  Hedefi işaretle
                </Button>
              </div>
              <p className={styles.commandHint}>
                {selectedMarkerTarget
                  ? `Seçili hedef: ${selectedMarkerTarget.label} | ${selectedMarkerTarget.x}, ${selectedMarkerTarget.y}.`
                  : "Odaklı işaret bırakmak için bir oba veya POI seç."}
              </p>
              {mapNotice ? <p className={styles.commandNotice}>{mapNotice}</p> : null}
            </article>
            <article className={styles.commandCard}>
              <div className={styles.commandHeader}>
                <strong className={styles.cardTitle}>Hızlı Buyruklar</strong>
                <Badge tone="info">{recentAllianceMarkers.length} işaret</Badge>
              </div>
              <div className={styles.shortcutGrid}>
                {shortcuts.map((shortcut) => (
                  <div key={shortcut.id} className={styles.shortcutItem}>
                    <span>{shortcut.label}</span>
                    <kbd className={styles.kbd}>{shortcut.keys}</kbd>
                  </div>
                ))}
              </div>
              <div className={styles.markerList}>
                {recentAllianceMarkers.length > 0 ? (
                  recentAllianceMarkers.map((marker) => (
                    <div key={marker.id} className={styles.markerRow}>
                      <button type="button" className={styles.markerFocus} onClick={() => handleMarkerFocus(marker)}>
                        <strong>{marker.label}</strong>
                        <span className={styles.markerMeta}>
                          {marker.x}, {marker.y} / {formatMarkerAge(marker.createdAt, now)}
                          {marker.expiresAt ? ` / ${formatTimeRemaining(marker.expiresAt, now)} kaldı` : ""}
                        </span>
                      </button>
                      {marker.canDelete ? (
                        <Button
                          type="button"
                          size="small"
                          variant="ghost"
                          disabled={deleteMarkerMutation.isPending}
                          onClick={(event) => handleMarkerDelete(event, marker)}
                        >
                          Kaldır
                        </Button>
                      ) : null}
                    </div>
                  ))
                ) : (
                  <p className={styles.commandHint}>Haritadan bırakılan toy işaretleri hızlı odak için burada görünür.</p>
                )}
              </div>
            </article>
          </section>

          <section className={styles.rail}>
            {targetCards.map((entry) => (
              <button
                key={entry.id}
                className={styles.targetCard}
                type="button"
                onClick={() =>
                  entry.kind === "CITY"
                    ? handleCitySelect(entry.city, { focus: true })
                    : handlePoiSelect(entry.poi, { focus: true })
                }
              >
                <strong className={styles.cardTitle}>{entry.label}</strong>
                <p className={styles.targetMeta}>{entry.meta}</p>
              </button>
            ))}
          </section>

          {activeBattleWindow ? (
            <BattleWindowPanel battleWindow={activeBattleWindow} now={now} allianceTag={alliance?.tag ?? null} />
          ) : null}

          {showReports ? (
            <SectionCard kicker="Rapor İşaretleri" title="Görünür geçmiş">
              <div className={styles.intelList}>
                {reportMarkers.length === 0 ? (
                  <p className={styles.commandHint}>Bu görünür bölgede çözülen savaş ve dönüşler burada belirir.</p>
                ) : (
                  reportMarkers.slice(0, 6).map((report) => (
                    <button
                      key={report.id}
                      type="button"
                      className={styles.intelCard}
                      onClick={() => handleOpenReport(report.id)}
                    >
                      <div className={styles.intelHeader}>
                        <Badge tone={report.resultTone}>
                          {report.kind === "CITY_BATTLE"
                            ? "Kuşatma"
                            : report.kind === "BARBARIAN_BATTLE"
                              ? "Kamp"
                              : "Dönüş"}
                        </Badge>
                        <span className={styles.intelMeta}>{report.x}, {report.y}</span>
                      </div>
                      <strong className={styles.cardTitle}>{report.label}</strong>
                      <p className={styles.commandHint}>{getReportKindLabel(report.kind)} işareti etkin mercekte.</p>
                    </button>
                  ))
                )}
              </div>
            </SectionCard>
          ) : null}


        </aside>
      </section>

      <BottomSheet
        open={targetSheetVisible || Boolean(composerMode)}
        title={composerMode ? composerTitle : `Buyruk Tepsisi: ${selectedTargetName ?? "-"}`}
        onClose={() => {
          if (composerMode) {
            setComposerMode(null);
          } else {
            setTargetSheetOpen(false);
          }
        }}
        mode="aside"
        actions={
          composerMode ? (
            <>
              <Button type="button" variant="ghost" onClick={() => setComposerMode(null)}>
                Vazgeç
              </Button>
              <Button
                type="button"
                disabled={isSendingMarch || (composerMode !== "SCOUT" && totalAssignedTroops <= 0)}
                onClick={() => void handleComposerConfirm()}
              >
                {composerActionLabel}
              </Button>
            </>
          ) : undefined
        }
      >
        <div
          className={styles.composerGrid}
          data-map-composer={composerMode ?? undefined}
          data-map-target-tray={composerMode ? undefined : "open"}
        >
          {composerMode ? (
            <>
              <section className={styles.composerHero}>
                <div>
                  <p className={styles.hudEyebrow}>Buyruk Hazırlığı</p>
                  <strong className={styles.cardTitle}>{selectedTargetName ?? "Hedef seç"}</strong>
                  <p className={styles.muted}>{selectedTargetSubtitle}</p>
                </div>
                <Badge
                  tone={
                    composerMode === "SCOUT"
                      ? "info"
                      : composerMode === "RESOURCE_GATHER"
                        ? "success"
                        : "warning"
                  }
                >
                  {composerMode === "SCOUT"
                    ? "Keşif"
                    : composerMode === "RESOURCE_GATHER"
                      ? "Hasat"
                      : composerMode === "RALLY"
                        ? "Toy"
                        : "Akın"}
                </Badge>
              </section>
              <div className={styles.composerStats}>
                <article className={styles.composerStatCard}>
                  <span className={styles.composerStatLabel}>Mesafe</span>
                  <strong className={styles.composerStatValue}>
                    {selectedTargetDistance != null ? `${formatNumber(selectedTargetDistance)} karo` : "-"}
                  </strong>
                </article>
                <article className={styles.composerStatCard}>
                  <span className={styles.composerStatLabel}>{composerMode === "SCOUT" ? "Rapor" : "ETA"}</span>
                  <strong className={styles.composerStatValue}>
                    {composerMode === "SCOUT"
                      ? "Ulak bilgisi"
                      : estimatedMarchEtaMs != null
                        ? formatTimeRemaining(new Date(now + estimatedMarchEtaMs).toISOString(), now)
                        : "Birlik bekliyor"}
                  </strong>
                </article>
                <article className={styles.composerStatCard}>
                  <span className={styles.composerStatLabel}>{composerMode === "SCOUT" ? "Kapsam" : "Güç"}</span>
                  <strong className={styles.composerStatValue}>
                    {composerMode === "SCOUT" ? "Hedef okuması" : formatNumber(estimatedPower)}
                  </strong>
                </article>
                <article className={styles.composerStatCard}>
                  <span className={styles.composerStatLabel}>{composerMode === "SCOUT" ? "Tarama" : "Taşıma"}</span>
                  <strong className={styles.composerStatValue}>
                    {composerMode === "SCOUT" ? "Yüksek detay" : formatNumber(estimatedCarry)}
                  </strong>
                </article>
              </div>
              {composerMode !== "SCOUT" ? (
                <>
                  <section className={styles.commanderCard}>
                    <div className={styles.composerRow}>
                      <span className={styles.muted}>Başbuğ</span>
                      <select aria-label="Başbuğ" value={commanderId} onChange={(event) => setCommanderId(event.target.value)}>
                        {state.city.commanders.map((commander) => (
                          <option key={commander.id} value={commander.id}>
                            {commander.name} L{commander.level}
                          </option>
                        ))}
                      </select>
                    </div>
                    <p className={styles.commanderMeta}>
                      Sefer +{selectedCommander?.marchSpeedBonusPct ?? 0}% / Taşıma +
                      {selectedCommander?.carryBonusPct ?? 0}% / Akın +{selectedCommander?.attackBonusPct ?? 0}% /
                      Kalkan +{selectedCommander?.defenseBonusPct ?? 0}%
                    </p>
                  </section>
                  <div className={styles.troopDeck}>
                    {state.city.troops.map((troop) => (
                      <article key={troop.type} className={styles.sliderCard}>
                        <label htmlFor={`troop-${troop.type}`} className={styles.sliderLabelRow}>
                          <span>
                            <strong>{troop.label}</strong>
                            <span className={styles.sliderMeta}>
                              Yedek {formatNumber(troop.quantity)} / Taşıma {formatNumber(troop.carry)}
                            </span>
                          </span>
                          <strong>{formatNumber(troopPayload[troop.type])}</strong>
                        </label>
                        <input
                          id={`troop-${troop.type}`}
                          className={styles.sliderTrack}
                          type="range"
                          min={0}
                          max={troop.quantity}
                          value={troopPayload[troop.type]}
                          onChange={(event) =>
                            setTroopPayload((current) => ({
                              ...current,
                              [troop.type]: Number(event.target.value),
                            }))
                          }
                        />
                        <p className={styles.sliderFooter}>
                          {troop.quantity > 0
                            ? `%${Math.round((troopPayload[troop.type] / troop.quantity) * 100)} ayrıldı`
                            : "Birlik yok"}
                        </p>
                      </article>
                    ))}
                  </div>
                </>
              ) : (
                <section className={styles.commanderCard}>
                  <div className={styles.composerRow}>
                    <span className={styles.muted}>Keşif bedeli</span>
                    <strong>Birlik yok</strong>
                  </div>
                  {selectedPoi?.resourceType ? (
                    <div className={styles.composerRow}>
                      <span className={styles.muted}>Kaynak</span>
                      <strong>{copy.poiResources[selectedPoi.resourceType]}</strong>
                    </div>
                  ) : null}
                </section>
              )}
            </>
          ) : selectedCity ? (
            <>
              <section className={styles.composerHero}>
                <div>
                  <p className={styles.hudEyebrow}>Kuşatma Hedefi</p>
                  <strong className={styles.cardTitle}>{selectedTargetName}</strong>
                  <p className={styles.muted}>{selectedTargetSubtitle}</p>
                </div>
                <Badge tone={selectedCity.projectedOutcome === "ATTACKER_WIN" ? "success" : "warning"}>
                  {selectedCity.projectedOutcome === "ATTACKER_WIN" ? "Elverişli" : "Dirençli"}
                </Badge>
              </section>
              <section className={styles.commandActionGrid}>
                <article className={styles.commandActionCard}>
                  <p className={styles.commandActionEyebrow}>Keşif Taraması</p>
                  <strong className={styles.commandActionTitle}>Keşif hattını aç</strong>
                  <Button type="button" variant="secondary" onClick={() => openComposer("SCOUT")}>
                    {copy.map.scout}
                  </Button>
                </article>
                <article className={styles.commandActionCard}>
                  <p className={styles.commandActionEyebrow}>Toy Çağrısı</p>
                  <strong className={styles.commandActionTitle}>Sancak kaldır</strong>
                  <Button type="button" variant="ghost" onClick={() => openComposer("RALLY")}>
                    {copy.map.rally}
                  </Button>
                </article>
                <article className={styles.commandActionCard}>
                  <p className={styles.commandActionEyebrow}>Ana Buyruk</p>
                  <strong className={styles.commandActionTitle}>Kuşatma düzenini gönder</strong>
                  <Button type="button" variant="primary" onClick={() => openComposer(targetPrimaryMode)}>
                    {targetPrimaryActionLabel}
                  </Button>
                </article>
              </section>
              <div className={styles.composerStats}>
                <article className={styles.composerStatCard}>
                  <span className={styles.composerStatLabel}>Savunma</span>
                  <strong className={styles.composerStatValue}>{formatNumber(selectedCity.defensePower)}</strong>
                </article>
                <article className={styles.composerStatCard}>
                  <span className={styles.composerStatLabel}>Mesafe</span>
                  <strong className={styles.composerStatValue}>
                    {selectedCity.distance != null ? `${formatNumber(selectedCity.distance)} karo` : "-"}
                  </strong>
                </article>
                <article className={styles.composerStatCard}>
                  <span className={styles.composerStatLabel}>ETA</span>
                  <strong className={styles.composerStatValue}>
                    {previewMarchEtaMs != null
                      ? formatTimeRemaining(new Date(now + previewMarchEtaMs).toISOString(), now)
                      : "-"}
                  </strong>
                </article>
                <article className={styles.composerStatCard}>
                  <span className={styles.composerStatLabel}>Güç</span>
                  <strong className={styles.composerStatValue}>{formatNumber(previewPower)}</strong>
                </article>
              </div>
            </>
          ) : selectedPoi ? (
            <>
              <section className={styles.composerHero}>
                <div>
                  <p className={styles.hudEyebrow}>Saha Hedefi</p>
                  <strong className={styles.cardTitle}>{selectedTargetName}</strong>
                  <p className={styles.muted}>{selectedTargetSubtitle}</p>
                </div>
                <Badge tone={selectedPoi.kind === "RESOURCE_NODE" ? "info" : "warning"}>
                  {selectedPoi.kind === "RESOURCE_NODE" ? "Hasada açık" : "Dirençli"}
                </Badge>
              </section>
              <section className={styles.commandActionGrid}>
                <article className={styles.commandActionCard}>
                  <p className={styles.commandActionEyebrow}>Keşif Taraması</p>
                  <strong className={styles.commandActionTitle}>Hedefi oku</strong>
                  <Button type="button" variant="secondary" onClick={() => openComposer("SCOUT")}>
                    {copy.map.scout}
                  </Button>
                </article>
                {selectedPoi.kind === "BARBARIAN_CAMP" ? (
                  <article className={styles.commandActionCard}>
                    <p className={styles.commandActionEyebrow}>Toy Çağrısı</p>
                    <strong className={styles.commandActionTitle}>Toy hattı aç</strong>
                    <Button type="button" variant="ghost" onClick={() => openComposer("RALLY")}>
                      {copy.map.rally}
                    </Button>
                  </article>
                ) : null}
                <article className={styles.commandActionCard}>
                  <p className={styles.commandActionEyebrow}>Ana Buyruk</p>
                  <strong className={styles.commandActionTitle}>
                    {selectedPoi.kind === "BARBARIAN_CAMP" ? "Akın kolunu gönder" : "Hasat düzenini aç"}
                  </strong>
                  <Button type="button" variant="primary" onClick={() => openComposer(targetPrimaryMode)}>
                    {targetPrimaryActionLabel}
                  </Button>
                </article>
              </section>
              <div className={styles.composerStats}>
                <article className={styles.composerStatCard}>
                  <span className={styles.composerStatLabel}>Seviye</span>
                  <strong className={styles.composerStatValue}>L{selectedPoi.level}</strong>
                </article>
                <article className={styles.composerStatCard}>
                  <span className={styles.composerStatLabel}>Mesafe</span>
                  <strong className={styles.composerStatValue}>
                    {selectedPoi.distance != null ? `${formatNumber(selectedPoi.distance)} karo` : "-"}
                  </strong>
                </article>
                <article className={styles.composerStatCard}>
                  <span className={styles.composerStatLabel}>Durum</span>
                  <strong className={styles.composerStatValue}>{getPoiStateLabel(selectedPoi.state)}</strong>
                </article>
                <article className={styles.composerStatCard}>
                  <span className={styles.composerStatLabel}>Miktar</span>
                  <strong className={styles.composerStatValue}>
                    {selectedPoi.remainingAmount != null ? formatNumber(selectedPoi.remainingAmount) : "-"}
                  </strong>
                </article>
              </div>
            </>
          ) : null}
        </div>
      </BottomSheet>

      <BottomSheet
        open={fieldCommandVisible}
        title={`Saha Buyruğu: ${fieldCommand?.label ?? "-"}`}
        onClose={() => setFieldCommand(null)}
        mode="aside"
        actions={
          fieldCommand ? (
            <>
              <Button type="button" variant="secondary" onClick={handleFieldCommandFocus}>
                Konuma odaklan
              </Button>
              {fieldCommandCanOpenTarget ? (
                <Button type="button" variant="ghost" onClick={handleFieldCommandOpenTarget}>
                  Hedefi aç
                </Button>
              ) : null}
              {fieldCommandCanScout ? (
                <Button type="button" onClick={handleFieldCommandScout}>
                  {copy.map.scout}
                </Button>
              ) : null}
            </>
          ) : undefined
        }
      >
        {fieldCommand ? (
          <div className={styles.composerGrid}>
            <section className={styles.composerHero}>
              <div>
                <p className={styles.hudEyebrow}>Saha Buyruğu</p>
                <strong className={styles.cardTitle}>{fieldCommand.label}</strong>
                <p className={styles.muted}>
                  {getFieldCommandKindLabel(fieldCommand.kind)} hedefi | {fieldCommand.x}, {fieldCommand.y}
                </p>
              </div>
              <Badge tone={fieldCommand.kind === "TILE" ? "info" : fieldCommand.kind === "CITY" ? "warning" : "success"}>
                {fieldCommand.kind === "TILE" ? "Harita işareti" : fieldCommand.kind === "CITY" ? "Kuşatma hedefi" : "Saha hedefi"}
              </Badge>
            </section>
            <section className={styles.commandPreviewGrid}>
              <article className={styles.commandPreviewCard}>
                <span className={styles.commandPreviewLabel}>Tür</span>
                <strong className={styles.commandPreviewValue}>{getFieldCommandKindLabel(fieldCommand.kind)}</strong>
              </article>
              <article className={styles.commandPreviewCard}>
                <span className={styles.commandPreviewLabel}>Koordinat</span>
                <strong className={styles.commandPreviewValue}>{fieldCommand.x}, {fieldCommand.y}</strong>
              </article>
              <article className={styles.commandPreviewCard}>
                <span className={styles.commandPreviewLabel}>Mesafe</span>
                <strong className={styles.commandPreviewValue}>
                  {fieldCommandDistance != null ? `${formatNumber(fieldCommandDistance)} karo` : "-"}
                </strong>
              </article>
            </section>
            <section className={styles.commandActionGrid}>
              <article className={styles.commandActionCard}>
                <p className={styles.commandActionEyebrow}>Kamera Kontrolü</p>
                <strong className={styles.commandActionTitle}>Sahayı sabitle</strong>
                <p className={styles.commandActionCopy}>
                  Araziyi, rotayı veya rapor işaretlerini okumak için kamerayı bu koordinata al.
                </p>
                <Button type="button" variant="secondary" onClick={handleFieldCommandFocus}>
                  Konuma odaklan
                </Button>
              </article>
              <article className={styles.commandActionCard}>
                <p className={styles.commandActionEyebrow}>Hedef Köprüsü</p>
                <strong className={styles.commandActionTitle}>
                  {fieldCommandCanOpenTarget ? "Hedef tepsisini aç" : "Gerçek hedef bekliyor"}
                </strong>
                <p className={styles.commandActionCopy}>
                  Oba ve POI saha buyrukları keşif, toy ve sefer kararlarına doğrudan atlar.
                </p>
                <Button type="button" variant="ghost" disabled={!fieldCommandCanOpenTarget} onClick={handleFieldCommandOpenTarget}>
                  Hedefi aç
                </Button>
              </article>
              <article className={styles.commandActionCard}>
                <p className={styles.commandActionEyebrow}>Toy İşareti</p>
                <strong className={styles.commandActionTitle}>İşareti buyruk yap</strong>
                <p className={styles.commandActionCopy}>
                  Bu konumu toy işaretlerine yaz; kamera kayınca bile koordinat okunur kalsın.
                </p>
                <Button type="button" onClick={() => void handleFieldMarkerCreate()} disabled={createMarkerMutation.isPending}>
                  {createMarkerMutation.isPending ? "Gönderiliyor" : "İşaret bırak"}
                </Button>
              </article>
            </section>
            <SectionCard kicker="İşaret Etiketi" title="Toy işareti gönderimi">
              <div className={styles.fieldCommandMeta}>
                <label className={styles.fieldCommandLabel}>
                  <span className={styles.commandPreviewLabel}>İşaret etiketi</span>
                  <input
                    className={styles.commandInput}
                    type="text"
                    value={fieldMarkerDraft}
                    onChange={(event) => setFieldMarkerDraft(event.target.value)}
                    placeholder={fieldCommand.label}
                  />
                </label>
                <p className={styles.commandHint}>
                  Kısa etiket kullan; minimap ve toy hattı kalabalıkta okunur kalsın.
                </p>
              </div>
            </SectionCard>
          </div>
        ) : null}
      </BottomSheet>

      <BottomSheet
        open={selectedMarchVisible}
        title={`Sefer Defteri: ${selectedMarch?.targetPoiName ?? selectedMarch?.targetCityName ?? "-"}`}
        onClose={() => setSelectedMarchId(null)}
        mode="aside"
        actions={
          selectedMarch ? (
            <>
              <Button type="button" variant="secondary" onClick={() => mapCommandRef.current?.focusMarch(selectedMarch.id)}>
                Rotayı izle
              </Button>
              <Button
                type="button"
                variant="ghost"
                disabled={isRecallingMarch}
                onClick={() => {
                  void recallMarch(selectedMarch.id);
                  setSelectedMarchId(null);
                }}
              >
                {isRecallingMarch ? "Bekle" : "Geri çağır"}
              </Button>
              <Button
                type="button"
                disabled={retargetMutation.isPending || !selectedMarchRetargetable}
                onClick={() => {
                  retargetMutation.mutate({
                    marchId: selectedMarch.id,
                    targetCityId: selectedMarch.objective === "CITY_ATTACK" ? selectedCity?.cityId : undefined,
                    targetPoiId: selectedMarch.objective !== "CITY_ATTACK" ? selectedPoi?.id : undefined,
                  });
                }}
              >
                {selectedMarchRetargetLabel}
              </Button>
            </>
          ) : undefined
        }
      >
        {selectedMarch ? (
          <div className={styles.composerGrid}>
            <section className={styles.composerHero}>
              <div>
                <p className={styles.hudEyebrow}>Aktif Sefer</p>
                <strong className={styles.cardTitle}>{selectedMarch.targetPoiName ?? selectedMarch.targetCityName ?? "Hedef"}</strong>
                <p className={styles.muted}>{selectedMarch.commanderName} bu kolu bozkırda yönetiyor.</p>
              </div>
              <Badge tone={selectedMarch.state === "STAGING" ? "warning" : selectedMarch.state === "RETURNING" ? "info" : "success"}>
                {getMarchStateLabel(selectedMarch.state)}
              </Badge>
            </section>
            <section className={styles.commandPreviewGrid}>
              <article className={styles.commandPreviewCard}>
                <span className={styles.commandPreviewLabel}>Süre</span>
                <strong className={styles.commandPreviewValue}>{getMarchTimingLabel(selectedMarch, now)}</strong>
              </article>
              <article className={styles.commandPreviewCard}>
                <span className={styles.commandPreviewLabel}>Hedef</span>
                <strong className={styles.commandPreviewValue}>{getMarchObjectiveLabel(selectedMarch.objective)}</strong>
              </article>
              <article className={styles.commandPreviewCard}>
                <span className={styles.commandPreviewLabel}>Yük</span>
                <strong className={styles.commandPreviewValue}>{selectedMarchCargoLabel}</strong>
              </article>
            </section>
            <div className={styles.composerStats}>
              <article className={styles.composerStatCard}>
                <span className={styles.composerStatLabel}>Birlik</span>
                <strong className={styles.composerStatValue}>{formatNumber(selectedMarchTroopTotal)}</strong>
              </article>
              <article className={styles.composerStatCard}>
                <span className={styles.composerStatLabel}>Mesafe</span>
                <strong className={styles.composerStatValue}>{formatNumber(selectedMarch.distance)} karo</strong>
              </article>
              <article className={styles.composerStatCard}>
                <span className={styles.composerStatLabel}>Çıkış</span>
                <strong className={styles.composerStatValue}>{selectedMarch.origin.x}, {selectedMarch.origin.y}</strong>
              </article>
              <article className={styles.composerStatCard}>
                <span className={styles.composerStatLabel}>Hedef</span>
                <strong className={styles.composerStatValue}>{selectedMarch.target.x}, {selectedMarch.target.y}</strong>
              </article>
            </div>
            <section className={styles.commandActionGrid}>
              <article className={styles.commandActionCard}>
                <p className={styles.commandActionEyebrow}>Rota Odağı</p>
                <strong className={styles.commandActionTitle}>Kolun yanında kal</strong>
                <p className={styles.commandActionCopy}>
                  Yakın tehdit, toy işareti ve savaş pencerelerini okumak için aktif sefere odaklan.
                </p>
                <Button type="button" variant="secondary" onClick={() => mapCommandRef.current?.focusMarch(selectedMarch.id)}>
                  Rotayı izle
                </Button>
              </article>
              <article className={styles.commandActionCard}>
                <p className={styles.commandActionEyebrow}>Geri Çağırma</p>
                <strong className={styles.commandActionTitle}>Buyruğu boz</strong>
                <p className={styles.commandActionCopy}>
                  Daha iyi hedef çıkarsa veya pencere aleyhine dönerse kolu geri çek.
                </p>
                <Button
                  type="button"
                  variant="ghost"
                  disabled={isRecallingMarch}
                  onClick={() => {
                    void recallMarch(selectedMarch.id);
                    setSelectedMarchId(null);
                  }}
                >
                  {isRecallingMarch ? "Bekle" : "Geri çağır"}
                </Button>
              </article>
              <article className={styles.commandActionCard}>
                <p className={styles.commandActionEyebrow}>Yön Değiştir</p>
                <strong className={styles.commandActionTitle}>{selectedMarchRetargetable ? selectedMarchRetargetLabel : "Yeni hedef seç"}</strong>
                <p className={styles.commandActionCopy}>
                  Arkada bir oba veya POI seçili kalsın; composer açmadan seferi yeniden yönlendir.
                </p>
                <Button
                  type="button"
                  disabled={retargetMutation.isPending || !selectedMarchRetargetable}
                  onClick={() => {
                    retargetMutation.mutate({
                      marchId: selectedMarch.id,
                      targetCityId: selectedMarch.objective === "CITY_ATTACK" ? selectedCity?.cityId : undefined,
                      targetPoiId: selectedMarch.objective !== "CITY_ATTACK" ? selectedPoi?.id : undefined,
                    });
                  }}
                >
                  {selectedMarchRetargetLabel}
                </Button>
              </article>
            </section>
          </div>
        ) : null}
      </BottomSheet>
    </section>
  );
}
