import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import { api } from "../api";
import { useGameLayoutContext } from "../components/GameLayout";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { EmptyState } from "../components/ui/EmptyState";
import { SectionCard } from "../components/ui/SectionCard";
import { formatDateTime, formatNumber } from "../lib/formatters";
import { getMailboxEntryTone, getMailboxSectionLabel, groupMailboxEntries } from "../lib/mailbox";
import { summarizeRewardLines } from "../lib/rewardSummaries";
import styles from "./MessageCenterPage.module.css";

export function MessageCenterPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { state } = useGameLayoutContext();
  const mailboxQuery = useQuery({ queryKey: ["mailbox"], queryFn: api.mailbox });
  const [selectedEntryId, setSelectedEntryId] = useState<string | null>(null);

  const claimMailboxMutation = useMutation({
    mutationFn: (mailboxId: string) => api.claimMailbox(mailboxId),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["mailbox"] }),
        queryClient.invalidateQueries({ queryKey: ["inventory"] }),
        queryClient.invalidateQueries({ queryKey: ["game-state"] }),
      ]);
    },
  });

  const entries = mailboxQuery.data?.entries ?? [];

  useEffect(() => {
    const fallback = entries.find((entry) => !entry.claimedAt) ?? entries[0] ?? null;
    if (!selectedEntryId || !entries.some((entry) => entry.id === selectedEntryId)) {
      setSelectedEntryId(fallback?.id ?? null);
    }
  }, [entries, selectedEntryId]);

  const groupedEntries = useMemo(() => groupMailboxEntries(entries), [entries]);
  const selectedEntry = entries.find((entry) => entry.id === selectedEntryId) ?? entries[0] ?? null;
  const selectedRewards = summarizeRewardLines(selectedEntry?.reward ?? null);
  const unreadCount = mailboxQuery.data?.unreadCount ?? 0;
  const claimableCount = entries.filter((entry) => entry.canClaim).length;
  const scoutCount = entries.filter((entry) => entry.kind === "SCOUT_REPORT").length;
  const battleCount = entries.filter((entry) => entry.kind === "BATTLE_REPORT" || entry.kind === "RALLY_REPORT").length;

  if (mailboxQuery.isPending) {
    return <div className={styles.feedback}>Loading dispatch archive...</div>;
  }

  if (mailboxQuery.isError) {
    return <div className={styles.feedback}>Message center could not be loaded.</div>;
  }

  return (
    <section className={styles.page}>
      <header className={styles.hero}>
        <div className={styles.heroTop}>
          <div>
            <p className={styles.kicker}>Imperial Message Center</p>
            <h2 className={styles.heroTitle}>Dispatch archive and reward manifest</h2>
            <p className={styles.heroLead}>
              Reports, scout returns, and claimable warrants now live in a full archive surface instead of a transient drawer.
            </p>
          </div>
          <Badge tone="warning">{formatNumber(unreadCount)} unread</Badge>
        </div>
        <div className={styles.summaryGrid}>
          <article className={styles.summaryCard}>
            <span className={styles.summaryLabel}>Unread dispatches</span>
            <strong className={styles.summaryValue}>{formatNumber(unreadCount)}</strong>
            <span className={styles.summaryMeta}>Priority records still waiting for review.</span>
          </article>
          <article className={styles.summaryCard}>
            <span className={styles.summaryLabel}>Claimable warrants</span>
            <strong className={styles.summaryValue}>{formatNumber(claimableCount)}</strong>
            <span className={styles.summaryMeta}>Rewards and system grants ready to process.</span>
          </article>
          <article className={styles.summaryCard}>
            <span className={styles.summaryLabel}>Scout dispatches</span>
            <strong className={styles.summaryValue}>{formatNumber(scoutCount)}</strong>
            <span className={styles.summaryMeta}>Recon intel and node reports on file.</span>
          </article>
          <article className={styles.summaryCard}>
            <span className={styles.summaryLabel}>Battle alerts</span>
            <strong className={styles.summaryValue}>{formatNumber(battleCount)}</strong>
            <span className={styles.summaryMeta}>Combat and rally reports in the archive.</span>
          </article>
        </div>
      </header>

      {entries.length === 0 || !selectedEntry ? (
        <SectionCard kicker="Archive" title="No dispatches on file">
          <EmptyState title="Archive empty" body="Rewards, reports, and recon returns will populate here once the frontier starts moving." />
        </SectionCard>
      ) : (
        <div className={styles.layout}>
          <section className={styles.archiveRail}>
            <div className={styles.archiveHeader}>
              <div>
                <p className={styles.groupLabel}>Dispatch archive</p>
                <h3 className={styles.archiveTitle}>{state.city.cityName} records</h3>
              </div>
              <Badge tone="info">{formatNumber(entries.length)} entries</Badge>
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
                            <span>{entry.kind.replaceAll("_", " ").toLowerCase()}</span>
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
                  <strong>{getMailboxSectionLabel(selectedEntry)}</strong>
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
                <span className={styles.detailCardLabel}>Recon breakdown</span>
                <div className={styles.intelGrid}>
                  {selectedEntry.scoutReport.cityIntel ? (
                    <div className={styles.intelBlock}>
                      <strong>{selectedEntry.scoutReport.cityIntel.cityName}</strong>
                      <span>Owner: {selectedEntry.scoutReport.cityIntel.ownerName}</span>
                      <span>Defense: {formatNumber(selectedEntry.scoutReport.cityIntel.defensePower)}</span>
                      <span>Shield: {selectedEntry.scoutReport.cityIntel.peaceShieldUntil ? "Active" : "Inactive"}</span>
                    </div>
                  ) : null}
                  {selectedEntry.scoutReport.poiIntel ? (
                    <div className={styles.intelBlock}>
                      <strong>{selectedEntry.scoutReport.poiIntel.poiName}</strong>
                      <span>Type: {selectedEntry.scoutReport.poiIntel.poiKind.toLowerCase()}</span>
                      <span>Level: {selectedEntry.scoutReport.poiIntel.level}</span>
                      <span>Stock: {selectedEntry.scoutReport.poiIntel.remainingAmount ? formatNumber(selectedEntry.scoutReport.poiIntel.remainingAmount) : "Unknown"}</span>
                    </div>
                  ) : null}
                </div>
              </article>
            ) : null}

            {selectedRewards.length > 0 ? (
              <article className={styles.detailCard}>
                <span className={styles.detailCardLabel}>Reward manifest</span>
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
                onClick={() => navigate(selectedEntry.kind === "SCOUT_REPORT" ? "/app/map" : "/app/reports")}
              >
                {selectedEntry.kind === "SCOUT_REPORT" ? "Open Strategic Map" : "Open War Council"}
              </Button>
              {selectedEntry.canClaim ? (
                <Button type="button" variant="primary" disabled={claimMailboxMutation.isPending} onClick={() => claimMailboxMutation.mutate(selectedEntry.id)}>
                  {claimMailboxMutation.isPending ? "Processing" : "Claim Reward"}
                </Button>
              ) : null}
            </div>
          </section>
        </div>
      )}
    </section>
  );
}
