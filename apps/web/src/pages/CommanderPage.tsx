import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CommanderProgressView, CommanderTalentTrack } from "@frontier/shared";
import { useMemo, useState } from "react";

import { api } from "../api";
import { CommanderSkillTree } from "../components/commanders/CommanderSkillTree";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { DetailList, PanelStatGrid, SectionHeaderBlock, type DetailListItem, type PanelStatItem } from "../components/ui/CommandSurface";
import { EmptyState } from "../components/ui/EmptyState";
import { PageNotice } from "../components/ui/PageNotice";
import { SectionCard } from "../components/ui/SectionCard";
import { useGameLayoutContext } from "../components/GameLayout";
import { formatNumber } from "../lib/formatters";
import styles from "./CommanderPage.module.css";

type ResearchSynergyEntry = {
  research: string;
  label: string;
  bonus: string;
};

const TRACK_SYNERGIES: Record<CommanderTalentTrack, ResearchSynergyEntry[]> = {
  CONQUEST: [
    { research: "MILITARY_DRILL",   label: "Military Drill",   bonus: "+8% all troop attack / level" },
    { research: "METALLURGY",       label: "Metallurgy",       bonus: "+10% all troop attack / level" },
    { research: "ARCHERY",          label: "Archery",          bonus: "+8% archer attack / level" },
    { research: "CAVALRY_TACTICS",  label: "Cavalry Tactics",  bonus: "+8% cavalry attack, +6% march speed / level" },
  ],
  PEACEKEEPING: [
    { research: "MEDICINE",         label: "Medicine",         bonus: "+20% hospital healing rate / level" },
    { research: "CITY_PLANNING",    label: "City Planning",    bonus: "-10% building upgrade duration / level" },
    { research: "STONEWORK",        label: "Stonework",        bonus: "+5% structural defense, +12% stone / level" },
  ],
  GATHERING: [
    { research: "LOGISTICS",        label: "Logistics",        bonus: "+8% march speed / level" },
    { research: "AGRONOMY",         label: "Agronomy",         bonus: "+12% food production / level" },
    { research: "GOLD_TRADE",       label: "Gold Trade",       bonus: "+12% gold income / level" },
    { research: "SCOUTING",         label: "Scouting",         bonus: "+1 vision radius / level" },
  ],
};

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
    return (
      <section className={styles.page}>
        <PageNotice title="Loading commander progression" body="The war cabinet is assembling roster, doctrines, and promotion records." />
      </section>
    );
  }

  if (commandersQuery.isError) {
    return (
      <section className={styles.page}>
        <PageNotice
          title="Commander progression could not be loaded"
          body="Commander records are unavailable right now. Retry once the player state and route data stabilize."
          tone="danger"
        />
      </section>
    );
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
  const bonusCards: DetailListItem[] = [
    { id: "attack", label: "Attack Doctrine", value: `+${selectedCommander.attackBonusPct}%`, note: "frontline pressure" },
    { id: "defense", label: "Defense Posture", value: `+${selectedCommander.defenseBonusPct}%`, note: "wall discipline" },
    { id: "speed", label: "March Tempo", value: `+${selectedCommander.marchSpeedBonusPct}%`, note: "field movement" },
    { id: "carry", label: "Carry Capacity", value: `+${selectedCommander.carryBonusPct}%`, note: "supply lift" },
  ];
  const serviceRows: DetailListItem[] = [
    { id: "track", label: "Doctrine Track", value: selectedCommander.skillTree.trackLabel },
    { id: "preset", label: "Preset", value: selectedCommander.assignedPreset ?? "Unassigned" },
    { id: "reserve", label: "Talent Reserve", value: `${selectedCommander.talentPointsAvailable} ready` },
    { id: "status", label: "Command Status", value: selectedCommander.isPrimary ? "Primary banner" : "Reserve wing" },
  ];
  const attributeCards = [
    { label: "Attack", value: selectedCommander.attackBonusPct },
    { label: "Defense", value: selectedCommander.defenseBonusPct },
    { label: "Speed", value: selectedCommander.marchSpeedBonusPct },
    { label: "Carry", value: selectedCommander.carryBonusPct },
  ];
  const attributeStats: PanelStatItem[] = attributeCards.map((card) => ({
    id: card.label.toLowerCase(),
    label: card.label,
    value: `+${card.value}%`,
    note:
      card.label === "Attack"
        ? "frontline pressure"
        : card.label === "Defense"
          ? "wall discipline"
          : card.label === "Speed"
            ? "field tempo"
            : "supply lift",
    tone: card.label === "Defense" ? "info" : card.label === "Carry" ? "success" : "warning",
  }));
  const selectedCommanderRailStats: PanelStatItem[] = [
    {
      id: "level",
      label: "Level",
      value: `L${selectedCommander.level}`,
      note: `${selectedCommander.starLevel} stars`,
      tone: selectedCommander.isPrimary ? "success" : "info",
    },
    {
      id: "power",
      label: "Power",
      value: formatNumber(selectedCommander.totalPowerScore),
      note: selectedCommander.skillTree.trackLabel,
      tone: "warning",
    },
    {
      id: "xp",
      label: "XP to next",
      value: formatNumber(selectedCommander.xpToNextLevel),
      note: "promotion window",
      tone: "info",
    },
    {
      id: "talent",
      label: "Doctrine",
      value: selectedCommander.talentPointsAvailable,
      note: "points ready",
      tone: "success",
    },
  ] as const;

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
            <SectionHeaderBlock
              kicker="Active Banner"
              title={selectedCommander.name}
              lead={`${selectedCommander.skillTree.trackLabel} doctrine | ${
                selectedCommander.isPrimary ? "Primary banner" : "Reserve wing"
              }`}
              aside={<Badge tone={selectedCommander.isPrimary ? "success" : "info"}>{selectedCommander.isPrimary ? "Lead" : "Reserve"}</Badge>}
              className={styles.surfaceHeader}
            />
            <PanelStatGrid items={selectedCommanderRailStats} columns={2} compact className={styles.rosterStats} />
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
                <SectionHeaderBlock
                  kicker="War Cabinet"
                  title="Field doctrine"
                  lead="Frontline pressure, wall discipline, march tempo, and carry lift stay readable before promotion."
                  className={styles.surfaceHeader}
                />
                <DetailList items={bonusCards} />
              </article>

              <article className={styles.stageCard}>
                <SectionHeaderBlock
                  kicker="Service Record"
                  title="Campaign ledger"
                  lead="Preset, reserve doctrine, and command status stay visible while you plan the next rank."
                  aside={<Badge tone="warning">{selectedCommander.starLevel} stars</Badge>}
                  className={styles.surfaceHeader}
                />
                <DetailList items={serviceRows} />
              </article>
            </div>
          </section>

          <PanelStatGrid items={attributeStats} columns={4} className={styles.attributeStats} />

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

          <SectionCard
            kicker="Research Synergy"
            title="Doctrine amplifiers"
            aside={<Badge tone="info">{TRACK_SYNERGIES[selectedCommander.skillTree.track].length} synergies</Badge>}
          >
            <p className={styles.orderLead}>
              These research branches amplify the{" "}
              <strong>{selectedCommander.skillTree.trackLabel}</strong> doctrine track.
              Higher research tiers multiply the bonus for every level of this commander.
            </p>
            <div className={styles.synergyGrid}>
              {TRACK_SYNERGIES[selectedCommander.skillTree.track].map((entry) => (
                <article key={entry.research} className={styles.synergyCard}>
                  <span className={styles.synergyLabel}>{entry.label}</span>
                  <strong className={styles.synergyBonus}>{entry.bonus}</strong>
                </article>
              ))}
            </div>
          </SectionCard>
        </div>
      </div>
    </section>
  );
}
