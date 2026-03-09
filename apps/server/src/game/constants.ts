import type { BuildingType, ResearchType, ResourceStock, TroopStock, TroopType } from "@frontier/shared";
import { MAP_SIZE } from "@frontier/shared";

export const GAME_MAP_SIZE = MAP_SIZE;

export const STARTING_RESOURCES: ResourceStock = {
  wood: 900,
  stone: 900,
  food: 1000,
  gold: 600,
};

export const STARTING_TROOPS: TroopStock = {
  INFANTRY: 48,
  ARCHER: 32,
  CAVALRY: 20,
};

export const STARTING_BUILDING_LEVEL = 1;
export const STARTING_RESEARCH_LEVEL = 0;

export const UPGRADE_COST_BASE: Record<BuildingType, ResourceStock> = {
  TOWN_HALL: { wood: 120, stone: 120, food: 60, gold: 40 },
  FARM: { wood: 60, stone: 20, food: 0, gold: 10 },
  LUMBER_MILL: { wood: 40, stone: 30, food: 20, gold: 10 },
  QUARRY: { wood: 30, stone: 40, food: 20, gold: 10 },
  GOLD_MINE: { wood: 50, stone: 50, food: 30, gold: 20 },
  BARRACKS: { wood: 80, stone: 70, food: 40, gold: 30 },
  ACADEMY: { wood: 90, stone: 90, food: 50, gold: 40 },
  WATCHTOWER: { wood: 70, stone: 110, food: 20, gold: 35 },
};

export const PRODUCTION_PER_MINUTE_PER_LEVEL: Record<BuildingType, Partial<ResourceStock>> = {
  TOWN_HALL: {},
  FARM: { food: 20 },
  LUMBER_MILL: { wood: 16 },
  QUARRY: { stone: 16 },
  GOLD_MINE: { gold: 10 },
  BARRACKS: {},
  ACADEMY: {},
  WATCHTOWER: {},
};

export const TROOP_BASE_COST: Record<TroopType, ResourceStock> = {
  INFANTRY: { wood: 6, stone: 0, food: 18, gold: 0 },
  ARCHER: { wood: 10, stone: 0, food: 16, gold: 2 },
  CAVALRY: { wood: 12, stone: 0, food: 24, gold: 6 },
};

export const TROOP_BASE_DURATION_SECONDS: Record<TroopType, number> = {
  INFANTRY: 8,
  ARCHER: 10,
  CAVALRY: 14,
};

export const TROOP_ATTACK: Record<TroopType, number> = {
  INFANTRY: 14,
  ARCHER: 20,
  CAVALRY: 24,
};

export const TROOP_DEFENSE: Record<TroopType, number> = {
  INFANTRY: 20,
  ARCHER: 11,
  CAVALRY: 14,
};

export const TROOP_SPEED: Record<TroopType, number> = {
  INFANTRY: 1.0,
  ARCHER: 0.95,
  CAVALRY: 1.2,
};

export const TROOP_CARRY: Record<TroopType, number> = {
  INFANTRY: 16,
  ARCHER: 12,
  CAVALRY: 14,
};

export const RESEARCH_MAX_LEVEL = 3;

export const RESEARCH_BASE_COST: Record<ResearchType, ResourceStock> = {
  MILITARY_DRILL: { wood: 90, stone: 60, food: 70, gold: 30 },
  LOGISTICS: { wood: 70, stone: 40, food: 90, gold: 30 },
  AGRONOMY: { wood: 80, stone: 20, food: 110, gold: 20 },
  STONEWORK: { wood: 60, stone: 100, food: 50, gold: 30 },
  GOLD_TRADE: { wood: 70, stone: 70, food: 40, gold: 60 },
  SCOUTING: { wood: 80, stone: 50, food: 60, gold: 35 },
};

export const RESEARCH_DURATION_MINUTES: Record<ResearchType, number> = {
  MILITARY_DRILL: 4,
  LOGISTICS: 4,
  AGRONOMY: 3,
  STONEWORK: 3,
  GOLD_TRADE: 3,
  SCOUTING: 2,
};

export const ATTACK_LOOT_PERCENT = 0.2;

export const MAX_LOOT: ResourceStock = {
  wood: 160,
  stone: 160,
  food: 160,
  gold: 100,
};

export const MAX_MARCH_DISTANCE = 10;
export const BASE_MARCH_SECONDS_PER_TILE = 20;
export const MIN_MARCH_SECONDS = 15;
export const BASE_VISION_RADIUS = 4;
export const MARCH_VISION_RADIUS = 2;
export const DEFAULT_WORLD_RADIUS = 8;
export const WORLD_RECONCILE_INTERVAL_MS = 5_000;
export const ALLIANCE_MAX_MEMBERS = 12;
export const ALLIANCE_CHAT_HISTORY_LIMIT = 20;
export const ALLIANCE_HELP_MAX_RESPONSES = 3;
export const ALLIANCE_HELP_REDUCTION_MS = 20_000;

export const JWT_COOKIE_NAME = "frontier_session";
