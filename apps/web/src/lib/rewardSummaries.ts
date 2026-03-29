import type { RewardBundleView } from "@frontier/shared";

import { formatNumber } from "./formatters";

export interface RewardLike {
  resources: Record<string, number | undefined>;
  items: Array<{ itemKey: string; quantity: number }>;
  commanderXp: number;
  seasonPassXp: number;
}

export function summarizeRewardLines(reward?: RewardLike | RewardBundleView | null): string[] {
  if (!reward) {
    return [];
  }

  const lines: string[] = [];
  const resourceLine = Object.entries(reward.resources)
    .filter(([, amount]) => Number(amount ?? 0) > 0)
    .map(([resource, amount]) => `${resource}: ${formatNumber(Number(amount ?? 0))}`)
    .join(" | ");

  if (resourceLine) {
    lines.push(resourceLine);
  }
  if (reward.items.length > 0) {
    lines.push(reward.items.map((item) => `${item.itemKey} x${item.quantity}`).join(" | "));
  }
  if (reward.commanderXp > 0) {
    lines.push(`Commander XP: ${formatNumber(reward.commanderXp)}`);
  }
  if (reward.seasonPassXp > 0) {
    lines.push(`Season XP: ${formatNumber(reward.seasonPassXp)}`);
  }
  return lines;
}
