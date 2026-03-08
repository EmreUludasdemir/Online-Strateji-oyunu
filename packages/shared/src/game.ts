export const RESOURCE_KEYS = ["wood", "stone", "food", "gold"] as const;

export type ResourceKey = (typeof RESOURCE_KEYS)[number];

export const BUILDING_TYPES = [
  "TOWN_HALL",
  "FARM",
  "LUMBER_MILL",
  "QUARRY",
  "GOLD_MINE",
] as const;

export type BuildingType = (typeof BUILDING_TYPES)[number];

export const BATTLE_RESULTS = ["ATTACKER_WIN", "DEFENDER_HOLD"] as const;

export type BattleResult = (typeof BATTLE_RESULTS)[number];

export const SOCKET_EVENT_TYPES = [
  "city.updated",
  "upgrade.completed",
  "report.created",
  "map.updated",
] as const;

export type SocketEventType = (typeof SOCKET_EVENT_TYPES)[number];

export const MAP_SIZE = 20;

export const BUILDING_LABELS: Record<BuildingType, string> = {
  TOWN_HALL: "Town Hall",
  FARM: "Farm",
  LUMBER_MILL: "Lumber Mill",
  QUARRY: "Quarry",
  GOLD_MINE: "Gold Mine",
};

export const BUILDING_DESCRIPTIONS: Record<BuildingType, string> = {
  TOWN_HALL: "Coordinates the city and boosts command strength.",
  FARM: "Produces steady food for growth and campaigns.",
  LUMBER_MILL: "Cuts timber used in construction efforts.",
  QUARRY: "Extracts stone for durable expansion.",
  GOLD_MINE: "Mints wealth to fund ambitious projects.",
};
