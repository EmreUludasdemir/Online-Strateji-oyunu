import type {
  CommanderTalentTrack,
  ItemKey,
  LiveEventKey,
  RewardBundleView,
  StoreCatalogView,
  TaskKind,
} from "@frontier/shared";
import { COMMANDER_TALENT_LABELS, ITEM_LABELS, LIVE_EVENT_LABELS } from "@frontier/shared";

export interface CommanderTemplate {
  key: string;
  name: string;
  track: CommanderTalentTrack;
  attackBonus: number;
  defenseBonus: number;
  marchSpeedBonus: number;
  carryBonus: number;
  isPrimary?: boolean;
}

export const COMMANDER_TEMPLATES: CommanderTemplate[] = [
  {
    key: "VANGUARD_MARSHAL",
    name: "Vanguard Marshal",
    track: "CONQUEST",
    attackBonus: 0.08,
    defenseBonus: 0.08,
    marchSpeedBonus: 0.1,
    carryBonus: 0.15,
    isPrimary: true,
  },
  {
    key: "STEPPE_WARDEN",
    name: "Steppe Warden",
    track: "GATHERING",
    attackBonus: 0.03,
    defenseBonus: 0.05,
    marchSpeedBonus: 0.12,
    carryBonus: 0.22,
  },
  {
    key: "EMBER_GUARD",
    name: "Ember Guard",
    track: "PEACEKEEPING",
    attackBonus: 0.06,
    defenseBonus: 0.06,
    marchSpeedBonus: 0.08,
    carryBonus: 0.12,
  },
  {
    key: "SAPPHIRE_SCOUT",
    name: "Sapphire Scout",
    track: "GATHERING",
    attackBonus: 0.02,
    defenseBonus: 0.04,
    marchSpeedBonus: 0.14,
    carryBonus: 0.2,
  },
  {
    key: "LION_STANDARD",
    name: "Lion Standard",
    track: "CONQUEST",
    attackBonus: 0.09,
    defenseBonus: 0.07,
    marchSpeedBonus: 0.06,
    carryBonus: 0.1,
  },
  {
    key: "FRONTIER_HIEROPHANT",
    name: "Frontier Hierophant",
    track: "PEACEKEEPING",
    attackBonus: 0.05,
    defenseBonus: 0.09,
    marchSpeedBonus: 0.05,
    carryBonus: 0.1,
  },
];

export interface ItemTemplate {
  key: ItemKey;
  label: string;
  description: string;
  kind: "SPEEDUP" | "RESOURCE_CHEST" | "COMMANDER_XP" | "BUFF";
  durationMs?: number;
  resourceAmount?: number;
  commanderXp?: number;
}

export const ITEM_TEMPLATES: Record<ItemKey, ItemTemplate> = {
  UNIVERSAL_SPEEDUP_5M: {
    key: "UNIVERSAL_SPEEDUP_5M",
    label: ITEM_LABELS.UNIVERSAL_SPEEDUP_5M,
    description: "Reduces any active build, training, or research timer by 5 minutes.",
    kind: "SPEEDUP",
    durationMs: 5 * 60 * 1000,
  },
  TRAINING_SPEEDUP_5M: {
    key: "TRAINING_SPEEDUP_5M",
    label: ITEM_LABELS.TRAINING_SPEEDUP_5M,
    description: "Reduces the active training queue by 5 minutes.",
    kind: "SPEEDUP",
    durationMs: 5 * 60 * 1000,
  },
  RESEARCH_SPEEDUP_5M: {
    key: "RESEARCH_SPEEDUP_5M",
    label: ITEM_LABELS.RESEARCH_SPEEDUP_5M,
    description: "Reduces the active research queue by 5 minutes.",
    kind: "SPEEDUP",
    durationMs: 5 * 60 * 1000,
  },
  RESOURCE_CHEST_SMALL: {
    key: "RESOURCE_CHEST_SMALL",
    label: ITEM_LABELS.RESOURCE_CHEST_SMALL,
    description: "Opens a small chest of frontier resources.",
    kind: "RESOURCE_CHEST",
    resourceAmount: 200,
  },
  COMMANDER_XP_TOME: {
    key: "COMMANDER_XP_TOME",
    label: ITEM_LABELS.COMMANDER_XP_TOME,
    description: "Adds commander experience to the selected field leader.",
    kind: "COMMANDER_XP",
    commanderXp: 120,
  },
  PEACE_SHIELD_8H: {
    key: "PEACE_SHIELD_8H",
    label: ITEM_LABELS.PEACE_SHIELD_8H,
    description: "Prevents hostile city attacks for 8 hours.",
    kind: "BUFF",
    durationMs: 8 * 60 * 60 * 1000,
  },
};

export interface TaskTemplate {
  key: string;
  kind: TaskKind;
  title: string;
  description: string;
  target: number;
  trigger: string;
  reward: RewardBundleView;
}

export const TASK_TEMPLATES: TaskTemplate[] = [
  {
    key: "tutorial_first_upgrade",
    kind: "TUTORIAL",
    title: "Raise the first district",
    description: "Start the first building upgrade inside the city.",
    target: 1,
    trigger: "building_upgrade_started",
    reward: {
      resources: { wood: 140, stone: 140, food: 140, gold: 60 },
      items: [],
      commanderXp: 0,
      seasonPassXp: 20,
    },
  },
  {
    key: "tutorial_first_train",
    kind: "TUTORIAL",
    title: "Drill the first troops",
    description: "Queue the first troop training order.",
    target: 1,
    trigger: "troop_train_started",
    reward: {
      resources: {},
      items: [{ itemKey: "TRAINING_SPEEDUP_5M", quantity: 1 }],
      commanderXp: 0,
      seasonPassXp: 20,
    },
  },
  {
    key: "tutorial_first_research",
    kind: "TUTORIAL",
    title: "Open a doctrine lane",
    description: "Start the first academy research.",
    target: 1,
    trigger: "research_started",
    reward: {
      resources: {},
      items: [{ itemKey: "RESEARCH_SPEEDUP_5M", quantity: 1 }],
      commanderXp: 0,
      seasonPassXp: 20,
    },
  },
  {
    key: "tutorial_first_gather",
    kind: "TUTORIAL",
    title: "Return with cargo",
    description: "Complete the first gathering return from a resource node.",
    target: 1,
    trigger: "gather_completed",
    reward: {
      resources: {},
      items: [{ itemKey: "RESOURCE_CHEST_SMALL", quantity: 1 }],
      commanderXp: 0,
      seasonPassXp: 25,
    },
  },
  {
    key: "tutorial_first_barbarian",
    kind: "TUTORIAL",
    title: "Break a barbarian camp",
    description: "Win the first barbarian camp engagement.",
    target: 1,
    trigger: "barbarian_battle_won",
    reward: {
      resources: {},
      items: [{ itemKey: "COMMANDER_XP_TOME", quantity: 1 }],
      commanderXp: 60,
      seasonPassXp: 25,
    },
  },
  {
    key: "tutorial_join_alliance",
    kind: "TUTORIAL",
    title: "Find a banner",
    description: "Join or create an alliance.",
    target: 1,
    trigger: "alliance_joined",
    reward: {
      resources: {},
      items: [{ itemKey: "PEACE_SHIELD_8H", quantity: 1 }],
      commanderXp: 0,
      seasonPassXp: 30,
    },
  },
  {
    key: "daily_train",
    kind: "DAILY",
    title: "Daily drill order",
    description: "Queue at least one troop training order today.",
    target: 1,
    trigger: "troop_train_started",
    reward: {
      resources: { food: 160, wood: 80 },
      items: [],
      commanderXp: 0,
      seasonPassXp: 15,
    },
  },
  {
    key: "daily_gather",
    kind: "DAILY",
    title: "Daily caravan",
    description: "Complete one successful gathering return today.",
    target: 1,
    trigger: "gather_completed",
    reward: {
      resources: { stone: 120, wood: 120 },
      items: [],
      commanderXp: 0,
      seasonPassXp: 15,
    },
  },
  {
    key: "daily_help",
    kind: "DAILY",
    title: "Aid an ally",
    description: "Answer one alliance help request today.",
    target: 1,
    trigger: "alliance_help_responded",
    reward: {
      resources: { gold: 120, food: 120 },
      items: [],
      commanderXp: 0,
      seasonPassXp: 15,
    },
  },
];

export interface SeasonPassTierTemplate {
  tier: number;
  requiredXp: number;
  freeReward: RewardBundleView;
  premiumReward: RewardBundleView | null;
}

export const SEASON_PASS_KEY = "season-001";
export const SEASON_PASS_LABEL = "Sultan's Road";

export const SEASON_PASS_TIERS: SeasonPassTierTemplate[] = [
  {
    tier: 1,
    requiredXp: 25,
    freeReward: { resources: { wood: 120, food: 120 }, items: [], commanderXp: 0, seasonPassXp: 0 },
    premiumReward: { resources: {}, items: [{ itemKey: "UNIVERSAL_SPEEDUP_5M", quantity: 1 }], commanderXp: 0, seasonPassXp: 0 },
  },
  {
    tier: 2,
    requiredXp: 60,
    freeReward: { resources: {}, items: [{ itemKey: "RESOURCE_CHEST_SMALL", quantity: 1 }], commanderXp: 0, seasonPassXp: 0 },
    premiumReward: { resources: {}, items: [{ itemKey: "COMMANDER_XP_TOME", quantity: 1 }], commanderXp: 0, seasonPassXp: 0 },
  },
  {
    tier: 3,
    requiredXp: 100,
    freeReward: { resources: { gold: 120 }, items: [], commanderXp: 0, seasonPassXp: 0 },
    premiumReward: { resources: {}, items: [{ itemKey: "PEACE_SHIELD_8H", quantity: 1 }], commanderXp: 0, seasonPassXp: 0 },
  },
];

export interface LiveEventTemplate {
  key: LiveEventKey;
  label: string;
  description: string;
  target: number;
  reward: RewardBundleView;
  trigger: string;
}

export const LIVE_EVENT_TEMPLATES: LiveEventTemplate[] = [
  {
    key: "POWER_SPRINT",
    label: LIVE_EVENT_LABELS.POWER_SPRINT,
    description: "Gain score from building upgrades and commander levels.",
    target: 100,
    reward: { resources: { wood: 220, stone: 220 }, items: [], commanderXp: 0, seasonPassXp: 0 },
    trigger: "power_gain",
  },
  {
    key: "BARBARIAN_HUNT",
    label: LIVE_EVENT_LABELS.BARBARIAN_HUNT,
    description: "Gain score by clearing barbarian camps.",
    target: 3,
    reward: { resources: {}, items: [{ itemKey: "COMMANDER_XP_TOME", quantity: 1 }], commanderXp: 0, seasonPassXp: 0 },
    trigger: "barbarian_battle_won",
  },
  {
    key: "GATHERING_RUSH",
    label: LIVE_EVENT_LABELS.GATHERING_RUSH,
    description: "Gain score by returning cargo from nodes.",
    target: 1200,
    reward: { resources: {}, items: [{ itemKey: "RESOURCE_CHEST_SMALL", quantity: 2 }], commanderXp: 0, seasonPassXp: 0 },
    trigger: "gather_score",
  },
];

export interface StoreProductTemplate {
  productId: string;
  label: string;
  description: string;
  priceLabel: string;
  reward: RewardBundleView;
  entitlementKey?: string;
}

export interface StoreOfferTemplate {
  offerId: string;
  title: string;
  description: string;
  productIds: string[];
  segmentTags: string[];
}

export const STORE_PRODUCTS: StoreProductTemplate[] = [
  {
    productId: "starter_bundle",
    label: "Starter Bundle",
    description: "A quick-start bundle of resources and speedups.",
    priceLabel: "$2.99",
    reward: {
      resources: { wood: 500, stone: 500, food: 500, gold: 240 },
      items: [{ itemKey: "UNIVERSAL_SPEEDUP_5M", quantity: 2 }],
      commanderXp: 60,
      seasonPassXp: 0,
    },
  },
  {
    productId: "daily_chest",
    label: "Daily Chest",
    description: "A small chest for consistent daily progression.",
    priceLabel: "$0.99",
    reward: {
      resources: { wood: 220, stone: 220, food: 220, gold: 120 },
      items: [{ itemKey: "RESOURCE_CHEST_SMALL", quantity: 1 }],
      commanderXp: 0,
      seasonPassXp: 0,
    },
  },
  {
    productId: "speedup_pack",
    label: "Speedup Pack",
    description: "Focused acceleration for research and training.",
    priceLabel: "$3.99",
    reward: {
      resources: {},
      items: [
        { itemKey: "UNIVERSAL_SPEEDUP_5M", quantity: 3 },
        { itemKey: "TRAINING_SPEEDUP_5M", quantity: 2 },
        { itemKey: "RESEARCH_SPEEDUP_5M", quantity: 2 },
      ],
      commanderXp: 0,
      seasonPassXp: 0,
    },
  },
  {
    productId: "commander_xp_pack",
    label: "Commander Codex Pack",
    description: "Experience tomes for rapid commander advancement.",
    priceLabel: "$4.99",
    reward: {
      resources: {},
      items: [{ itemKey: "COMMANDER_XP_TOME", quantity: 4 }],
      commanderXp: 180,
      seasonPassXp: 0,
    },
  },
  {
    productId: "resource_crate",
    label: "Resource Crate",
    description: "A broad stock refill for your city stores.",
    priceLabel: "$1.99",
    reward: {
      resources: { wood: 800, stone: 800, food: 900, gold: 300 },
      items: [],
      commanderXp: 0,
      seasonPassXp: 0,
    },
  },
  {
    productId: "season_pass_premium",
    label: "Sultan's Road Premium",
    description: "Unlock premium rewards on the current season road.",
    priceLabel: "$5.99",
    reward: {
      resources: {},
      items: [],
      commanderXp: 0,
      seasonPassXp: 0,
    },
    entitlementKey: "season_pass_premium",
  },
];

export const STORE_OFFERS: StoreOfferTemplate[] = [
  {
    offerId: "newbie_burst",
    title: "New Governor Burst",
    description: "Targets newly settled governors with a fast start.",
    productIds: ["starter_bundle", "daily_chest"],
    segmentTags: ["newbie", "non_payer"],
  },
  {
    offerId: "alliance_push",
    title: "Alliance War Chest",
    description: "Useful for active alliance players coordinating queues and rallies.",
    productIds: ["speedup_pack", "resource_crate"],
    segmentTags: ["alliance_active"],
  },
  {
    offerId: "payer_refresh",
    title: "Veteran Quartermaster",
    description: "Refresh pack for already-converted payers.",
    productIds: ["commander_xp_pack", "speedup_pack"],
    segmentTags: ["payer"],
  },
];

export function getCommanderTemplate(templateKey: string): CommanderTemplate {
  const template = COMMANDER_TEMPLATES.find((entry) => entry.key === templateKey);
  if (!template) {
    throw new Error(`Unknown commander template: ${templateKey}`);
  }

  return template;
}

export function getItemTemplate(itemKey: ItemKey): ItemTemplate {
  return ITEM_TEMPLATES[itemKey];
}

export function getTaskTemplates(kind?: TaskKind): TaskTemplate[] {
  return kind ? TASK_TEMPLATES.filter((task) => task.kind === kind) : [...TASK_TEMPLATES];
}

export function getTaskTemplate(taskKey: string): TaskTemplate {
  const template = TASK_TEMPLATES.find((task) => task.key === taskKey);
  if (!template) {
    throw new Error(`Unknown task template: ${taskKey}`);
  }

  return template;
}

export function getLiveEventTemplate(eventKey: LiveEventKey): LiveEventTemplate {
  const template = LIVE_EVENT_TEMPLATES.find((event) => event.key === eventKey);
  if (!template) {
    throw new Error(`Unknown live event: ${eventKey}`);
  }

  return template;
}

export function getStoreProduct(productId: string): StoreProductTemplate {
  const product = STORE_PRODUCTS.find((entry) => entry.productId === productId);
  if (!product) {
    throw new Error(`Unknown store product: ${productId}`);
  }

  return product;
}

export function getCurrentDailyKey(now: Date): string {
  return now.toISOString().slice(0, 10);
}

export function buildStoreCatalog(): StoreCatalogView {
  return {
    products: STORE_PRODUCTS.map((product) => ({
      productId: product.productId,
      label: product.label,
      description: product.description,
      priceLabel: product.priceLabel,
      reward: product.reward,
    })),
    offers: STORE_OFFERS.map((offer) => ({
      offerId: offer.offerId,
      title: offer.title,
      description: offer.description,
      productIds: offer.productIds,
      segmentTags: offer.segmentTags,
    })),
  };
}

export function buildCommanderPresetLabel(track: CommanderTalentTrack): string {
  return `${COMMANDER_TALENT_LABELS[track]} Doctrine`;
}
