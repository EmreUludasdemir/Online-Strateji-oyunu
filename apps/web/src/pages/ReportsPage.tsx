import { useQuery } from "@tanstack/react-query";

import { api } from "../api";
import styles from "../components/GameLayout.module.css";
import { formatDateTime, formatNumber } from "../lib/formatters";

export function ReportsPage() {
  const reportsQuery = useQuery({
    queryKey: ["battle-reports"],
    queryFn: api.reports,
  });

  if (reportsQuery.isPending) {
    return <div className={styles.feedbackCard}>Loading battle reports...</div>;
  }

  if (reportsQuery.isError || !reportsQuery.data) {
    return <div className={styles.feedbackCard}>Unable to load battle reports.</div>;
  }

  const winCount = reportsQuery.data.reports.filter((report) => report.result === "ATTACKER_WIN").length;
  const defenseCount = reportsQuery.data.reports.length - winCount;
  const totalLoot = reportsQuery.data.reports.reduce(
    (sum, report) => sum + Object.values(report.loot).reduce((lootSum, value) => lootSum + value, 0),
    0,
  );

  return (
    <section className={styles.reportList}>
      <article className={styles.heroCard}>
        <p className={styles.sectionKicker}>Battle ledger</p>
        <h2>Resolved marches and war spoils</h2>
        <p>Each report is stored on the server and survives restarts, including loot and troop losses.</p>
        <div className={styles.commandDeck}>
          <article className={styles.commandCard}>
            <p className={styles.sectionKicker}>Victories</p>
            <strong className={styles.commandValue}>{formatNumber(winCount)}</strong>
            <p className={styles.commandHint}>Successful marches recorded in the current ledger.</p>
          </article>
          <article className={styles.commandCard}>
            <p className={styles.sectionKicker}>Defenses held</p>
            <strong className={styles.commandValue}>{formatNumber(defenseCount)}</strong>
            <p className={styles.commandHint}>Clashes where the defending city kept control.</p>
          </article>
          <article className={styles.commandCard}>
            <p className={styles.sectionKicker}>Loot hauled</p>
            <strong className={styles.commandValue}>{formatNumber(totalLoot)}</strong>
            <p className={styles.commandHint}>Combined loot volume across the current report list.</p>
          </article>
        </div>
      </article>

      {reportsQuery.data.reports.length === 0 ? (
        <div className={styles.feedbackCard}>No reports yet. Launch a march from the world map.</div>
      ) : (
        reportsQuery.data.reports.map((report) => (
          <article key={report.id} className={styles.reportCard}>
            <div className={styles.reportHeader}>
              <div>
                <p className={report.result === "ATTACKER_WIN" ? styles.reportOutcomeWin : styles.reportOutcomeHold}>
                  {report.result === "ATTACKER_WIN" ? "March succeeded" : "Defense held"}
                </p>
                <h3>
                  {report.attackerCityName} vs {report.defenderCityName}
                </h3>
              </div>
              <span className={styles.levelBadge}>{formatDateTime(report.createdAt)}</span>
            </div>

            <p>
              {report.attackerName} attacked {report.defenderName} from ({report.location.from.x}, {report.location.from.y})
              to ({report.location.to.x}, {report.location.to.y}) across {report.location.distance} tiles.
            </p>
            <p>
              Attack power {formatNumber(report.attackerPower)} versus defense power {formatNumber(report.defenderPower)}.
            </p>

            <div className={styles.commandDeck}>
              <article className={styles.commandCard}>
                <p className={styles.sectionKicker}>Loot</p>
                <div className={styles.costGrid}>
                  {Object.entries(report.loot).map(([resource, amount]) => (
                    <div key={resource}>
                      <dt>{resource}</dt>
                      <dd>{formatNumber(amount)}</dd>
                    </div>
                  ))}
                </div>
              </article>
              <article className={styles.commandCard}>
                <p className={styles.sectionKicker}>Attacker losses</p>
                <div className={styles.costGrid}>
                  {Object.entries(report.attackerLosses).map(([troopType, amount]) => (
                    <div key={troopType}>
                      <dt>{troopType.toLowerCase()}</dt>
                      <dd>{formatNumber(amount)}</dd>
                    </div>
                  ))}
                </div>
              </article>
              <article className={styles.commandCard}>
                <p className={styles.sectionKicker}>Defender losses</p>
                <div className={styles.costGrid}>
                  {Object.entries(report.defenderLosses).map(([troopType, amount]) => (
                    <div key={troopType}>
                      <dt>{troopType.toLowerCase()}</dt>
                      <dd>{formatNumber(amount)}</dd>
                    </div>
                  ))}
                </div>
              </article>
            </div>
          </article>
        ))
      )}
    </section>
  );
}
