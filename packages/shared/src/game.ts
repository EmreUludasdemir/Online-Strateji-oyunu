export const RESOURCE_KEYS = ["wood", "stone", "food", "gold"] as const;

export type ResourceKey = (typeof RESOURCE_KEYS)[number];

export const BUILDING_TYPES = [
  "TOWN_HALL",
  "FARM",
  "LUMBER_MILL",
  "QUARRY",
  "GOLD_MINE",
  "BARRACKS",
  "ACADEMY",
  "WATCHTOWER",
] as const;

export type BuildingType = (typeof BUILDING_TYPES)[number];

export const TROOP_TYPES = ["INFANTRY", "ARCHER", "CAVALRY"] as const;

export type TroopType = (typeof TROOP_TYPES)[number];

export const RESEARCH_TYPES = [
  "MILITARY_DRILL",
  "LOGISTICS",
  "AGRONOMY",
  "STONEWORK",
  "GOLD_TRADE",
  "SCOUTING",
] as const;

export type ResearchType = (typeof RESEARCH_TYPES)[number];

export const ALLIANCE_ROLES = ["LEADER", "OFFICER", "MEMBER"] as const;

export type AllianceRole = (typeof ALLIANCE_ROLES)[number];

export const ALLIANCE_HELP_KINDS = ["BUILDING_UPGRADE", "TRAINING", "RESEARCH"] as const;

export type AllianceHelpKind = (typeof ALLIANCE_HELP_KINDS)[number];

export const COMMANDER_TALENT_TRACKS = ["CONQUEST", "PEACEKEEPING", "GATHERING"] as const;

export type CommanderTalentTrack = (typeof COMMANDER_TALENT_TRACKS)[number];

export const POI_KINDS = ["BARBARIAN_CAMP", "RESOURCE_NODE"] as const;

export type PoiKind = (typeof POI_KINDS)[number];

export const POI_STATES = ["ACTIVE", "OCCUPIED", "DEPLETED", "RESPAWNING"] as const;

export type PoiState = (typeof POI_STATES)[number];

export const POI_RESOURCE_TYPES = ["WOOD", "STONE", "FOOD", "GOLD"] as const;

export type PoiResourceType = (typeof POI_RESOURCE_TYPES)[number];

export const MARCH_OBJECTIVES = ["CITY_ATTACK", "BARBARIAN_ATTACK", "RESOURCE_GATHER"] as const;

export type MarchObjective = (typeof MARCH_OBJECTIVES)[number];

export const MARCH_STATES = ["ENROUTE", "STAGING", "GATHERING", "RETURNING", "RESOLVED", "RECALLED"] as const;

export type MarchState = (typeof MARCH_STATES)[number];

export const BATTLE_RESULTS = ["ATTACKER_WIN", "DEFENDER_HOLD"] as const;

export type BattleResult = (typeof BATTLE_RESULTS)[number];

export const FOG_STATES = ["VISIBLE", "DISCOVERED", "HIDDEN"] as const;

export type FogState = (typeof FOG_STATES)[number];

export const REPORT_ENTRY_KINDS = ["CITY_BATTLE", "BARBARIAN_BATTLE", "RESOURCE_GATHER"] as const;

export type ReportEntryKind = (typeof REPORT_ENTRY_KINDS)[number];

export const ITEM_KEYS = [
  "UNIVERSAL_SPEEDUP_5M",
  "TRAINING_SPEEDUP_5M",
  "RESEARCH_SPEEDUP_5M",
  "RESOURCE_CHEST_SMALL",
  "COMMANDER_XP_TOME",
  "PEACE_SHIELD_8H",
] as const;

export type ItemKey = (typeof ITEM_KEYS)[number];

export const ITEM_TARGET_KINDS = ["BUILDING_UPGRADE", "TRAINING", "RESEARCH", "COMMANDER", "CITY"] as const;

export type ItemTargetKind = (typeof ITEM_TARGET_KINDS)[number];

export const TASK_KINDS = ["TUTORIAL", "DAILY"] as const;

export type TaskKind = (typeof TASK_KINDS)[number];

export const SCOUT_STATES = ["ENROUTE", "RESOLVED", "RECALLED"] as const;

export type ScoutState = (typeof SCOUT_STATES)[number];

export const SCOUT_TARGET_KINDS = ["CITY", "POI"] as const;

export type ScoutTargetKind = (typeof SCOUT_TARGET_KINDS)[number];

export const RALLY_STATES = ["OPEN", "LAUNCHED", "RESOLVED", "CANCELLED"] as const;

export type RallyState = (typeof RALLY_STATES)[number];

export const MAILBOX_KINDS = [
  "SCOUT_REPORT",
  "BATTLE_REPORT",
  "RALLY_REPORT",
  "SYSTEM_REWARD",
  "PURCHASE_REWARD",
] as const;

export type MailboxKind = (typeof MAILBOX_KINDS)[number];

export const PURCHASE_STATUSES = ["VALIDATED", "DUPLICATE", "REJECTED"] as const;

export type PurchaseStatus = (typeof PURCHASE_STATUSES)[number];

export const LIVE_EVENT_KEYS = ["POWER_SPRINT", "BARBARIAN_HUNT", "GATHERING_RUSH"] as const;

export type LiveEventKey = (typeof LIVE_EVENT_KEYS)[number];

export const ANALYTICS_EVENT_TYPES = [
  "tutorial_started",
  "tutorial_step_seen",
  "first_upgrade",
  "first_troop_train",
  "first_march",
  "battle_result",
  "research_started",
  "research_completed",
  "task_claimed",
  "item_used",
  "scout_sent",
  "scout_completed",
  "rally_created",
  "rally_joined",
  "purchase_verified",
  "event_reward_claimed",
  "hud_tab_opened",
  "target_sheet_opened",
  "march_confirmed",
  "inbox_opened",
  "store_opened",
] as const;

export type AnalyticsEventType = (typeof ANALYTICS_EVENT_TYPES)[number];

export const SOCKET_EVENT_TYPES = [
  "city.updated",
  "upgrade.completed",
  "training.completed",
  "research.completed",
  "march.created",
  "march.updated",
  "battle.resolved",
  "report.created",
  "fog.updated",
  "poi.updated",
  "map.updated",
  "alliance.updated",
  "task.updated",
  "inventory.updated",
  "commander.updated",
  "scout.completed",
  "rally.updated",
  "mailbox.updated",
  "store.updated",
  "event.updated",
  "leaderboard.updated",
] as const;

export type SocketEventType = (typeof SOCKET_EVENT_TYPES)[number];

export const MAP_SIZE = 64;

export const BUILDING_LABELS: Record<BuildingType, string> = {
  TOWN_HALL: "Town Hall",
  FARM: "Farm",
  LUMBER_MILL: "Lumber Mill",
  QUARRY: "Quarry",
  GOLD_MINE: "Gold Mine",
  BARRACKS: "Barracks",
  ACADEMY: "Academy",
  WATCHTOWER: "Watchtower",
};

export const BUILDING_DESCRIPTIONS: Record<BuildingType, string> = {
  TOWN_HALL: "Coordinates the city and unlocks strategic capacity.",
  FARM: "Produces food for citizens, troops, and long campaigns.",
  LUMBER_MILL: "Turns timber into the frame of every expansion order.",
  QUARRY: "Pulls stone for walls, roads, and hard defenses.",
  GOLD_MINE: "Generates gold used for command and research.",
  BARRACKS: "Trains frontline troops and improves enlistment speed.",
  ACADEMY: "Unlocks long-term doctrine and strategic upgrades.",
  WATCHTOWER: "Improves vision across the frontier and strengthens defense.",
};

export const TROOP_LABELS: Record<TroopType, string> = {
  INFANTRY: "Infantry",
  ARCHER: "Archers",
  CAVALRY: "Cavalry",
};

export const POI_KIND_LABELS: Record<PoiKind, string> = {
  BARBARIAN_CAMP: "Barbarian Camp",
  RESOURCE_NODE: "Resource Node",
};

export const POI_RESOURCE_LABELS: Record<PoiResourceType, string> = {
  WOOD: "Wood",
  STONE: "Stone",
  FOOD: "Food",
  GOLD: "Gold",
};

export const RESEARCH_LABELS: Record<ResearchType, string> = {
  MILITARY_DRILL: "Military Drill",
  LOGISTICS: "Logistics",
  AGRONOMY: "Agronomy",
  STONEWORK: "Stonework",
  GOLD_TRADE: "Gold Trade",
  SCOUTING: "Scouting",
};

export const RESEARCH_DESCRIPTIONS: Record<ResearchType, string> = {
  MILITARY_DRILL: "Raises offensive pressure for all fielded troops.",
  LOGISTICS: "Improves march speed and command movement discipline.",
  AGRONOMY: "Expands food efficiency across the farm districts.",
  STONEWORK: "Improves quarry output and structural resilience.",
  GOLD_TRADE: "Strengthens gold generation from market activity.",
  SCOUTING: "Expands visible frontier range and tactical awareness.",
};

export const COMMANDER_TALENT_LABELS: Record<CommanderTalentTrack, string> = {
  CONQUEST: "Conquest",
  PEACEKEEPING: "Peacekeeping",
  GATHERING: "Gathering",
};

export const ITEM_LABELS: Record<ItemKey, string> = {
  UNIVERSAL_SPEEDUP_5M: "Universal Speedup (5m)",
  TRAINING_SPEEDUP_5M: "Training Speedup (5m)",
  RESEARCH_SPEEDUP_5M: "Research Speedup (5m)",
  RESOURCE_CHEST_SMALL: "Resource Chest",
  COMMANDER_XP_TOME: "Commander XP Tome",
  PEACE_SHIELD_8H: "Peace Shield (8h)",
};

export const LIVE_EVENT_LABELS: Record<LiveEventKey, string> = {
  POWER_SPRINT: "Power Sprint",
  BARBARIAN_HUNT: "Barbarian Hunt",
  GATHERING_RUSH: "Gathering Rush",
};
