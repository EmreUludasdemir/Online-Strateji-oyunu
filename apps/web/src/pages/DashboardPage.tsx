import { type BuildingType } from "@frontier/shared";

import { useGameLayoutContext } from "../components/GameLayout";
import styles from "../components/GameLayout.module.css";
import { formatNumber, formatRelativeTimer } from "../lib/formatters";
import { useNow } from "../lib/useNow";

export function DashboardPage() {
  const now = useNow();
  const { state, upgrade, isUpgrading } = useGameLayoutContext();
  const activeUpgrade = state.city.activeUpgrade;

  return (
    <section className={styles.pageGrid}>
      <article className={styles.heroCard}>
        <p className={styles.sectionKicker}>City overview</p>
        <h2>{state.city.cityName}</h2>
        <p>
          Coordinates {state.city.coordinates.x}, {state.city.coordinates.y}. Attack power {state.city.attackPower},
          defense power {state.city.defensePower}.
        </p>
        {activeUpgrade ? (
          <div className={styles.statusStrip}>
            Active upgrade: {activeUpgrade.buildingType.replaceAll("_", " ")} to level {activeUpgrade.toLevel}.
            Completes in {formatRelativeTimer(activeUpgrade.completesAt, now)}.
          </div>
        ) : (
          <div className={styles.statusStrip}>No construction is active. Queue a new upgrade below.</div>
        )}
      </article>

      <div className={styles.cardGrid}>
        {state.city.buildings.map((building) => {
          const blockedByQueue = Boolean(activeUpgrade) && !building.isUpgradeActive;

          return (
            <article key={building.type} className={styles.buildingCard}>
              <div className={styles.buildingHeader}>
                <div>
                  <p className={styles.sectionKicker}>{building.label}</p>
                  <h3>Level {building.level}</h3>
                </div>
                <span className={styles.levelBadge}>Next {building.nextLevel}</span>
              </div>
              <p className={styles.buildingText}>{building.description}</p>
              <dl className={styles.costGrid}>
                {Object.entries(building.upgradeCost).map(([resource, amount]) => (
                  <div key={resource}>
                    <dt>{resource}</dt>
                    <dd>{formatNumber(amount)}</dd>
                  </div>
                ))}
              </dl>
              <p className={styles.timerText}>
                Upgrade time: {Math.floor(building.upgradeDurationSeconds / 60)}m {building.upgradeDurationSeconds % 60}s
              </p>
              <button
                className={styles.primaryButton}
                type="button"
                disabled={isUpgrading || blockedByQueue || building.isUpgradeActive}
                onClick={() => upgrade(building.type as BuildingType)}
              >
                {building.isUpgradeActive
                  ? "Currently upgrading"
                  : blockedByQueue
                    ? "Queue is occupied"
                    : "Upgrade building"}
              </button>
            </article>
          );
        })}
      </div>
    </section>
  );
}
