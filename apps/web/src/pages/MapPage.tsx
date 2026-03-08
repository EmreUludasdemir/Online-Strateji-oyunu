import { useQuery } from "@tanstack/react-query";
import { lazy, Suspense, useEffect, useMemo } from "react";

import { api } from "../api";
import { useGameLayoutContext } from "../components/GameLayout";
import styles from "../components/GameLayout.module.css";
import { formatNumber } from "../lib/formatters";

const WorldMap = lazy(() => import("../components/WorldMap"));

export function MapPage() {
  const { selectedCityId, setSelectedCityId, attack, isAttacking, state } = useGameLayoutContext();
  const worldMapQuery = useQuery({
    queryKey: ["world-map"],
    queryFn: api.worldMap,
  });

  useEffect(() => {
    if (!worldMapQuery.data || selectedCityId) {
      return;
    }

    const preferredCity =
      worldMapQuery.data.cities.find((city) => city.isCurrentPlayer) ?? worldMapQuery.data.cities[0];
    setSelectedCityId(preferredCity?.cityId ?? null);
  }, [selectedCityId, setSelectedCityId, worldMapQuery.data]);

  const selectedCity = useMemo(() => {
    return worldMapQuery.data?.cities.find((city) => city.cityId === selectedCityId) ?? null;
  }, [selectedCityId, worldMapQuery.data]);

  const attackableSettlements = useMemo(
    () => worldMapQuery.data?.cities.filter((city) => city.canAttack) ?? [],
    [worldMapQuery.data],
  );

  const emptyTiles = useMemo(() => {
    if (!worldMapQuery.data) {
      return 0;
    }

    return worldMapQuery.data.size * worldMapQuery.data.size - worldMapQuery.data.cities.length;
  }, [worldMapQuery.data]);

  if (worldMapQuery.isPending) {
    return <div className={styles.feedbackCard}>Loading the regional map...</div>;
  }

  if (worldMapQuery.isError || !worldMapQuery.data) {
    return <div className={styles.feedbackCard}>Unable to load the world map.</div>;
  }

  return (
    <section className={styles.mapLayout}>
      <article className={styles.mapCard}>
        <div className={styles.mapHeader}>
          <div>
            <p className={styles.sectionKicker}>World map</p>
            <h2>Nearby frontier settlements</h2>
          </div>
          <span className={styles.levelBadge}>
            {worldMapQuery.data.size} x {worldMapQuery.data.size} grid
          </span>
        </div>
        <div className={styles.mapInsightGrid}>
          <article className={styles.mapInsightCard}>
            <span className={styles.sectionKicker}>Command reach</span>
            <strong>{attackableSettlements.length} targets in range</strong>
            <p>{worldMapQuery.data.cities.length - 1} rival settlements currently known.</p>
          </article>
          <article className={styles.mapInsightCard}>
            <span className={styles.sectionKicker}>Frontier density</span>
            <strong>{emptyTiles} empty tiles</strong>
            <p>The map still has open ground for future expansion.</p>
          </article>
          <article className={styles.mapInsightCard}>
            <span className={styles.sectionKicker}>City posture</span>
            <strong>
              {formatNumber(state.city.attackPower)} atk / {formatNumber(state.city.defensePower)} def
            </strong>
            <p>{state.city.cityName} remains your current command center.</p>
          </article>
        </div>
        <Suspense fallback={<div className={styles.statusStrip}>Loading the tactical map...</div>}>
          <WorldMap
            size={worldMapQuery.data.size}
            cities={worldMapQuery.data.cities}
            selectedCityId={selectedCityId}
            onSelect={setSelectedCityId}
          />
        </Suspense>
        <div className={styles.settlementList}>
          {worldMapQuery.data.cities.map((city) => (
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
                  : `${city.ownerName} - ${city.distance ?? "-"} tiles`}
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
            <p>Town Hall level: {formatNumber(selectedCity.townHallLevel)}</p>
            <div className={styles.costGrid}>
              <div>
                <dt>Attack</dt>
                <dd>{formatNumber(selectedCity.attackPower)}</dd>
              </div>
              <div>
                <dt>Defense</dt>
                <dd>{formatNumber(selectedCity.defensePower)}</dd>
              </div>
            </div>
            <p>
              {selectedCity.isCurrentPlayer
                ? "This is your current city."
                : `Distance: ${selectedCity.distance ?? "-"} tiles`}
            </p>
            {!selectedCity.isCurrentPlayer ? (
              <div className={styles.statusStrip}>
                {selectedCity.canAttack
                  ? selectedCity.projectedOutcome === "ATTACKER_WIN"
                    ? "Projected result: raid favored with current forces."
                    : "Projected result: target defense is favored."
                  : "Target is currently out of range for an attack order."}
              </div>
            ) : null}

            {selectedCity.canAttack ? (
              <button
                className={styles.primaryButton}
                type="button"
                disabled={isAttacking}
                onClick={() => attack(selectedCity.cityId)}
              >
                {isAttacking ? "Sending attack..." : "Send attack"}
              </button>
            ) : (
              <div className={styles.statusStrip}>
                {selectedCity.isCurrentPlayer
                  ? "Select another settlement to inspect attack options."
                  : "This target is outside the current attack range."}
              </div>
            )}
          </>
        ) : (
          <div className={styles.statusStrip}>Pick a city marker to inspect it.</div>
        )}
      </aside>
    </section>
  );
}
