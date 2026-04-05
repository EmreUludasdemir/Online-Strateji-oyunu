import { useQuery } from "@tanstack/react-query";
import type { ReportEntryView, TroopStock } from "@frontier/shared";
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

import { api } from "../api";
import { useGameLayoutContext } from "../components/GameLayout";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { PanelStatGrid, SectionHeaderBlock } from "../components/ui/CommandSurface";
import { EmptyState } from "../components/ui/EmptyState";
import { PageHero, SummaryMetricGrid } from "../components/ui/PageHero";
import { PageNotice } from "../components/ui/PageNotice";
import { SectionCard } from "../components/ui/SectionCard";
import { trackAnalyticsOnce } from "../lib/analytics";
import { formatDateTime, formatNumber } from "../lib/formatters";
import { copy } from "../lib/i18n";
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

function getReportRibbon(report: ReportEntryView): string {
  if (report.kind === "RESOURCE_GATHER") {
    return "Caravan Returned";
  }
  if (report.result === "ATTACKER_WIN") {
    return report.kind === "CITY_BATTLE" ? "Major Victory" : "Camp Cleared";
  }
  return report.kind === "CITY_BATTLE" ? "Defense Held" : "Expedition Repelled";
}

function getReportTitle(report: ReportEntryView): string {
  if (report.kind === "CITY_BATTLE") {
    return `Siege of ${report.defenderCityName}`;
  }
  if (report.kind === "BARBARIAN_BATTLE") {
    return `Assault on ${report.poiName}`;
  }
  return `Return from ${report.poiName}`;
}

function getReportSubtitle(report: ReportEntryView): string {
  if (report.kind === "RESOURCE_GATHER") {
    return `${report.cityName} logistics train`;
  }
  return `${report.attackerName} field report`;
}

function getReportTheater(report: ReportEntryView): string {
  if (report.kind === "CITY_BATTLE") {
    return "Border Siege";
  }
  if (report.kind === "BARBARIAN_BATTLE") {
    return "Frontier Sweep";
  }
  return "Supply Corridor";
}

function getReportResolution(report: ReportEntryView): string {
  if (report.kind === "RESOURCE_GATHER") {
    return "Cargo recovered";
  }

  return report.result === "ATTACKER_WIN" ? "Offensive gain" : "Front held";
}

function getReportRouteCopy(report: ReportEntryView): { label: string; note: string } {
  if (report.kind === "RESOURCE_GATHER") {
    return {
      label: "Open Strategic Map",
      note: "Recenter on the source node and queue the next logistics lane.",
    };
  }

  return {
    label: "Open Strategic Map",
    note: "Reposition armies, reinforce the lane, or inspect the engagement zone.",
  };
}

function getCasualtyTotal(losses: TroopStock): number {
  return Object.values(losses).reduce((sum, value) => sum + value, 0);
}

export function ReportsPage() {
  const navigate = useNavigate();
  const { notifications } = useGameLayoutContext();
  const [searchParams, setSearchParams] = useSearchParams();
  const [kindFilter, setKindFilter] = useState<"ALL" | ReportEntryView["kind"]>("ALL");
  const [resultFilter, setResultFilter] = useState<"ALL" | "ATTACKER_WIN" | "DEFENDER_HOLD" | "LOGISTICS">("ALL");
  const [dateFilter, setDateFilter] = useState<"ALL" | "24H" | "7D" | "30D">("ALL");
  const reportsQuery = useQuery({
    queryKey: ["battle-reports"],
    queryFn: api.reports,
  });
  const mailboxQuery = useQuery({
    queryKey: ["mailbox"],
    queryFn: api.mailbox,
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
  const mailboxEntries = mailboxQuery.data?.entries ?? [];
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
        } else if (report.kind === "RESOURCE_GATHER" || report.result !== resultFilter) {
          return false;
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

  const claimableDispatches = mailboxEntries.filter((entry) => entry.canClaim).length;
  const battleDispatches = mailboxEntries.filter(
    (entry) => entry.kind === "BATTLE_REPORT" || entry.kind === "RALLY_REPORT",
  ).length;
  const scoutDispatches = mailboxEntries.filter((entry) => entry.kind === "SCOUT_REPORT").length;
  const heroMetrics = [
    {
      id: "victories",
      label: "Victories",
      value: formatNumber(summary.victories),
      note: "Resolved offensive pushes currently visible in the council stack.",
    },
    {
      id: "holds",
      label: "Defenses Held",
      value: formatNumber(summary.holds),
      note: "Frontline holds and repelled incursions across the current filter set.",
    },
    {
      id: "gather",
      label: "Gather Returns",
      value: formatNumber(summary.gatherReturns),
      note: "Logistics marches that completed their corridor and filed back to court.",
      tone: "info" as const,
    },
    {
      id: "throughput",
      label: "Total Throughput",
      value: formatNumber(summary.movedTotal),
      note: "Combined loot and cargo moved through the current filter stack.",
      tone: "success" as const,
    },
    {
      id: "handoffs",
      label: "Dispatch Handoffs",
      value: formatNumber(notifications.unreadMailboxCount),
      note: "Council items still waiting inside the message center archive.",
      tone: notifications.unreadMailboxCount > 0 ? ("warning" as const) : ("default" as const),
    },
    {
      id: "claimable",
      label: "Claimable Warrants",
      value: formatNumber(claimableDispatches),
      note: "Reward bundles ready to process without leaving the command loop.",
      tone: claimableDispatches > 0 ? ("warning" as const) : ("info" as const),
    },
  ];

  const activeReport = useMemo(
    () => reports.find((report) => report.id === focusedReportId) ?? filteredReports[0] ?? null,
    [filteredReports, focusedReportId, reports],
  );

  const adjacentReports = useMemo(() => {
    if (!activeReport) {
      return filteredReports.slice(0, 3);
    }

    return [
      ...filteredReports.filter((report) => report.id !== activeReport.id && report.kind === activeReport.kind),
      ...filteredReports.filter((report) => report.id !== activeReport.id && report.kind !== activeReport.kind),
    ].slice(0, 3);
  }, [activeReport, filteredReports]);
  const activeDossierStats = activeReport
    ? [
        {
          id: "theater",
          label: "Theater",
          value: getReportTheater(activeReport),
          note: `${formatNumber(activeReport.location.distance)} tiles from launch to resolution.`,
        },
        {
          id: "resolution",
          label: "Resolution",
          value: getReportResolution(activeReport),
          note: `${getReportRibbon(activeReport)} logged by the council ledger.`,
          tone: getReportTone(activeReport),
        },
        {
          id: "bridge",
          label: "Dispatch Bridge",
          value: formatNumber(notifications.unreadMailboxCount),
          note: `${formatNumber(claimableDispatches)} warrants and follow-up dispatches waiting in archive.`,
          tone: notifications.unreadMailboxCount > 0 ? ("warning" as const) : ("info" as const),
        },
      ]
    : [];
  const activeBridgeStats = [
    {
      id: "unread",
      label: "Unread dispatches",
      value: formatNumber(notifications.unreadMailboxCount),
      note: "Current archive backlog",
      tone: notifications.unreadMailboxCount > 0 ? ("warning" as const) : ("info" as const),
    },
    {
      id: "battle",
      label: "Battle dispatches",
      value: formatNumber(battleDispatches),
      note: "Combat records on file",
    },
    {
      id: "scout",
      label: "Scout dispatches",
      value: formatNumber(scoutDispatches),
      note: "Recon packets preserved",
      tone: "info" as const,
    },
  ];

  if (reportsQuery.isPending) {
    return (
      <section className={styles.page}>
        <PageNotice title="Loading reports" body="Battle dossiers, attrition ledgers, and reward relays are still being assembled." />
      </section>
    );
  }

  if (reportsQuery.isError || !reportsQuery.data) {
    return (
      <section className={styles.page}>
        <PageNotice
          title="Unable to load reports"
          body="The War Council could not retrieve the latest dossiers. Retry once the route and server state stabilize."
          tone="danger"
        />
      </section>
    );
  }

  return (
    <section className={styles.page}>
      <PageHero
        kicker={copy.reports.title}
        title="War Council"
        lead="Battle dossiers, resource returns, and attrition ledgers stay in one council rail. Follow-up warrants and scout packets now feed a tighter bridge into the message center."
        aside={<Badge tone="info">{reports.length} entries</Badge>}
      >
        <div className={styles.filterRow}>
          <select aria-label="Filter by category" value={kindFilter} onChange={(event) => setKindFilter(event.target.value as typeof kindFilter)}>
            <option value="ALL">All categories</option>
            <option value="CITY_BATTLE">City battles</option>
            <option value="BARBARIAN_BATTLE">Barbarian battles</option>
            <option value="RESOURCE_GATHER">Gather returns</option>
          </select>
          <select aria-label="Filter by outcome" value={resultFilter} onChange={(event) => setResultFilter(event.target.value as typeof resultFilter)}>
            <option value="ALL">All outcomes</option>
            <option value="ATTACKER_WIN">Attacker win</option>
            <option value="DEFENDER_HOLD">Defender hold</option>
            <option value="LOGISTICS">Logistics only</option>
          </select>
          <select aria-label="Filter by date range" value={dateFilter} onChange={(event) => setDateFilter(event.target.value as typeof dateFilter)}>
            <option value="ALL">All dates</option>
            <option value="24H">Last 24h</option>
            <option value="7D">Last 7d</option>
            <option value="30D">Last 30d</option>
          </select>
        </div>
        <SummaryMetricGrid items={heroMetrics} />
      </PageHero>

      <div className={styles.layout}>
        <aside className={styles.reportRail}>
          <SectionHeaderBlock
            kicker="Council Rail"
            title="Battle Reports"
            lead={`${formatNumber(filteredReports.length)} active logs`}
            className={styles.railHeader}
          />
          {filteredReports.length === 0 ? (
            <SectionCard kicker="Empty Log" title="No entries yet">
              <EmptyState
                title="Launch the first march"
                body="Adjust the filters or launch a new march, then wait for the next resolved report to land here."
              />
            </SectionCard>
          ) : (
            <div className={styles.railList}>
              {filteredReports.map((report) => {
                const isActive = activeReport?.id === report.id;

                return (
                  <button
                    key={report.id}
                    type="button"
                    className={[styles.reportCard, isActive ? styles.reportCardActive : ""].filter(Boolean).join(" ")}
                    onClick={() => setSearchParams({ focus: report.id })}
                  >
                    <div className={styles.reportCardMeta}>
                      <span>{getReportRibbon(report)}</span>
                      <span>{formatDateTime(report.createdAt)}</span>
                    </div>
                    <strong className={styles.reportCardTitle}>{getReportTitle(report)}</strong>
                    <p className={styles.reportCardBody}>{getReportSubtitle(report)}</p>
                    <div className={styles.reportCardSignals}>
                      <span className={styles.reportSignal}>{getReportTheater(report)}</span>
                      <span className={styles.reportSignal}>
                        {report.kind === "RESOURCE_GATHER"
                          ? copy.poiResources[report.resourceType]
                          : `${formatNumber(report.location.distance)} tile push`}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </aside>

        <div className={styles.detailPane}>
          {!activeReport ? (
            <SectionCard kicker="Council Desk" title="Detail center" aside={<Badge tone="warning">{notifications.unreadMailboxCount} new</Badge>}>
              <p className={styles.sideText}>Select a report from the rail to view siege telemetry, attrition, cargo returns, and the bridge into later dispatch handling.</p>
              <Button type="button" variant="secondary" onClick={() => navigate("/app/messages")}>
                Open Message Center
              </Button>
            </SectionCard>
          ) : (
            <>
              <header className={styles.detailHero}>
                <div className={styles.detailMetaRow}>
                  <Badge tone={getReportTone(activeReport)}>{getReportRibbon(activeReport)}</Badge>
                  <span className={styles.detailMetaText}>{formatDateTime(activeReport.createdAt)}</span>
                </div>
                <h2 className={styles.detailTitle}>{getReportTitle(activeReport)}</h2>
                <p className={styles.detailSubtitle}>{getReportSubtitle(activeReport)}</p>
                <div className={styles.dossierStrip}>
                  <PanelStatGrid items={activeDossierStats} columns={3} />
                </div>
              </header>

              <div className={styles.detailGrid}>
                <SectionCard kicker="Engagement Zone" title="Location data">
                  <div className={styles.coordGrid}>
                    <article className={styles.statCard}>
                      <span className={styles.statLabel}>Launch</span>
                      <strong>{activeReport.location.from.x}, {activeReport.location.from.y}</strong>
                    </article>
                    <article className={styles.statCard}>
                      <span className={styles.statLabel}>Target</span>
                      <strong>{activeReport.location.to.x}, {activeReport.location.to.y}</strong>
                    </article>
                    <article className={styles.statCard}>
                      <span className={styles.statLabel}>Distance</span>
                      <strong>{formatNumber(activeReport.location.distance)} tiles</strong>
                    </article>
                  </div>
                </SectionCard>

                <SectionCard kicker="Council Bridge" title="Redeploy and archive">
                  <PanelStatGrid items={activeBridgeStats} columns={3} className={styles.bridgeGrid} />
                  <p className={styles.sideText}>{getReportRouteCopy(activeReport).note}</p>
                  <div className={styles.detailActions}>
                    <Button type="button" variant="secondary" onClick={() => navigate("/app/map")}>
                      {getReportRouteCopy(activeReport).label}
                    </Button>
                    <Button type="button" variant="ghost" onClick={() => navigate("/app/messages")}>
                      Open Message Center
                    </Button>
                  </div>
                </SectionCard>

                {activeReport.kind === "RESOURCE_GATHER" ? (
                  <SectionCard kicker="Cargo Manifest" title="Recovered assets">
                    <div className={styles.lootGrid}>
                      <article className={styles.statCard}>
                        <span className={styles.statLabel}>Resource</span>
                        <strong>{copy.poiResources[activeReport.resourceType]}</strong>
                      </article>
                      <article className={styles.statCard}>
                        <span className={styles.statLabel}>Amount</span>
                        <strong>{formatNumber(activeReport.amount)}</strong>
                      </article>
                    </div>
                    <dl className={styles.definitionGrid}>
                      {Object.entries(activeReport.troops).map(([troopType, amount]) => (
                        <div key={troopType}>
                          <dt>{troopType.toLowerCase()}</dt>
                          <dd>{formatNumber(amount)}</dd>
                        </div>
                      ))}
                    </dl>
                  </SectionCard>
                ) : (
                  <SectionCard kicker="Attrition Report" title="Casualties and power">
                    <div className={styles.powerSplit}>
                      <div
                        className={styles.powerFill}
                        style={{ width: `${Math.round((activeReport.attackerPower / Math.max(1, activeReport.attackerPower + activeReport.defenderPower)) * 100)}%` }}
                      />
                    </div>
                    <div className={styles.powerLabels}>
                      <span>{formatNumber(activeReport.attackerPower)} attacker</span>
                      <span>{formatNumber(activeReport.defenderPower)} defender</span>
                    </div>
                    <div className={styles.lootGrid}>
                      <article className={styles.statCard}>
                        <span className={styles.statLabel}>Attacker losses</span>
                        <strong>{formatNumber(getCasualtyTotal(activeReport.attackerLosses))}</strong>
                      </article>
                      <article className={styles.statCard}>
                        <span className={styles.statLabel}>Defender losses</span>
                        <strong>{formatNumber(getCasualtyTotal(activeReport.defenderLosses))}</strong>
                      </article>
                    </div>
                    <div className={styles.lossGrid}>
                      <dl className={styles.definitionGrid}>
                        {Object.entries(activeReport.attackerLosses).map(([troopType, amount]) => (
                          <div key={troopType}>
                            <dt>Atk {troopType.toLowerCase()}</dt>
                            <dd>{formatNumber(amount)}</dd>
                          </div>
                        ))}
                      </dl>
                      <dl className={styles.definitionGrid}>
                        {Object.entries(activeReport.defenderLosses).map(([troopType, amount]) => (
                          <div key={troopType}>
                            <dt>Def {troopType.toLowerCase()}</dt>
                            <dd>{formatNumber(amount)}</dd>
                          </div>
                        ))}
                      </dl>
                    </div>
                  </SectionCard>
                )}

                <SectionCard kicker="War Spoils" title="Acquired assets">
                  {activeReport.kind === "RESOURCE_GATHER" ? (
                    <p className={styles.sideText}>Gathering logs report delivered cargo and assigned troops. Reward parcels are available through the message center.</p>
                  ) : (
                    <div className={styles.lootGrid}>
                      {Object.entries(activeReport.loot)
                        .filter(([, amount]) => amount > 0)
                        .map(([resource, amount]) => (
                          <article key={resource} className={styles.statCard}>
                            <span className={styles.statLabel}>{resource}</span>
                            <strong>{formatNumber(amount)}</strong>
                          </article>
                        ))}
                      {Object.values(activeReport.loot).every((amount) => amount === 0) ? (
                        <p className={styles.sideText}>No spoils were recovered from this engagement.</p>
                      ) : null}
                    </div>
                  )}
                </SectionCard>

                <SectionCard kicker="Council Chronicle" title="Adjacent dossiers" aside={<Badge tone="info">{adjacentReports.length} linked</Badge>}>
                  {adjacentReports.length === 0 ? (
                    <p className={styles.sideText}>More resolved marches will stack here as the current front evolves.</p>
                  ) : (
                    <div className={styles.timelineList}>
                      {adjacentReports.map((report) => (
                        <button
                          key={report.id}
                          type="button"
                          className={styles.timelineButton}
                          onClick={() => setSearchParams({ focus: report.id })}
                        >
                          <div className={styles.timelineButtonMeta}>
                            <span>{getReportTheater(report)}</span>
                            <span>{formatDateTime(report.createdAt)}</span>
                          </div>
                          <strong>{getReportTitle(report)}</strong>
                          <span>{getReportRibbon(report)}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </SectionCard>

                <SectionCard kicker="Reward Relay" title="Result handling" aside={<Badge tone="warning">{notifications.unreadMailboxCount} inbox</Badge>}>
                  <p className={styles.sideText}>
                    Reward parcels, commander tomes, and any follow-up dispatches continue into the message center for claiming and review.
                  </p>
                  <div className={styles.detailActions}>
                    <Button type="button" variant="secondary" onClick={() => navigate("/app/messages")}>
                      Open Message Center
                    </Button>
                    <Button type="button" variant="ghost" onClick={() => navigate("/app/map")}>
                      Review Strategic Map
                    </Button>
                  </div>
                </SectionCard>
              </div>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
