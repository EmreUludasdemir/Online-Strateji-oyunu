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
import type { MapFieldCommand, MapReportMarkerView, WorldMapHandle } from "../components/WorldMap";
import { Badge } from "../components/ui/Badge";
import { BottomSheet } from "../components/ui/BottomSheet";
import { Button } from "../components/ui/Button";
import { SectionCard } from "../components/ui/SectionCard";
import { TargetDetailSheet } from "../components/ui/TargetDetailSheet";
import { buildChunkPrefetchRequests, mergeWorldChunks } from "../components/worldMapData";
import { getWorldRegions } from "../components/worldRegions";
import {
  MAP_CAMERA_DEFAULT_ZOOM,
  type ActiveMapChunkMeta,
  type MapCameraState,
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

function createTroopPayload(stateTroops: Array<{ type: TroopType; quantity: number }>): TroopStock {
  return {
    INFANTRY: Math.min(18, stateTroops.find((troop) => troop.type === "INFANTRY")?.quantity ?? 0),
    ARCHER: Math.min(12, stateTroops.find((troop) => troop.type === "ARCHER")?.quantity ?? 0),
    CAVALRY: Math.min(8, stateTroops.find((troop) => troop.type === "CAVALRY")?.quantity ?? 0),
  };
}

function getMarchTimingLabel(
  march: { state: string; etaAt: string; battleWindowClosesAt: string | null; returnEtaAt: string | null },
  now: number,
): string {
  if (march.state === "STAGING" && march.battleWindowClosesAt) {
    return `Window ${formatRelativeTimer(march.battleWindowClosesAt, now)}`;
  }
  if (march.state === "GATHERING") {
    return `Gathering ${formatRelativeTimer(march.etaAt, now)}`;
  }
  if (march.state === "RETURNING" && march.returnEtaAt) {
    return `Return ${formatRelativeTimer(march.returnEtaAt, now)}`;
  }
  return `ETA ${formatRelativeTimer(march.etaAt, now)}`;
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
    return "#4d7d72";
  }
  if (state === "DISCOVERED") {
    return "#564339";
  }
  return "#17100d";
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
  const markerCycleIndexRef = useRef(0);

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
  const [fieldMarkerDraft, setFieldMarkerDraft] = useState("");
  const [cameraView, setCameraView] = useState<MapCameraState>(() =>
    createInitialCameraState(state.city.coordinates.x, state.city.coordinates.y),
  );
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
      setMapNotice("Alliance marker posted to the frontier map.");
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
      setMapNotice("Marker removed from the frontier map.");
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
        }
      : null;

    return () => {
      window.frontierMapFieldCommand = null;
    };
  }, [fieldCommand]);

  useEffect(() => {
    window.open_map_field_command = (command) => {
      setTargetSheetOpen(false);
      setSelectedMarchId(null);
      setFieldCommand({
        kind: command.kind ?? "TILE",
        label: command.label ?? `Frontier ${command.x},${command.y}`,
        x: command.x,
        y: command.y,
        cityId: command.cityId,
        poiId: command.poiId,
      });
      setFieldMarkerDraft(command.label ?? `Frontier ${command.x},${command.y}`);
    };

    return () => {
      delete window.open_map_field_command;
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
            ? `${report.attackerCityName} → ${report.defenderCityName}`
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
  const alliance = allianceQuery.data?.alliance ?? null;
  const alliedOwnerNames = useMemo(() => alliance?.members.map((member) => member.username) ?? [], [alliance]);
  const allianceMarkers = alliance?.markers ?? [];
  const [minimapPing, setMinimapPing] = useState<{ x: number; y: number } | null>(null);
  const minimapWorldSize = worldChunk?.size ?? 64;
  const minimapTiles = worldChunk?.tiles ?? [];
  const minimapStep = useMemo(() => Math.max(1, Math.ceil(minimapWorldSize / 32)), [minimapWorldSize]);
  const minimapCells = useMemo(() => {
    const tileMap = new Map(minimapTiles.map((tile) => [`${tile.x}:${tile.y}`, tile.state] as const));
    const cells: Array<{ x: number; y: number; state: "VISIBLE" | "DISCOVERED" | "HIDDEN" }> = [];

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
        cells.push({ x, y, state });
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
  const minimapViewport = useMemo(() => {
    const halfSpan = Math.max(3, chunkRequest.radius);
    return {
      x: Math.max(0, cameraView.centerTileX - halfSpan),
      y: Math.max(0, cameraView.centerTileY - halfSpan),
      width: Math.min(minimapWorldSize, halfSpan * 2 + 1),
      height: Math.min(minimapWorldSize, halfSpan * 2 + 1),
    };
  }, [cameraView.centerTileX, cameraView.centerTileY, chunkRequest.radius, minimapWorldSize]);

  const targetCards = useMemo(() => {
    if (!worldChunk) {
      return [];
    }

    const cityCards = worldChunk.cities
      .filter((city) => !city.isCurrentPlayer && (filter === "ALL" || filter === "CITIES"))
      .map((city) => ({
        id: city.cityId,
        label: city.cityName,
        meta: `${city.ownerName} | ${city.distance ?? "-"} tiles`,
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
        meta: `${poi.kind.toLowerCase()} | ${poi.distance ?? "-"} tiles`,
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
    setSelectedMarchId(marchId);
    mapCommandRef.current?.focusMarch(marchId);
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
              label: `Frontier ${cameraView.centerTileX},${cameraView.centerTileY}`,
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
    setSelectedMarchId(null);
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
      setTargetSheetOpen(false);
      setComposerMode("SCOUT");
      setFieldCommand(null);
      return;
    }

    if (fieldCommand.kind === "POI" && fieldCommand.poiId) {
      selectPoi(fieldCommand.poiId);
      setOpenedTargetKey(`poi:${fieldCommand.poiId}`);
      mapCommandRef.current?.focusPoi(fieldCommand.poiId);
      setTargetSheetOpen(false);
      setComposerMode("SCOUT");
      setFieldCommand(null);
    }
  }, [fieldCommand, selectCity, selectPoi]);

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
        meta: `${city.ownerName} | ${city.distance ?? "-"} tiles`,
        action: () => handleCitySelect(city, { focus: true }),
      }));

    const poiResults = worldChunk.pois.map((poi) => ({
      id: `poi:${poi.id}`,
      label: poi.label,
      meta: `${poi.kind.toLowerCase()} | ${poi.distance ?? "-"} tiles`,
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
      { id: "search", label: "Focus Search", keys: "/" },
      { id: "marker", label: "Focus Marker Label", keys: "M" },
      { id: "camera", label: "Post Camera Marker", keys: "C" },
      { id: "recenter", label: "Recenter", keys: "R" },
      { id: "zoom-in", label: "Zoom In", keys: "+" },
      { id: "zoom-out", label: "Zoom Out", keys: "-" },
      { id: "marker-prev", label: "Previous Marker", keys: "[" },
      { id: "marker-next", label: "Next Marker", keys: "]" },
      { id: "filters", label: "Filters", keys: "1-4" },
      { id: "close", label: "Close Panels", keys: "Esc" },
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
    return <div className={styles.hero}>Loading map...</div>;
  }

  if (worldChunkQuery.isError && !worldChunk) {
    return <div className={styles.hero}>Unable to load this world chunk.</div>;
  }

  if (!worldChunk) {
    return <div className={styles.hero}>Opening map...</div>;
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

  return (
    <section className={styles.page}>
      <article className={styles.hero}>
        <div className={styles.heroTop}>
          <div>
            <p className={styles.muted}>{copy.map.title}</p>
            <h2 className={styles.heroTitle}>Frontier Theater</h2>
            <p className={styles.heroLead}>
              The world now runs in camera space: drag to pan, zoom to change detail, watch marches move, and scout live routes across the frontier.
            </p>
          </div>
          <Badge tone="info">
            Center {cameraView.centerTileX},{cameraView.centerTileY} · zoom {cameraView.zoom.toFixed(2)}
          </Badge>
        </div>
        <div className={styles.summaryGrid}>
          <article className={styles.summaryCard}>
            <span className={styles.muted}>{copy.map.visible}</span>
            <strong className={styles.summaryValue}>{formatNumber(visibleTiles)}</strong>
          </article>
          <article className={styles.summaryCard}>
            <span className={styles.muted}>{copy.map.discoverable}</span>
            <strong className={styles.summaryValue}>{formatNumber(discoveredTiles)}</strong>
          </article>
          <article className={styles.summaryCard}>
            <span className={styles.muted}>{copy.map.activeMarches}</span>
            <strong className={styles.summaryValue}>{formatNumber(activeMarchCount)}</strong>
          </article>
        </div>
      </article>

      <div className={styles.chipRow}>
        <Button type="button" size="small" variant={filter === "ALL" ? "primary" : "secondary"} onClick={() => setFilter("ALL")}>
          All
        </Button>
        <Button type="button" size="small" variant={filter === "CITIES" ? "primary" : "secondary"} onClick={() => setFilter("CITIES")}>
          Cities
        </Button>
        <Button type="button" size="small" variant={filter === "CAMPS" ? "primary" : "secondary"} onClick={() => setFilter("CAMPS")}>
          Camps
        </Button>
        <Button type="button" size="small" variant={filter === "NODES" ? "primary" : "secondary"} onClick={() => setFilter("NODES")}>
          Nodes
        </Button>
        <Button type="button" size="small" variant={showPaths ? "primary" : "secondary"} onClick={() => setShowPaths((current) => !current)}>
          Show Paths
        </Button>
        <Button
          type="button"
          size="small"
          variant={showScoutTrails ? "primary" : "secondary"}
          onClick={() => setShowScoutTrails((current) => !current)}
        >
          Show Scout Trails
        </Button>
        <Button type="button" size="small" variant={showReports ? "primary" : "secondary"} onClick={() => setShowReports((current) => !current)}>
          Show Reports
        </Button>
      </div>

      <section className={styles.battlefieldLayout}>
        <div className={styles.mapStage}>
          <article className={styles.mapFrame}>
            <div className={styles.controls}>
              <Button type="button" size="small" variant="secondary" onClick={() => mapCommandRef.current?.zoomIn()}>
                {copy.map.zoomIn}
              </Button>
              <Button type="button" size="small" variant="secondary" onClick={() => mapCommandRef.current?.zoomOut()}>
                {copy.map.zoomOut}
              </Button>
              <Button
                type="button"
                size="small"
                variant="secondary"
                onClick={() => mapCommandRef.current?.focusTile(state.city.coordinates.x, state.city.coordinates.y)}
              >
                Recenter
              </Button>
            </div>
            <aside className={styles.minimapCard}>
              <div className={styles.minimapHeader}>
                <strong className={styles.cardTitle}>Minimap</strong>
                <Badge tone="info">{cameraView.detailLevel}</Badge>
              </div>
              <div className={styles.minimapFrame}>
                <svg
                  className={styles.minimap}
                  viewBox={`0 0 ${worldChunk.size} ${worldChunk.size}`}
                  role="img"
                  aria-label="World minimap"
                >
                  {minimapCells.map((cell) => (
                    <rect
                      key={`${cell.x}:${cell.y}`}
                      x={cell.x}
                      y={cell.y}
                      width={minimapStep}
                      height={minimapStep}
                      fill={getMinimapStateColor(cell.state)}
                    />
                  ))}
                  {worldRegions.map((region) => (
                    <g key={region.id}>
                      <rect
                        x={region.x0}
                        y={region.y0}
                        width={region.x1 - region.x0 + 1}
                        height={region.y1 - region.y0 + 1}
                        fill="none"
                        stroke={region.color}
                        strokeOpacity="0.18"
                        strokeWidth="0.6"
                        strokeDasharray="1.2 1.4"
                      />
                      <text
                        x={region.anchorX}
                        y={region.anchorY}
                        textAnchor="middle"
                        fontSize="2.7"
                        fill={region.color}
                        opacity="0.45"
                      >
                        {region.label}
                      </text>
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
                  aria-label="Re-center with minimap"
                  onClick={handleMinimapClick}
                />
              </div>
              <p className={styles.minimapHint}>Click the minimap to re-center the camera.</p>
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
            <Suspense fallback={<div className={styles.hero}>Opening map...</div>}>
              <WorldMap
                worldSize={worldChunk.size}
                initialCenter={state.city.coordinates}
                tiles={worldChunk.tiles}
                cities={worldChunk.cities}
                pois={worldChunk.pois}
                marches={worldChunk.marches}
                scoutTrails={scoutTrails}
                reportMarkers={reportMarkers}
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
                commandHandleRef={mapCommandRef}
              />
            </Suspense>
          </article>
        </div>

        <aside className={styles.sideRail}>
          <section className={styles.commandStrip}>
            <article className={styles.commandCard}>
              <div className={styles.commandHeader}>
                <strong className={styles.cardTitle}>Command Search</strong>
                <Badge tone="info">{searchResults.length} matches</Badge>
              </div>
              <input
                ref={searchInputRef}
                className={styles.commandInput}
                type="search"
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder="Search cities, camps, nodes, or markers"
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
                <p className={styles.commandHint}>Search the current chunk to jump between cities, POIs, and alliance markers.</p>
              )}
            </article>
            <article className={styles.commandCard}>
              <div className={styles.commandHeader}>
                <strong className={styles.cardTitle}>Alliance Markers</strong>
                <Badge tone={alliance ? "success" : "warning"}>{alliance ? alliance.tag : "No alliance"}</Badge>
              </div>
              <input
                ref={markerInputRef}
                className={styles.commandInput}
                type="text"
                value={markerDraft}
                onChange={(event) => setMarkerDraft(event.target.value)}
                placeholder={selectedMarkerTarget ? `Label for ${selectedMarkerTarget.label}` : "Marker label"}
              />
              <div className={styles.actionRow}>
                <Button
                  type="button"
                  size="small"
                  variant="secondary"
                  disabled={createMarkerMutation.isPending}
                  onClick={() => handleQuickMarkerCreate("CAMERA")}
                >
                  {createMarkerMutation.isPending ? "Posting" : "Mark Camera"}
                </Button>
                <Button
                  type="button"
                  size="small"
                  variant="primary"
                  disabled={createMarkerMutation.isPending || !selectedMarkerTarget}
                  onClick={() => handleQuickMarkerCreate("TARGET")}
                >
                  Mark Target
                </Button>
              </div>
              <p className={styles.commandHint}>
                {selectedMarkerTarget
                  ? `Selected target: ${selectedMarkerTarget.label} at ${selectedMarkerTarget.x}, ${selectedMarkerTarget.y}.`
                  : "Select a city or POI to post a focused target marker."}
              </p>
              {mapNotice ? <p className={styles.commandNotice}>{mapNotice}</p> : null}
            </article>
            <article className={styles.commandCard}>
              <div className={styles.commandHeader}>
                <strong className={styles.cardTitle}>Rapid Orders</strong>
                <Badge tone="info">{recentAllianceMarkers.length} markers</Badge>
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
                          {marker.x}, {marker.y} · {formatMarkerAge(marker.createdAt, now)}
                          {marker.expiresAt ? ` · ${formatTimeRemaining(marker.expiresAt, now)} left` : ""}
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
                          Remove
                        </Button>
                      ) : null}
                    </div>
                  ))
                ) : (
                  <p className={styles.commandHint}>Alliance markers posted from the map will appear here for rapid focus.</p>
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
            <SectionCard kicker="Report Beacons" title="Visible history">
              <div className={styles.markerList}>
                {reportMarkers.length === 0 ? (
                  <p className={styles.commandHint}>Resolved battles and returns inside the current visible chunk will appear here.</p>
                ) : (
                  reportMarkers.slice(0, 6).map((report) => (
                    <button
                      key={report.id}
                      type="button"
                      className={styles.markerFocus}
                      onClick={() => handleOpenReport(report.id)}
                    >
                      <strong>{report.label}</strong>
                      <span className={styles.markerMeta}>
                        {report.x}, {report.y} · {report.kind.toLowerCase().replaceAll("_", " ")}
                      </span>
                    </button>
                  ))
                )}
              </div>
            </SectionCard>
          ) : null}

          <SectionCard kicker={copy.map.activeMarches} title="Orders in the field" className={styles.marchSection}>
            <div className={styles.marchList}>
              {state.city.activeMarches.map((march) => (
                <article
                  key={march.id}
                  className={styles.marchCard}
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
                    <strong className={styles.cardTitle}>{march.targetPoiName ?? march.targetCityName ?? "Target"}</strong>
                    <Badge tone={march.state === "STAGING" ? "warning" : march.state === "RETURNING" ? "info" : "success"}>
                      {march.state.toLowerCase()}
                    </Badge>
                  </div>
                  <p className={styles.muted}>
                    {getMarchTimingLabel(march, now)} | Distance {formatNumber(march.distance)} tiles
                  </p>
                  <div className={styles.actionRow}>
                    <Button
                      type="button"
                      size="small"
                      variant="ghost"
                      disabled={isRecallingMarch}
                      onClick={() => recallMarch(march.id)}
                    >
                      {isRecallingMarch ? "Please wait" : "Recall"}
                    </Button>
                    <Button
                      type="button"
                      size="small"
                      variant="secondary"
                      disabled={retargetMutation.isPending || !canRetargetMarch(march, selectedCity, selectedPoi)}
                      onClick={() =>
                        retargetMutation.mutate({
                          marchId: march.id,
                          targetCityId: march.objective === "CITY_ATTACK" ? selectedCity?.cityId : undefined,
                          targetPoiId: march.objective !== "CITY_ATTACK" ? selectedPoi?.id : undefined,
                        })
                      }
                    >
                      {copy.map.retarget}
                    </Button>
                  </div>
                </article>
              ))}
            </div>
          </SectionCard>
        </aside>
      </section>

      <TargetDetailSheet
        open={targetSheetOpen}
        target={
          selectedCity && !selectedCity.isCurrentPlayer
            ? { kind: "CITY", city: selectedCity }
            : selectedPoi
              ? { kind: "POI", poi: selectedPoi }
              : null
        }
        projectedOutcome={selectedCity?.projectedOutcome ?? selectedPoi?.projectedOutcome ?? null}
        onClose={() => setTargetSheetOpen(false)}
        onProceed={() =>
          setComposerMode(selectedCity ? "CITY_ATTACK" : selectedPoi?.kind === "BARBARIAN_CAMP" ? "BARBARIAN_ATTACK" : "RESOURCE_GATHER")
        }
        onScout={() => setComposerMode("SCOUT")}
        onRally={selectedCity || selectedPoi?.kind === "BARBARIAN_CAMP" ? () => setComposerMode("RALLY") : null}
      />

      <BottomSheet
        open={Boolean(fieldCommand)}
        title={fieldCommand ? `Field Command: ${fieldCommand.label}` : "Field Command"}
        onClose={() => setFieldCommand(null)}
        actions={
          <>
            <Button type="button" variant="ghost" onClick={() => setFieldCommand(null)}>
              Close
            </Button>
            <Button
              type="button"
              variant="secondary"
              disabled={createMarkerMutation.isPending}
              onClick={() => void handleFieldMarkerCreate()}
            >
              {createMarkerMutation.isPending ? "Posting" : "Post Marker"}
            </Button>
          </>
        }
      >
        {fieldCommand ? (
          <div className={styles.detailList}>
            <div className={styles.fieldCommandMeta}>
              <p className={styles.muted}>Target type: {fieldCommand.kind.toLowerCase()}</p>
              <p className={styles.muted}>
                Coordinates: {fieldCommand.x}, {fieldCommand.y}
              </p>
            </div>
            <div className={styles.actionRow}>
              <Button type="button" size="small" variant="secondary" onClick={handleFieldCommandFocus}>
                Focus
              </Button>
              {fieldCommand.kind !== "TILE" ? (
                <Button type="button" size="small" variant="secondary" onClick={handleFieldCommandOpenTarget}>
                  Open Target
                </Button>
              ) : null}
              {fieldCommand.kind !== "TILE" ? (
                <Button type="button" size="small" variant="primary" onClick={handleFieldCommandScout}>
                  Scout
                </Button>
              ) : null}
            </div>
            <label className={styles.fieldCommandLabel}>
              <span className={styles.muted}>Alliance marker label</span>
              <input
                className={styles.commandInput}
                type="text"
                value={fieldMarkerDraft}
                onChange={(event) => setFieldMarkerDraft(event.target.value)}
                placeholder={`Marker for ${fieldCommand.label}`}
              />
            </label>
            <p className={styles.commandHint}>
              {alliance
                ? "Right-click lets you tag the frontier without leaving the map route."
                : "Join an alliance to turn field commands into persistent map markers."}
            </p>
          </div>
        ) : null}
      </BottomSheet>

      <BottomSheet
        open={Boolean(selectedMarch)}
        title={selectedMarch ? `March Orders: ${selectedMarch.targetPoiName ?? selectedMarch.targetCityName ?? "Target"}` : "March Orders"}
        onClose={() => setSelectedMarchId(null)}
        actions={
          selectedMarch ? (
            <>
              <Button type="button" variant="ghost" onClick={() => setSelectedMarchId(null)}>
                Close
              </Button>
              <Button
                type="button"
                variant="secondary"
                disabled={retargetMutation.isPending || !canRetargetMarch(selectedMarch, selectedCity, selectedPoi)}
                onClick={() =>
                  retargetMutation.mutate({
                    marchId: selectedMarch.id,
                    targetCityId: selectedMarch.objective === "CITY_ATTACK" ? selectedCity?.cityId : undefined,
                    targetPoiId: selectedMarch.objective !== "CITY_ATTACK" ? selectedPoi?.id : undefined,
                  })
                }
              >
                {copy.map.retarget}
              </Button>
              <Button type="button" disabled={isRecallingMarch} onClick={() => recallMarch(selectedMarch.id)}>
                {isRecallingMarch ? "Please wait" : "Recall"}
              </Button>
            </>
          ) : undefined
        }
      >
        {selectedMarch ? (
          <div className={styles.detailList}>
            <p className={styles.muted}>Commander: {selectedMarch.commanderName}</p>
            <p className={styles.muted}>State: {selectedMarch.state.toLowerCase()}</p>
            <p className={styles.muted}>{getMarchTimingLabel(selectedMarch, now)}</p>
            <p className={styles.muted}>Distance: {formatNumber(selectedMarch.distance)} tiles</p>
            {selectedMarch.cargo.amount > 0 ? (
              <p className={styles.muted}>
                Cargo: {formatNumber(selectedMarch.cargo.amount)} {selectedMarch.cargo.resourceType?.toLowerCase() ?? "supplies"}
              </p>
            ) : null}
            <p className={styles.muted}>
              Select another valid target on the map, then use {copy.map.retarget.toLowerCase()} while this sheet is open.
            </p>
          </div>
        ) : null}
      </BottomSheet>

      <BottomSheet
        open={Boolean(composerMode)}
        title={composerMode === "SCOUT" ? "Scout Mission" : composerMode === "RALLY" ? "Rally Setup" : copy.map.confirm}
        onClose={() => setComposerMode(null)}
        actions={
          <>
            <Button type="button" variant="ghost" onClick={() => setComposerMode(null)}>
              Cancel
            </Button>
            <Button type="button" disabled={isSendingMarch || (composerMode !== "SCOUT" && totalAssignedTroops <= 0)} onClick={() => void handleComposerConfirm()}>
              {composerMode === "SCOUT"
                ? "Send Scout"
                : composerMode === "RALLY"
                  ? "Open Rally"
                  : composerMode === "RESOURCE_GATHER"
                    ? "Start Gathering"
                    : composerMode === "BARBARIAN_ATTACK"
                      ? "March to Camp"
                      : "Send March"}
            </Button>
          </>
        }
      >
        <div className={styles.composerGrid}>
          <p className={styles.muted}>
            {selectedCity
              ? `${selectedCity.cityName} | ${selectedCity.ownerName}`
              : selectedPoi
                ? `${selectedPoi.label} | ${selectedPoi.kind.toLowerCase()}`
                : ""}
          </p>
          {composerMode !== "SCOUT" ? (
            <>
              <div className={styles.composerRow}>
                <span className={styles.muted}>Commander</span>
                <select value={commanderId} onChange={(event) => setCommanderId(event.target.value)}>
                  {state.city.commanders.map((commander) => (
                    <option key={commander.id} value={commander.id}>
                      {commander.name} L{commander.level}
                    </option>
                  ))}
                </select>
              </div>
              {state.city.troops.map((troop) => (
                <div key={troop.type} className={styles.sliderRow}>
                  <label htmlFor={`troop-${troop.type}`}>
                    <span>
                      {troop.label} ({formatNumber(troop.quantity)})
                    </span>
                    <strong>{formatNumber(troopPayload[troop.type])}</strong>
                  </label>
                  <input
                    id={`troop-${troop.type}`}
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
                </div>
              ))}
            </>
          ) : (
            <div className={styles.detailList}>
              <p className={styles.muted}>Scout missions do not carry troops. The result will arrive as a detailed inbox report.</p>
              {selectedPoi?.resourceType ? <p className={styles.muted}>Resource Type: {copy.poiResources[selectedPoi.resourceType]}</p> : null}
            </div>
          )}
        </div>
      </BottomSheet>
    </section>
  );
}
