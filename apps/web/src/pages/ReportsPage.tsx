import { useQuery } from "@tanstack/react-query";
import type { PoiResourceType } from "@frontier/shared";
import { useEffect } from "react";

import { api } from "../api";
import styles from "../components/GameLayout.module.css";
import { trackAnalyticsOnce } from "../lib/analytics";
import { formatDateTime, formatNumber } from "../lib/formatters";

const poiResourceLabels: Record<PoiResourceType, string> = {
  WOOD: "Wood",
  STONE: "Stone",
  FOOD: "Food",
  GOLD: "Gold",
};

function getLootVolume(report: Awaited<ReturnType<typeof api.reports>>["reports"][number]): number {
  if (report.kind === "RESOURCE_GATHER") {
    return report.amount;
  }

  return Object.values(report.loot).reduce((sum, value) => sum + value, 0);
}

export function ReportsPage() {
  const reportsQuery = useQuery({
    queryKey: ["battle-reports"],
    queryFn: api.reports,
  });

  useEffect(() => {
    if (!reportsQuery.data) {
      return;
    }

    for (const report of reportsQuery.data.reports) {
      if (report.kind === "RESOURCE_GATHER") {
        continue;
      }

      trackAnalyticsOnce(`battle_result:${report.id}`, "battle_result", {
        reportKind: report.kind,
        result: report.result,
      });
    }
  }, [reportsQuery.data]);

  if (reportsQuery.isPending) {
    return <div className={styles.feedbackCard}>Loading battle reports...</div>;
  }

  if (reportsQuery.isError || !reportsQuery.data) {
    return <div className={styles.feedbackCard}>Unable to load battle reports.</div>;
  }

  const victoryCount = reportsQuery.data.reports.filter(
    (report) => report.kind !== "RESOURCE_GATHER" && report.result === "ATTACKER_WIN",
  ).length;
  const defenseCount = reportsQuery.data.reports.filter(
    (report) => report.kind !== "RESOURCE_GATHER" && report.result === "DEFENDER_HOLD",
  ).length;
  const gatherCount = reportsQuery.data.reports.filter((report) => report.kind === "RESOURCE_GATHER").length;
  const totalLoot = reportsQuery.data.reports.reduce((sum, report) => sum + getLootVolume(report), 0);

  return (
    <section className={styles.reportList}>
      <article className={styles.heroCard}>
        <p className={styles.sectionKicker}>Battle ledger</p>
        <h2>Resolved marches, PvE clears, and gathered loads</h2>
        <p>The report feed now merges city battles, barbarian camp clashes, and completed gathering returns.</p>
        <div className={styles.commandDeck}>
          <article className={styles.commandCard}>
            <p className={styles.sectionKicker}>Victories</p>
            <strong className={styles.commandValue}>{formatNumber(victoryCount)}</strong>
            <p className={styles.commandHint}>City and camp battles won by your marches.</p>
          </article>
          <article className={styles.commandCard}>
            <p className={styles.sectionKicker}>Defenses held</p>
            <strong className={styles.commandValue}>{formatNumber(defenseCount)}</strong>
            <p className={styles.commandHint}>Engagements where the defender kept control.</p>
          </article>
          <article className={styles.commandCard}>
            <p className={styles.sectionKicker}>Gather returns</p>
            <strong className={styles.commandValue}>{formatNumber(gatherCount)}</strong>
            <p className={styles.commandHint}>{formatNumber(totalLoot)} total resources moved through the ledger.</p>
          </article>
        </div>
      </article>

      {reportsQuery.data.reports.length === 0 ? (
        <div className={styles.feedbackCard}>No reports yet. Launch a march from the world map.</div>
      ) : (
        reportsQuery.data.reports.map((report) => {
          if (report.kind === "CITY_BATTLE") {
            return (
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
            );
          }

          if (report.kind === "BARBARIAN_BATTLE") {
            return (
              <article key={report.id} className={styles.reportCard}>
                <div className={styles.reportHeader}>
                  <div>
                    <p className={report.result === "ATTACKER_WIN" ? styles.reportOutcomeWin : styles.reportOutcomeHold}>
                      {report.result === "ATTACKER_WIN" ? "Camp cleared" : "Camp held"}
                    </p>
                    <h3>
                      {report.attackerCityName} vs {report.poiName}
                    </h3>
                  </div>
                  <span className={styles.levelBadge}>{formatDateTime(report.createdAt)}</span>
                </div>

                <p>
                  {report.attackerName} assaulted a level {report.poiLevel} barbarian camp across {report.location.distance} tiles.
                </p>
                <p>
                  Attack power {formatNumber(report.attackerPower)} versus camp defense {formatNumber(report.defenderPower)}.
                </p>

                <div className={styles.commandDeck}>
                  <article className={styles.commandCard}>
                    <p className={styles.sectionKicker}>Rewards</p>
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
                    <p className={styles.sectionKicker}>Camp losses</p>
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
            );
          }

          return (
            <article key={report.id} className={styles.reportCard}>
              <div className={styles.reportHeader}>
                <div>
                  <p className={styles.reportOutcomeWin}>Gather returned</p>
                  <h3>
                    {report.cityName} {"<-"} {report.poiName}
                  </h3>
                </div>
                <span className={styles.levelBadge}>{formatDateTime(report.createdAt)}</span>
              </div>

                <p>
                  {report.ownerName} returned from the node with {formatNumber(report.amount)}{" "}
                  {poiResourceLabels[report.resourceType].toLowerCase()} after traveling {report.location.distance} tiles.
                </p>

              <div className={styles.commandDeck}>
                <article className={styles.commandCard}>
                  <p className={styles.sectionKicker}>Cargo</p>
                  <div className={styles.costGrid}>
                    <div>
                      <dt>Resource</dt>
                      <dd>{poiResourceLabels[report.resourceType]}</dd>
                    </div>
                    <div>
                      <dt>Amount</dt>
                      <dd>{formatNumber(report.amount)}</dd>
                    </div>
                  </div>
                </article>
                <article className={styles.commandCard}>
                  <p className={styles.sectionKicker}>Troops used</p>
                  <div className={styles.costGrid}>
                    {Object.entries(report.troops).map(([troopType, amount]) => (
                      <div key={troopType}>
                        <dt>{troopType.toLowerCase()}</dt>
                        <dd>{formatNumber(amount)}</dd>
                      </div>
                    ))}
                  </div>
                </article>
              </div>
            </article>
          );
        })
      )}
    </section>
  );
}
