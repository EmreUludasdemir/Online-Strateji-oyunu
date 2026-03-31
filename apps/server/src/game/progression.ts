import type {
  CommanderProgressView,
  CommanderTalentTrack,
  EntitlementView,
  GameEventsResponse,
  InventoryItemView,
  ItemKey,
  ItemUseRequest,
  LeaderboardEntryView,
  MailboxEntryView,
  RewardBundleView,
  ScoutReportView,
  TaskView,
} from "@frontier/shared";
import { COMMANDER_TALENT_LABELS, type LiveEventKey, type ResourceStock } from "@frontier/shared";
import type { Prisma } from "@prisma/client";

import { HttpError } from "../lib/http";
import { prisma } from "../lib/prisma";
import {
  buildCommanderPresetLabel,
  buildStoreCatalog,
  COMMANDER_TEMPLATES,
  getCurrentDailyKey,
  getItemTemplate,
  getLiveEventTemplate,
  getStoreProduct,
  getTaskTemplate,
  getTaskTemplates,
  LIVE_EVENT_TEMPLATES,
  SEASON_PASS_KEY,
  SEASON_PASS_LABEL,
  SEASON_PASS_TIERS,
  STORE_OFFERS,
} from "./content";
import { addResources } from "./engine";
import { getPrimaryCommander, getResourceLedger, loadCityStateRecordOrThrow, mapCommanderViews, resourceLedgerToCityUpdate } from "./shared";

const XP_PER_LEVEL_BASE = 80;
const XP_PER_LEVEL_STEP = 35;

const COMMANDER_SKILL_BLUEPRINT: Record<
  CommanderTalentTrack,
  Array<{
    id: string;
    label: string;
    description: string;
    tier: number;
    lane: number;
    icon: string;
    requiredPoints: number;
    bonusLabel: string;
  }>
> = {
  CONQUEST: [
    {
      id: "spearhead",
      label: "Spearhead",
      description: "Sharpens the first impact of assault marches.",
      tier: 1,
      lane: 0,
      icon: "sword",
      requiredPoints: 0,
      bonusLabel: "+4% opening attack",
    },
    {
      id: "war-drum",
      label: "War Drum",
      description: "Keeps infantry pressure steady after first contact.",
      tier: 1,
      lane: 1,
      icon: "drum",
      requiredPoints: 1,
      bonusLabel: "+3% infantry pressure",
    },
    {
      id: "banner-push",
      label: "Banner Push",
      description: "Turns allied pressure into faster march tempo.",
      tier: 2,
      lane: 0,
      icon: "banner",
      requiredPoints: 2,
      bonusLabel: "+3% march tempo",
    },
    {
      id: "iron-surge",
      label: "Iron Surge",
      description: "Adds a strong late-fight assault spike.",
      tier: 2,
      lane: 1,
      icon: "shield",
      requiredPoints: 4,
      bonusLabel: "+5% assault power",
    },
    {
      id: "breach-order",
      label: "Breach Order",
      description: "Cracks fortified defenders during staged assaults.",
      tier: 3,
      lane: 0,
      icon: "gate",
      requiredPoints: 6,
      bonusLabel: "+4% vs defenses",
    },
    {
      id: "imperial-slam",
      label: "Imperial Slam",
      description: "Final doctrine burst for decisive breakthrough windows.",
      tier: 3,
      lane: 1,
      icon: "crown",
      requiredPoints: 8,
      bonusLabel: "+6% decisive damage",
    },
  ],
  PEACEKEEPING: [
    {
      id: "front-watch",
      label: "Front Watch",
      description: "Raises guard efficiency against roaming threats.",
      tier: 1,
      lane: 0,
      icon: "watch",
      requiredPoints: 0,
      bonusLabel: "+4% guard defense",
    },
    {
      id: "steady-ranks",
      label: "Steady Ranks",
      description: "Reduces troop collapse under barbarian pressure.",
      tier: 1,
      lane: 1,
      icon: "shield",
      requiredPoints: 1,
      bonusLabel: "+3% battle steadiness",
    },
    {
      id: "warden-step",
      label: "Warden Step",
      description: "Improves pursuit speed between frontier fights.",
      tier: 2,
      lane: 0,
      icon: "hoof",
      requiredPoints: 2,
      bonusLabel: "+3% pursuit speed",
    },
    {
      id: "ember-aegis",
      label: "Ember Aegis",
      description: "Bolsters defenses when staging around camps or cities.",
      tier: 2,
      lane: 1,
      icon: "tower",
      requiredPoints: 4,
      bonusLabel: "+5% staging defense",
    },
    {
      id: "guardian-circle",
      label: "Guardian Circle",
      description: "Improves allied survivability in shared battle windows.",
      tier: 3,
      lane: 0,
      icon: "ring",
      requiredPoints: 6,
      bonusLabel: "+4% ally support",
    },
    {
      id: "trucebreaker",
      label: "Trucebreaker",
      description: "Converts patient defense into clean counter pressure.",
      tier: 3,
      lane: 1,
      icon: "flame",
      requiredPoints: 8,
      bonusLabel: "+6% counter strike",
    },
  ],
  GATHERING: [
    {
      id: "caravan-step",
      label: "Caravan Step",
      description: "Speeds up first-leg travel toward distant nodes.",
      tier: 1,
      lane: 0,
      icon: "hoof",
      requiredPoints: 0,
      bonusLabel: "+4% march speed",
    },
    {
      id: "supply-ledger",
      label: "Supply Ledger",
      description: "Improves resource accounting and carry efficiency.",
      tier: 1,
      lane: 1,
      icon: "ledger",
      requiredPoints: 1,
      bonusLabel: "+6% carry load",
    },
    {
      id: "ore-reading",
      label: "Ore Reading",
      description: "Finds the richest extraction seams sooner.",
      tier: 2,
      lane: 0,
      icon: "gem",
      requiredPoints: 2,
      bonusLabel: "+4% node yield",
    },
    {
      id: "quiet-column",
      label: "Quiet Column",
      description: "Makes gathering lines harder to disrupt in the field.",
      tier: 2,
      lane: 1,
      icon: "veil",
      requiredPoints: 4,
      bonusLabel: "+3% route concealment",
    },
    {
      id: "harvest-burst",
      label: "Harvest Burst",
      description: "Accelerates the final loading cycle before return.",
      tier: 3,
      lane: 0,
      icon: "grain",
      requiredPoints: 6,
      bonusLabel: "+5% load speed",
    },
    {
      id: "golden-route",
      label: "Golden Route",
      description: "Turns efficient gathering into strategic treasury growth.",
      tier: 3,
      lane: 1,
      icon: "coin",
      requiredPoints: 8,
      bonusLabel: "+6% return value",
    },
  ],
};

function mapRewardBundle(value: Prisma.JsonValue | null): RewardBundleView | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const entry = value as Record<string, unknown>;
  return {
    resources: (entry.resources as RewardBundleView["resources"]) ?? {},
    items: (entry.items as RewardBundleView["items"]) ?? [],
    commanderXp: Number(entry.commanderXp ?? 0),
    seasonPassXp: Number(entry.seasonPassXp ?? 0),
  };
}

function rewardToJson(reward: RewardBundleView | null): Prisma.InputJsonValue | undefined {
  if (!reward) {
    return undefined;
  }

  return reward as unknown as Prisma.InputJsonValue;
}

function getCommanderBonusDelta(level: number, starLevel: number, talentTrack: CommanderTalentTrack, talentPoints: number) {
  const levelDelta = Math.max(0, level - 1);
  const starDelta = Math.max(0, starLevel - 1);
  const trackAttack =
    talentTrack === "CONQUEST" ? talentPoints * 0.008 : talentTrack === "PEACEKEEPING" ? talentPoints * 0.004 : talentPoints * 0.003;
  const trackDefense =
    talentTrack === "PEACEKEEPING" ? talentPoints * 0.008 : talentTrack === "CONQUEST" ? talentPoints * 0.004 : talentPoints * 0.003;
  const trackSpeed =
    talentTrack === "GATHERING" ? talentPoints * 0.006 : talentTrack === "PEACEKEEPING" ? talentPoints * 0.002 : talentPoints * 0.003;
  const trackCarry =
    talentTrack === "GATHERING" ? talentPoints * 0.01 : talentTrack === "CONQUEST" ? talentPoints * 0.002 : talentPoints * 0.004;

  return {
    attackBonus: levelDelta * 0.004 + starDelta * 0.015 + trackAttack,
    defenseBonus: levelDelta * 0.003 + starDelta * 0.015 + trackDefense,
    marchSpeedBonus: levelDelta * 0.002 + starDelta * 0.008 + trackSpeed,
    carryBonus: levelDelta * 0.004 + starDelta * 0.012 + trackCarry,
  };
}

function getCommanderStats(templateKey: string, level: number, starLevel: number, talentTrack: CommanderTalentTrack, talentPoints: number) {
  const template = COMMANDER_TEMPLATES.find((entry) => entry.key === templateKey);
  if (!template) {
    throw new HttpError(500, "COMMANDER_TEMPLATE_MISSING", "The commander template could not be found.");
  }

  const delta = getCommanderBonusDelta(level, starLevel, talentTrack, talentPoints);
  return {
    attackBonus: Number((template.attackBonus + delta.attackBonus).toFixed(4)),
    defenseBonus: Number((template.defenseBonus + delta.defenseBonus).toFixed(4)),
    marchSpeedBonus: Number((template.marchSpeedBonus + delta.marchSpeedBonus).toFixed(4)),
    carryBonus: Number((template.carryBonus + delta.carryBonus).toFixed(4)),
  };
}

export function getCommanderXpRequirement(level: number): number {
  return XP_PER_LEVEL_BASE + Math.max(0, level - 1) * XP_PER_LEVEL_STEP;
}

function getCommanderTotalTalentPoints(level: number, starLevel: number) {
  return Math.max(0, level - 1) + Math.max(0, starLevel - 1) * 2;
}

function buildCommanderSkillTree(
  track: CommanderTalentTrack,
  level: number,
  starLevel: number,
  talentPointsSpent: number,
  assignedSkills: string[] = []
) {
  const totalPoints = getCommanderTotalTalentPoints(level, starLevel);
  const availablePoints = Math.max(0, totalPoints - talentPointsSpent);
  const blueprint = COMMANDER_SKILL_BLUEPRINT[track];

  return {
    track,
    trackLabel: COMMANDER_TALENT_LABELS[track],
    availablePoints,
    nodes: blueprint.map((node) => ({
      ...node,
      unlocked: totalPoints >= node.requiredPoints,
      active: assignedSkills.includes(node.id),
    })),
    links: blueprint.slice(1).map((node, index) => ({
      from: blueprint[index].id,
      to: node.id,
    })),
  };
}

/**
 * Get skill node from blueprint
 */
export function getSkillNode(track: CommanderTalentTrack, skillId: string) {
  const blueprint = COMMANDER_SKILL_BLUEPRINT[track];
  return blueprint.find((node) => node.id === skillId);
}

/**
 * Validate if a skill can be assigned
 */
export function canAssignSkill(
  track: CommanderTalentTrack,
  level: number,
  starLevel: number,
  assignedSkills: string[],
  skillId: string
): { valid: boolean; reason?: string } {
  const node = getSkillNode(track, skillId);
  if (!node) {
    return { valid: false, reason: "Skill not found in track" };
  }

  const totalPoints = getCommanderTotalTalentPoints(level, starLevel);
  if (totalPoints < node.requiredPoints) {
    return { valid: false, reason: "Not enough total points to unlock this skill" };
  }

  if (assignedSkills.includes(skillId)) {
    return { valid: false, reason: "Skill already assigned" };
  }

  const maxSkills = COMMANDER_SKILL_BLUEPRINT[track].length;
  if (assignedSkills.length >= maxSkills) {
    return { valid: false, reason: "Maximum skills reached" };
  }

  // Check if used points would exceed available
  if (assignedSkills.length >= totalPoints) {
    return { valid: false, reason: "No available talent points" };
  }

  return { valid: true };
}

/**
 * Validate if a skill can be unassigned
 */
export function canUnassignSkill(
  assignedSkills: string[],
  skillId: string
): { valid: boolean; reason?: string } {
  if (!assignedSkills.includes(skillId)) {
    return { valid: false, reason: "Skill not currently assigned" };
  }

  return { valid: true };
}

/**
 * Calculate stat bonuses from assigned skills
 */
function getAssignedSkillsBonuses(track: CommanderTalentTrack, assignedSkills: string[]) {
  const numAssigned = assignedSkills.length;
  
  // Bonuses scale with number of assigned skills
  const trackAttack =
    track === "CONQUEST" ? numAssigned * 0.008 : track === "PEACEKEEPING" ? numAssigned * 0.004 : numAssigned * 0.003;
  const trackDefense =
    track === "PEACEKEEPING" ? numAssigned * 0.008 : track === "CONQUEST" ? numAssigned * 0.004 : numAssigned * 0.003;
  const trackSpeed =
    track === "GATHERING" ? numAssigned * 0.006 : track === "PEACEKEEPING" ? numAssigned * 0.002 : numAssigned * 0.003;
  const trackCarry =
    track === "GATHERING" ? numAssigned * 0.01 : track === "CONQUEST" ? numAssigned * 0.002 : numAssigned * 0.004;

  return { trackAttack, trackDefense, trackSpeed, trackCarry };
}

/**
 * Get commander bonuses from level, stars, and assigned skills
 */
function getCommanderBonusDeltaWithSkills(
  level: number,
  starLevel: number,
  talentTrack: CommanderTalentTrack,
  assignedSkills: string[]
) {
  const levelDelta = Math.max(0, level - 1);
  const starDelta = Math.max(0, starLevel - 1);
  const skillBonuses = getAssignedSkillsBonuses(talentTrack, assignedSkills);

  return {
    attackBonus: levelDelta * 0.004 + starDelta * 0.015 + skillBonuses.trackAttack,
    defenseBonus: levelDelta * 0.003 + starDelta * 0.015 + skillBonuses.trackDefense,
    marchSpeedBonus: levelDelta * 0.002 + starDelta * 0.008 + skillBonuses.trackSpeed,
    carryBonus: levelDelta * 0.004 + starDelta * 0.012 + skillBonuses.trackCarry,
  };
}

/**
 * Recalculate commander stats with assigned skills
 */
export function getCommanderStatsWithSkills(
  templateKey: string,
  level: number,
  starLevel: number,
  talentTrack: CommanderTalentTrack,
  assignedSkills: string[]
) {
  const template = COMMANDER_TEMPLATES.find((entry) => entry.key === templateKey);
  if (!template) {
    throw new HttpError(500, "COMMANDER_TEMPLATE_MISSING", "The commander template could not be found.");
  }

  const delta = getCommanderBonusDeltaWithSkills(level, starLevel, talentTrack, assignedSkills);
  return {
    attackBonus: Number((template.attackBonus + delta.attackBonus).toFixed(4)),
    defenseBonus: Number((template.defenseBonus + delta.defenseBonus).toFixed(4)),
    marchSpeedBonus: Number((template.marchSpeedBonus + delta.marchSpeedBonus).toFixed(4)),
    carryBonus: Number((template.carryBonus + delta.carryBonus).toFixed(4)),
  };
}

async function getPlayerCityIdTx(tx: Prisma.TransactionClient, userId: string): Promise<string> {
  const user = await tx.user.findUnique({
    where: { id: userId },
    select: {
      city: {
        select: {
          id: true,
        },
      },
    },
  });
  if (!user?.city) {
    throw new HttpError(404, "CITY_NOT_FOUND", "The current user does not have a city.");
  }
  return user.city.id;
}

async function upsertInventoryItemTx(tx: Prisma.TransactionClient, userId: string, itemKey: ItemKey, quantity: number) {
  if (quantity <= 0) {
    return;
  }

  await tx.inventoryItem.upsert({
    where: {
      userId_itemKey: {
        userId,
        itemKey,
      },
    },
    create: {
      userId,
      itemKey,
      quantity,
    },
    update: {
      quantity: {
        increment: quantity,
      },
    },
  });
}

async function decrementInventoryItemTx(tx: Prisma.TransactionClient, userId: string, itemKey: ItemKey, quantity: number) {
  const item = await tx.inventoryItem.findUnique({
    where: {
      userId_itemKey: {
        userId,
        itemKey,
      },
    },
  });

  if (!item || item.quantity < quantity) {
    throw new HttpError(409, "ITEM_NOT_AVAILABLE", "The requested item is not available in inventory.");
  }

  await tx.inventoryItem.update({
    where: {
      userId_itemKey: {
        userId,
        itemKey,
      },
    },
    data: {
      quantity: item.quantity - quantity,
    },
  });
}

export async function createMailboxEntryTx(
  tx: Prisma.TransactionClient,
  options: {
    userId: string;
    kind: MailboxEntryView["kind"];
    title: string;
    body: string;
    reward?: RewardBundleView | null;
    scoutReportId?: string | null;
  },
) {
  await tx.mailboxEntry.create({
    data: {
      userId: options.userId,
      kind: options.kind,
      title: options.title,
      body: options.body,
      reward: rewardToJson(options.reward ?? null),
      scoutReportId: options.scoutReportId ?? null,
    },
  });
}

async function ensureSeasonPassRowTx(tx: Prisma.TransactionClient, userId: string) {
  await tx.seasonPassProgress.upsert({
    where: {
      userId_seasonKey: {
        userId,
        seasonKey: SEASON_PASS_KEY,
      },
    },
    create: {
      userId,
      seasonKey: SEASON_PASS_KEY,
    },
    update: {},
  });
}

async function ensureEventRowsTx(tx: Prisma.TransactionClient, userId: string) {
  for (const event of LIVE_EVENT_TEMPLATES) {
    await tx.liveEventScore.upsert({
      where: {
        userId_eventKey: {
          userId,
          eventKey: event.key,
        },
      },
      create: {
        userId,
        eventKey: event.key,
      },
      update: {},
    });
  }
}

function taskCycleKey(kind: TaskView["kind"], now: Date): string {
  return kind === "DAILY" ? getCurrentDailyKey(now) : "permanent";
}

export async function ensureRetentionStateTx(tx: Prisma.TransactionClient, userId: string, now: Date = new Date()) {
  await tx.tutorialProgress.upsert({
    where: { userId },
    create: { userId },
    update: {},
  });

  for (const template of getTaskTemplates()) {
    await tx.playerTask.upsert({
      where: {
        userId_taskKey_cycleKey: {
          userId,
          taskKey: template.key,
          cycleKey: taskCycleKey(template.kind, now),
        },
      },
      create: {
        userId,
        taskKey: template.key,
        kind: template.kind,
        title: template.title,
        description: template.description,
        target: template.target,
        cycleKey: taskCycleKey(template.kind, now),
      },
      update: {},
    });
  }

  await ensureSeasonPassRowTx(tx, userId);
  await ensureEventRowsTx(tx, userId);
}

export async function ensureCommanderCollectionTx(tx: Prisma.TransactionClient, userId: string, username: string) {
  const existing = await tx.commander.findMany({
    where: { userId },
    select: { templateKey: true },
  });
  const existingKeys = new Set(existing.map((entry) => entry.templateKey));

  for (const template of COMMANDER_TEMPLATES) {
    if (existingKeys.has(template.key)) {
      continue;
    }

    const stats = getCommanderStats(template.key, 1, 1, template.track, 0);
    await tx.commander.create({
      data: {
        userId,
        name: template.isPrimary ? `${username} ${template.name}` : template.name,
        templateKey: template.key,
        level: 1,
        xp: 0,
        starLevel: 1,
        talentTrack: template.track,
        talentPointsSpent: 0,
        assignedPreset: buildCommanderPresetLabel(template.track),
        attackBonus: stats.attackBonus,
        defenseBonus: stats.defenseBonus,
        marchSpeedBonus: stats.marchSpeedBonus,
        carryBonus: stats.carryBonus,
        isPrimary: template.isPrimary ?? false,
      },
    });
  }
}

async function syncTutorialProgressTx(tx: Prisma.TransactionClient, userId: string, now: Date) {
  const tutorialTasks = await tx.playerTask.findMany({
    where: {
      userId,
      kind: "TUTORIAL",
      cycleKey: "permanent",
    },
    orderBy: { createdAt: "asc" },
  });

  const completedCount = tutorialTasks.filter((task) => task.completedAt != null).length;
  const allCompleted = tutorialTasks.length > 0 && tutorialTasks.every((task) => task.completedAt != null);

  await tx.tutorialProgress.upsert({
    where: { userId },
    create: {
      userId,
      currentStep: completedCount,
      completedAt: allCompleted ? now : null,
    },
    update: {
      currentStep: completedCount,
      completedAt: allCompleted ? now : null,
    },
  });
}

async function autoGrantSeasonPassRewardsTx(tx: Prisma.TransactionClient, userId: string) {
  const season = await tx.seasonPassProgress.findUniqueOrThrow({
    where: {
      userId_seasonKey: {
        userId,
        seasonKey: SEASON_PASS_KEY,
      },
    },
  });

  for (const tier of SEASON_PASS_TIERS) {
    if (season.xp < tier.requiredXp || season.claimedFreeTiers.includes(tier.tier)) {
      continue;
    }

    await tx.seasonPassProgress.update({
      where: { id: season.id },
      data: {
        claimedFreeTiers: [...season.claimedFreeTiers, tier.tier],
      },
    });

    await createMailboxEntryTx(tx, {
      userId,
      kind: "SYSTEM_REWARD",
      title: `${SEASON_PASS_LABEL} free tier ${tier.tier}`,
      body: "A free season pass reward has been deposited.",
      reward: tier.freeReward,
    });
  }

  const refreshed = await tx.seasonPassProgress.findUniqueOrThrow({
    where: {
      userId_seasonKey: {
        userId,
        seasonKey: SEASON_PASS_KEY,
      },
    },
  });

  if (!refreshed.premiumUnlocked) {
    return;
  }

  for (const tier of SEASON_PASS_TIERS) {
    if (refreshed.xp < tier.requiredXp || !tier.premiumReward || refreshed.claimedPremiumTiers.includes(tier.tier)) {
      continue;
    }

    await tx.seasonPassProgress.update({
      where: { id: refreshed.id },
      data: {
        claimedPremiumTiers: [...refreshed.claimedPremiumTiers, tier.tier],
      },
    });

    await createMailboxEntryTx(tx, {
      userId,
      kind: "PURCHASE_REWARD",
      title: `${SEASON_PASS_LABEL} premium tier ${tier.tier}`,
      body: "A premium season pass reward has been deposited.",
      reward: tier.premiumReward,
    });
  }
}

async function autoGrantLiveEventRewardsTx(tx: Prisma.TransactionClient, userId: string) {
  const scores = await tx.liveEventScore.findMany({
    where: { userId },
  });

  for (const row of scores) {
    const template = getLiveEventTemplate(row.eventKey as LiveEventKey);
    if (row.score < template.target || row.claimedRewardTiers.includes(1)) {
      continue;
    }

    await tx.liveEventScore.update({
      where: { id: row.id },
      data: {
        claimedRewardTiers: [...row.claimedRewardTiers, 1],
      },
    });

    await createMailboxEntryTx(tx, {
      userId,
      kind: "SYSTEM_REWARD",
      title: `${template.label} reward`,
      body: "An event threshold reward has been deposited.",
      reward: template.reward,
    });
  }
}

export async function grantRewardBundleTx(
  tx: Prisma.TransactionClient,
  userId: string,
  reward: RewardBundleView,
  now: Date,
  options?: {
    cityId?: string;
    commanderId?: string | null;
    mailboxKind?: MailboxEntryView["kind"];
    mailboxTitle?: string;
    mailboxBody?: string;
  },
) {
  if ((reward.resources.wood ?? 0) > 0 || (reward.resources.stone ?? 0) > 0 || (reward.resources.food ?? 0) > 0 || (reward.resources.gold ?? 0) > 0) {
    const city = await loadCityStateRecordOrThrow(tx, options?.cityId ?? (await getPlayerCityIdTx(tx, userId)));
    const nextResources = addResources(getResourceLedger(city), {
      wood: reward.resources.wood ?? 0,
      stone: reward.resources.stone ?? 0,
      food: reward.resources.food ?? 0,
      gold: reward.resources.gold ?? 0,
    });
    await tx.city.update({
      where: { id: city.id },
      data: resourceLedgerToCityUpdate(nextResources, now),
    });
  }

  for (const item of reward.items) {
    await upsertInventoryItemTx(tx, userId, item.itemKey, item.quantity);
  }

  if (reward.commanderXp > 0) {
    const commander = options?.commanderId
      ? await tx.commander.findUnique({
          where: { id: options.commanderId },
        })
      : await tx.commander.findFirst({
          where: { userId, isPrimary: true },
          orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
        });

    if (commander) {
      await tx.commander.update({
        where: { id: commander.id },
        data: {
          xp: {
            increment: reward.commanderXp,
          },
        },
      });
    }
  }

  if (reward.seasonPassXp > 0) {
    await ensureSeasonPassRowTx(tx, userId);
    const season = await tx.seasonPassProgress.findUniqueOrThrow({
      where: {
        userId_seasonKey: {
          userId,
          seasonKey: SEASON_PASS_KEY,
        },
      },
    });
    await tx.seasonPassProgress.update({
      where: { id: season.id },
      data: {
        xp: season.xp + reward.seasonPassXp,
      },
    });
    await autoGrantSeasonPassRewardsTx(tx, userId);
  }

  if (options?.mailboxKind && options.mailboxTitle && options.mailboxBody) {
    await createMailboxEntryTx(tx, {
      userId,
      kind: options.mailboxKind,
      title: options.mailboxTitle,
      body: options.mailboxBody,
      reward,
    });
  }
}

export async function progressGameTriggerTx(
  tx: Prisma.TransactionClient,
  userId: string,
  trigger: string,
  value: number,
  now: Date = new Date(),
) {
  await ensureRetentionStateTx(tx, userId, now);

  const taskRows = await tx.playerTask.findMany({
    where: {
      userId,
      OR: [{ cycleKey: "permanent" }, { cycleKey: getCurrentDailyKey(now) }],
      claimedAt: null,
    },
  });

  for (const task of taskRows) {
    const template = getTaskTemplate(task.taskKey);
    if (template.trigger !== trigger) {
      continue;
    }

    const nextProgress = Math.min(task.target, task.progress + value);
    await tx.playerTask.update({
      where: { id: task.id },
      data: {
        progress: nextProgress,
        completedAt: nextProgress >= task.target ? task.completedAt ?? now : task.completedAt,
      },
    });
  }

  const liveEventKey =
    trigger === "power_gain" ? "POWER_SPRINT" : trigger === "barbarian_battle_won" ? "BARBARIAN_HUNT" : trigger === "gather_score" ? "GATHERING_RUSH" : null;
  if (liveEventKey) {
    const row = await tx.liveEventScore.findUnique({
      where: {
        userId_eventKey: {
          userId,
          eventKey: liveEventKey,
        },
      },
    });
    if (row) {
      await tx.liveEventScore.update({
        where: { id: row.id },
        data: {
          score: row.score + value,
        },
      });
    }
  }

  await syncTutorialProgressTx(tx, userId, now);
  await autoGrantLiveEventRewardsTx(tx, userId);
}

export async function getTasksViewTx(tx: Prisma.TransactionClient, userId: string, now: Date = new Date()) {
  await ensureRetentionStateTx(tx, userId, now);
  const taskRows = await tx.playerTask.findMany({
    where: {
      userId,
      OR: [{ cycleKey: "permanent" }, { cycleKey: getCurrentDailyKey(now) }],
    },
    orderBy: [{ kind: "asc" }, { createdAt: "asc" }],
  });
  const tutorialProgress = await tx.tutorialProgress.findUnique({ where: { userId } });

  const mapped = taskRows.map<TaskView>((task) => ({
    id: task.id,
    taskKey: task.taskKey,
    kind: task.kind,
    title: task.title,
    description: task.description,
    progress: task.progress,
    target: task.target,
    isCompleted: task.completedAt != null,
    isClaimed: task.claimedAt != null,
    reward: getTaskTemplate(task.taskKey).reward,
    completedAt: task.completedAt?.toISOString() ?? null,
    claimedAt: task.claimedAt?.toISOString() ?? null,
  }));

  return {
    tutorial: mapped.filter((task) => task.kind === "TUTORIAL"),
    daily: mapped.filter((task) => task.kind === "DAILY"),
    tutorialCompleted: tutorialProgress?.completedAt != null,
    dailyKey: getCurrentDailyKey(now),
  };
}

export async function claimTaskTx(tx: Prisma.TransactionClient, userId: string, taskId: string, now: Date = new Date()) {
  await ensureRetentionStateTx(tx, userId, now);
  const task = await tx.playerTask.findFirst({
    where: {
      id: taskId,
      userId,
    },
  });
  if (!task) {
    throw new HttpError(404, "TASK_NOT_FOUND", "That task was not found.");
  }
  if (!task.completedAt) {
    throw new HttpError(409, "TASK_NOT_COMPLETED", "That task is not complete yet.");
  }
  if (task.claimedAt) {
    throw new HttpError(409, "TASK_ALREADY_CLAIMED", "That task reward has already been claimed.");
  }

  await tx.playerTask.update({
    where: { id: task.id },
    data: {
      claimedAt: now,
    },
  });

  await grantRewardBundleTx(tx, userId, getTaskTemplate(task.taskKey).reward, now, {
    mailboxKind: "SYSTEM_REWARD",
    mailboxTitle: task.title,
    mailboxBody: "A task reward has been issued to your inventory and city stores.",
  });
}

export async function getInventoryViewTx(tx: Prisma.TransactionClient, userId: string): Promise<InventoryItemView[]> {
  const items = await tx.inventoryItem.findMany({
    where: {
      userId,
      quantity: {
        gt: 0,
      },
    },
    orderBy: [{ updatedAt: "desc" }, { itemKey: "asc" }],
  });

  return items.map((item) => {
    const template = getItemTemplate(item.itemKey as ItemKey);
    return {
      itemKey: item.itemKey as ItemKey,
      label: template.label,
      description: template.description,
      quantity: item.quantity,
    };
  });
}

export async function useInventoryItemTx(tx: Prisma.TransactionClient, userId: string, payload: ItemUseRequest, now: Date = new Date()) {
  const template = getItemTemplate(payload.itemKey);
  const cityId = await getPlayerCityIdTx(tx, userId);

  await decrementInventoryItemTx(tx, userId, payload.itemKey, 1);

  if (template.kind === "RESOURCE_CHEST") {
    const city = await loadCityStateRecordOrThrow(tx, cityId);
    const amount = template.resourceAmount ?? 0;
    const nextResources = addResources(getResourceLedger(city), {
      wood: amount,
      stone: amount,
      food: amount,
      gold: Math.floor(amount * 0.6),
    });
    await tx.city.update({
      where: { id: city.id },
      data: resourceLedgerToCityUpdate(nextResources, now),
    });
    return;
  }

  if (template.kind === "COMMANDER_XP") {
    const commanderId =
      payload.targetId ??
      getPrimaryCommander(await loadCityStateRecordOrThrow(tx, cityId))?.id;

    if (!commanderId) {
      throw new HttpError(404, "COMMANDER_NOT_FOUND", "A target commander is required for this item.");
    }

    await tx.commander.update({
      where: { id: commanderId },
      data: {
        xp: {
          increment: template.commanderXp ?? 0,
        },
      },
    });
    return;
  }

  if (template.kind === "BUFF") {
    await tx.city.update({
      where: { id: cityId },
      data: {
        peaceShieldUntil: new Date(now.getTime() + (template.durationMs ?? 0)),
      },
    });
    return;
  }

  const durationMs = template.durationMs ?? 0;
  const activeUpgrade = await tx.buildingUpgrade.findFirst({
    where: { cityId, status: "ACTIVE" },
    orderBy: { completesAt: "asc" },
  });
  const activeTraining = await tx.troopTrainingQueue.findFirst({
    where: { cityId, status: "ACTIVE" },
    orderBy: { completesAt: "asc" },
  });
  const activeResearch = await tx.researchQueue.findFirst({
    where: { cityId, status: "ACTIVE" },
    orderBy: { completesAt: "asc" },
  });

  if (payload.targetKind === "BUILDING_UPGRADE" || (!payload.targetKind && payload.itemKey === "UNIVERSAL_SPEEDUP_5M")) {
    if (activeUpgrade) {
      await tx.buildingUpgrade.update({
        where: { id: activeUpgrade.id },
        data: {
          completesAt: new Date(Math.max(now.getTime(), activeUpgrade.completesAt.getTime() - durationMs)),
        },
      });
      return;
    }
  }

  if (payload.targetKind === "TRAINING" || payload.itemKey === "TRAINING_SPEEDUP_5M" || payload.itemKey === "UNIVERSAL_SPEEDUP_5M") {
    if (activeTraining) {
      await tx.troopTrainingQueue.update({
        where: { id: activeTraining.id },
        data: {
          completesAt: new Date(Math.max(now.getTime(), activeTraining.completesAt.getTime() - durationMs)),
        },
      });
      return;
    }
  }

  if (payload.targetKind === "RESEARCH" || payload.itemKey === "RESEARCH_SPEEDUP_5M" || payload.itemKey === "UNIVERSAL_SPEEDUP_5M") {
    if (activeResearch) {
      await tx.researchQueue.update({
        where: { id: activeResearch.id },
        data: {
          completesAt: new Date(Math.max(now.getTime(), activeResearch.completesAt.getTime() - durationMs)),
        },
      });
      return;
    }
  }

  throw new HttpError(409, "ITEM_TARGET_INVALID", "That item could not find a valid active target.");
}

export async function upgradeCommanderTx(tx: Prisma.TransactionClient, userId: string, commanderId: string, now: Date = new Date()) {
  const cityId = await getPlayerCityIdTx(tx, userId);
  const [commander, city] = await Promise.all([
    tx.commander.findFirst({
      where: {
        id: commanderId,
        userId,
      },
    }),
    loadCityStateRecordOrThrow(tx, cityId),
  ]);

  if (!commander) {
    throw new HttpError(404, "COMMANDER_NOT_FOUND", "That commander is not available to the current player.");
  }

  const xpRequired = getCommanderXpRequirement(commander.level);
  if (commander.xp < xpRequired) {
    throw new HttpError(409, "COMMANDER_XP_INSUFFICIENT", "That commander does not have enough experience to upgrade.");
  }

  const goldCost = 30 + commander.level * 20;
  const resources = getResourceLedger(city);
  if ((resources.gold ?? 0) < goldCost) {
    throw new HttpError(409, "INSUFFICIENT_GOLD", "Not enough gold is available for commander advancement.");
  }

  const nextLevel = commander.level + 1;
  const nextStarLevel = 1 + Math.floor(Math.max(0, nextLevel - 1) / 5);
  const nextTalentPoints = commander.talentPointsSpent + 1;
  const nextStats = getCommanderStats(commander.templateKey, nextLevel, nextStarLevel, commander.talentTrack, nextTalentPoints);

  await tx.commander.update({
    where: { id: commander.id },
    data: {
      xp: commander.xp - xpRequired,
      level: nextLevel,
      starLevel: nextStarLevel,
      talentPointsSpent: nextTalentPoints,
      attackBonus: nextStats.attackBonus,
      defenseBonus: nextStats.defenseBonus,
      marchSpeedBonus: nextStats.marchSpeedBonus,
      carryBonus: nextStats.carryBonus,
    },
  });

  await tx.city.update({
    where: { id: city.id },
    data: resourceLedgerToCityUpdate(
      {
        ...resources,
        gold: Math.max(0, resources.gold - goldCost),
      } as ResourceStock,
      now,
    ),
  });

  await progressGameTriggerTx(tx, userId, "power_gain", 10, now);
}

export async function getCommanderProgressViewTx(tx: Prisma.TransactionClient, userId: string): Promise<CommanderProgressView[]> {
  const cityId = await getPlayerCityIdTx(tx, userId);
  const city = await loadCityStateRecordOrThrow(tx, cityId);
  return mapCommanderViews(city).map<CommanderProgressView>((commander) => ({
    ...commander,
    totalPowerScore:
      commander.attackBonusPct +
      commander.defenseBonusPct +
      commander.marchSpeedBonusPct +
      commander.carryBonusPct +
      commander.level * 6 +
      commander.starLevel * 12,
    xpForCurrentLevel: commander.xp,
    xpForNextLevel: commander.xp + commander.xpToNextLevel,
    talentPointsAvailable: Math.max(
      0,
      getCommanderTotalTalentPoints(commander.level, commander.starLevel) - commander.assignedSkills.length,
    ),
    skillTree: buildCommanderSkillTree(
      commander.talentTrack,
      commander.level,
      commander.starLevel,
      commander.assignedSkills.length,
      commander.assignedSkills,
    ),
  }));
}

export async function getMailboxViewTx(tx: Prisma.TransactionClient, userId: string): Promise<{ entries: MailboxEntryView[]; unreadCount: number }> {
  const entries = await tx.mailboxEntry.findMany({
    where: { userId },
    include: {
      scoutReport: true,
    },
    orderBy: { createdAt: "desc" },
    take: 30,
  });

  return {
    entries: entries.map((entry) => ({
      id: entry.id,
      kind: entry.kind,
      title: entry.title,
      body: entry.body,
      createdAt: entry.createdAt.toISOString(),
      claimedAt: entry.claimedAt?.toISOString() ?? null,
      canClaim: entry.claimedAt == null && mapRewardBundle(entry.reward) != null,
      reward: mapRewardBundle(entry.reward),
      scoutReport: entry.scoutReport
        ? {
            id: entry.scoutReport.id,
            targetKind: entry.scoutReport.targetKind,
            createdAt: entry.scoutReport.createdAt.toISOString(),
            title: entry.scoutReport.title,
            summary: entry.scoutReport.summary,
            cityIntel: ((entry.scoutReport.payload as Record<string, unknown>).cityIntel ?? null) as ScoutReportView["cityIntel"],
            poiIntel: ((entry.scoutReport.payload as Record<string, unknown>).poiIntel ?? null) as ScoutReportView["poiIntel"],
          }
        : null,
    })),
    unreadCount: entries.filter((entry) => entry.claimedAt == null).length,
  };
}

export async function claimMailboxEntryTx(tx: Prisma.TransactionClient, userId: string, mailboxId: string, now: Date = new Date()) {
  const entry = await tx.mailboxEntry.findFirst({
    where: {
      id: mailboxId,
      userId,
    },
  });
  if (!entry) {
    throw new HttpError(404, "MAILBOX_ENTRY_NOT_FOUND", "That mailbox entry could not be found.");
  }
  if (entry.claimedAt) {
    throw new HttpError(409, "MAILBOX_ALREADY_CLAIMED", "That mailbox reward has already been claimed.");
  }

  const reward = mapRewardBundle(entry.reward);
  if (reward) {
    await grantRewardBundleTx(tx, userId, reward, now);
  }

  await tx.mailboxEntry.update({
    where: { id: entry.id },
    data: {
      claimedAt: now,
    },
  });
}

export async function getEventsViewTx(tx: Prisma.TransactionClient, userId: string): Promise<GameEventsResponse> {
  await ensureSeasonPassRowTx(tx, userId);
  await ensureEventRowsTx(tx, userId);

  const [season, events] = await Promise.all([
    tx.seasonPassProgress.findUniqueOrThrow({
      where: {
        userId_seasonKey: {
          userId,
          seasonKey: SEASON_PASS_KEY,
        },
      },
    }),
    tx.liveEventScore.findMany({
      where: {
        userId,
      },
      orderBy: { eventKey: "asc" },
    }),
  ]);

  return {
    seasonPass: {
      seasonKey: SEASON_PASS_KEY,
      label: SEASON_PASS_LABEL,
      xp: season.xp,
      premiumUnlocked: season.premiumUnlocked,
      tiers: SEASON_PASS_TIERS.map((tier) => ({
        tier: tier.tier,
        requiredXp: tier.requiredXp,
        freeReward: tier.freeReward,
        premiumReward: tier.premiumReward,
        claimedFree: season.claimedFreeTiers.includes(tier.tier),
        claimedPremium: season.claimedPremiumTiers.includes(tier.tier),
      })),
    },
    events: LIVE_EVENT_TEMPLATES.map((template) => {
      const score = events.find((entry) => entry.eventKey === template.key);
      return {
        eventKey: template.key,
        label: template.label,
        description: template.description,
        score: score?.score ?? 0,
        target: template.target,
        reward: template.reward,
      };
    }),
  };
}

export async function getLeaderboardTx(tx: Prisma.TransactionClient, leaderboardId: string): Promise<LeaderboardEntryView[]> {
  if (leaderboardId === "alliance_contribution") {
    const contributions = await tx.allianceContribution.findMany({
      include: { user: true },
      orderBy: [{ points: "desc" }, { userId: "asc" }],
      take: 20,
    });
    return contributions.map((entry, index) => ({
      rank: index + 1,
      userId: entry.userId,
      username: entry.user.username,
      value: entry.points,
      secondaryLabel: "alliance points",
    }));
  }

  const rows = await tx.liveEventScore.findMany({
    where: {
      eventKey: leaderboardId,
    },
    include: { user: true },
    orderBy: [{ score: "desc" }, { userId: "asc" }],
    take: 20,
  });

  return rows.map((entry, index) => ({
    rank: index + 1,
    userId: entry.userId,
    username: entry.user.username,
    value: entry.score,
    secondaryLabel: leaderboardId.toLowerCase().replaceAll("_", " "),
  }));
}

export async function getUserSegmentTagsTx(tx: Prisma.TransactionClient, userId: string): Promise<string[]> {
  const [purchaseCount, user, allianceMembership] = await Promise.all([
    tx.purchase.count({
      where: {
        userId,
        status: "VALIDATED",
      },
    }),
    tx.user.findUniqueOrThrow({
      where: { id: userId },
      select: { createdAt: true },
    }),
    tx.allianceMember.findUnique({
      where: { userId },
      select: { id: true },
    }),
  ]);

  return [
    purchaseCount > 0 ? "payer" : "non_payer",
    user.createdAt.getTime() >= Date.now() - 48 * 60 * 60 * 1000 ? "newbie" : "established",
    allianceMembership ? "alliance_active" : "solo",
  ];
}

export async function getStoreCatalogViewTx(_tx: Prisma.TransactionClient) {
  return buildStoreCatalog();
}

export async function getStoreOffersViewTx(tx: Prisma.TransactionClient, userId: string) {
  const segments = await getUserSegmentTagsTx(tx, userId);
  return STORE_OFFERS.filter((offer) => offer.segmentTags.some((segment) => segments.includes(segment))).map((offer) => ({
    offerId: offer.offerId,
    title: offer.title,
    description: offer.description,
    productIds: offer.productIds,
    segmentTags: offer.segmentTags,
  }));
}

export async function getEntitlementsViewTx(tx: Prisma.TransactionClient, userId: string): Promise<EntitlementView[]> {
  const rows = await tx.entitlement.findMany({
    where: { userId },
    orderBy: { grantedAt: "desc" },
  });
  return rows.map((entry) => ({
    id: entry.id,
    entitlementKey: entry.entitlementKey,
    productId: entry.productId,
    status: entry.status,
    grantedAt: entry.grantedAt.toISOString(),
  }));
}

export async function activatePremiumSeasonPassTx(tx: Prisma.TransactionClient, userId: string) {
  await ensureSeasonPassRowTx(tx, userId);
  await tx.seasonPassProgress.update({
    where: {
      userId_seasonKey: {
        userId,
        seasonKey: SEASON_PASS_KEY,
      },
    },
    data: {
      premiumUnlocked: true,
    },
  });
  await autoGrantSeasonPassRewardsTx(tx, userId);
}

export async function grantStoreProductTx(tx: Prisma.TransactionClient, userId: string, productId: string, now: Date = new Date()) {
  const product = getStoreProduct(productId);
  const cityId = await getPlayerCityIdTx(tx, userId);

  await grantRewardBundleTx(tx, userId, product.reward, now, {
    cityId,
    mailboxKind: "PURCHASE_REWARD",
    mailboxTitle: product.label,
    mailboxBody: "Purchase rewards have been deposited into your account.",
  });

  if (product.entitlementKey) {
    await tx.entitlement.upsert({
      where: {
        userId_entitlementKey: {
          userId,
          entitlementKey: product.entitlementKey,
        },
      },
      create: {
        userId,
        entitlementKey: product.entitlementKey,
        productId,
        status: "ACTIVE",
      },
      update: {
        status: "ACTIVE",
      },
    });
  }

  if (productId === "season_pass_premium") {
    await activatePremiumSeasonPassTx(tx, userId);
  }
}

export async function verifySandboxPurchaseToken(tx: Prisma.TransactionClient, userId: string, productId: string, purchaseToken: string, platform: string, now: Date = new Date()) {
  const expectedPrefix = `sandbox:${productId}:`;
  if (!purchaseToken.startsWith(expectedPrefix)) {
    await tx.purchase.create({
      data: {
        userId,
        platform,
        productId,
        purchaseToken,
        rawReceipt: purchaseToken,
        status: "REJECTED",
      },
    });
    throw new HttpError(400, "PURCHASE_INVALID", "The sandbox purchase token is invalid.");
  }

  const existing = await tx.purchase.findUnique({
    where: {
      purchaseToken,
    },
  });

  if (existing) {
    return "DUPLICATE" as const;
  }

  await tx.purchase.create({
    data: {
      userId,
      platform,
      productId,
      purchaseToken,
      rawReceipt: purchaseToken,
      status: "VALIDATED",
      createdAt: now,
    },
  });

  await grantStoreProductTx(tx, userId, productId, now);
  return "VALIDATED" as const;
}

export async function getAnalyticsRollupSnapshot() {
  const now = new Date();
  const lastDay = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const [tutorialStarted, firstMarch, firstPurchase] = await Promise.all([
    prisma.analyticsEvent.count({
      where: {
        event: "tutorial_started",
        createdAt: {
          gte: lastDay,
        },
      },
    }),
    prisma.analyticsEvent.count({
      where: {
        event: "first_march",
        createdAt: {
          gte: lastDay,
        },
      },
    }),
    prisma.purchase.count({
      where: {
        status: "VALIDATED",
        createdAt: {
          gte: lastDay,
        },
      },
    }),
  ]);

  return {
    tutorialStarted,
    firstMarch,
    firstPurchase,
  };
}
