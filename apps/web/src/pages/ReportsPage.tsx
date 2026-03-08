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

  return (
    <section className={styles.reportList}>
      <article className={styles.heroCard}>
        <p className={styles.sectionKicker}>Battle ledger</p>
        <h2>Recent raids and defenses</h2>
        <p>Each report is stored on the server and remains available after restarts.</p>
      </article>

      {reportsQuery.data.reports.length === 0 ? (
        <div className={styles.feedbackCard}>No reports yet. Launch a raid from the world map.</div>
      ) : (
        reportsQuery.data.reports.map((report) => (
          <article key={report.id} className={styles.reportCard}>
            <div className={styles.reportHeader}>
              <div>
                <p className={styles.sectionKicker}>
                  {report.result === "ATTACKER_WIN" ? "Raid succeeded" : "Defense held"}
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
            <dl className={styles.costGrid}>
              {Object.entries(report.loot).map(([resource, amount]) => (
                <div key={resource}>
                  <dt>{resource}</dt>
                  <dd>{formatNumber(amount)}</dd>
                </div>
              ))}
            </dl>
          </article>
        ))
      )}
    </section>
  );
}
