import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CommanderProgressView, CommanderTalentTrack } from "@frontier/shared";
import { useMemo, useState } from "react";

import { api } from "../api";
import { CommanderSkillTree } from "../components/commanders/CommanderSkillTree";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { DetailList, SectionHeaderBlock, type DetailListItem } from "../components/ui/CommandSurface";
import { EmptyState } from "../components/ui/EmptyState";
import { PageNotice } from "../components/ui/PageNotice";
import { SectionCard } from "../components/ui/SectionCard";
import { useGameLayoutContext } from "../components/GameLayout";
import { formatNumber } from "../lib/formatters";
import uiStyles from "../components/ui/primitives.module.css";
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
        <PageNotice title="Loading commander progression" body="Başbuğ defteri açılıyor." />
      </section>
    );
  }

  if (commandersQuery.isError) {
    return (
      <section className={styles.page}>
        <PageNotice
          title="Commander progression could not be loaded"
          body="Bağlantı koptu, tekrar deneniyor."
          tone="danger"
        />
      </section>
    );
  }

  if (!selectedCommander) {
    return (
      <section className={styles.page}>
        <SectionCard kicker="Başbuğ Defteri" title="Hazır başbuğ yok">
          <EmptyState icon="military_tech" title="Başbuğ kadrosu boş" body="İlerleme otağını açmadan önce başbuğları üret veya ekle." />
        </SectionCard>
      </section>
    );
  }

  const commanderMonogram = getCommanderMonogram(selectedCommander.name);
  const bonusCards: DetailListItem[] = [
    { id: "attack", label: "Saldırı Töresi", value: `+${selectedCommander.attackBonusPct}%`, note: "ön saf baskısı" },
    { id: "defense", label: "Savunma Duruşu", value: `+${selectedCommander.defenseBonusPct}%`, note: "sur disiplini" },
    { id: "speed", label: "Sefer Hızı", value: `+${selectedCommander.marchSpeedBonusPct}%`, note: "saha temposu" },
    { id: "carry", label: "Yük Kapasitesi", value: `+${selectedCommander.carryBonusPct}%`, note: "ikmal taşıma" },
  ];
  const serviceRows: DetailListItem[] = [
    { id: "track", label: "Töre Yolu", value: selectedCommander.skillTree.trackLabel },
    { id: "preset", label: "Hazır Kalıp", value: selectedCommander.assignedPreset ?? "Atanmamış" },
    { id: "reserve", label: "Yetenek Rezervi", value: `${selectedCommander.talentPointsAvailable} hazır` },
    { id: "status", label: "Komut Durumu", value: selectedCommander.isPrimary ? "Baş sancak" : "Yedek kol" },
  ];

  return (
    <section className={styles.page}>
      <header className={styles.commandBar}>
        <div className={styles.commandIdentity}>
          <p className={styles.kicker}>Başbuğ Künyesi</p>
          <h2 className={styles.commandTitle}>{selectedCommander.name}</h2>
          <div className={styles.commandMeta}>
            <Badge tone={selectedCommander.isPrimary ? "success" : "info"}>
              {selectedCommander.isPrimary ? "Baş sancak" : "Yedek kol"}
            </Badge>
            <span>{selectedCommander.skillTree.trackLabel}</span>
            <span>{selectedCommander.starLevel} yıldız</span>
          </div>
        </div>

        <div className={styles.commandStats} aria-label="Başbuğ özet kartı">
          <article>
            <span>Güç</span>
            <strong>{formatNumber(selectedCommander.totalPowerScore)}</strong>
          </article>
          <article>
            <span>Mertebe</span>
            <strong>L{selectedCommander.level}</strong>
          </article>
          <article>
            <span>Töre</span>
            <strong>{selectedCommander.talentPointsAvailable}</strong>
          </article>
          <article>
            <span>Altın</span>
            <strong>{formatNumber(state.city.resources.gold)}</strong>
          </article>
        </div>
      </header>

      <div className={styles.layout}>
        <aside className={styles.rosterColumn}>
          <SectionCard kicker="Başbuğ Defteri" title="Bağlı başbuğlar" aside={<Badge tone="info">{commanders.length} kayıt</Badge>}>
            <SectionHeaderBlock
              kicker="Aktif Sancak"
              title={selectedCommander.name}
              lead={`${selectedCommander.skillTree.trackLabel} töresi | ${
                selectedCommander.isPrimary ? "Baş sancak" : "Yedek kol"
              }`}
              aside={<Badge tone={selectedCommander.isPrimary ? "success" : "info"}>{selectedCommander.isPrimary ? "Baş" : "Yedek"}</Badge>}
              className={styles.surfaceHeader}
            />
            <div className={styles.rosterStats}>
              <article>
                <span>Kadro</span>
                <strong>{formatNumber(commanders.length)}</strong>
              </article>
              <article>
                <span>Mertebe</span>
                <strong>{formatNumber(rosterStats.totalLevels)}</strong>
              </article>
            </div>
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
                    <Badge tone={commander.isPrimary ? "success" : "info"}>{commander.isPrimary ? "Baş" : "Yedek"}</Badge>
                  </div>
                  <p className={styles.rosterMeta}>
                    L{commander.level} | {commander.skillTree.trackLabel} | {commander.starLevel} yıldız
                  </p>
                  <div className={styles.progressRail}>
                    <span style={{ width: `${getProgressPct(commander)}%` }} />
                  </div>
                  <span className={styles.rosterNote}>{formatNumber(commander.totalPowerScore)} güç</span>
                </button>
              ))}
            </div>
          </SectionCard>
        </aside>

        <div className={styles.mainColumn}>
          <section className={styles.commanderStage}>
            <article className={styles.portraitCard}>
              <div className={styles.portraitInset}>
                <span className={styles.portraitKicker}>Hizmet Sancağı</span>
                <span className={styles.portraitMonogram}>{commanderMonogram}</span>
                <strong className={styles.portraitName}>{selectedCommander.skillTree.trackLabel}</strong>
                <span className={styles.portraitMeta}>Mertebe {selectedCommander.level} başbuğ | {selectedCommander.starLevel} yıldız</span>
              </div>
              <div className={styles.portraitFooter}>
                <div className={styles.portraitRow}>
                  <span>Tecrübe ilerlemesi</span>
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
                  kicker="Savaş Otağı"
                  title="Saha töresi"
                  className={styles.surfaceHeader}
                />
                <DetailList items={bonusCards} />
              </article>

              <article className={styles.stageCard}>
                <SectionHeaderBlock
                  kicker="Hizmet Defteri"
                  title="Sefer kayıtları"
                  aside={<Badge tone="warning">{selectedCommander.starLevel} yıldız</Badge>}
                  className={styles.surfaceHeader}
                />
                <DetailList items={serviceRows} />
              </article>
            </div>
          </section>

          <SectionCard
            kicker="Terfi Buyruğu"
            title="Başbuğ rütbesini yükselt"
            aside={<Badge tone="warning">{selectedCommander.talentPointsAvailable} töre puanı</Badge>}
          >
            <div className={styles.orderGrid}>
              <p className={styles.orderLead}>
                Tecrübe çubuğu dolduğunda terfi açılır.
              </p>
              <div className={styles.actionRow}>
                <Button
                  type="button"
                  className={selectedCommander.xp >= selectedCommander.xpToNextLevel ? uiStyles.pulseHighlight : undefined}
                  disabled={upgradeMutation.isPending || selectedCommander.xp < selectedCommander.xpToNextLevel}
                  onClick={() => upgradeMutation.mutate(selectedCommander.id)}
                >
                  {upgradeMutation.isPending ? "Yükseltiliyor" : "Başbuğu Terfi Et"}
                </Button>
              </div>
            </div>
          </SectionCard>

          <CommanderSkillTree commander={selectedCommander} />

          <SectionCard
            kicker="Töre Sinerjisi"
            title="Töre güçlendiricileri"
            aside={<Badge tone="info">{TRACK_SYNERGIES[selectedCommander.skillTree.track].length} sinerji</Badge>}
          >
            <p className={styles.orderLead}>
              Bu töreler <strong>{selectedCommander.skillTree.trackLabel}</strong> yolunu güçlendirir.
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
