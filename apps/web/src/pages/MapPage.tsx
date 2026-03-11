import { useQuery } from "@tanstack/react-query";
import type { PoiKind, PoiResourceType, TroopStock, TroopType } from "@frontier/shared";
import { lazy, Suspense, useEffect, useMemo, useState } from "react";

import { api } from "../api";
import { useGameLayoutContext } from "../components/GameLayout";
import styles from "../components/GameLayout.module.css";
import { formatNumber, formatRelativeTimer } from "../lib/formatters";
import { useNow } from "../lib/useNow";

const WorldMap = lazy(() => import("../components/WorldMap"));

const poiKindLabels: Record<PoiKind, string> = {
  BARBARIAN_CAMP: "Barbarian Camp",
  RESOURCE_NODE: "Resource Node",
};

const poiResourceLabels: Record<PoiResourceType, string> = {
  WOOD: "Wood",
  STONE: "Stone",
  FOOD: "Food",
  GOLD: "Gold",
};

function humanizeToken(value: string): string {
  return value.toLowerCase().replaceAll("_", " ");
}

function getMarchTargetName(targetCityName: string | null, targetPoiName: string | null): string {
  return targetPoiName ?? targetCityName ?? "Unknown target";
}

function getMarchTimingLabel(
  march: {
    state: string;
    etaAt: string;
    battleWindowClosesAt: string | null;
    returnEtaAt: string | null;
  },
  now: number,
): string {
  if (march.state === "STAGING" && march.battleWindowClosesAt) {
    return `Window closes ${formatRelativeTimer(march.battleWindowClosesAt, now)}`;
  }

  if (march.state === "GATHERING") {
    return `Gathering ${formatRelativeTimer(march.etaAt, now)}`;
  }

  if (march.state === "RETURNING" && march.returnEtaAt) {
    return `Returning ${formatRelativeTimer(march.returnEtaAt, now)}`;
  }

  return `ETA ${formatRelativeTimer(march.etaAt, now)}`;
}

export function MapPage() {
  const now = useNow();
  const {
    selectedCityId,
    selectedPoiId,
    selectCity,
    selectPoi,
    sendMarch,
    recallMarch,
    isSendingMarch,
    isRecallingMarch,
    state,
  } = useGameLayoutContext();
  const [commanderId, setCommanderId] = useState(state.city.commanders[0]?.id ?? "");
  const [troopPayload, setTroopPayload] = useState<TroopStock>({
    INFANTRY: Math.min(18, state.city.troops[0]?.quantity ?? 0),
    ARCHER: Math.min(12, state.city.troops[1]?.quantity ?? 0),
    CAVALRY: Math.min(8, state.city.troops[2]?.quantity ?? 0),
  });

  const worldChunkQuery = useQuery({
    queryKey: ["world-chunk"],
    queryFn: () =>
      api.worldChunk({
        centerX: state.city.coordinates.x,
        centerY: state.city.coordinates.y,
        radius: 8,
      }),
  });

  useEffect(() => {
    if (!worldChunkQuery.data || selectedCityId || selectedPoiId) {
      return;
    }

    const preferredCity = worldChunkQuery.data.cities.find((city) => city.isCurrentPlayer) ?? worldChunkQuery.data.cities[0];
    selectCity(preferredCity?.cityId ?? null);
  }, [selectCity, selectedCityId, selectedPoiId, worldChunkQuery.data]);

  const selectedCity = useMemo(() => {
    return worldChunkQuery.data?.cities.find((city) => city.cityId === selectedCityId) ?? null;
  }, [selectedCityId, worldChunkQuery.data]);

  const selectedPoi = useMemo(() => {
    return worldChunkQuery.data?.pois.find((poi) => poi.id === selectedPoiId) ?? null;
  }, [selectedPoiId, worldChunkQuery.data]);

  const visibleTiles = worldChunkQuery.data?.tiles.filter((tile) => tile.state === "VISIBLE").length ?? 0;
  const discoveredTiles = worldChunkQuery.data?.tiles.filter((tile) => tile.state !== "HIDDEN").length ?? 0;
  const commandableCities = worldChunkQuery.data?.cities.filter((city) => city.canSendMarch) ?? [];
  const actionablePois = worldChunkQuery.data?.pois.filter((poi) => poi.canSendMarch || poi.canGather) ?? [];
  const activeCampCount = worldChunkQuery.data?.pois.filter((poi) => poi.kind === "BARBARIAN_CAMP").length ?? 0;
  const visibleNodeCount = worldChunkQuery.data?.pois.filter((poi) => poi.kind === "RESOURCE_NODE").length ?? 0;
  const totalAssignedTroops = Object.values(troopPayload).reduce((sum, value) => sum + value, 0);

  if (worldChunkQuery.isPending) {
    return <div className={styles.feedbackCard}>Loading the regional map...</div>;
  }

  if (worldChunkQuery.isError || !worldChunkQuery.data) {
    return <div className={styles.feedbackCard}>Unable to load the world map.</div>;
  }

  const renderMarchComposer = (options: {
    title: string;
    emphasis: string;
    hint: string;
    actionLabel: string;
    disabled: boolean;
    onSubmit: () => void;
  }) => (
    <>
      <article className={styles.commandCard}>
        <p className={styles.sectionKicker}>{options.title}</p>
        <strong className={styles.commandValue}>{options.emphasis}</strong>
        <p className={styles.commandHint}>{options.hint}</p>
        <div className={styles.inlineForm}>
          <select value={commanderId} onChange={(event) => setCommanderId(event.target.value)}>
            {state.city.commanders.map((commander) => (
              <option key={commander.id} value={commander.id}>
                {commander.name}
              </option>
            ))}
          </select>
          <span className={styles.inlineMetric}>{formatNumber(totalAssignedTroops)} troops assigned</span>
        </div>
        <div className={styles.cardStack}>
          {state.city.troops.map((troop) => (
            <label key={troop.type} className={styles.inlineRange}>
              <span>
                {troop.label} ({formatNumber(troop.quantity)})
              </span>
              <input
                type="range"
                min={0}
                max={troop.quantity}
                value={troopPayload[troop.type as TroopType]}
                onChange={(event) =>
                  setTroopPayload((current) => ({
                    ...current,
                    [troop.type]: Number(event.target.value),
                  }))
                }
              />
              <strong>{formatNumber(troopPayload[troop.type as TroopType])}</strong>
            </label>
          ))}
        </div>
      </article>

      <button className={styles.primaryButton} type="button" disabled={options.disabled} onClick={options.onSubmit}>
        {isSendingMarch ? "Dispatching march..." : options.actionLabel}
      </button>
    </>
  );

  const renderActiveMarches = () =>
    state.city.activeMarches.length > 0 ? (
      <div className={styles.cardStack}>
        {state.city.activeMarches.map((march) => (
          <article key={march.id} className={styles.commandCard}>
            <p className={styles.sectionKicker}>{humanizeToken(march.objective)}</p>
            <strong className={styles.commandValue}>{getMarchTargetName(march.targetCityName, march.targetPoiName)}</strong>
            <p className={styles.commandHint}>{humanizeToken(march.state)} / {getMarchTimingLabel(march, now)}</p>
            <div className={styles.compactMetricGrid}>
              <div>
                <dt>Distance</dt>
                <dd>{formatNumber(march.distance)} tiles</dd>
              </div>
              <div>
                <dt>Cargo</dt>
                <dd>
                  {march.cargo.amount > 0 && march.cargo.resourceType
                    ? `${formatNumber(march.cargo.amount)} ${poiResourceLabels[march.cargo.resourceType]}`
                    : "Empty"}
                </dd>
              </div>
            </div>
            <button
              className={styles.subtleButton}
              type="button"
              disabled={isRecallingMarch}
              onClick={() => recallMarch(march.id)}
            >
              {isRecallingMarch ? "Recalling..." : "Recall march"}
            </button>
          </article>
        ))}
      </div>
    ) : null;

  const renderCityDetail = () => {
    if (!selectedCity) {
      return null;
    }

    return (
      <>
        <p className={styles.sectionKicker}>Settlement detail</p>
        <h3>{selectedCity.cityName}</h3>
        <p>Owner: {selectedCity.ownerName}</p>
        <p>
          Coordinates {selectedCity.x}, {selectedCity.y}
        </p>
        <p>Visibility: {selectedCity.fogState.toLowerCase()}</p>
        <div className={styles.costGrid}>
          <div>
            <dt>Projected attack</dt>
            <dd>{formatNumber(state.city.attackPower)}</dd>
          </div>
          <div>
            <dt>Target defense</dt>
            <dd>{formatNumber(selectedCity.defensePower)}</dd>
          </div>
        </div>

        {selectedCity.battleWindowClosesAt && selectedCity.stagedMarchCount > 0 ? (
          <div className={styles.statusStrip}>
            Battle window open for {formatNumber(selectedCity.stagedMarchCount)} staged marches. Closes{" "}
            {formatRelativeTimer(selectedCity.battleWindowClosesAt, now)}.
          </div>
        ) : null}

        {!selectedCity.isCurrentPlayer ? (
          <>
            {renderMarchComposer({
              title: "Send march",
              emphasis: selectedCity.battleWindowClosesAt
                ? "Battle window open"
                : selectedCity.projectedOutcome === "ATTACKER_WIN"
                  ? "Favored"
                  : "Risky",
              hint: selectedCity.battleWindowClosesAt
                ? "A same-target battle window is already open. Reaching the city before it closes will join the pending siege."
                : "Assign troops and a commander. The server locks the march until ETA, then resolves it authoritatively.",
              actionLabel: selectedCity.battleWindowClosesAt ? "Join battle window" : "Send march",
              disabled: isSendingMarch || totalAssignedTroops <= 0 || !selectedCity.canSendMarch,
              onSubmit: () =>
                sendMarch({
                  targetCityId: selectedCity.cityId,
                  commanderId,
                  troops: troopPayload,
                }),
            })}
            {!selectedCity.canSendMarch ? (
              <div className={styles.statusStrip}>This target is outside range or otherwise unavailable to your city.</div>
            ) : null}
          </>
        ) : (
          <div className={styles.statusStrip}>This is your command center. Choose another city or a point of interest.</div>
        )}
      </>
    );
  };

  const renderPoiDetail = () => {
    if (!selectedPoi) {
      return null;
    }

    const isCamp = selectedPoi.kind === "BARBARIAN_CAMP";
    const canAct = isCamp ? selectedPoi.canSendMarch : selectedPoi.canGather;
    const actionLabel = isCamp ? "Send assault" : "Send gather";
    const emphasis = isCamp
      ? selectedPoi.projectedOutcome === "ATTACKER_WIN"
        ? "Camp looks beatable"
        : "Expect resistance"
      : selectedPoi.projectedLoad != null
        ? `${formatNumber(selectedPoi.projectedLoad)} carry capacity`
        : "Gather mission";

    const statusMessage = (() => {
      if (canAct) {
        return null;
      }

      if (selectedPoi.occupantMarchId) {
        return "Another march already occupies this point of interest.";
      }

      if (selectedPoi.state !== "ACTIVE" && selectedPoi.respawnsAt) {
        return `${poiKindLabels[selectedPoi.kind]} respawns in ${formatRelativeTimer(selectedPoi.respawnsAt, now)}.`;
      }

      if (!isCamp && (selectedPoi.remainingAmount ?? 0) <= 0) {
        return "This node is depleted and waiting to respawn.";
      }

      return "This point of interest is currently unavailable.";
    })();

    return (
      <>
        <p className={styles.sectionKicker}>Point of interest</p>
        <h3>{selectedPoi.label}</h3>
        <p>
          {poiKindLabels[selectedPoi.kind]} / level {selectedPoi.level}
        </p>
        <p>
          Coordinates {selectedPoi.x}, {selectedPoi.y}
        </p>
        <div className={styles.compactMetricGrid}>
          <div>
            <dt>Visibility</dt>
            <dd>{selectedPoi.fogState.toLowerCase()}</dd>
          </div>
          <div>
            <dt>State</dt>
            <dd>{humanizeToken(selectedPoi.state)}</dd>
          </div>
          <div>
            <dt>Distance</dt>
            <dd>{selectedPoi.distance != null ? `${formatNumber(selectedPoi.distance)} tiles` : "-"}</dd>
          </div>
          <div>
            <dt>Occupancy</dt>
            <dd>{selectedPoi.occupantMarchId ? "Occupied" : "Open"}</dd>
          </div>
        </div>

        {isCamp ? (
          <div className={styles.costGrid}>
            <div>
              <dt>Projected attack</dt>
              <dd>{formatNumber(state.city.attackPower)}</dd>
            </div>
            <div>
              <dt>Projected outcome</dt>
              <dd>{selectedPoi.projectedOutcome === "ATTACKER_WIN" ? "Favored" : "Risky"}</dd>
            </div>
          </div>
        ) : (
          <div className={styles.costGrid}>
            <div>
              <dt>Resource type</dt>
              <dd>{selectedPoi.resourceType ? poiResourceLabels[selectedPoi.resourceType] : "-"}</dd>
            </div>
            <div>
              <dt>Remaining</dt>
              <dd>
                {selectedPoi.remainingAmount != null && selectedPoi.maxAmount != null
                  ? `${formatNumber(selectedPoi.remainingAmount)} / ${formatNumber(selectedPoi.maxAmount)}`
                  : "-"}
              </dd>
            </div>
          </div>
        )}

        {renderMarchComposer({
          title: isCamp ? "Camp assault" : "Gather resource",
          emphasis,
          hint: isCamp
            ? "Barbarian camps resolve as a single authoritative PvE battle at ETA."
            : "Resource nodes switch to gathering, then return the haul once the march reaches home.",
          actionLabel,
          disabled: isSendingMarch || totalAssignedTroops <= 0 || !canAct,
          onSubmit: () =>
            sendMarch({
              objective: isCamp ? "BARBARIAN_ATTACK" : "RESOURCE_GATHER",
              targetPoiId: selectedPoi.id,
              commanderId,
              troops: troopPayload,
            }),
        })}
        {statusMessage ? <div className={styles.statusStrip}>{statusMessage}</div> : null}
      </>
    );
  };

  return (
    <section className={styles.mapLayout}>
      <article className={styles.mapCard}>
        <div className={styles.mapHeader}>
          <div>
            <p className={styles.sectionKicker}>Imperial atlas</p>
            <h2>Frontier theatre</h2>
          </div>
          <span className={styles.levelBadge}>
            Center {worldChunkQuery.data.center.x},{worldChunkQuery.data.center.y}
          </span>
        </div>
        <div className={styles.mapInsightGrid}>
          <article className={styles.mapInsightCard}>
            <span className={styles.sectionKicker}>Surveyed ground</span>
            <strong>{formatNumber(visibleTiles)} tiles</strong>
            <p>{formatNumber(discoveredTiles)} tiles have been discovered inside this chunk.</p>
          </article>
          <article className={styles.mapInsightCard}>
            <span className={styles.sectionKicker}>Actionable targets</span>
            <strong>{formatNumber(commandableCities.length + actionablePois.length)} orders</strong>
            <p>
              {formatNumber(commandableCities.length)} settlements and {formatNumber(actionablePois.length)} points of interest
              are currently in range.
            </p>
          </article>
          <article className={styles.mapInsightCard}>
            <span className={styles.sectionKicker}>Field pressure</span>
            <strong>{formatNumber(activeCampCount + visibleNodeCount)} POIs</strong>
            <p>
              {formatNumber(activeCampCount)} visible camps and {formatNumber(visibleNodeCount)} visible resource nodes shape the
              local theatre.
            </p>
          </article>
        </div>
        <Suspense fallback={<div className={styles.statusStrip}>Loading the tactical map...</div>}>
          <WorldMap
            size={worldChunkQuery.data.size}
            center={worldChunkQuery.data.center}
            radius={worldChunkQuery.data.radius}
            tiles={worldChunkQuery.data.tiles}
            cities={worldChunkQuery.data.cities}
            pois={worldChunkQuery.data.pois}
            marches={worldChunkQuery.data.marches}
            selectedCityId={selectedCityId}
            selectedPoiId={selectedPoiId}
            onSelectCity={selectCity}
            onSelectPoi={selectPoi}
          />
        </Suspense>

        <p className={styles.sectionKicker}>Cities in view</p>
        <div className={styles.settlementList}>
          {worldChunkQuery.data.cities.map((city) => (
            <button
              key={city.cityId}
              className={city.cityId === selectedCityId ? styles.settlementButtonActive : styles.settlementButton}
              type="button"
              onClick={() => selectCity(city.cityId)}
            >
              <span>{city.cityName}</span>
              <small>
                {city.isCurrentPlayer
                  ? "Your city"
                  : `${city.ownerName} / ${city.fogState.toLowerCase()} / ${city.distance ?? "-"} tiles`}
              </small>
            </button>
          ))}
        </div>

        <p className={styles.sectionKicker}>Frontier marks</p>
        <div className={styles.settlementList}>
          {worldChunkQuery.data.pois.map((poi) => (
            <button
              key={poi.id}
              className={poi.id === selectedPoiId ? styles.settlementButtonActive : styles.settlementButton}
              type="button"
              onClick={() => selectPoi(poi.id)}
            >
              <span>{poi.label}</span>
              <small>
                {poiKindLabels[poi.kind]}
                {poi.resourceType ? ` / ${poiResourceLabels[poi.resourceType]}` : ""}
                {` / ${humanizeToken(poi.state)} / ${poi.distance ?? "-"} tiles`}
              </small>
            </button>
          ))}
        </div>
      </article>

      <aside className={styles.detailCard}>
        {selectedCity ? renderCityDetail() : selectedPoi ? renderPoiDetail() : <div className={styles.statusStrip}>Pick a city or POI marker to inspect it.</div>}
        {renderActiveMarches()}
      </aside>
    </section>
  );
}
