import { useQuery } from "@tanstack/react-query";
import type { ReportEntryView } from "@frontier/shared";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";

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
  const [searchParams] = useSearchParams();
  const [kindFilter, setKindFilter] = useState<"ALL" | ReportEntryView["kind"]>("ALL");
  const [resultFilter, setResultFilter] = useState<"ALL" | "ATTACKER_WIN" | "DEFENDER_HOLD" | "LOGISTICS">("ALL");
  const [dateFilter, setDateFilter] = useState<"ALL" | "24H" | "7D" | "30D">("ALL");
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
  const focusedReportId = searchParams.get("focus");
  const filteredReports = useMemo(() => {
    const now = Date.now();

    return reports.filter((report) => {
      if (kindFilter !== "ALL" && report.kind !== kindFilter) {
        return false;
      }

      if (resultFilter !== "ALL") {
        if (resultFilter === "LOGISTICS") {
          if (report.kind !== "RESOURCE_GATHER") {
            return false;
          }
        } else {
          if (report.kind === "RESOURCE_GATHER" || report.result !== resultFilter) {
            return false;
          }
        }
      }

      if (dateFilter !== "ALL") {
        const ageMs = now - new Date(report.createdAt).getTime();
        const maxAgeMs =
          dateFilter === "24H"
            ? 24 * 60 * 60 * 1000
            : dateFilter === "7D"
              ? 7 * 24 * 60 * 60 * 1000
              : 30 * 24 * 60 * 60 * 1000;
        if (ageMs > maxAgeMs) {
          return false;
        }
      }

      return true;
    });
  }, [dateFilter, kindFilter, reports, resultFilter]);

  const summary = useMemo(() => {
    const victories = filteredReports.filter(
      (report) => report.kind !== "RESOURCE_GATHER" && report.result === "ATTACKER_WIN",
    ).length;
    const holds = filteredReports.filter(
      (report) => report.kind !== "RESOURCE_GATHER" && report.result === "DEFENDER_HOLD",
    ).length;
    const gatherReturns = filteredReports.filter((report) => report.kind === "RESOURCE_GATHER").length;
    const movedTotal = filteredReports.reduce((sum, report) => sum + getLootVolume(report), 0);

    return { victories, holds, gatherReturns, movedTotal };
  }, [filteredReports]);

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
        <div className={styles.filterRow}>
          <select value={kindFilter} onChange={(event) => setKindFilter(event.target.value as typeof kindFilter)}>
            <option value="ALL">All categories</option>
            <option value="CITY_BATTLE">City battles</option>
            <option value="BARBARIAN_BATTLE">Barbarian battles</option>
            <option value="RESOURCE_GATHER">Gather returns</option>
          </select>
          <select value={resultFilter} onChange={(event) => setResultFilter(event.target.value as typeof resultFilter)}>
            <option value="ALL">All outcomes</option>
            <option value="ATTACKER_WIN">Attacker win</option>
            <option value="DEFENDER_HOLD">Defender hold</option>
            <option value="LOGISTICS">Logistics only</option>
          </select>
          <select value={dateFilter} onChange={(event) => setDateFilter(event.target.value as typeof dateFilter)}>
            <option value="ALL">All dates</option>
            <option value="24H">Last 24h</option>
            <option value="7D">Last 7d</option>
            <option value="30D">Last 30d</option>
          </select>
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
          {filteredReports.length === 0 ? (
            <SectionCard kicker="Empty Log" title="No entries yet">
              <EmptyState
                title="Launch the first march"
                body="Adjust the filters or launch a new march, then wait for the next resolved report to land here."
              />
            </SectionCard>
          ) : (
            filteredReports.map((report) => {
              const focusedClass = focusedReportId === report.id ? styles.focusedEntry : undefined;
              if (report.kind === "CITY_BATTLE") {
                return (
                  <SectionCard
                    key={report.id}
                    kicker="City Battle"
                    title={`${report.attackerCityName} -> ${report.defenderCityName}`}
                    aside={<Badge tone={getReportTone(report)}>{getReportHeadline(report)}</Badge>}
                    className={[styles.entryCard, focusedClass].filter(Boolean).join(" ")}
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
                    className={[styles.entryCard, focusedClass].filter(Boolean).join(" ")}
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
                  className={[styles.entryCard, focusedClass].filter(Boolean).join(" ")}
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
