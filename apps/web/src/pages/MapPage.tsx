import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { MapCity, PoiKind, PoiResourceType, PoiView, TroopStock, TroopType } from "@frontier/shared";
import { lazy, Suspense, useEffect, useMemo, useState } from "react";

import { api } from "../api";
import { useGameLayoutContext } from "../components/GameLayout";
import { Badge } from "../components/ui/Badge";
import { BottomSheet } from "../components/ui/BottomSheet";
import { Button } from "../components/ui/Button";
import { SectionCard } from "../components/ui/SectionCard";
import { TargetDetailSheet } from "../components/ui/TargetDetailSheet";
import { trackAnalyticsEvent } from "../lib/analytics";
import { copy } from "../lib/i18n";
import { formatNumber, formatRelativeTimer } from "../lib/formatters";
import { useNow } from "../lib/useNow";
import styles from "./MapPage.module.css";

const WorldMap = lazy(() => import("../components/WorldMap"));
const RADII = [6, 8, 10] as const;

const poiResourceLabels: Record<PoiResourceType, string> = { WOOD: "Odun", STONE: "Tas", FOOD: "Yemek", GOLD: "Altin" };

function createTroopPayload(stateTroops: Array<{ type: TroopType; quantity: number }>): TroopStock {
  return {
    INFANTRY: Math.min(18, stateTroops.find((troop) => troop.type === "INFANTRY")?.quantity ?? 0),
    ARCHER: Math.min(12, stateTroops.find((troop) => troop.type === "ARCHER")?.quantity ?? 0),
    CAVALRY: Math.min(8, stateTroops.find((troop) => troop.type === "CAVALRY")?.quantity ?? 0),
  };
}

function getMarchTimingLabel(march: { state: string; etaAt: string; battleWindowClosesAt: string | null; returnEtaAt: string | null }, now: number): string {
  if (march.state === "STAGING" && march.battleWindowClosesAt) return `Pencere ${formatRelativeTimer(march.battleWindowClosesAt, now)}`;
  if (march.state === "GATHERING") return `Toplama ${formatRelativeTimer(march.etaAt, now)}`;
  if (march.state === "RETURNING" && march.returnEtaAt) return `Donus ${formatRelativeTimer(march.returnEtaAt, now)}`;
  return `ETA ${formatRelativeTimer(march.etaAt, now)}`;
}

export function MapPage() {
  const now = useNow();
  const queryClient = useQueryClient();
  const { state, selectedCityId, selectedPoiId, selectCity, selectPoi, sendMarch, recallMarch, isSendingMarch, isRecallingMarch } = useGameLayoutContext();
  const [radiusIndex, setRadiusIndex] = useState(1);
  const [filter, setFilter] = useState<"ALL" | "CITIES" | "CAMPS" | "NODES">("ALL");
  const [targetSheetOpen, setTargetSheetOpen] = useState(false);
  const [openedTargetKey, setOpenedTargetKey] = useState<string | null>(null);
  const [composerMode, setComposerMode] = useState<"CITY_ATTACK" | "BARBARIAN_ATTACK" | "RESOURCE_GATHER" | "SCOUT" | "RALLY" | null>(null);
  const [commanderId, setCommanderId] = useState(state.city.commanders[0]?.id ?? "");
  const [troopPayload, setTroopPayload] = useState<TroopStock>(() => createTroopPayload(state.city.troops));

  const worldChunkQuery = useQuery({
    queryKey: ["world-chunk", RADII[radiusIndex]],
    queryFn: () => api.worldChunk({ centerX: state.city.coordinates.x, centerY: state.city.coordinates.y, radius: RADII[radiusIndex] }),
  });

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
    mutationFn: ({ marchId, targetCityId, targetPoiId }: { marchId: string; targetCityId?: string; targetPoiId?: string }) => api.retargetMarch(marchId, { targetCityId, targetPoiId }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["world-chunk"] }),
        queryClient.invalidateQueries({ queryKey: ["game-state"] }),
      ]);
    },
  });

  useEffect(() => {
    setTroopPayload(createTroopPayload(state.city.troops));
    setCommanderId(state.city.commanders[0]?.id ?? "");
  }, [state.city.commanders, state.city.troops]);

  const selectedCity = useMemo(() => worldChunkQuery.data?.cities.find((city) => city.cityId === selectedCityId) ?? null, [selectedCityId, worldChunkQuery.data]);
  const selectedPoi = useMemo(() => worldChunkQuery.data?.pois.find((poi) => poi.id === selectedPoiId) ?? null, [selectedPoiId, worldChunkQuery.data]);
  const visibleTiles = worldChunkQuery.data?.tiles.filter((tile) => tile.state === "VISIBLE").length ?? 0;
  const discoveredTiles = worldChunkQuery.data?.tiles.filter((tile) => tile.state !== "HIDDEN").length ?? 0;
  const totalAssignedTroops = Object.values(troopPayload).reduce((sum, value) => sum + value, 0);

  const targetCards = useMemo(() => {
    if (!worldChunkQuery.data) return [];
    const cityCards = worldChunkQuery.data.cities.filter((city) => !city.isCurrentPlayer && (filter === "ALL" || filter === "CITIES")).map((city) => ({ id: city.cityId, label: city.cityName, meta: `${city.ownerName} | ${city.distance ?? "-"} kare`, kind: "CITY" as const, city }));
    const poiCards = worldChunkQuery.data.pois.filter((poi) => filter === "ALL" || (filter === "CAMPS" && poi.kind === "BARBARIAN_CAMP") || (filter === "NODES" && poi.kind === "RESOURCE_NODE")).map((poi) => ({ id: poi.id, label: poi.label, meta: `${poi.kind.toLowerCase()} | ${poi.distance ?? "-"} kare`, kind: "POI" as const, poi }));
    return [...cityCards, ...poiCards].slice(0, 12);
  }, [filter, worldChunkQuery.data]);

  useEffect(() => {
    if (selectedCity && !selectedCity.isCurrentPlayer) {
      trackAnalyticsEvent("target_sheet_opened", { targetType: "CITY", targetId: selectedCity.cityId });
    }
    if (selectedPoi) {
      trackAnalyticsEvent("target_sheet_opened", { targetType: "POI", targetId: selectedPoi.id });
    }
  }, [selectedCity, selectedPoi]);

  useEffect(() => {
    const nextTargetKey = selectedCity && !selectedCity.isCurrentPlayer ? `city:${selectedCity.cityId}` : selectedPoi ? `poi:${selectedPoi.id}` : null;
    if (!nextTargetKey || nextTargetKey === openedTargetKey) {
      return;
    }

    setTargetSheetOpen(true);
    setOpenedTargetKey(nextTargetKey);
  }, [openedTargetKey, selectedCity, selectedPoi]);

  if (worldChunkQuery.isPending) {
    return <div className={styles.hero}>Atlas yukleniyor...</div>;
  }

  if (worldChunkQuery.isError || !worldChunkQuery.data) {
    return <div className={styles.hero}>Dunya parcasi yuklenemedi.</div>;
  }

  const handleCitySelect = (city: MapCity) => {
    selectCity(city.cityId);
    setOpenedTargetKey(null);
    if (!city.isCurrentPlayer) setTargetSheetOpen(true);
  };

  const handlePoiSelect = (poi: PoiView) => {
    selectPoi(poi.id);
    setOpenedTargetKey(null);
    setTargetSheetOpen(true);
  };

  const handleComposerConfirm = async () => {
    if (composerMode === "SCOUT") {
      await scoutMutation.mutateAsync({ targetCityId: selectedCity?.cityId, targetPoiId: selectedPoi?.id });
      setComposerMode(null);
      setTargetSheetOpen(false);
      return;
    }
    if (composerMode === "RALLY") {
      await rallyMutation.mutateAsync({ objective: selectedCity ? "CITY_ATTACK" : undefined, targetCityId: selectedCity?.cityId, targetPoiId: selectedPoi?.id, commanderId, troops: troopPayload });
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
          <div><p className={styles.muted}>{copy.map.title}</p><h2 className={styles.heroTitle}>Sinir tiyatrosu</h2><p className={styles.heroLead}>Canvas dunya haritasi altta kalir; hedef akisi artik iki asamali sheet uzerinden ilerler.</p></div>
          <Badge tone="info">Merkez {worldChunkQuery.data.center.x},{worldChunkQuery.data.center.y}</Badge>
        </div>
        <div className={styles.summaryGrid}>
          <article className={styles.summaryCard}><span className={styles.muted}>{copy.map.visible}</span><strong className={styles.summaryValue}>{formatNumber(visibleTiles)}</strong></article>
          <article className={styles.summaryCard}><span className={styles.muted}>{copy.map.discoverable}</span><strong className={styles.summaryValue}>{formatNumber(discoveredTiles)}</strong></article>
          <article className={styles.summaryCard}><span className={styles.muted}>{copy.map.activeMarches}</span><strong className={styles.summaryValue}>{formatNumber(state.city.activeMarches.length)}</strong></article>
        </div>
      </article>

      <div className={styles.chipRow}>
        <Button type="button" size="small" variant={filter === "ALL" ? "primary" : "secondary"} onClick={() => setFilter("ALL")}>Tumu</Button>
        <Button type="button" size="small" variant={filter === "CITIES" ? "primary" : "secondary"} onClick={() => setFilter("CITIES")}>Sehirler</Button>
        <Button type="button" size="small" variant={filter === "CAMPS" ? "primary" : "secondary"} onClick={() => setFilter("CAMPS")}>Kamplar</Button>
        <Button type="button" size="small" variant={filter === "NODES" ? "primary" : "secondary"} onClick={() => setFilter("NODES")}>Node'lar</Button>
      </div>

      <article className={styles.mapFrame}>
        <div className={styles.controls}>
          <Button type="button" size="small" variant="secondary" disabled={radiusIndex === 0} onClick={() => setRadiusIndex((current) => Math.max(0, current - 1))}>{copy.map.zoomIn}</Button>
          <Button type="button" size="small" variant="secondary" disabled={radiusIndex === RADII.length - 1} onClick={() => setRadiusIndex((current) => Math.min(RADII.length - 1, current + 1))}>{copy.map.zoomOut}</Button>
        </div>
        <Suspense fallback={<div className={styles.hero}>Harita aciliyor...</div>}>
          <WorldMap
            size={64}
            center={worldChunkQuery.data.center}
            radius={worldChunkQuery.data.radius}
            tiles={worldChunkQuery.data.tiles}
            cities={worldChunkQuery.data.cities}
            pois={worldChunkQuery.data.pois}
            marches={worldChunkQuery.data.marches}
            selectedCityId={selectedCityId}
            selectedPoiId={selectedPoiId}
            onSelectCity={(cityId) => {
              const city = worldChunkQuery.data?.cities.find((entry) => entry.cityId === cityId);
              if (city) handleCitySelect(city);
            }}
            onSelectPoi={(poiId) => {
              const poi = worldChunkQuery.data?.pois.find((entry) => entry.id === poiId);
              if (poi) handlePoiSelect(poi);
            }}
          />
        </Suspense>
      </article>

      <section className={styles.rail}>
        {targetCards.map((entry) => (
          <button key={entry.id} className={styles.targetCard} type="button" onClick={() => entry.kind === "CITY" ? handleCitySelect(entry.city) : handlePoiSelect(entry.poi)}>
            <strong className={styles.cardTitle}>{entry.label}</strong>
            <p className={styles.targetMeta}>{entry.meta}</p>
          </button>
        ))}
      </section>

      <SectionCard kicker={copy.map.activeMarches} title="Sahadaki emirler">
        <div className={styles.marchList}>
          {state.city.activeMarches.map((march) => (
            <article key={march.id} className={styles.marchCard}>
              <div className={styles.marchMeta}>
                <strong className={styles.cardTitle}>{march.targetPoiName ?? march.targetCityName ?? "Hedef"}</strong>
                <Badge tone={march.state === "STAGING" ? "warning" : march.state === "RETURNING" ? "info" : "success"}>{march.state.toLowerCase()}</Badge>
              </div>
              <p className={styles.muted}>{getMarchTimingLabel(march, now)} | Mesafe {formatNumber(march.distance)} kare</p>
              <div className={styles.actionRow}>
                <Button type="button" size="small" variant="ghost" disabled={isRecallingMarch} onClick={() => recallMarch(march.id)}>{isRecallingMarch ? "Bekle" : "Geri cagir"}</Button>
                <Button
                  type="button"
                  size="small"
                  variant="secondary"
                  disabled={
                    retargetMutation.isPending ||
                    march.state !== "ENROUTE" ||
                    !((march.objective === "CITY_ATTACK" && selectedCity && !selectedCity.isCurrentPlayer && selectedCity.cityId !== march.targetCityId) ||
                      (march.objective === "BARBARIAN_ATTACK" && selectedPoi?.kind === "BARBARIAN_CAMP" && selectedPoi.id !== march.targetPoiId) ||
                      (march.objective === "RESOURCE_GATHER" && selectedPoi?.kind === "RESOURCE_NODE" && selectedPoi.id !== march.targetPoiId))
                  }
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
        target={selectedCity && !selectedCity.isCurrentPlayer ? { kind: "CITY", city: selectedCity } : selectedPoi ? { kind: "POI", poi: selectedPoi } : null}
        projectedOutcome={selectedCity?.projectedOutcome ?? selectedPoi?.projectedOutcome ?? null}
        onClose={() => setTargetSheetOpen(false)}
        onProceed={() => setComposerMode(selectedCity ? "CITY_ATTACK" : selectedPoi?.kind === "BARBARIAN_CAMP" ? "BARBARIAN_ATTACK" : "RESOURCE_GATHER")}
        onScout={() => setComposerMode("SCOUT")}
        onRally={selectedCity || selectedPoi?.kind === "BARBARIAN_CAMP" ? () => setComposerMode("RALLY") : null}
      />

      <BottomSheet
        open={Boolean(composerMode)}
        title={composerMode === "SCOUT" ? "Kesif emri" : composerMode === "RALLY" ? "Ralli hazirligi" : copy.map.confirm}
        onClose={() => setComposerMode(null)}
        actions={
          <>
            <Button type="button" variant="ghost" onClick={() => setComposerMode(null)}>Vazgec</Button>
            <Button type="button" disabled={isSendingMarch || (composerMode !== "SCOUT" && totalAssignedTroops <= 0)} onClick={() => void handleComposerConfirm()}>
              {composerMode === "SCOUT"
                ? "Kesfi gonder"
                : composerMode === "RALLY"
                  ? "Ralli ac"
                  : composerMode === "RESOURCE_GATHER"
                    ? "Toplama gonder"
                    : composerMode === "BARBARIAN_ATTACK"
                      ? "Kampa yuru"
                      : "Seferi gonder"}
            </Button>
          </>
        }
      >
        <div className={styles.composerGrid}>
          <p className={styles.muted}>{selectedCity ? `${selectedCity.cityName} | ${selectedCity.ownerName}` : selectedPoi ? `${selectedPoi.label} | ${selectedPoi.kind.toLowerCase()}` : ""}</p>
          {composerMode !== "SCOUT" ? (
            <>
              <div className={styles.composerRow}>
                <span className={styles.muted}>Komutan</span>
                <select value={commanderId} onChange={(event) => setCommanderId(event.target.value)}>
                  {state.city.commanders.map((commander) => <option key={commander.id} value={commander.id}>{commander.name} L{commander.level}</option>)}
                </select>
              </div>
              {state.city.troops.map((troop) => (
                <div key={troop.type} className={styles.sliderRow}>
                  <label htmlFor={`troop-${troop.type}`}><span>{troop.label} ({formatNumber(troop.quantity)})</span><strong>{formatNumber(troopPayload[troop.type])}</strong></label>
                  <input id={`troop-${troop.type}`} type="range" min={0} max={troop.quantity} value={troopPayload[troop.type]} onChange={(event) => setTroopPayload((current) => ({ ...current, [troop.type]: Number(event.target.value) }))} />
                </div>
              ))}
            </>
          ) : (
            <div className={styles.detailList}>
              <p className={styles.muted}>Kesif emirleri birlik tasimaz. Sonuc ulak kutusuna detayli rapor olarak duser.</p>
              {selectedPoi?.resourceType ? <p className={styles.muted}>Kaynak tipi: {poiResourceLabels[selectedPoi.resourceType]}</p> : null}
            </div>
          )}
        </div>
      </BottomSheet>
    </section>
  );
}
