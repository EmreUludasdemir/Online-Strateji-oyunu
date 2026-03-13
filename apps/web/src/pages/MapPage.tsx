import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  MapCity,
  MarchView,
  PoiView,
  ScoutMutationResponse,
  TroopStock,
  TroopType,
  WorldChunkResponse,
} from "@frontier/shared";
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";

import { api } from "../api";
import { useGameLayoutContext } from "../components/GameLayout";
import type { WorldMapHandle } from "../components/WorldMap";
import { Badge } from "../components/ui/Badge";
import { BottomSheet } from "../components/ui/BottomSheet";
import { Button } from "../components/ui/Button";
import { SectionCard } from "../components/ui/SectionCard";
import { TargetDetailSheet } from "../components/ui/TargetDetailSheet";
import { buildChunkPrefetchRequests, mergeWorldChunks } from "../components/worldMapData";
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
import { formatNumber, formatRelativeTimer } from "../lib/formatters";
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

export function MapPage() {
  const now = useNow();
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

  const [filter, setFilter] = useState<MapFilter>("ALL");
  const [targetSheetOpen, setTargetSheetOpen] = useState(false);
  const [openedTargetKey, setOpenedTargetKey] = useState<string | null>(null);
  const [composerMode, setComposerMode] = useState<ComposerMode>(null);
  const [commanderId, setCommanderId] = useState(state.city.commanders[0]?.id ?? "");
  const [troopPayload, setTroopPayload] = useState<TroopStock>(() => createTroopPayload(state.city.troops));
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
    };
  }, []);

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

  const visibleTiles = worldChunk?.tiles.filter((tile) => tile.state === "VISIBLE").length ?? 0;
  const discoveredTiles = worldChunk?.tiles.filter((tile) => tile.state !== "HIDDEN").length ?? 0;
  const totalAssignedTroops = Object.values(troopPayload).reduce((sum, value) => sum + value, 0);
  const activeMarchCount = worldChunk?.marches.length ?? state.city.activeMarches.length;

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
  }, []);

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
      </div>

      <article className={styles.mapFrame}>
        <div className={styles.controls}>
          <Button type="button" size="small" variant="secondary" onClick={() => mapCommandRef.current?.zoomIn()}>
            {copy.map.zoomIn}
          </Button>
          <Button type="button" size="small" variant="secondary" onClick={() => mapCommandRef.current?.zoomOut()}>
            {copy.map.zoomOut}
          </Button>
        </div>
        <Suspense fallback={<div className={styles.hero}>Opening map...</div>}>
          <WorldMap
            worldSize={worldChunk.size}
            initialCenter={state.city.coordinates}
            tiles={worldChunk.tiles}
            cities={worldChunk.cities}
            pois={worldChunk.pois}
            marches={worldChunk.marches}
            scoutTrails={scoutTrails}
            filter={filter}
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
            onCameraChange={handleCameraChange}
            commandHandleRef={mapCommandRef}
          />
        </Suspense>
      </article>

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

      <SectionCard kicker={copy.map.activeMarches} title="Orders in the field">
        <div className={styles.marchList}>
          {state.city.activeMarches.map((march) => (
            <article
              key={march.id}
              className={styles.marchCard}
              role="button"
              tabIndex={0}
              onClick={() => setSelectedMarchId(march.id)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  setSelectedMarchId(march.id);
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
                <Button type="button" size="small" variant="ghost" disabled={isRecallingMarch} onClick={() => recallMarch(march.id)}>
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
