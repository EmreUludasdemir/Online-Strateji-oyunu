import { useQuery } from "@tanstack/react-query";
import type { PoiResourceType, ReportEntryView } from "@frontier/shared";
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

const poiResourceLabels: Record<PoiResourceType, string> = {
  WOOD: "Odun",
  STONE: "Tas",
  FOOD: "Yemek",
  GOLD: "Altin",
};

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
    return report.result === "ATTACKER_WIN" ? "Sefer basarili" : "Savunma tuttu";
  }

  if (report.kind === "BARBARIAN_BATTLE") {
    return report.result === "ATTACKER_WIN" ? "Kamp temizlendi" : "Kamp dayandi";
  }

  return "Toplama dondu";
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
    return <div className={styles.feedback}>Sefer defteri yukleniyor...</div>;
  }

  if (reportsQuery.isError || !reportsQuery.data) {
    return <div className={styles.feedback}>Sefer defteri yuklenemedi.</div>;
  }

  return (
    <section className={styles.page}>
      <header className={styles.hero}>
        <div className={styles.heroTop}>
          <div>
            <p className={styles.kicker}>{copy.reports.title}</p>
            <h2 className={styles.heroTitle}>Saha ozetleri ve ikmal donusleri</h2>
            <p className={styles.heroLead}>
              Sehir savaslari, barbar kampi carpismalari ve kaynak donusleri ayni defterde toplanir.
              Ayrintili odul akislari ulak kutusundan acilir.
            </p>
          </div>
          <Badge tone="info">{reports.length} kayit</Badge>
        </div>
        <div className={styles.summaryGrid}>
          <article className={styles.summaryCard}>
            <span className={styles.summaryLabel}>Zafer</span>
            <strong className={styles.summaryValue}>{formatNumber(summary.victories)}</strong>
          </article>
          <article className={styles.summaryCard}>
            <span className={styles.summaryLabel}>Tutulan savunma</span>
            <strong className={styles.summaryValue}>{formatNumber(summary.holds)}</strong>
          </article>
          <article className={styles.summaryCard}>
            <span className={styles.summaryLabel}>Toplama donusu</span>
            <strong className={styles.summaryValue}>{formatNumber(summary.gatherReturns)}</strong>
          </article>
          <article className={styles.summaryCard}>
            <span className={styles.summaryLabel}>Toplam nakliye</span>
            <strong className={styles.summaryValue}>{formatNumber(summary.movedTotal)}</strong>
          </article>
        </div>
      </header>

      <div className={styles.layout}>
        <div className={styles.feed}>
          {reports.length === 0 ? (
            <SectionCard kicker="Bos defter" title="Henuz kayit yok">
              <EmptyState
                title="Ilk seferi cikarin"
                body="Haritadan bir hedef secin, march onaylayin ve sonuc kaydinin bu deftere dusmesini bekleyin."
              />
            </SectionCard>
          ) : (
            reports.map((report) => {
              if (report.kind === "CITY_BATTLE") {
                return (
                  <SectionCard
                    key={report.id}
                    kicker="Sehir carpismasi"
                    title={`${report.attackerCityName} -> ${report.defenderCityName}`}
                    aside={<Badge tone={getReportTone(report)}>{getReportHeadline(report)}</Badge>}
                    className={styles.entryCard}
                  >
                    <div className={styles.entryMeta}>
                      <span>{formatDateTime(report.createdAt)}</span>
                      <span>{report.location.distance} kare</span>
                    </div>
                    <p className={styles.entryBody}>
                      {report.attackerName}, {report.defenderName} uzerine {report.location.from.x},
                      {report.location.from.y} noktasindan yurudu. Taarruz gucu {formatNumber(report.attackerPower)},
                      savunma gucu {formatNumber(report.defenderPower)}.
                    </p>
                    <div className={styles.metricGrid}>
                      <article className={styles.metricCard}>
                        <span className={styles.metricLabel}>Ganimet</span>
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
                        <span className={styles.metricLabel}>Taarruz kaybi</span>
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
                        <span className={styles.metricLabel}>Savunma kaybi</span>
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
                    kicker="Barbar baskini"
                    title={`${report.attackerCityName} -> ${report.poiName}`}
                    aside={<Badge tone={getReportTone(report)}>{getReportHeadline(report)}</Badge>}
                    className={styles.entryCard}
                  >
                    <div className={styles.entryMeta}>
                      <span>{formatDateTime(report.createdAt)}</span>
                      <span>Seviye {report.poiLevel}</span>
                    </div>
                    <p className={styles.entryBody}>
                      March, {report.location.distance} kare kat ederek kampa ulasti. Taarruz gucu
                      {" "}{formatNumber(report.attackerPower)}, kamp savunmasi {formatNumber(report.defenderPower)}.
                    </p>
                    <div className={styles.metricGrid}>
                      <article className={styles.metricCard}>
                        <span className={styles.metricLabel}>Oduller</span>
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
                        <span className={styles.metricLabel}>Taarruz kaybi</span>
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
                        <span className={styles.metricLabel}>Kamp kaybi</span>
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
                  kicker="Toplama donusu"
                  title={`${report.cityName} <- ${report.poiName}`}
                  aside={<Badge tone="info">{getReportHeadline(report)}</Badge>}
                  className={styles.entryCard}
                >
                  <div className={styles.entryMeta}>
                    <span>{formatDateTime(report.createdAt)}</span>
                    <span>{report.location.distance} kare</span>
                  </div>
                  <p className={styles.entryBody}>
                    {report.ownerName}, dugumden {formatNumber(report.amount)}
                    {" "}{poiResourceLabels[report.resourceType].toLowerCase()} getirerek sehre geri dondu.
                  </p>
                  <div className={styles.metricGrid}>
                    <article className={styles.metricCard}>
                      <span className={styles.metricLabel}>Kargo</span>
                      <dl className={styles.definitionGrid}>
                        <div>
                          <dt>Kaynak</dt>
                          <dd>{poiResourceLabels[report.resourceType]}</dd>
                        </div>
                        <div>
                          <dt>Miktar</dt>
                          <dd>{formatNumber(report.amount)}</dd>
                        </div>
                      </dl>
                    </article>
                    <article className={styles.metricCard}>
                      <span className={styles.metricLabel}>Kullanilan birlik</span>
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
            kicker="Ulak akis"
            title="Ayrinti merkezi"
            aside={<Badge tone="warning">{notifications.unreadMailboxCount} yeni</Badge>}
          >
            <p className={styles.sideText}>
              Scout raporlari, sistem odulleri ve claim bekleyen kayitlar ulak kutusunda ayrintili tutulur.
            </p>
            <Button type="button" variant="secondary" onClick={openInbox}>
              Ulak kutusunu ac
            </Button>
          </SectionCard>

          <SectionCard kicker="Defter okuma" title="Yorum ipuclari">
            <ul className={styles.tipList}>
              <li>Sehir savaslarinda ganimet ve kayip dagilimini birlikte okuyun.</li>
              <li>Barbar kampi raporlari komutan XP ve PvE tempo takibi icin degerlidir.</li>
              <li>Toplama kayitlari ikmal zincirinin hangi dugum uzerinden verimli aktigini gosterir.</li>
            </ul>
          </SectionCard>
        </aside>
      </div>
    </section>
  );
}
