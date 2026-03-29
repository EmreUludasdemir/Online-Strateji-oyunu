import type { MailboxEntryView } from "@frontier/shared";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import { formatDateTime, formatNumber } from "../../lib/formatters";
import { copy } from "../../lib/i18n";
import { getMailboxEntryTone, getMailboxSectionLabel, groupMailboxEntries } from "../../lib/mailbox";
import { summarizeRewardLines } from "../../lib/rewardSummaries";
import { Badge } from "./Badge";
import { BottomSheet } from "./BottomSheet";
import { Button } from "./Button";
import { EmptyState } from "./EmptyState";
import styles from "./InboxDrawer.module.css";

export function InboxDrawer({
  open,
  entries,
  unreadCount,
  onClaim,
  onClose,
}: {
  open: boolean;
  entries: MailboxEntryView[];
  unreadCount: number;
  onClaim: (id: string) => void;
  onClose: () => void;
}) {
  const navigate = useNavigate();
  const [selectedEntryId, setSelectedEntryId] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }

    const fallback = entries.find((entry) => !entry.claimedAt) ?? entries[0] ?? null;
    setSelectedEntryId((current) => current ?? fallback?.id ?? null);
  }, [entries, open]);

  useEffect(() => {
    if (!selectedEntryId || entries.some((entry) => entry.id === selectedEntryId)) {
      return;
    }

    setSelectedEntryId(entries[0]?.id ?? null);
  }, [entries, selectedEntryId]);

  const groupedEntries = useMemo(() => groupMailboxEntries(entries), [entries]);
  const selectedEntry = entries.find((entry) => entry.id === selectedEntryId) ?? entries[0] ?? null;
  const selectedRewards = summarizeRewardLines(selectedEntry?.reward ?? null);

  return (
    <BottomSheet
      open={open}
      title={`Message Center | ${formatNumber(unreadCount)} ${copy.hud.unread}`}
      onClose={onClose}
      mode="bottom"
    >
      {entries.length === 0 || !selectedEntry ? (
        <EmptyState title={copy.mailbox.title} body={copy.mailbox.empty} />
      ) : (
        <div className={styles.layout}>
          <section className={styles.archiveRail}>
            <div className={styles.archiveHeader}>
              <div>
                <p className={styles.kicker}>Archives</p>
                <h3 className={styles.archiveTitle}>Imperial dispatches</h3>
              </div>
              <Badge tone="warning">{formatNumber(unreadCount)} new</Badge>
            </div>

            <div className={styles.archiveGroups}>
              {groupedEntries.map(([groupLabel, groupEntries]) => (
                <section key={groupLabel} className={styles.groupBlock}>
                  <h4 className={styles.groupLabel}>{groupLabel}</h4>
                  <div className={styles.groupList}>
                    {groupEntries.map((entry) => {
                      const isActive = entry.id === selectedEntry.id;
                      return (
                        <button
                          key={entry.id}
                          type="button"
                          className={[styles.entryButton, isActive ? styles.entryButtonActive : ""].filter(Boolean).join(" ")}
                          onClick={() => setSelectedEntryId(entry.id)}
                        >
                          <div className={styles.entryHead}>
                            <strong>{entry.title}</strong>
                            <span>{formatDateTime(entry.createdAt)}</span>
                          </div>
                          <div className={styles.entryMeta}>
                            <Badge tone={getMailboxEntryTone(entry)}>{entry.claimedAt ? "Filed" : "Open"}</Badge>
                            <span>{getMailboxSectionLabel(entry)}</span>
                          </div>
                          <p className={styles.entryExcerpt}>{entry.body}</p>
                        </button>
                      );
                    })}
                  </div>
                </section>
              ))}
            </div>
          </section>

          <section className={styles.detailPane}>
            <header className={styles.detailHero}>
              <div className={styles.detailMetaRow}>
                <Badge tone={getMailboxEntryTone(selectedEntry)}>{selectedEntry.claimedAt ? "Filed" : "Priority"}</Badge>
                <span className={styles.detailRef}>Ref {selectedEntry.id.slice(0, 8).toUpperCase()}</span>
              </div>
              <h3 className={styles.detailTitle}>{selectedEntry.title}</h3>
              <div className={styles.detailColumns}>
                <div>
                  <span className={styles.detailLabel}>Dispatch Type</span>
                  <strong>{selectedEntry.kind.replaceAll("_", " ").toLowerCase()}</strong>
                </div>
                <div>
                  <span className={styles.detailLabel}>Filed At</span>
                  <strong>{formatDateTime(selectedEntry.createdAt)}</strong>
                </div>
              </div>
            </header>

            <article className={styles.letterCard}>
              <p className={styles.letterBody}>{selectedEntry.body}</p>
              {selectedEntry.scoutReport?.summary ? <blockquote className={styles.quote}>{selectedEntry.scoutReport.summary}</blockquote> : null}
            </article>

            {selectedEntry.scoutReport?.cityIntel || selectedEntry.scoutReport?.poiIntel ? (
              <article className={styles.detailCard}>
                <span className={styles.detailCardLabel}>Scout Intel</span>
                <div className={styles.intelGrid}>
                  {selectedEntry.scoutReport.cityIntel ? (
                    <div className={styles.intelBlock}>
                      <strong>{selectedEntry.scoutReport.cityIntel.cityName}</strong>
                      <span>Owner: {selectedEntry.scoutReport.cityIntel.ownerName}</span>
                      <span>Defense: {formatNumber(selectedEntry.scoutReport.cityIntel.defensePower)}</span>
                      <span>
                        Shield: {selectedEntry.scoutReport.cityIntel.peaceShieldUntil ? "Active" : "Inactive"}
                      </span>
                    </div>
                  ) : null}
                  {selectedEntry.scoutReport.poiIntel ? (
                    <div className={styles.intelBlock}>
                      <strong>{selectedEntry.scoutReport.poiIntel.poiName}</strong>
                      <span>Type: {selectedEntry.scoutReport.poiIntel.poiKind.toLowerCase()}</span>
                      <span>Level: {selectedEntry.scoutReport.poiIntel.level}</span>
                      <span>
                        Stock: {selectedEntry.scoutReport.poiIntel.remainingAmount ? formatNumber(selectedEntry.scoutReport.poiIntel.remainingAmount) : "Unknown"}
                      </span>
                    </div>
                  ) : null}
                </div>
              </article>
            ) : null}

            {selectedRewards.length > 0 ? (
              <article className={styles.detailCard}>
                <span className={styles.detailCardLabel}>Reward Manifest</span>
                <div className={styles.rewardList}>
                  {selectedRewards.map((line) => (
                    <span key={line}>{line}</span>
                  ))}
                </div>
              </article>
            ) : null}

            <div className={styles.actionRow}>
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  onClose();
                  navigate("/app/messages");
                }}
              >
                Open Message Center
              </Button>
              {selectedEntry.canClaim ? (
                <Button type="button" variant="primary" onClick={() => onClaim(selectedEntry.id)}>
                  {copy.mailbox.claim}
                </Button>
              ) : null}
            </div>
          </section>
        </div>
      )}
    </BottomSheet>
  );
}
