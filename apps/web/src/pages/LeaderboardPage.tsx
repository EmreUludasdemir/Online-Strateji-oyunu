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
    label: "Kudret Yarışı",
    eyebrow: "Güç sayımı",
    description: "Diyardaki beylerin toplam güç artışını ölçer.",
  },
  {
    id: "BARBARIAN_HUNT",
    label: "Av Seferi",
    eyebrow: "Saha temizliği",
    description: "Yok edilen isyancı kamplarını ve sınır güvenliğini ölçer.",
  },
  {
    id: "GATHERING_RUSH",
    label: "Hasat Şenliği",
    eyebrow: "Erzak yarışı",
    description: "Sınır kaynaklarından en çok erzak toplayanları sıralar.",
  },
  {
    id: "alliance_contribution",
    label: "Sancak Hizmeti",
    eyebrow: "Otağ bağışı",
    description: "Beylerin sancağa yaptığı bağış ve yardımları sıralar.",
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
    return "Kağanlık Makamı";
  }
  if (rank === 2) {
    return "Başbuğ Makamı";
  }
  return "Bey Makamı";
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
            ? [`Sancak: [${state.alliance.tag}] ${state.alliance.name}`]
            : ["Bu listeye girmek için bir sancağa katıl."],
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
      label: "Sıralama",
      value: selectedTab?.label ?? "Mevcut Değil",
      note: "Mevcut pano.",
      tone: "info" as const,
    },
    {
      id: "top",
      label: "En Yüksek Skor",
      value: formatNumber(entries[0]?.value ?? 0),
      note: "Panodaki en iyi derece.",
      tone: entries.length > 0 ? ("success" as const) : ("default" as const),
    },
    {
      id: "rank",
      label: "Sıranız",
      value: currentPlayerEntry ? `#${currentPlayerEntry.rank}` : "Sıralama Dışı",
      note: "Mevcut panodaki yeriniz.",
      tone: currentPlayerEntry ? ("warning" as const) : ("default" as const),
    },
    {
      id: "competitors",
      label: "Beyler",
      value: formatNumber(entries.length),
      note: "Sıralamaya giren oyuncular.",
    },
  ];

  return (
    <section className={styles.page}>
      <PageHero
        kicker="Diyar Sıralaması"
        title="Sancak beyi sıralaması"
        lead="Diyardaki beylerin kudret ve itibar sıralaması."
        aside={<Badge tone="warning">{selectedTab?.eyebrow ?? "Sıralama panosu"}</Badge>}
      >
        <SummaryMetricGrid items={heroMetrics} />
      </PageHero>

      <div className={styles.layout}>
        <div className={styles.mainColumn}>
          <SectionCard kicker="Pano Seçimi" title="Sefer ve Sancak Sıralamaları">
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
            kicker="İlk Üç Bey"
            title={selectedTab?.label ?? "Sıralama"}
            aside={selectedTab?.currentScore != null ? <Badge tone="success">{formatNumber(selectedTab.currentScore)} puan</Badge> : null}
          >
            {leaderboardQuery.isPending ? (
              <p className={styles.feedback}>Sıralamalar yükleniyor...</p>
            ) : leaderboardQuery.isError ? (
              <p className={styles.feedback}>Sıralama verisi alınamadı.</p>
            ) : entries.length === 0 ? (
              <EmptyState
                icon="emoji_events"
                title="Sıralama boş"
                body="Henüz yeterli kudret puanı toplanmadı."
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
                      <span className={styles.podiumMeta}>{entry.secondaryLabel ?? "Kudret puanı işlendi."}</span>
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
                          <p className={styles.rankMeta}>{entry.secondaryLabel ?? "Kudret puanı işlendi."}</p>
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
            kicker={selectedTab?.eyebrow ?? "Sıralama Özeti"}
            title={selectedTab?.label ?? "Sıralama Panosu"}
            aside={selectedTab?.target != null ? <Badge tone="info">Hedef {formatNumber(selectedTab.target)}</Badge> : null}
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
                <p className={styles.sideMeta}>Ödüller bu panoda açıldığında burada görünür.</p>
              )}
              <div className={styles.sideActions}>
                <Button type="button" variant="secondary" onClick={() => navigate("/app/dashboard")}>
                  Obaya dön
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => navigate(selectedBoardId === "alliance_contribution" ? "/app/alliance" : "/app/reports")}
                >
                  İlgili otağa git
                </Button>
              </div>
            </div>
          </SectionCard>

          <SectionCard
            kicker="Kişisel Durum"
            title={currentPlayerEntry ? `${state.player.username} listeye girdi` : "Sıralama dışı"}
            aside={currentPlayerEntry ? <Badge tone="warning">#{currentPlayerEntry.rank}</Badge> : null}
          >
            {currentPlayerEntry ? (() => {
              const topScore = entries[0]?.value ?? 1;
              const gapToLeader = topScore - currentPlayerEntry.value;
              const rankAbove = entries.find((entry) => entry.rank === currentPlayerEntry.rank - 1);
              const gapToNext = rankAbove ? rankAbove.value - currentPlayerEntry.value : 0;
              const rankPct = Math.max(0, Math.min(100, (currentPlayerEntry.value / Math.max(1, topScore)) * 100));
              return (
                <div className={styles.sideStack}>
                  <div className={styles.personalMetric}>
                    <span className={styles.summaryLabel}>Kayıtlı skor</span>
                    <strong className={styles.personalScore}>{formatNumber(currentPlayerEntry.value)}</strong>
                    <meter className={styles.rankMeter} value={currentPlayerEntry.value} min={0} max={Math.max(1, topScore)} />
                    <span className={styles.rankRailLabel}>Birincinin %{rankPct.toFixed(1)}'i</span>
                  </div>
                  {gapToLeader > 0 && (
                    <div className={styles.gapRow}>
                      <div className={styles.gapCell}>
                         <span className={styles.summaryLabel}>Lidere uzaklık</span>
                        <strong className={styles.gapValue}>{formatNumber(gapToLeader)}</strong>
                      </div>
                      {gapToNext > 0 && (
                        <div className={styles.gapCell}>
                          <span className={styles.summaryLabel}>Sıra {currentPlayerEntry.rank - 1} ile fark</span>
                          <strong className={styles.gapValueNext}>{formatNumber(gapToNext)}</strong>
                        </div>
                      )}
                    </div>
                  )}
                  <p className={styles.sideMeta}>
                    {currentPlayerEntry.secondaryLabel ?? "Üst sıralara tırmanmak için seferlere katılmaya devam et."}
                  </p>
                </div>
              );
            })() : (
              <EmptyState
                icon="emoji_events"
                title="Derece yok"
                body="Bey bu sıralamada henüz yer edinemedi."
              />
            )}
          </SectionCard>
        </aside>
      </div>
    </section>
  );
}
