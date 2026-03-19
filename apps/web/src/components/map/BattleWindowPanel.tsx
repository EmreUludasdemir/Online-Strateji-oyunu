import type { BattleWindowView } from "@frontier/shared";

import { Badge } from "../ui/Badge";
import { SectionCard } from "../ui/SectionCard";
import { formatNumber, formatRelativeTimer } from "../../lib/formatters";
import styles from "./BattleWindowPanel.module.css";

function getParticipantTroopTotal(window: BattleWindowView) {
  return window.participants.reduce(
    (sum, participant) => sum + Object.values(participant.troops).reduce((inner, value) => inner + value, 0),
    0,
  );
}

function getParticipantTone(isAllianceSupport: boolean) {
  return isAllianceSupport ? "success" : "info";
}

export function BattleWindowPanel({
  battleWindow,
  now,
  allianceTag,
}: {
  battleWindow: BattleWindowView;
  now: number;
  allianceTag: string | null;
}) {
  const allianceParticipants = battleWindow.participants.filter(
    (participant) => allianceTag && participant.ownerAllianceTag === allianceTag,
  );
  const participantTroops = getParticipantTroopTotal(battleWindow);

  return (
    <SectionCard
      kicker="Battle Window"
      title={battleWindow.label}
      aside={<Badge tone="warning">{formatRelativeTimer(battleWindow.closesAt, now)}</Badge>}
      className={styles.card}
    >
      <div className={styles.summaryGrid}>
        <article className={styles.summaryItem}>
          <span className={styles.summaryLabel}>Attackers</span>
          <strong className={styles.summaryValue}>{battleWindow.attackerLabel}</strong>
        </article>
        <article className={styles.summaryItem}>
          <span className={styles.summaryLabel}>Defenders</span>
          <strong className={styles.summaryValue}>{battleWindow.defenderLabel}</strong>
        </article>
        <article className={styles.summaryItem}>
          <span className={styles.summaryLabel}>Participants</span>
          <strong className={styles.summaryValue}>{formatNumber(battleWindow.participantCount)}</strong>
        </article>
        <article className={styles.summaryItem}>
          <span className={styles.summaryLabel}>Troops</span>
          <strong className={styles.summaryValue}>{formatNumber(participantTroops)}</strong>
        </article>
      </div>

      <div className={styles.body}>
        <div className={styles.metaRow}>
          <Badge tone="info">{battleWindow.objective.replaceAll("_", " ").toLowerCase()}</Badge>
          <span className={styles.metaText}>
            Window closes in {formatRelativeTimer(battleWindow.closesAt, now)}.
          </span>
        </div>

        <div className={styles.section}>
          <div className={styles.sectionHeader}>
            <strong>Alliance support</strong>
            <Badge tone={allianceParticipants.length > 0 ? "success" : "info"}>
              {allianceParticipants.length} allied
            </Badge>
          </div>
          {allianceParticipants.length === 0 ? (
            <p className={styles.empty}>No alliance member is staged in this window yet.</p>
          ) : (
            <ul className={styles.participantList}>
              {allianceParticipants.map((participant) => (
                <li key={participant.marchId} className={styles.participantRow}>
                  <div>
                    <strong>{participant.ownerName}</strong>
                    <p className={styles.participantMeta}>
                      {participant.commanderName} · ETA {formatRelativeTimer(participant.etaAt, now)}
                    </p>
                  </div>
                  <Badge tone="success">
                    {formatNumber(Object.values(participant.troops).reduce((sum, value) => sum + value, 0))}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className={styles.section}>
          <div className={styles.sectionHeader}>
            <strong>Participants</strong>
            <Badge tone="info">{battleWindow.participantCount} staged</Badge>
          </div>
          <ul className={styles.participantList}>
            {battleWindow.participants.map((participant) => {
              const troopCount = Object.values(participant.troops).reduce((sum, value) => sum + value, 0);
              const isAllianceSupport = Boolean(allianceTag && participant.ownerAllianceTag === allianceTag);

              return (
                <li key={participant.marchId} className={styles.participantRow}>
                  <div>
                    <strong>{participant.ownerName}</strong>
                    <p className={styles.participantMeta}>
                      {participant.commanderName}
                      {participant.ownerAllianceTag ? ` · [${participant.ownerAllianceTag}]` : ""}
                    </p>
                  </div>
                  <div className={styles.participantBadges}>
                    <Badge tone={getParticipantTone(isAllianceSupport)}>{participant.objective.toLowerCase()}</Badge>
                    <Badge tone="warning">{formatNumber(troopCount)}</Badge>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </SectionCard>
  );
}
