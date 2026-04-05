import type { LiveEventKey, LeaderboardEntryView, RewardBundleView } from "@frontier/shared";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import { api } from "../api";
import { useGameLayoutContext } from "../components/GameLayout";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { EmptyState } from "../components/ui/EmptyState";
import { PageHero, SummaryMetricGrid } from "../components/ui/PageHero";
import { SectionCard } from "../components/ui/SectionCard";
import { formatNumber } from "../lib/formatters";
import styles from "./LeaderboardPage.module.css";

const DEFAULT_EVENT_TABS: Array<{
  id: LiveEventKey | "alliance_contribution";
  label: string;
  eyebrow: string;
  description: string;
}> = [
  {
    id: "POWER_SPRINT",
    label: "Power Sprint",
    eyebrow: "War census",
    description: "Ranks raw growth pressure and total power acceleration across active rulers.",
  },
  {
    id: "BARBARIAN_HUNT",
    label: "Barbarian Hunt",
    eyebrow: "Field purge",
    description: "Tracks camp clears and the commanders driving frontier suppression.",
  },
  {
    id: "GATHERING_RUSH",
    label: "Gathering Rush",
    eyebrow: "Supply race",
    description: "Measures who is pulling the most value out of frontier nodes and caravans.",
  },
  {
    id: "alliance_contribution",
    label: "Alliance Contribution",
    eyebrow: "Banner ledger",
    description: "Keeps alliance help, donations, and banner service visible to every member.",
  },
] as const;

function summarizeReward(bundle: RewardBundleView | null | undefined): string[] {
  if (!bundle) {
    return [];
  }

  const lines: string[] = [];
  const resourceLine = Object.entries(bundle.resources)
    .filter(([, amount]) => Number(amount ?? 0) > 0)
    .map(([resource, amount]) => `${resource}: ${formatNumber(Number(amount ?? 0))}`)
    .join(" | ");

  if (resourceLine) {
    lines.push(resourceLine);
  }
  if (bundle.items.length > 0) {
    lines.push(bundle.items.map((item) => `${item.itemKey} x${item.quantity}`).join(" | "));
  }
  if (bundle.commanderXp > 0) {
    lines.push(`Commander XP: ${formatNumber(bundle.commanderXp)}`);
  }
  if (bundle.seasonPassXp > 0) {
    lines.push(`Season XP: ${formatNumber(bundle.seasonPassXp)}`);
  }
  return lines;
}

function getPodiumLabel(rank: number) {
  if (rank === 1) {
    return "Crown seat";
  }
  if (rank === 2) {
    return "War seat";
  }
  return "Archive seat";
}

export function LeaderboardPage() {
  const navigate = useNavigate();
  const { state } = useGameLayoutContext();
  const eventsQuery = useQuery({ queryKey: ["events"], queryFn: api.events });
  const [selectedBoardId, setSelectedBoardId] = useState<(typeof DEFAULT_EVENT_TABS)[number]["id"]>("POWER_SPRINT");

  const tabs = useMemo(() => {
    const liveEventMap = new Map((eventsQuery.data?.events ?? []).map((event) => [event.eventKey, event]));

    return DEFAULT_EVENT_TABS.map((tab) => {
      if (tab.id === "alliance_contribution") {
        return {
          ...tab,
          rewardLines: state.alliance
            ? [`Alliance banner: [${state.alliance.tag}] ${state.alliance.name}`]
            : ["Join an alliance to push the banner ledger."],
          target: null,
          currentScore: null,
        };
      }

      const liveEvent = liveEventMap.get(tab.id);
      return {
        ...tab,
        label: liveEvent?.label ?? tab.label,
        description: liveEvent?.description ?? tab.description,
        rewardLines: summarizeReward(liveEvent?.reward),
        target: liveEvent?.target ?? null,
        currentScore: liveEvent?.score ?? null,
      };
    });
  }, [eventsQuery.data?.events, state.alliance]);

  useEffect(() => {
    if (!tabs.some((tab) => tab.id === selectedBoardId)) {
      setSelectedBoardId(tabs[0]?.id ?? "POWER_SPRINT");
    }
  }, [selectedBoardId, tabs]);

  const selectedTab = tabs.find((tab) => tab.id === selectedBoardId) ?? tabs[0] ?? null;

  const leaderboardQuery = useQuery({
    queryKey: ["leaderboard", selectedBoardId],
    queryFn: () => api.leaderboard(selectedBoardId),
    enabled: Boolean(selectedTab),
    refetchInterval: 10_000,
  });

  const entries = leaderboardQuery.data?.entries ?? [];
  const podium = [entries[1], entries[0], entries[2]].filter(Boolean) as LeaderboardEntryView[];
  const tableEntries = entries.slice(3);
  const currentPlayerEntry = entries.find((entry) => entry.userId === state.player.id) ?? null;
  const heroMetrics = [
    {
      id: "board",
      label: "Board",
      value: selectedTab?.label ?? "Unavailable",
      note: "Current ranking surface.",
      tone: "info" as const,
    },
    {
      id: "top",
      label: "Top score",
      value: formatNumber(entries[0]?.value ?? 0),
      note: "Highest mark on the active board.",
      tone: entries.length > 0 ? ("success" as const) : ("default" as const),
    },
    {
      id: "rank",
      label: "Your rank",
      value: currentPlayerEntry ? `#${currentPlayerEntry.rank}` : "Unranked",
      note: "Pulled from the live leaderboard response.",
      tone: currentPlayerEntry ? ("warning" as const) : ("default" as const),
    },
    {
      id: "competitors",
      label: "Competitors",
      value: formatNumber(entries.length),
      note: "Visible entries on this board.",
    },
  ];

  return (
    <section className={styles.page}>
      <PageHero
        kicker="Imperial Leaderboards"
        title="Sovereign ranking ledger"
        lead="Live boards now read like a premium imperial record: top seats, event tabs, and a clear personal standing layer instead of a flat score list."
        aside={<Badge tone="warning">{selectedTab?.eyebrow ?? "Ranking board"}</Badge>}
      >
        <SummaryMetricGrid items={heroMetrics} />
      </PageHero>

      <div className={styles.layout}>
        <div className={styles.mainColumn}>
          <SectionCard kicker="Board selector" title="Event and banner standings">
            <div className={styles.tabRow}>
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  className={[styles.tabButton, tab.id === selectedBoardId ? styles.tabButtonActive : ""]
                    .filter(Boolean)
                    .join(" ")}
                  onClick={() => setSelectedBoardId(tab.id)}
                >
                  <span className={styles.tabEyebrow}>{tab.eyebrow}</span>
                  <strong>{tab.label}</strong>
                </button>
              ))}
            </div>
          </SectionCard>

          <SectionCard
            kicker="Sovereign podium"
            title={selectedTab?.label ?? "Leaderboard"}
            aside={selectedTab?.currentScore != null ? <Badge tone="success">{formatNumber(selectedTab.currentScore)} progress</Badge> : null}
          >
            {leaderboardQuery.isPending ? (
              <p className={styles.feedback}>Loading ranking ledger...</p>
            ) : leaderboardQuery.isError ? (
              <p className={styles.feedback}>Leaderboard data could not be loaded.</p>
            ) : entries.length === 0 ? (
              <EmptyState
                title="No rankings yet"
                body="This board has not accumulated enough score pressure to render standings."
              />
            ) : (
              <>
                <div className={styles.podiumGrid}>
                  {podium.map((entry) => (
                    <article
                      key={entry.userId}
                      className={[
                        styles.podiumCard,
                        entry.rank === 1 ? styles.podiumFirst : entry.rank === 2 ? styles.podiumSecond : styles.podiumThird,
                      ].join(" ")}
                    >
                      <span className={styles.podiumLabel}>{getPodiumLabel(entry.rank)}</span>
                      <strong className={styles.podiumName}>#{entry.rank} {entry.username}</strong>
                      <span className={styles.podiumScore}>{formatNumber(entry.value)}</span>
                      <span className={styles.podiumMeta}>{entry.secondaryLabel ?? "Imperial score registered."}</span>
                    </article>
                  ))}
                </div>

                <div className={styles.table}>
                  {tableEntries.map((entry) => (
                    <article
                      key={entry.userId}
                      className={[styles.rankRow, entry.userId === state.player.id ? styles.rankRowActive : ""]
                        .filter(Boolean)
                        .join(" ")}
                    >
                      <div className={styles.rankIdentity}>
                        <span className={styles.rankNumber}>#{entry.rank}</span>
                        <div>
                          <strong>{entry.username}</strong>
                          <p className={styles.rankMeta}>{entry.secondaryLabel ?? "Imperial score recorded."}</p>
                        </div>
                      </div>
                      <strong className={styles.rankValue}>{formatNumber(entry.value)}</strong>
                    </article>
                  ))}
                </div>
              </>
            )}
          </SectionCard>
        </div>

        <aside className={styles.sideColumn}>
          <SectionCard
            kicker={selectedTab?.eyebrow ?? "Board brief"}
            title={selectedTab?.label ?? "Ranking board"}
            aside={selectedTab?.target != null ? <Badge tone="info">Target {formatNumber(selectedTab.target)}</Badge> : null}
          >
            <div className={styles.sideStack}>
              <p className={styles.sideLead}>{selectedTab?.description}</p>
              {selectedTab?.rewardLines.length ? (
                <div className={styles.rewardList}>
                  {selectedTab.rewardLines.map((line) => (
                    <div key={line} className={styles.rewardRow}>
                      <span>{line}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className={styles.sideMeta}>Reward manifest appears when the live event payload exposes it.</p>
              )}
              <div className={styles.sideActions}>
                <Button type="button" variant="secondary" onClick={() => navigate("/app/dashboard")}>
                  Open city deck
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => navigate(selectedBoardId === "alliance_contribution" ? "/app/alliance" : "/app/reports")}
                >
                  Open related room
                </Button>
              </div>
            </div>
          </SectionCard>

          <SectionCard
            kicker="Personal standing"
            title={currentPlayerEntry ? `${state.player.username} is ranked` : "No personal entry yet"}
            aside={currentPlayerEntry ? <Badge tone="warning">#{currentPlayerEntry.rank}</Badge> : null}
          >
            {currentPlayerEntry ? (
              <div className={styles.sideStack}>
                <div className={styles.personalMetric}>
                  <span className={styles.summaryLabel}>Registered score</span>
                  <strong className={styles.personalScore}>{formatNumber(currentPlayerEntry.value)}</strong>
                </div>
                <p className={styles.sideMeta}>
                  {currentPlayerEntry.secondaryLabel ?? "Continue pushing this event or banner board to climb the ledger."}
                </p>
              </div>
            ) : (
              <EmptyState
                title="No current placement"
                body="This ruler has not entered the visible range of the active board yet."
              />
            )}
          </SectionCard>
        </aside>
      </div>
    </section>
  );
}
