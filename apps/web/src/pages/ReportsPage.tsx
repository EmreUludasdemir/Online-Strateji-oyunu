import { useQuery } from "@tanstack/react-query";
import type { ReportEntryView, TroopStock } from "@frontier/shared";
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

import { api } from "../api";
import { useGameLayoutContext } from "../components/GameLayout";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { SectionHeaderBlock } from "../components/ui/CommandSurface";
import { EmptyState } from "../components/ui/EmptyState";
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
  const { notifications, state } = useGameLayoutContext();
  const [searchParams, setSearchParams] = useSearchParams();
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

  const activeReport = useMemo(
    () => reports.find((report) => report.id === focusedReportId) ?? filteredReports[0] ?? null,
    [filteredReports, focusedReportId, reports],
  );

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
      <section className={styles.reportCommandBar}>
        <div className={styles.reportCommandHead}>
          <div>
            <p className={styles.kicker}>{copy.reports.title}</p>
            <h1 className={styles.railTitle}>War Council</h1>
          </div>
          <Badge tone="info">{formatNumber(reports.length)} entries</Badge>
        </div>
        <div className={styles.reportQuickStats} aria-label="Report summary">
          <article className={styles.summaryCard}>
            <span className={styles.summaryLabel}>Wins</span>
            <strong className={styles.summaryValue}>{formatNumber(summary.victories)}</strong>
          </article>
          <article className={styles.summaryCard}>
            <span className={styles.summaryLabel}>Holds</span>
            <strong className={styles.summaryValue}>{formatNumber(summary.holds)}</strong>
          </article>
          <article className={styles.summaryCard}>
            <span className={styles.summaryLabel}>Returns</span>
            <strong className={styles.summaryValue}>{formatNumber(summary.gatherReturns)}</strong>
          </article>
          <article className={styles.summaryCard}>
            <span className={styles.summaryLabel}>Moved</span>
            <strong className={styles.summaryValue}>{formatNumber(summary.movedTotal)}</strong>
          </article>
        </div>
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
      </section>

      <div className={styles.layout}>
        <aside className={styles.reportRail}>
          <SectionHeaderBlock
            kicker="Divan Rayı"
            title="Akın Defterleri"
            lead={`${formatNumber(filteredReports.length)} açık kayıt`}
            className={styles.railHeader}
          />
          {filteredReports.length === 0 ? (
            <SectionCard kicker="Boş Defter" title="Henüz kayıt yok">
              <EmptyState
                icon="history"
                title="İlk seferi aç"
                body="Filtreleri ayarla veya yeni bir sefer aç; çözümlenen ilk rapor buraya düşecek."
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
            <SectionCard kicker="Divan Masası" title="Detay merkezi" aside={<Badge tone="warning">{notifications.unreadMailboxCount} yeni</Badge>}>
              <EmptyState
                icon="explore"
                title="Kayıt seçilmedi"
                body="Bir kayıt seçerek saldırı verisi, kayıplar ve ganimeti incele."
                action={
                  <Button type="button" variant="secondary" onClick={() => navigate("/app/messages")}>
                    Ulak Odasına Geç
                  </Button>
                }
              />
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
                  <article className={styles.dossierCell}>
                    <span>Saha</span>
                    <strong>{getReportTheater(activeReport)}</strong>
                  </article>
                  <article className={styles.dossierCell}>
                    <span>Sonuç</span>
                    <strong>{getReportResolution(activeReport)}</strong>
                  </article>
                  <article className={styles.dossierCell}>
                    <span>Mesafe</span>
                    <strong>{formatNumber(activeReport.location.distance)} kare</strong>
                  </article>
                </div>
                <div className={styles.detailActions}>
                  <Button type="button" variant="secondary" onClick={() => navigate("/app/map")}>
                    {getReportRouteCopy(activeReport).label}
                  </Button>
                  <Button type="button" variant="ghost" onClick={() => navigate("/app/messages")}>
                    Ulak Odası
                  </Button>
                </div>
              </header>

              <div className={styles.detailGrid}>
                {activeReport.kind === "RESOURCE_GATHER" ? (
                  <SectionCard kicker="Kervan Defteri" title="Toplanan ganimet">
                    <div className={styles.lootGrid}>
                      <article className={styles.statCard}>
                        <span className={styles.statLabel}>Kaynak</span>
                        <strong>{copy.poiResources[activeReport.resourceType]}</strong>
                      </article>
                      <article className={styles.statCard}>
                        <span className={styles.statLabel}>Miktar</span>
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
                  <SectionCard kicker="Kayıp Tutanağı" title="Kayıplar ve güç">
                    <div className={styles.powerSplit}>
                      <div
                        className={styles.powerFill}
                        style={{ width: `${Math.round((activeReport.attackerPower / Math.max(1, activeReport.attackerPower + activeReport.defenderPower)) * 100)}%` }}
                      />
                    </div>
                    <div className={styles.powerLabels}>
                      <span>{formatNumber(activeReport.attackerPower)} saldıran</span>
                      <span>{formatNumber(activeReport.defenderPower)} savunan</span>
                    </div>
                    <div className={styles.lootGrid}>
                      <article className={styles.statCard}>
                        <span className={styles.statLabel}>Saldıran kaybı</span>
                        <strong>{formatNumber(getCasualtyTotal(activeReport.attackerLosses))}</strong>
                      </article>
                      <article className={styles.statCard}>
                        <span className={styles.statLabel}>Savunan kaybı</span>
                        <strong>{formatNumber(getCasualtyTotal(activeReport.defenderLosses))}</strong>
                      </article>
                    </div>
                    <div className={styles.lossGrid}>
                      <dl className={styles.definitionGrid}>
                        {Object.entries(activeReport.attackerLosses).map(([troopType, amount]) => (
                          <div key={troopType}>
                            <dt>Saldıran {troopType.toLowerCase()}</dt>
                            <dd>{formatNumber(amount)}</dd>
                          </div>
                        ))}
                      </dl>
                      <dl className={styles.definitionGrid}>
                        {Object.entries(activeReport.defenderLosses).map(([troopType, amount]) => (
                          <div key={troopType}>
                            <dt>Savunan {troopType.toLowerCase()}</dt>
                            <dd>{formatNumber(amount)}</dd>
                          </div>
                        ))}
                      </dl>
                    </div>
                    {state.city.hospitalHealingCapacity > 0 && getCasualtyTotal(activeReport.attackerLosses) > 0 && (
                      <div className={styles.hospitalNotice}>
                        <span className={styles.hospitalNoticeIcon}>+</span>
                        <div>
                          <strong className={styles.hospitalNoticeTitle}>Şifahane Çalışıyor</strong>
                          <p className={styles.hospitalNoticeBody}>
                            Bu çarpışmadaki yaralı askerler şifahanende iyileşiyor.
                            {" "}Şu an{" "}
                            {formatNumber(
                              Object.values(state.city.woundedTroops).reduce((s, v) => s + v, 0)
                            )}{" "}
                            asker iyileşmede, devir başına{" "}
                            {formatNumber(state.city.hospitalHealingCapacity)} iyileşme kapasitesi.
                          </p>
                        </div>
                      </div>
                    )}
                  </SectionCard>
                )}

                <SectionCard kicker="Akın Payı" title="Edinilen ganimet">
                  {activeReport.kind === "RESOURCE_GATHER" ? (
                    <p className={styles.sideText}>Yağma kayıtları taşınan ganimeti ve görev yapan askerleri özetler. Ödül paketleri Ulak Odası üzerinden erişilir.</p>
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

              </div>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
