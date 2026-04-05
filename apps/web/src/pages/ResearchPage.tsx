import type { ResearchType } from "@frontier/shared";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import { useGameLayoutContext } from "../components/GameLayout";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { EmptyState } from "../components/ui/EmptyState";
import { PageHero, SummaryMetricGrid } from "../components/ui/PageHero";
import { PageNotice } from "../components/ui/PageNotice";
import { SectionCard } from "../components/ui/SectionCard";
import { TimerChip } from "../components/ui/TimerChip";
import { formatNumber } from "../lib/formatters";
import { useNow } from "../lib/useNow";
import styles from "./ResearchPage.module.css";

const RESEARCH_LANES = [
  {
    id: "war",
    label: "Field Command",
    note: "Aggression, routing discipline, and frontier awareness.",
    types: ["MILITARY_DRILL", "LOGISTICS", "SCOUTING"] as ResearchType[],
  },
  {
    id: "prosperity",
    label: "Imperial Works",
    note: "District output, stone pressure, and treasury flow.",
    types: ["AGRONOMY", "STONEWORK", "GOLD_TRADE"] as ResearchType[],
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
    chapter: "War doctrine",
    effect: "Raises offensive pressure across every troop class in the field.",
    directive: "Best when city attack tempo or barbarian clear speed needs to spike.",
    metricLabel: "Attack Pressure",
  },
  LOGISTICS: {
    chapter: "Operational movement",
    effect: "Improves march speed and reduces the drag between objectives.",
    directive: "Best when map rotation, rally timing, and resource gathering must tighten.",
    metricLabel: "March Tempo",
  },
  AGRONOMY: {
    chapter: "Province sustainment",
    effect: "Expands food throughput to support larger queues and longer marches.",
    directive: "Best when troop upkeep or long training cycles are constraining growth.",
    metricLabel: "Food Yield",
  },
  STONEWORK: {
    chapter: "Masonry records",
    effect: "Strengthens quarry output and structural resilience for city defense.",
    directive: "Best when upgrades and defensive readiness are competing for stock.",
    metricLabel: "Stone Yield",
  },
  GOLD_TRADE: {
    chapter: "Market charter",
    effect: "Improves gold inflow for command, upgrades, and long-range planning.",
    directive: "Best when research cadence or elite actions are gold-gated.",
    metricLabel: "Treasury Yield",
  },
  SCOUTING: {
    chapter: "Recon bureau",
    effect: "Expands visible territory and makes the frontier easier to read.",
    directive: "Best when locating camps, routes, and hostile staging is becoming slow.",
    metricLabel: "Vision Radius",
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
    state.city.research.find((entry) => entry.type === state.city.activeResearch?.researchType)?.label ?? "Dormant";

  if (!selectedResearch) {
    return (
      <section className={styles.page}>
        <PageNotice
          kicker="Imperial Research"
          title="Doctrine archive unavailable"
          body="Research lanes appear once the city state exposes academy doctrine progress."
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
  const heroMetrics = [
    {
      id: "academy",
      label: "Academy Tier",
      value: `L${academy?.level ?? 0}`,
      note: "Capacity for deeper doctrine.",
      tone: "info" as const,
    },
    {
      id: "depth",
      label: "Archive Depth",
      value: `${formatNumber(totalDoctrineLevels)}/${formatNumber(availableDoctrineTiers)}`,
      note: "Total doctrine ranks recorded.",
    },
    {
      id: "completed",
      label: "Completed Lanes",
      value: formatNumber(completedDoctrines),
      note: "Doctrines already capped.",
      tone: completedDoctrines > 0 ? ("success" as const) : ("default" as const),
    },
    {
      id: "active",
      label: "Active Project",
      value: activeResearchLabel,
      note: state.city.activeResearch ? `Tier ${state.city.activeResearch.toLevel} in progress.` : "Queue currently open.",
      tone: state.city.activeResearch ? ("warning" as const) : ("info" as const),
    },
  ];

  return (
    <section className={styles.page}>
      <PageHero
        kicker="Imperial Research"
        title="Sovereign archive of doctrine"
        lead="The academy is now framed as a strategic archive instead of a flat checklist. Every lane exposes field leverage, city pressure, and the next tier worth funding."
        aside={
          state.city.activeResearch ? (
            <TimerChip endsAt={state.city.activeResearch.completesAt} now={now} />
          ) : (
            <Badge tone="info">Academy ready</Badge>
          )
        }
      >
        <SummaryMetricGrid items={heroMetrics} />
      </PageHero>

      <div className={styles.layout}>
        <div className={styles.boardColumn}>
          <SectionCard
            kicker="Research atlas"
            title="Doctrine lanes"
            aside={<Badge tone="warning">2 chapters</Badge>}
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
                      ranks
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
                            Level {entry.level}/{entry.maxLevel}
                          </span>
                          <span className={styles.nodeHint}>{RESEARCH_BRIEFS[entry.type].effect}</span>
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

          <SectionCard
            kicker="Empire leverage"
            title="What current doctrine is already doing"
            aside={<Badge tone="success">{formatNumber(state.city.openMarchCount)} marches</Badge>}
          >
            <div className={styles.metricsGrid}>
              <article className={styles.metricCard}>
                <span className={styles.metricLabel}>Attack pressure</span>
                <strong className={styles.metricValue}>{formatNumber(state.city.attackPower)}</strong>
                <span className={styles.metricHint}>Driven by troop stock, commanders, and war doctrine.</span>
              </article>
              <article className={styles.metricCard}>
                <span className={styles.metricLabel}>Defense pressure</span>
                <strong className={styles.metricValue}>{formatNumber(state.city.defensePower)}</strong>
                <span className={styles.metricHint}>Bolstered by masonry and watch discipline.</span>
              </article>
              <article className={styles.metricCard}>
                <span className={styles.metricLabel}>Vision radius</span>
                <strong className={styles.metricValue}>{formatNumber(state.city.visionRadius)}</strong>
                <span className={styles.metricHint}>Scouting expands map readability and target discovery.</span>
              </article>
            </div>
          </SectionCard>
        </div>

        <aside className={styles.detailColumn}>
          <SectionCard
            kicker={brief.chapter}
            title={selectedResearch.label}
            aside={
              selectedResearch.isActive ? (
                <Badge tone="warning">In progress</Badge>
              ) : selectedResearch.level >= selectedResearch.maxLevel ? (
                <Badge tone="success">Complete</Badge>
              ) : (
                <Badge tone="info">Tier {selectedResearch.nextLevel}</Badge>
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
                  <span className={styles.detailLabel}>Upgrade duration</span>
                  <strong className={styles.detailValue}>{formatNumber(selectedResearch.durationSeconds / 60)}m</strong>
                </article>
              </div>

              <div className={styles.costList}>
                {Object.entries(selectedResearch.startCost).map(([resource, amount]) => {
                  const available = state.city.resources[resource as keyof typeof state.city.resources];
                  return (
                    <div key={resource} className={styles.costRow}>
                      <div>
                        <strong>{resource}</strong>
                        <p className={styles.detailMeta}>
                          {getAffordabilityLabel(available, amount)} from current city stock.
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
                  disabled={!canStartResearch}
                  onClick={() => {
                    void research(selectedResearch.type);
                  }}
                >
                  {selectedResearch.isActive
                    ? "Doctrine in progress"
                    : selectedResearch.level >= selectedResearch.maxLevel
                      ? "Doctrine complete"
                      : state.city.activeResearch
                        ? "Academy occupied"
                        : isResearching
                          ? "Submitting"
                          : `Begin tier ${selectedResearch.nextLevel}`}
                </Button>
                <Button type="button" variant="secondary" onClick={() => navigate("/app/dashboard")}>
                  Return to city deck
                </Button>
              </div>
            </div>
          </SectionCard>

          <SectionCard
            kicker="Current operation"
            title={state.city.activeResearch ? activeResearchLabel : "No live study"}
            aside={state.city.activeResearch ? <TimerChip endsAt={state.city.activeResearch.completesAt} now={now} /> : null}
          >
            {state.city.activeResearch ? (
              <div className={styles.detailStack}>
                <div className={styles.metricStrip}>
                  <article>
                    <span className={styles.detailLabel}>Target tier</span>
                    <strong className={styles.detailValue}>T{state.city.activeResearch.toLevel}</strong>
                  </article>
                  <article>
                    <span className={styles.detailLabel}>Research type</span>
                    <strong className={styles.detailValue}>{activeResearchLabel}</strong>
                  </article>
                </div>
                <p className={styles.detailMeta}>
                  The academy is occupied, so additional doctrine orders must wait for the current ledger entry to
                  resolve.
                </p>
              </div>
            ) : (
              <EmptyState
                title="Archive is open"
                body="Choose the next doctrine lane to keep march tempo, production, or scouting pressure moving."
              />
            )}
          </SectionCard>
        </aside>
      </div>
    </section>
  );
}
