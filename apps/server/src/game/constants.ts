import type { BuildingType, ResourceStock } from "@frontier/shared";
import { MAP_SIZE } from "@frontier/shared";

export const GAME_MAP_SIZE = MAP_SIZE;

export const STARTING_RESOURCES: ResourceStock = {
  wood: 600,
  stone: 600,
  food: 600,
  gold: 400,
};

export const STARTING_BUILDING_LEVEL = 1;

export const UPGRADE_COST_BASE: Record<BuildingType, ResourceStock> = {
  TOWN_HALL: { wood: 120, stone: 120, food: 60, gold: 40 },
  FARM: { wood: 60, stone: 20, food: 0, gold: 10 },
  LUMBER_MILL: { wood: 40, stone: 30, food: 20, gold: 10 },
  QUARRY: { wood: 30, stone: 40, food: 20, gold: 10 },
  GOLD_MINE: { wood: 50, stone: 50, food: 30, gold: 20 },
};

export const PRODUCTION_PER_MINUTE_PER_LEVEL: Record<BuildingType, Partial<ResourceStock>> = {
  TOWN_HALL: {},
  FARM: { food: 20 },
  LUMBER_MILL: { wood: 16 },
  QUARRY: { stone: 16 },
  GOLD_MINE: { gold: 10 },
};

export const ATTACK_COST: ResourceStock = {
  wood: 0,
  stone: 0,
  food: 40,
  gold: 20,
};

export const MAX_LOOT: ResourceStock = {
  wood: 100,
  stone: 100,
  food: 100,
  gold: 60,
};

export const ATTACK_RANGE = 4;

export const JWT_COOKIE_NAME = "frontier_session";
