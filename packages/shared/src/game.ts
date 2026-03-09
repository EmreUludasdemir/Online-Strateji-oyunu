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

export const MARCH_STATES = ["ENROUTE", "RESOLVED", "RECALLED"] as const;

export type MarchState = (typeof MARCH_STATES)[number];

export const BATTLE_RESULTS = ["ATTACKER_WIN", "DEFENDER_HOLD"] as const;

export type BattleResult = (typeof BATTLE_RESULTS)[number];

export const FOG_STATES = ["VISIBLE", "DISCOVERED", "HIDDEN"] as const;

export type FogState = (typeof FOG_STATES)[number];

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
  "map.updated",
  "alliance.updated",
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
