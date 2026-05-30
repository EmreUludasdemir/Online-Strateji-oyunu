import type { ResearchType } from "@frontier/shared";
import { useEffect, useMemo, useState } from "react";

// Returns a human-readable bonus string for each research type at a given level
function getResearchBonusLabel(type: ResearchType, level: number): string {
  if (level <= 0) return "No bonus yet";
  switch (type) {
    case "MILITARY_DRILL":  return `+${level * 5}% attack power (all troops)`;
    case "LOGISTICS":       return `+${level * 8}% march speed`;
    case "AGRONOMY":        return `+${level * 12}% food production`;
    case "STONEWORK":       return `+${level * 12}% stone production, +${level * 5}% structural defense`;
    case "GOLD_TRADE":      return `+${level * 12}% gold production`;
    case "SCOUTING":        return `+${level} vision radius`;
    case "METALLURGY":      return `+${level * 5}% attack power (all troops, stacks with Drill)`;
    case "MEDICINE":        return `+${level * 20}% hospital healing rate`;
    case "CAVALRY_TACTICS": return `+${level * 8}% cavalry attack, +${level * 6}% cavalry march speed`;
    case "CITY_PLANNING":   return `-${level * 10}% building upgrade duration`;
    case "ARCHERY":         return `+${level * 8}% archer attack`;
    default:                return `Level ${level} active`;
  }
}
import { useNavigate } from "react-router-dom";

import { useGameLayoutContext } from "../components/GameLayout";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { EmptyState } from "../components/ui/EmptyState";
import { PageNotice } from "../components/ui/PageNotice";
import { SectionCard } from "../components/ui/SectionCard";
import { TimerChip } from "../components/ui/TimerChip";
import { formatNumber } from "../lib/formatters";
import { useNow } from "../lib/useNow";
import uiStyles from "../components/ui/primitives.module.css";
import styles from "./ResearchPage.module.css";

const RESEARCH_LANES = [
  {
    id: "war",
    label: "Saha Komutası",
    note: "Taarruz, sefer disiplini ve keşif.",
    types: ["MILITARY_DRILL", "LOGISTICS", "SCOUTING"] as ResearchType[],
  },
  {
    id: "prosperity",
    label: "Oba Gelişimi",
    note: "Üretim, taş işçiliği ve altın rezervi.",
    types: ["AGRONOMY", "STONEWORK", "GOLD_TRADE", "CITY_PLANNING"] as ResearchType[],
  },
  {
    id: "arms",
    label: "Silah ve Taktik",
    note: "Birlik eğitimleri ve demir ocağı.",
    types: ["METALLURGY", "CAVALRY_TACTICS", "ARCHERY"] as ResearchType[],
  },
  {
    id: "administration",
    label: "Oba Düzeni",
    note: "Şifa töresi ve yapı inşası.",
    types: ["MEDICINE"] as ResearchType[],
  },
] as const;

const RESEARCH_BRIEFS: Record<
  ResearchType,
  {
    chapter: string;
    effect: string;
    directive: string;
    metricLabel: string;
  }
> = {
  MILITARY_DRILL: {
    chapter: "Savaş töresi",
    effect: "Birliklerin saldırı gücünü artırır.",
    directive: "Taarruz gücü gerektiğinde.",
    metricLabel: "Saldırı Gücü",
  },
  LOGISTICS: {
    chapter: "Sefer rotası",
    effect: "Sefer hızını artırır.",
    directive: "Harita temposu için.",
    metricLabel: "Sefer Hızı",
  },
  AGRONOMY: {
    chapter: "Oba hasadı",
    effect: "Erzak üretimini artırır.",
    directive: "Birlik yetiştirirken.",
    metricLabel: "Erzak Geliri",
  },
  STONEWORK: {
    chapter: "Taş işçiliği",
    effect: "Taş üretimi ve sur savunması.",
    directive: "Gelişim ve savunma için.",
    metricLabel: "Taş Geliri",
  },
  GOLD_TRADE: {
    chapter: "Pazar beratı",
    effect: "Altın gelirini artırır.",
    directive: "Altın ihtiyacı arttığında.",
    metricLabel: "Altın Geliri",
  },
  SCOUTING: {
    chapter: "Gözcü otağı",
    effect: "Görüş alanını genişletir.",
    directive: "Haritayı açmak için.",
    metricLabel: "Görüş Çapı",
  },
  METALLURGY: {
    chapter: "Demir ocağı",
    effect: "Silah kalitesini artırır.",
    directive: "Hasar potansiyeli için.",
    metricLabel: "Saldırı Bonusu",
  },
  MEDICINE: {
    chapter: "Şifa çadırı",
    effect: "Yaralıların iyileşmesini hızlandırır.",
    directive: "Kayıpları telafi etmek için.",
    metricLabel: "İyileşme Hızı",
  },
  CAVALRY_TACTICS: {
    chapter: "Atlı töresi",
    effect: "Atlı birliklerin hızını ve gücünü artırır.",
    directive: "Atlı ağırlıklı seferler.",
    metricLabel: "Atlı Bonusu",
  },
  CITY_PLANNING: {
    chapter: "Oba düzeni",
    effect: "Yapı sürelerini kısaltır.",
    directive: "Şehir gelişimi için.",
    metricLabel: "İnşa Hızı",
  },
  ARCHERY: {
    chapter: "Okçu nizamı",
    effect: "Okçuların hasarını artırır.",
    directive: "Menzilli savunma için.",
    metricLabel: "Okçu Hasarı",
  },
};

function getAffordabilityLabel(available: number, cost: number) {
  return available >= cost ? "Funded" : "Short";
}

export function ResearchPage() {
  const now = useNow();
  const navigate = useNavigate();
  const { state, research, isResearching } = useGameLayoutContext();
  const [selectedResearchType, setSelectedResearchType] = useState<ResearchType | null>(null);

  const academy = state.city.buildings.find((building) => building.type === "ACADEMY") ?? null;
  const suggestedResearch = useMemo(
    () =>
      state.city.research.find((entry) => entry.isActive) ??
      state.city.research.find((entry) => entry.level < entry.maxLevel) ??
      state.city.research[0] ??
      null,
    [state.city.research],
  );

  useEffect(() => {
    if (!selectedResearchType || !state.city.research.some((entry) => entry.type === selectedResearchType)) {
      setSelectedResearchType(suggestedResearch?.type ?? null);
    }
  }, [selectedResearchType, state.city.research, suggestedResearch]);

  const selectedResearch =
    state.city.research.find((entry) => entry.type === selectedResearchType) ?? suggestedResearch ?? null;

  const totalDoctrineLevels = state.city.research.reduce((sum, entry) => sum + entry.level, 0);
  const completedDoctrines = state.city.research.filter((entry) => entry.level >= entry.maxLevel).length;
  const availableDoctrineTiers = state.city.research.reduce((sum, entry) => sum + entry.maxLevel, 0);
  const activeResearchLabel =
    state.city.research.find((entry) => entry.type === state.city.activeResearch?.researchType)?.label ?? "Sessiz";

  if (!selectedResearch) {
    return (
      <section className={styles.page}>
        <PageNotice
          kicker="Töre Araştırması"
          title="Töre arşivi açılamadı"
          body="Bilge ocağı inşa edildiğinde araştırma yolları görünür olur."
          tone="warning"
        />
      </section>
    );
  }

  const brief = RESEARCH_BRIEFS[selectedResearch.type];
  const canStartResearch =
    !selectedResearch.isActive &&
    selectedResearch.level < selectedResearch.maxLevel &&
    !Boolean(state.city.activeResearch) &&
    !isResearching;

  return (
    <section className={styles.page}>
      <header className={styles.commandBar}>
        <div className={styles.commandIdentity}>
          <p className={styles.kicker}>Töre Araştırması</p>
          <h2 className={styles.commandTitle}>{selectedResearch.label}</h2>
          <div className={styles.commandMeta}>
            {state.city.activeResearch ? <TimerChip endsAt={state.city.activeResearch.completesAt} now={now} /> : <Badge tone="info">Bilge ocağı hazır</Badge>}
            <span>{brief.chapter}</span>
            <span>{state.city.activeResearch ? activeResearchLabel : "Kuyruk açık"}</span>
          </div>
        </div>

        <div className={styles.commandStats} aria-label="Töre araştırması özeti">
          <article>
            <span>Bilge Ocağı</span>
            <strong>L{academy?.level ?? 0}</strong>
          </article>
          <article>
            <span>Derinlik</span>
            <strong>{formatNumber(totalDoctrineLevels)}/{formatNumber(availableDoctrineTiers)}</strong>
          </article>
          <article>
            <span>Tamamlanan</span>
            <strong>{formatNumber(completedDoctrines)}</strong>
          </article>
          <article>
            <span>Kademe</span>
            <strong>{selectedResearch.level}/{selectedResearch.maxLevel}</strong>
          </article>
        </div>
      </header>

      <div className={styles.layout}>
        <div className={styles.boardColumn}>
          <SectionCard
            kicker="Töre Atlası"
            title="Töre yolları"
            aside={<Badge tone="warning">4 bölüm</Badge>}
            className={styles.canvasCard}
          >
            <div className={styles.laneStack}>
              {RESEARCH_LANES.map((lane) => (
                <section key={lane.id} className={styles.lane}>
                  <header className={styles.laneHeader}>
                    <div>
                      <p className={styles.laneEyebrow}>{lane.label}</p>
                      <h3 className={styles.laneTitle}>{lane.note}</h3>
                    </div>
                    <Badge tone="info">
                      {formatNumber(
                        lane.types.reduce((sum, type) => {
                          const entry = state.city.research.find((item) => item.type === type);
                          return sum + (entry?.level ?? 0);
                        }, 0),
                      )}{" "}
                      kademe
                    </Badge>
                  </header>

                  <div className={styles.nodeTrack}>
                    {lane.types.map((type) => {
                      const entry = state.city.research.find((item) => item.type === type);
                      if (!entry) {
                        return null;
                      }

                      const progressPercent = Math.round((entry.level / entry.maxLevel) * 100);
                      const isSelected = entry.type === selectedResearch.type;
                      const isCapped = entry.level >= entry.maxLevel;

                      return (
                        <button
                          key={entry.type}
                          type="button"
                          className={[
                            styles.node,
                            isSelected ? styles.nodeActive : "",
                            entry.isActive ? styles.nodeRunning : "",
                            isCapped ? styles.nodeComplete : "",
                          ]
                            .filter(Boolean)
                            .join(" ")}
                          onClick={() => setSelectedResearchType(entry.type)}
                        >
                          <span className={styles.nodeTier}>T{entry.nextLevel}</span>
                          <strong className={styles.nodeTitle}>{entry.label}</strong>
                          <span className={styles.nodeMeta}>
                            Kademe {entry.level}/{entry.maxLevel}
                          </span>
                          <span className={styles.nodeProgress}>
                            <span style={{ width: `${progressPercent}%` }} />
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </section>
              ))}
            </div>
          </SectionCard>
        </div>

        <aside className={styles.detailColumn}>
          <SectionCard
            kicker={brief.chapter}
            title={selectedResearch.label}
            aside={
              selectedResearch.isActive ? (
                <Badge tone="warning">Sürüyor</Badge>
              ) : selectedResearch.level >= selectedResearch.maxLevel ? (
                <Badge tone="success">Tamamlandı</Badge>
              ) : (
                <Badge tone="info">Kademe {selectedResearch.nextLevel}</Badge>
              )
            }
          >
            <div className={styles.detailStack}>
              <p className={styles.detailLead}>{selectedResearch.description}</p>
              <p className={styles.detailMeta}>{brief.directive}</p>

              <div className={styles.metricStrip}>
                <article>
                  <span className={styles.detailLabel}>{brief.metricLabel}</span>
                  <strong className={styles.detailValue}>L{selectedResearch.level}</strong>
                </article>
                <article>
                  <span className={styles.detailLabel}>Sonraki kademe süresi</span>
                  <strong className={styles.detailValue}>{formatNumber(selectedResearch.durationSeconds / 60)}dk</strong>
                </article>
              </div>

              <div className={styles.bonusStrip}>
                <article className={styles.bonusRow}>
                  <span className={styles.detailLabel}>Şu anki bonus</span>
                  <strong className={styles.bonusValue}>
                    {getResearchBonusLabel(selectedResearch.type, selectedResearch.level)}
                  </strong>
                </article>
                {selectedResearch.level < selectedResearch.maxLevel && (
                  <article className={styles.bonusRow}>
                    <span className={styles.detailLabel}>Kademe {selectedResearch.nextLevel}'te</span>
                    <strong className={styles.bonusValueNext}>
                      {getResearchBonusLabel(selectedResearch.type, selectedResearch.nextLevel)}
                    </strong>
                  </article>
                )}
              </div>

              <div className={styles.costList}>
                {Object.entries(selectedResearch.startCost).map(([resource, amount]) => {
                  const available = state.city.resources[resource as keyof typeof state.city.resources];
                  return (
                    <div key={resource} className={styles.costRow}>
                      <div>
                        <strong>{resource}</strong>
                        <p className={styles.detailMeta}>
                          {getAffordabilityLabel(available, amount)} oba ambarından.
                        </p>
                      </div>
                      <span className={available >= amount ? styles.costReady : styles.costShort}>
                        {formatNumber(amount)}
                      </span>
                    </div>
                  );
                })}
              </div>

              <div className={styles.detailActions}>
                <Button
                  type="button"
                  className={canStartResearch ? uiStyles.pulseHighlight : undefined}
                  disabled={!canStartResearch}
                  onClick={() => {
                    void research(selectedResearch.type);
                  }}
                >
                  {selectedResearch.isActive
                    ? "Töre çalışması sürüyor"
                    : selectedResearch.level >= selectedResearch.maxLevel
                      ? "Töre tamamlandı"
                      : state.city.activeResearch
                        ? "Bilge ocağı meşgul"
                        : isResearching
                          ? "Gönderiliyor"
                          : `Kademe ${selectedResearch.nextLevel}'i başlat`}
                </Button>
                <Button type="button" variant="secondary" onClick={() => navigate("/app/dashboard")}>
                  Oba merkezine dön
                </Button>
              </div>
            </div>
          </SectionCard>

          <SectionCard
            kicker="Mevcut Çalışma"
            title={state.city.activeResearch ? activeResearchLabel : "Aktif töre yok"}
            aside={state.city.activeResearch ? <TimerChip endsAt={state.city.activeResearch.completesAt} now={now} /> : null}
          >
            {state.city.activeResearch ? (
              <div className={styles.detailStack}>
                <div className={styles.metricStrip}>
                  <article>
                    <span className={styles.detailLabel}>Hedef kademe</span>
                    <strong className={styles.detailValue}>T{state.city.activeResearch.toLevel}</strong>
                  </article>
                  <article>
                    <span className={styles.detailLabel}>Töre türü</span>
                    <strong className={styles.detailValue}>{activeResearchLabel}</strong>
                  </article>
                </div>
                <p className={styles.detailMeta}>
                  Bilge ocağı meşgul; yeni töre buyruğu mevcut kayıt çözülene dek bekler.
                </p>
              </div>
            ) : (
              <EmptyState
                icon="science"
                title="Arşiv açık"
                body="Sefer hızı, üretim veya keşif baskısını canlı tutmak için bir sonraki töreyi seç."
              />
            )}
          </SectionCard>
        </aside>
      </div>
    </section>
  );
}
