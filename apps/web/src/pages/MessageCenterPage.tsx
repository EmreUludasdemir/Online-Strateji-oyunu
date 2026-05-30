import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import { api } from "../api";
import { useGameLayoutContext } from "../components/GameLayout";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { SectionHeaderBlock } from "../components/ui/CommandSurface";
import { EmptyState } from "../components/ui/EmptyState";
import { PageNotice } from "../components/ui/PageNotice";
import { SectionCard } from "../components/ui/SectionCard";
import { formatDateTime, formatNumber } from "../lib/formatters";
import { getMailboxEntryTone, getMailboxSectionLabel, groupMailboxEntries } from "../lib/mailbox";
import { summarizeRewardLines } from "../lib/rewardSummaries";
import uiStyles from "../components/ui/primitives.module.css";
import styles from "./MessageCenterPage.module.css";

function getDispatchRoute(entry: {
  kind: string;
}, storeEnabled: boolean): { label: string; to: string; note: string } {
  if (entry.kind === "SCOUT_REPORT") {
    return {
      label: "Open Strategic Map",
      to: "/app/map",
      note: "Review map targets.",
    };
  }
  if (entry.kind === "BATTLE_REPORT" || entry.kind === "RALLY_REPORT") {
    return {
      label: "Open War Council",
      to: "/app/reports",
      note: "Review combat dossier.",
    };
  }
  if (entry.kind === "PURCHASE_REWARD") {
    return storeEnabled
      ? {
          label: "Open Imperial Market",
          to: "/app/market",
          note: "Return to market.",
        }
      : {
          label: "Open City Dashboard",
          to: "/app/dashboard",
          note: "Return to city deck.",
        };
  }

  return {
    label: "Open City Dashboard",
    to: "/app/dashboard",
    note: "Return to city deck.",
  };
}

function getSecondaryDispatchRoute(entry: {
  kind: string;
}, storeEnabled: boolean): { label: string; to: string } {
  if (entry.kind === "SCOUT_REPORT") {
    return { label: "Open War Council", to: "/app/reports" };
  }
  if (entry.kind === "BATTLE_REPORT" || entry.kind === "RALLY_REPORT") {
    return { label: "Open Strategic Map", to: "/app/map" };
  }
  if (entry.kind === "PURCHASE_REWARD") {
    return storeEnabled
      ? { label: "Open City Dashboard", to: "/app/dashboard" }
      : { label: "Open War Council", to: "/app/reports" };
  }

  return { label: "Open War Council", to: "/app/reports" };
}

function getDispatchStatus(entry: {
  canClaim: boolean;
  claimedAt: string | null;
  kind: string;
}): string {
  if (entry.claimedAt) {
    return "Filed";
  }
  if (entry.canClaim) {
    return "Claim ready";
  }
  if (entry.kind === "SCOUT_REPORT") {
    return "Intel pending orders";
  }
  return "Awaiting review";
}

export function MessageCenterPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { state, bootstrap } = useGameLayoutContext();
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
    return (
      <section className={styles.page}>
        <PageNotice title="Loading dispatch archive" body="Indexing reports and warrants." />
      </section>
    );
  }

  if (mailboxQuery.isError) {
    return (
      <section className={styles.page}>
        <PageNotice
          title="Message Center could not be loaded"
          body="The dispatch archive is unavailable right now. Retry once mailbox and session state are healthy again."
          tone="danger"
        />
      </section>
    );
  }

  return (
    <section className={styles.page}>
      <header className={styles.commandBar}>
        <div className={styles.commandIdentity}>
          <p className={styles.kicker}>Imperial Message Center</p>
          <h2 className={styles.commandTitle}>Dispatch archive</h2>
          <div className={styles.commandMeta}>
            <Badge tone={unreadCount > 0 ? "warning" : "info"}>{formatNumber(unreadCount)} unread</Badge>
            <span>{formatNumber(entries.length)} records</span>
            <span>{selectedEntry ? getMailboxSectionLabel(selectedEntry) : "No selection"}</span>
          </div>
        </div>

        <div className={styles.commandStats} aria-label="Dispatch command summary">
          <article>
            <span>Unread</span>
            <strong>{formatNumber(unreadCount)}</strong>
          </article>
          <article>
            <span>Claim</span>
            <strong>{formatNumber(claimableCount)}</strong>
          </article>
          <article>
            <span>Scout</span>
            <strong>{formatNumber(scoutCount)}</strong>
          </article>
          <article>
            <span>Battle</span>
            <strong>{formatNumber(battleCount)}</strong>
          </article>
        </div>
      </header>

      {entries.length === 0 || !selectedEntry ? (
        <SectionCard kicker="Archive" title="No dispatches on file">
          <EmptyState icon="mail" title="Archive empty" body="Rewards, reports, and recon returns will populate here." />
        </SectionCard>
      ) : (
        <div className={styles.layout}>
          <section className={styles.archiveRail}>
            <SectionHeaderBlock
              kicker="Dispatch Archive"
              title={`${state.city.cityName} records`}
              lead={`${formatNumber(entries.length)} entries staged on the rail`}
              aside={<Badge tone="info">{formatNumber(entries.length)} entries</Badge>}
              className={styles.archiveHeader}
            />

            <div className={styles.archiveGroups}>
              {groupedEntries.map(([groupLabel, groupEntries]) => {
                const openCount = groupEntries.filter((entry) => !entry.claimedAt).length;
                const claimable = groupEntries.filter((entry) => entry.canClaim).length;

                return (
                  <section key={groupLabel} className={styles.groupBlock}>
                    <div className={styles.groupHead}>
                      <h4 className={styles.groupLabel}>{groupLabel}</h4>
                      <span className={styles.groupMeta}>
                        {formatNumber(openCount)} open · {formatNumber(claimable)} claimable
                      </span>
                    </div>
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
                              <Badge tone={getMailboxEntryTone(entry)}>{getDispatchStatus(entry)}</Badge>
                              <span>{entry.kind.replaceAll("_", " ").toLowerCase()}</span>
                            </div>
                            <p className={styles.entryExcerpt}>{entry.body}</p>
                          </button>
                        );
                      })}
                    </div>
                  </section>
                );
              })}
            </div>
          </section>

          <section className={styles.detailPane}>
            <header className={styles.detailHero}>
              <div className={styles.detailMetaRow}>
                <Badge tone={getMailboxEntryTone(selectedEntry)}>{getDispatchStatus(selectedEntry)}</Badge>
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
              <div className={styles.dispatchBoard}>
                <article className={styles.dispatchCell}>
                  <span>Route</span>
                  <strong>{getDispatchRoute(selectedEntry, bootstrap.storeEnabled).label}</strong>
                </article>
                <article className={styles.dispatchCell}>
                  <span>Reward</span>
                  <strong>{selectedEntry.canClaim ? "Claim ready" : selectedRewards.length > 0 ? "Filed" : "None"}</strong>
                </article>
                <article className={styles.dispatchCell}>
                  <span>Archive</span>
                  <strong>{formatNumber(entries.length)}</strong>
                </article>
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

            <SectionCard kicker="Operations Bridge" title="Route this dispatch">
              <p className={styles.routeNote}>{getDispatchRoute(selectedEntry, bootstrap.storeEnabled).note}</p>
              <div className={styles.actionRow}>
                <Button type="button" variant="secondary" onClick={() => navigate(getDispatchRoute(selectedEntry, bootstrap.storeEnabled).to)}>
                  {getDispatchRoute(selectedEntry, bootstrap.storeEnabled).label}
                </Button>
                <Button type="button" variant="ghost" onClick={() => navigate(getSecondaryDispatchRoute(selectedEntry, bootstrap.storeEnabled).to)}>
                  {getSecondaryDispatchRoute(selectedEntry, bootstrap.storeEnabled).label}
                </Button>
                {selectedEntry.canClaim ? (
                  <Button type="button" variant="primary" className={uiStyles.pulseHighlight} disabled={claimMailboxMutation.isPending} onClick={() => claimMailboxMutation.mutate(selectedEntry.id)}>
                    {claimMailboxMutation.isPending ? "Processing" : "Claim Reward"}
                  </Button>
                ) : null}
              </div>
            </SectionCard>
          </section>
        </div>
      )}
    </section>
  );
}
