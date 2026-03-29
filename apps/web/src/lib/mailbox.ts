import type { MailboxEntryView } from "@frontier/shared";

export function getMailboxSectionLabel(entry: MailboxEntryView): string {
  if (entry.kind === "BATTLE_REPORT" || entry.kind === "RALLY_REPORT") {
    return "Battle Alerts";
  }
  if (entry.kind === "SCOUT_REPORT") {
    return "Recon Dispatches";
  }
  if (entry.kind === "PURCHASE_REWARD") {
    return "Trade Warrants";
  }
  return "System Notices";
}

export function getMailboxEntryTone(entry: MailboxEntryView): "info" | "warning" | "success" {
  if (entry.kind === "BATTLE_REPORT" || entry.kind === "RALLY_REPORT") {
    return "warning";
  }
  if (entry.canClaim) {
    return "success";
  }
  return "info";
}

export function groupMailboxEntries(entries: MailboxEntryView[]): Array<[string, MailboxEntryView[]]> {
  const groups = new Map<string, MailboxEntryView[]>();
  for (const entry of entries) {
    const label = getMailboxSectionLabel(entry);
    const current = groups.get(label) ?? [];
    current.push(entry);
    groups.set(label, current);
  }
  return Array.from(groups.entries());
}
