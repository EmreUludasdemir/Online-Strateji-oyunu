import { useQuery } from "@tanstack/react-query";
import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import type { TroopStock, TroopType } from "@frontier/shared";

import { api } from "../api";
import { useGameLayoutContext } from "../components/GameLayout";
import styles from "../components/GameLayout.module.css";
import { formatNumber, formatRelativeTimer } from "../lib/formatters";
import { useNow } from "../lib/useNow";

const WorldMap = lazy(() => import("../components/WorldMap"));

export function MapPage() {
  const now = useNow();
  const { selectedCityId, setSelectedCityId, sendMarch, recallMarch, isSendingMarch, isRecallingMarch, state } =
    useGameLayoutContext();
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
    if (!worldChunkQuery.data || selectedCityId) {
      return;
    }

    const preferredCity = worldChunkQuery.data.cities.find((city) => city.isCurrentPlayer) ?? worldChunkQuery.data.cities[0];
    setSelectedCityId(preferredCity?.cityId ?? null);
  }, [selectedCityId, setSelectedCityId, worldChunkQuery.data]);

  const selectedCity = useMemo(() => {
    return worldChunkQuery.data?.cities.find((city) => city.cityId === selectedCityId) ?? null;
  }, [selectedCityId, worldChunkQuery.data]);

  const visibleTiles = worldChunkQuery.data?.tiles.filter((tile) => tile.state === "VISIBLE").length ?? 0;
  const discoveredTiles = worldChunkQuery.data?.tiles.filter((tile) => tile.state !== "HIDDEN").length ?? 0;
  const commandableCities = worldChunkQuery.data?.cities.filter((city) => city.canSendMarch) ?? [];
  const totalAssignedTroops = Object.values(troopPayload).reduce((sum, value) => sum + value, 0);

  if (worldChunkQuery.isPending) {
    return <div className={styles.feedbackCard}>Loading the regional map...</div>;
  }

  if (worldChunkQuery.isError || !worldChunkQuery.data) {
    return <div className={styles.feedbackCard}>Unable to load the world map.</div>;
  }

  return (
    <section className={styles.mapLayout}>
      <article className={styles.mapCard}>
        <div className={styles.mapHeader}>
          <div>
            <p className={styles.sectionKicker}>World map</p>
            <h2>Chunked frontier theatre</h2>
          </div>
          <span className={styles.levelBadge}>
            Center {worldChunkQuery.data.center.x},{worldChunkQuery.data.center.y}
          </span>
        </div>
        <div className={styles.mapInsightGrid}>
          <article className={styles.mapInsightCard}>
            <span className={styles.sectionKicker}>Visible ground</span>
            <strong>{formatNumber(visibleTiles)} tiles</strong>
            <p>{formatNumber(discoveredTiles)} tiles have been discovered in the current chunk.</p>
          </article>
          <article className={styles.mapInsightCard}>
            <span className={styles.sectionKicker}>March reach</span>
            <strong>{formatNumber(commandableCities.length)} valid targets</strong>
            <p>Your current command center can project force across nearby territory.</p>
          </article>
          <article className={styles.mapInsightCard}>
            <span className={styles.sectionKicker}>Field orders</span>
            <strong>{formatNumber(state.city.activeMarches.length)} active marches</strong>
            <p>Fog updates follow city vision and live march positions.</p>
          </article>
        </div>
        <Suspense fallback={<div className={styles.statusStrip}>Loading the tactical map...</div>}>
          <WorldMap
            size={worldChunkQuery.data.size}
            center={worldChunkQuery.data.center}
            radius={worldChunkQuery.data.radius}
            tiles={worldChunkQuery.data.tiles}
            cities={worldChunkQuery.data.cities}
            marches={worldChunkQuery.data.marches}
            selectedCityId={selectedCityId}
            onSelect={setSelectedCityId}
          />
        </Suspense>
        <div className={styles.settlementList}>
          {worldChunkQuery.data.cities.map((city) => (
            <button
              key={city.cityId}
              className={city.cityId === selectedCityId ? styles.settlementButtonActive : styles.settlementButton}
              type="button"
              onClick={() => setSelectedCityId(city.cityId)}
            >
              <span>{city.cityName}</span>
              <small>
                {city.isCurrentPlayer
                  ? "Your city"
                  : `${city.ownerName} · ${city.fogState.toLowerCase()} · ${city.distance ?? "-"} tiles`}
              </small>
            </button>
          ))}
        </div>
      </article>

      <aside className={styles.detailCard}>
        {selectedCity ? (
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

            {!selectedCity.isCurrentPlayer ? (
              <>
                <article className={styles.commandCard}>
                  <p className={styles.sectionKicker}>Send march</p>
                  <strong className={styles.commandValue}>
                    {selectedCity.projectedOutcome === "ATTACKER_WIN" ? "Favored" : "Risky"}
                  </strong>
                  <p className={styles.commandHint}>
                    Assign troops and a commander. The server will lock the march until ETA and then resolve it.
                  </p>
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

                {selectedCity.canSendMarch ? (
                  <button
                    className={styles.primaryButton}
                    type="button"
                    disabled={isSendingMarch || totalAssignedTroops <= 0}
                    onClick={() =>
                      sendMarch({
                        targetCityId: selectedCity.cityId,
                        commanderId,
                        troops: troopPayload,
                      })
                    }
                  >
                    {isSendingMarch ? "Dispatching march..." : "Send march"}
                  </button>
                ) : (
                  <div className={styles.statusStrip}>This target cannot receive a march from the current city.</div>
                )}
              </>
            ) : (
              <div className={styles.statusStrip}>This is your command center. Choose another city to issue a march.</div>
            )}

            {state.city.activeMarches.length > 0 ? (
              <div className={styles.cardStack}>
                {state.city.activeMarches.map((march) => (
                  <article key={march.id} className={styles.commandCard}>
                    <p className={styles.sectionKicker}>Active march</p>
                    <strong className={styles.commandValue}>{march.targetCityName}</strong>
                    <p className={styles.commandHint}>ETA {formatRelativeTimer(march.etaAt, now)}</p>
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
            ) : null}
          </>
        ) : (
          <div className={styles.statusStrip}>Pick a city marker to inspect it.</div>
        )}
      </aside>
    </section>
  );
}
