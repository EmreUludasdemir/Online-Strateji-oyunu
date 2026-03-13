import { useQuery } from "@tanstack/react-query";
import type { ReportEntryView } from "@frontier/shared";
import { useEffect, useMemo } from "react";

import { api } from "../api";
import { useGameLayoutContext } from "../components/GameLayout";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { EmptyState } from "../components/ui/EmptyState";
import { SectionCard } from "../components/ui/SectionCard";
import { trackAnalyticsOnce } from "../lib/analytics";
import { copy } from "../lib/i18n";
import { formatDateTime, formatNumber } from "../lib/formatters";
import styles from "./ReportsPage.module.css";

function getLootVolume(report: ReportEntryView): number {
  if (report.kind === "RESOURCE_GATHER") {
    return report.amount;
  }

  return Object.values(report.loot).reduce((sum, value) => sum + value, 0);
}

function getReportTone(report: ReportEntryView): "success" | "warning" | "info" {
  if (report.kind === "RESOURCE_GATHER") {
    return "info";
  }

  return report.result === "ATTACKER_WIN" ? "success" : "warning";
}

function getReportHeadline(report: ReportEntryView): string {
  if (report.kind === "CITY_BATTLE") {
    return report.result === "ATTACKER_WIN" ? "March Succeeded" : "Defense Held";
  }

  if (report.kind === "BARBARIAN_BATTLE") {
    return report.result === "ATTACKER_WIN" ? "Camp Cleared" : "Camp Held";
  }

  return "Gather Returned";
}

export function ReportsPage() {
  const { openInbox, notifications } = useGameLayoutContext();
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

  const reports = reportsQuery.data?.reports ?? [];
  const summary = useMemo(() => {
    const victories = reports.filter(
      (report) => report.kind !== "RESOURCE_GATHER" && report.result === "ATTACKER_WIN",
    ).length;
    const holds = reports.filter(
      (report) => report.kind !== "RESOURCE_GATHER" && report.result === "DEFENDER_HOLD",
    ).length;
    const gatherReturns = reports.filter((report) => report.kind === "RESOURCE_GATHER").length;
    const movedTotal = reports.reduce((sum, report) => sum + getLootVolume(report), 0);

    return { victories, holds, gatherReturns, movedTotal };
  }, [reports]);

  if (reportsQuery.isPending) {
    return <div className={styles.feedback}>Loading reports...</div>;
  }

  if (reportsQuery.isError || !reportsQuery.data) {
    return <div className={styles.feedback}>Unable to load reports.</div>;
  }

  return (
    <section className={styles.page}>
      <header className={styles.hero}>
        <div className={styles.heroTop}>
          <div>
            <p className={styles.kicker}>{copy.reports.title}</p>
            <h2 className={styles.heroTitle}>Battle outcomes and supply returns</h2>
            <p className={styles.heroLead}>
              City battles, barbarian camp clashes, and gathering returns are merged into one readable field log.
              Deep reward detail stays in the inbox.
            </p>
          </div>
          <Badge tone="info">{reports.length} entries</Badge>
        </div>
        <div className={styles.summaryGrid}>
          <article className={styles.summaryCard}>
            <span className={styles.summaryLabel}>Victories</span>
            <strong className={styles.summaryValue}>{formatNumber(summary.victories)}</strong>
          </article>
          <article className={styles.summaryCard}>
            <span className={styles.summaryLabel}>Defenses Held</span>
            <strong className={styles.summaryValue}>{formatNumber(summary.holds)}</strong>
          </article>
          <article className={styles.summaryCard}>
            <span className={styles.summaryLabel}>Gather Returns</span>
            <strong className={styles.summaryValue}>{formatNumber(summary.gatherReturns)}</strong>
          </article>
          <article className={styles.summaryCard}>
            <span className={styles.summaryLabel}>Total Throughput</span>
            <strong className={styles.summaryValue}>{formatNumber(summary.movedTotal)}</strong>
          </article>
        </div>
      </header>

      <div className={styles.layout}>
        <div className={styles.feed}>
          {reports.length === 0 ? (
            <SectionCard kicker="Empty Log" title="No entries yet">
              <EmptyState
                title="Launch the first march"
                body="Select a target from the map, confirm the march, and wait for the first resolved report to land here."
              />
            </SectionCard>
          ) : (
            reports.map((report) => {
              if (report.kind === "CITY_BATTLE") {
                return (
                  <SectionCard
                    key={report.id}
                    kicker="City Battle"
                    title={`${report.attackerCityName} -> ${report.defenderCityName}`}
                    aside={<Badge tone={getReportTone(report)}>{getReportHeadline(report)}</Badge>}
                    className={styles.entryCard}
                  >
                    <div className={styles.entryMeta}>
                      <span>{formatDateTime(report.createdAt)}</span>
                      <span>{report.location.distance} tiles</span>
                    </div>
                    <p className={styles.entryBody}>
                      {report.attackerName} marched on {report.defenderName} from {report.location.from.x},
                      {report.location.from.y}. Attack power reached {formatNumber(report.attackerPower)} against
                      {formatNumber(report.defenderPower)} defense power.
                    </p>
                    <div className={styles.metricGrid}>
                      <article className={styles.metricCard}>
                        <span className={styles.metricLabel}>Loot</span>
                        <dl className={styles.definitionGrid}>
                          {Object.entries(report.loot).map(([resource, amount]) => (
                            <div key={resource}>
                              <dt>{resource}</dt>
                              <dd>{formatNumber(amount)}</dd>
                            </div>
                          ))}
                        </dl>
                      </article>
                      <article className={styles.metricCard}>
                        <span className={styles.metricLabel}>Attacker Losses</span>
                        <dl className={styles.definitionGrid}>
                          {Object.entries(report.attackerLosses).map(([troopType, amount]) => (
                            <div key={troopType}>
                              <dt>{troopType.toLowerCase()}</dt>
                              <dd>{formatNumber(amount)}</dd>
                            </div>
                          ))}
                        </dl>
                      </article>
                      <article className={styles.metricCard}>
                        <span className={styles.metricLabel}>Defender Losses</span>
                        <dl className={styles.definitionGrid}>
                          {Object.entries(report.defenderLosses).map(([troopType, amount]) => (
                            <div key={troopType}>
                              <dt>{troopType.toLowerCase()}</dt>
                              <dd>{formatNumber(amount)}</dd>
                            </div>
                          ))}
                        </dl>
                      </article>
                    </div>
                  </SectionCard>
                );
              }

              if (report.kind === "BARBARIAN_BATTLE") {
                return (
                  <SectionCard
                    key={report.id}
                    kicker="Barbarian Battle"
                    title={`${report.attackerCityName} -> ${report.poiName}`}
                    aside={<Badge tone={getReportTone(report)}>{getReportHeadline(report)}</Badge>}
                    className={styles.entryCard}
                  >
                    <div className={styles.entryMeta}>
                      <span>{formatDateTime(report.createdAt)}</span>
                      <span>Level {report.poiLevel}</span>
                    </div>
                    <p className={styles.entryBody}>
                      The march covered {report.location.distance} tiles to reach the camp. Attack power peaked at
                      {" "}{formatNumber(report.attackerPower)} against {formatNumber(report.defenderPower)} camp defense.
                    </p>
                    <div className={styles.metricGrid}>
                      <article className={styles.metricCard}>
                        <span className={styles.metricLabel}>Rewards</span>
                        <dl className={styles.definitionGrid}>
                          {Object.entries(report.loot).map(([resource, amount]) => (
                            <div key={resource}>
                              <dt>{resource}</dt>
                              <dd>{formatNumber(amount)}</dd>
                            </div>
                          ))}
                        </dl>
                      </article>
                      <article className={styles.metricCard}>
                        <span className={styles.metricLabel}>Attacker Losses</span>
                        <dl className={styles.definitionGrid}>
                          {Object.entries(report.attackerLosses).map(([troopType, amount]) => (
                            <div key={troopType}>
                              <dt>{troopType.toLowerCase()}</dt>
                              <dd>{formatNumber(amount)}</dd>
                            </div>
                          ))}
                        </dl>
                      </article>
                      <article className={styles.metricCard}>
                        <span className={styles.metricLabel}>Camp Losses</span>
                        <dl className={styles.definitionGrid}>
                          {Object.entries(report.defenderLosses).map(([troopType, amount]) => (
                            <div key={troopType}>
                              <dt>{troopType.toLowerCase()}</dt>
                              <dd>{formatNumber(amount)}</dd>
                            </div>
                          ))}
                        </dl>
                      </article>
                    </div>
                  </SectionCard>
                );
              }

              return (
                <SectionCard
                  key={report.id}
                  kicker="Gather Return"
                  title={`${report.cityName} <- ${report.poiName}`}
                  aside={<Badge tone="info">{getReportHeadline(report)}</Badge>}
                  className={styles.entryCard}
                >
                  <div className={styles.entryMeta}>
                    <span>{formatDateTime(report.createdAt)}</span>
                    <span>{report.location.distance} tiles</span>
                  </div>
                  <p className={styles.entryBody}>
                    {report.ownerName} returned with {formatNumber(report.amount)} {copy.poiResources[report.resourceType].toLowerCase()} from the node.
                  </p>
                  <div className={styles.metricGrid}>
                    <article className={styles.metricCard}>
                      <span className={styles.metricLabel}>Cargo</span>
                      <dl className={styles.definitionGrid}>
                        <div>
                          <dt>Resource</dt>
                          <dd>{copy.poiResources[report.resourceType]}</dd>
                        </div>
                        <div>
                          <dt>Amount</dt>
                          <dd>{formatNumber(report.amount)}</dd>
                        </div>
                      </dl>
                    </article>
                    <article className={styles.metricCard}>
                      <span className={styles.metricLabel}>Assigned Troops</span>
                      <dl className={styles.definitionGrid}>
                        {Object.entries(report.troops).map(([troopType, amount]) => (
                          <div key={troopType}>
                            <dt>{troopType.toLowerCase()}</dt>
                            <dd>{formatNumber(amount)}</dd>
                          </div>
                        ))}
                      </dl>
                    </article>
                  </div>
                </SectionCard>
              );
            })
          )}
        </div>

        <aside className={styles.sideRail}>
          <SectionCard
            kicker="Inbox Flow"
            title="Detail Center"
            aside={<Badge tone="warning">{notifications.unreadMailboxCount} new</Badge>}
          >
            <p className={styles.sideText}>
              Scout reports, system rewards, and claimable entries remain in the inbox so this page stays focused on battle outcomes.
            </p>
            <Button type="button" variant="secondary" onClick={openInbox}>
              Open Inbox
            </Button>
          </SectionCard>

          <SectionCard kicker="Reading Guide" title="How to parse the log">
            <ul className={styles.tipList}>
              <li>Compare loot and loss distribution together when reviewing city battles.</li>
              <li>Barbarian camp entries are useful for commander XP pacing and PvE pressure.</li>
              <li>Gather logs reveal which nodes are keeping the supply chain most efficient.</li>
            </ul>
          </SectionCard>
        </aside>
      </div>
    </section>
  );
}
