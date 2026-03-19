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

  return (
    <section className={styles.page}>
      <header className={styles.hero}>
        <div className={styles.heroTop}>
          <div>
            <p className={styles.kicker}>Commander Progression</p>
            <h2 className={styles.heroTitle}>Command Staff Chamber</h2>
            <p className={styles.heroLead}>
              Track level growth, talent branches, and roster readiness before opening the next battle window.
            </p>
          </div>
          <Badge tone="info">{commanders.length} commanders</Badge>
        </div>
        <div className={styles.summaryGrid}>
          <article className={styles.summaryCard}>
            <span className={styles.summaryLabel}>Roster Levels</span>
            <strong className={styles.summaryValue}>{formatNumber(rosterStats.totalLevels)}</strong>
          </article>
          <article className={styles.summaryCard}>
            <span className={styles.summaryLabel}>Roster Power</span>
            <strong className={styles.summaryValue}>{formatNumber(rosterStats.totalPower)}</strong>
          </article>
          <article className={styles.summaryCard}>
            <span className={styles.summaryLabel}>City Gold</span>
            <strong className={styles.summaryValue}>{formatNumber(state.city.resources.gold)}</strong>
          </article>
        </div>
      </header>

      <div className={styles.layout}>
        <aside className={styles.rosterColumn}>
          <SectionCard kicker="Roster" title="Available commanders">
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
                  <p className={styles.meta}>
                    L{commander.level} · {commander.skillTree.trackLabel} · {commander.starLevel} stars
                  </p>
                  <div className={styles.progressRail}>
                    <span style={{ width: `${getProgressPct(commander)}%` }} />
                  </div>
                </button>
              ))}
            </div>
          </SectionCard>
        </aside>

        <div className={styles.mainColumn}>
          <SectionCard
            kicker="Selected Commander"
            title={`${selectedCommander.name} · Level ${selectedCommander.level}`}
            aside={<Badge tone="warning">{selectedCommander.starLevel} stars</Badge>}
          >
            <div className={styles.profileGrid}>
              <article className={styles.profileCard}>
                <span className={styles.profileLabel}>Experience</span>
                <strong className={styles.profileValue}>
                  {formatNumber(selectedCommander.xp)} / {formatNumber(selectedCommander.xp + selectedCommander.xpToNextLevel)}
                </strong>
                <div className={styles.progressRail}>
                  <span style={{ width: `${getProgressPct(selectedCommander)}%` }} />
                </div>
              </article>
              <article className={styles.profileCard}>
                <span className={styles.profileLabel}>Bonuses</span>
                <strong className={styles.profileValue}>
                  +{selectedCommander.attackBonusPct}% atk · +{selectedCommander.defenseBonusPct}% def
                </strong>
                <p className={styles.meta}>
                  +{selectedCommander.marchSpeedBonusPct}% speed · +{selectedCommander.carryBonusPct}% carry
                </p>
              </article>
              <article className={styles.profileCard}>
                <span className={styles.profileLabel}>Doctrines</span>
                <strong className={styles.profileValue}>{selectedCommander.talentPointsAvailable} talent points ready</strong>
                <p className={styles.meta}>{selectedCommander.assignedPreset ?? "No preset assigned"}</p>
              </article>
            </div>

            <div className={styles.actionRow}>
              <Button
                type="button"
                disabled={upgradeMutation.isPending || selectedCommander.xp < selectedCommander.xpToNextLevel}
                onClick={() => upgradeMutation.mutate(selectedCommander.id)}
              >
                {upgradeMutation.isPending ? "Upgrading" : "Upgrade Commander"}
              </Button>
            </div>
          </SectionCard>

          <CommanderSkillTree commander={selectedCommander} />
        </div>
      </div>
    </section>
  );
}
