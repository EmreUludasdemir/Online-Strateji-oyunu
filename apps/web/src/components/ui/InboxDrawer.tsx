import type { MailboxEntryView } from "@frontier/shared";

import { formatDateTime, formatNumber } from "../../lib/formatters";
import { copy } from "../../lib/i18n";
import { Badge } from "./Badge";
import { BottomSheet } from "./BottomSheet";
import { Button } from "./Button";
import { EmptyState } from "./EmptyState";
import styles from "./InboxDrawer.module.css";

function renderRewardLines(entry: MailboxEntryView): string[] {
  if (!entry.reward) {
    return [];
  }

  const lines: string[] = [];
  const totalResources = Object.entries(entry.reward.resources).filter(([, value]) => value > 0);
  if (totalResources.length > 0) {
    lines.push(totalResources.map(([resource, amount]) => `${resource}: ${formatNumber(amount)}`).join(" | "));
  }
  if (entry.reward.items.length > 0) {
    lines.push(entry.reward.items.map((item) => `${item.itemKey} x${item.quantity}`).join(" | "));
  }
  if (entry.reward.commanderXp > 0) {
    lines.push(`Komutan XP: ${formatNumber(entry.reward.commanderXp)}`);
  }
  if (entry.reward.seasonPassXp > 0) {
    lines.push(`Sezon XP: ${formatNumber(entry.reward.seasonPassXp)}`);
  }
  return lines;
}

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
  return (
    <BottomSheet
      open={open}
      title={`${copy.mailbox.title} | ${formatNumber(unreadCount)} ${copy.hud.unread}`}
      onClose={onClose}
      mode="aside"
    >
      {entries.length === 0 ? (
        <EmptyState title={copy.mailbox.title} body={copy.mailbox.empty} />
      ) : (
        <div className={styles.list}>
          {entries.map((entry) => (
            <article key={entry.id} className={styles.entry}>
              <div className={styles.entryHeader}>
                <div>
                  <strong className={styles.entryTitle}>{entry.title}</strong>
                  <p className={styles.entryBody}>{entry.body}</p>
                </div>
                <Badge tone={entry.claimedAt ? "info" : "warning"}>{entry.claimedAt ? "Arsiv" : "Yeni"}</Badge>
              </div>
              <div className={styles.meta}>
                <span>{formatDateTime(entry.createdAt)}</span>
                <span>{entry.kind.replaceAll("_", " ").toLowerCase()}</span>
                {entry.scoutReport ? <span>kesif raporu</span> : null}
              </div>
              {renderRewardLines(entry).length > 0 ? (
                <div className={styles.rewardList}>
                  {renderRewardLines(entry).map((line) => (
                    <span key={line}>{line}</span>
                  ))}
                </div>
              ) : null}
              {entry.scoutReport?.summary ? <p className={styles.entryBody}>{entry.scoutReport.summary}</p> : null}
              {entry.canClaim ? (
                <div className={styles.actionRow}>
                  <Button type="button" variant="primary" size="small" onClick={() => onClaim(entry.id)}>
                    {copy.mailbox.claim}
                  </Button>
                </div>
              ) : null}
            </article>
          ))}
        </div>
      )}
    </BottomSheet>
  );
}
