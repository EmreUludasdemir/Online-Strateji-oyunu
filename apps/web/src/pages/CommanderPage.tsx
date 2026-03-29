import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CommanderProgressView } from "@frontier/shared";
import { useMemo, useState } from "react";

import { api } from "../api";
import { CommanderSkillTree } from "../components/commanders/CommanderSkillTree";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { EmptyState } from "../components/ui/EmptyState";
import { SectionCard } from "../components/ui/SectionCard";
import { useGameLayoutContext } from "../components/GameLayout";
import { formatNumber } from "../lib/formatters";
import styles from "./CommanderPage.module.css";

function getProgressPct(commander: CommanderProgressView) {
  const total = Math.max(1, commander.xp + commander.xpToNextLevel);
  return Math.max(0, Math.min(100, (commander.xp / total) * 100));
}

function getCommanderMonogram(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

export function CommanderPage() {
  const queryClient = useQueryClient();
  const { state } = useGameLayoutContext();
  const commandersQuery = useQuery({
    queryKey: ["commanders"],
    queryFn: api.commanders,
  });
  const [selectedCommanderId, setSelectedCommanderId] = useState<string | null>(null);

  const upgradeMutation = useMutation({
    mutationFn: (commanderId: string) => api.upgradeCommander(commanderId),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["commanders"] }),
        queryClient.invalidateQueries({ queryKey: ["game-state"] }),
      ]);
    },
  });

  const commanders = commandersQuery.data?.commanders ?? [];
  const selectedCommander =
    commanders.find((entry) => entry.id === selectedCommanderId) ??
    commanders.find((entry) => entry.isPrimary) ??
    commanders[0] ??
    null;

  const rosterStats = useMemo(() => {
    return commanders.reduce(
      (accumulator, commander) => ({
        totalLevels: accumulator.totalLevels + commander.level,
        totalPower: accumulator.totalPower + commander.totalPowerScore,
      }),
      { totalLevels: 0, totalPower: 0 },
    );
  }, [commanders]);

  if (commandersQuery.isPending) {
    return <div className={styles.feedback}>Loading commander progression...</div>;
  }

  if (commandersQuery.isError) {
    return <div className={styles.feedback}>Commander progression could not be loaded.</div>;
  }

  if (!selectedCommander) {
    return (
      <section className={styles.page}>
        <SectionCard kicker="Command Staff" title="No commanders available">
          <EmptyState title="Commander roster empty" body="Unlock or seed commanders before opening the progression chamber." />
        </SectionCard>
      </section>
    );
  }

  const commanderMonogram = getCommanderMonogram(selectedCommander.name);
  const bonusCards = [
    { label: "Attack Doctrine", value: `+${selectedCommander.attackBonusPct}%`, note: "frontline pressure" },
    { label: "Defense Posture", value: `+${selectedCommander.defenseBonusPct}%`, note: "wall discipline" },
    { label: "March Tempo", value: `+${selectedCommander.marchSpeedBonusPct}%`, note: "field movement" },
    { label: "Carry Capacity", value: `+${selectedCommander.carryBonusPct}%`, note: "supply lift" },
  ];
  const serviceRows = [
    { label: "Doctrine Track", value: selectedCommander.skillTree.trackLabel },
    { label: "Preset", value: selectedCommander.assignedPreset ?? "Unassigned" },
    { label: "Talent Reserve", value: `${selectedCommander.talentPointsAvailable} ready` },
    { label: "Command Status", value: selectedCommander.isPrimary ? "Primary banner" : "Reserve wing" },
  ];
  const attributeCards = [
    { label: "Attack", value: selectedCommander.attackBonusPct },
    { label: "Defense", value: selectedCommander.defenseBonusPct },
    { label: "Speed", value: selectedCommander.marchSpeedBonusPct },
    { label: "Carry", value: selectedCommander.carryBonusPct },
  ];

  return (
    <section className={styles.page}>
      <header className={styles.hero}>
        <div className={styles.heroLeadBlock}>
          <p className={styles.kicker}>Commander Profile</p>
          <h2 className={styles.heroTitle}>{selectedCommander.name}</h2>
          <div className={styles.heroMeta}>
            <Badge tone={selectedCommander.isPrimary ? "success" : "info"}>
              {selectedCommander.isPrimary ? "Primary banner" : "Reserve wing"}
            </Badge>
            <span className={styles.heroMetaItem}>{selectedCommander.skillTree.trackLabel}</span>
            <span className={styles.heroMetaItem}>{selectedCommander.starLevel} stars</span>
          </div>
          <p className={styles.heroLead}>
            A cinematic command sheet for doctrine, readiness, and field tempo. Promotion, preset planning, and talent review stay readable in one place.
          </p>
        </div>
        <div className={styles.summaryGrid}>
          <article className={styles.summaryCard}>
            <span className={styles.summaryLabel}>Roster Power</span>
            <strong className={styles.summaryValue}>{formatNumber(rosterStats.totalPower)}</strong>
            <span className={styles.summaryHint}>{formatNumber(commanders.length)} sworn officers</span>
          </article>
          <article className={styles.summaryCard}>
            <span className={styles.summaryLabel}>Roster Levels</span>
            <strong className={styles.summaryValue}>{formatNumber(rosterStats.totalLevels)}</strong>
            <span className={styles.summaryHint}>campaign experience</span>
          </article>
          <article className={styles.summaryCard}>
            <span className={styles.summaryLabel}>Doctrine Reserve</span>
            <strong className={styles.summaryValue}>{selectedCommander.talentPointsAvailable}</strong>
            <span className={styles.summaryHint}>points ready to place</span>
          </article>
          <article className={styles.summaryCard}>
            <span className={styles.summaryLabel}>City Gold</span>
            <strong className={styles.summaryValue}>{formatNumber(state.city.resources.gold)}</strong>
            <span className={styles.summaryHint}>promotion treasury</span>
          </article>
        </div>
      </header>

      <div className={styles.layout}>
        <aside className={styles.rosterColumn}>
          <SectionCard kicker="Command Ledger" title="Available commanders" aside={<Badge tone="info">{commanders.length} total</Badge>}>
            <div className={styles.rosterList}>
              {commanders.map((commander) => (
                <button
                  key={commander.id}
                  type="button"
                  className={[styles.rosterCard, commander.id === selectedCommander.id ? styles.rosterCardActive : ""]
                    .filter(Boolean)
                    .join(" ")}
                  onClick={() => setSelectedCommanderId(commander.id)}
                >
                  <div className={styles.rosterHeader}>
                    <strong>{commander.name}</strong>
                    <Badge tone={commander.isPrimary ? "success" : "info"}>{commander.isPrimary ? "Primary" : "Reserve"}</Badge>
                  </div>
                  <p className={styles.rosterMeta}>
                    L{commander.level} | {commander.skillTree.trackLabel} | {commander.starLevel} stars
                  </p>
                  <div className={styles.progressRail}>
                    <span style={{ width: `${getProgressPct(commander)}%` }} />
                  </div>
                  <span className={styles.rosterNote}>{formatNumber(commander.totalPowerScore)} power</span>
                </button>
              ))}
            </div>
          </SectionCard>
        </aside>

        <div className={styles.mainColumn}>
          <section className={styles.commanderStage}>
            <article className={styles.portraitCard}>
              <div className={styles.portraitInset}>
                <span className={styles.portraitKicker}>Service Banner</span>
                <span className={styles.portraitMonogram}>{commanderMonogram}</span>
                <strong className={styles.portraitName}>{selectedCommander.skillTree.trackLabel}</strong>
                <span className={styles.portraitMeta}>Level {selectedCommander.level} commander | {selectedCommander.starLevel} stars</span>
              </div>
              <div className={styles.portraitFooter}>
                <div className={styles.portraitRow}>
                  <span>Experience progress</span>
                  <strong>
                    {formatNumber(selectedCommander.xp)} / {formatNumber(selectedCommander.xp + selectedCommander.xpToNextLevel)} XP
                  </strong>
                </div>
                <div className={styles.progressRail}>
                  <span style={{ width: `${getProgressPct(selectedCommander)}%` }} />
                </div>
              </div>
            </article>

            <div className={styles.stageStack}>
              <article className={styles.stageCard}>
                <span className={styles.cardEyebrow}>War Cabinet</span>
                <div className={styles.loadoutList}>
                  {bonusCards.map((card) => (
                    <div key={card.label} className={styles.loadoutRow}>
                      <div>
                        <span className={styles.loadoutLabel}>{card.label}</span>
                        <p className={styles.loadoutNote}>{card.note}</p>
                      </div>
                      <strong className={styles.loadoutValue}>{card.value}</strong>
                    </div>
                  ))}
                </div>
              </article>

              <article className={styles.stageCard}>
                <div className={styles.stageHeader}>
                  <span className={styles.cardEyebrow}>Service Record</span>
                  <Badge tone="warning">{selectedCommander.starLevel} stars</Badge>
                </div>
                <dl className={styles.serviceGrid}>
                  {serviceRows.map((row) => (
                    <div key={row.label} className={styles.serviceRow}>
                      <dt>{row.label}</dt>
                      <dd>{row.value}</dd>
                    </div>
                  ))}
                </dl>
              </article>
            </div>
          </section>

          <section className={styles.attributeGrid}>
            {attributeCards.map((card) => (
              <article key={card.label} className={styles.attributeCard}>
                <div className={styles.attributeHead}>
                  <span className={styles.attributeLabel}>{card.label}</span>
                  <strong className={styles.attributeValue}>+{card.value}%</strong>
                </div>
                <div className={styles.attributeRail}>
                  <span style={{ width: `${Math.max(8, Math.min(100, card.value * 5))}%` }} />
                </div>
              </article>
            ))}
          </section>

          <SectionCard
            kicker="Promotion Orders"
            title="Advance commander rank"
            aside={<Badge tone="warning">{selectedCommander.talentPointsAvailable} doctrine points</Badge>}
          >
            <div className={styles.orderGrid}>
              <p className={styles.orderLead}>
                Promotion opens when the experience bar is filled. Doctrine and stat cards below keep the power curve visible before you commit.
              </p>
              <div className={styles.actionRow}>
                <Button
                  type="button"
                  disabled={upgradeMutation.isPending || selectedCommander.xp < selectedCommander.xpToNextLevel}
                  onClick={() => upgradeMutation.mutate(selectedCommander.id)}
                >
                  {upgradeMutation.isPending ? "Upgrading" : "Upgrade Commander"}
                </Button>
              </div>
            </div>
          </SectionCard>

          <CommanderSkillTree commander={selectedCommander} />
        </div>
      </div>
    </section>
  );
}
