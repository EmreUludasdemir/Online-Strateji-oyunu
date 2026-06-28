import type { BuildingType, ResourceKey, ResourceStock, TroopType, ResearchType } from "@frontier/shared";

// Base cost of building upgrades (matches backend UPGRADE_COST_BASE)
export const UPGRADE_COST_BASE: Record<BuildingType, ResourceStock> = {
  TOWN_HALL:   { wood: 120, stone: 120, food:  60, gold:  40 },
  FARM:        { wood:  60, stone:  20, food:   0, gold:  10 },
  LUMBER_MILL: { wood:  40, stone:  30, food:  20, gold:  10 },
  QUARRY:      { wood:  30, stone:  40, food:  20, gold:  10 },
  GOLD_MINE:   { wood:  50, stone:  50, food:  30, gold:  20 },
  BARRACKS:    { wood:  80, stone:  70, food:  40, gold:  30 },
  ACADEMY:     { wood:  90, stone:  90, food:  50, gold:  40 },
  WATCHTOWER:  { wood:  70, stone: 110, food:  20, gold:  35 },
  HOSPITAL:    { wood: 100, stone:  80, food:  60, gold:  45 },
  WALL:        { wood:  60, stone: 140, food:  20, gold:  50 },
  EMBASSY:     { wood: 110, stone:  80, food:  70, gold:  60 },
  FORGE:       { wood:  80, stone:  60, food:  40, gold:  55 },
};

// Base production per minute per level (matches backend PRODUCTION_PER_MINUTE_PER_LEVEL)
export const PRODUCTION_PER_MINUTE_PER_LEVEL: Record<BuildingType, Partial<ResourceStock>> = {
  TOWN_HALL:   {},
  FARM:        { food: 20 },
  LUMBER_MILL: { wood: 16 },
  QUARRY:      { stone: 16 },
  GOLD_MINE:   { gold: 10 },
  BARRACKS:    {},
  ACADEMY:     {},
  WATCHTOWER:  {},
  HOSPITAL:    {},
  WALL:        {},
  EMBASSY:     {},
  FORGE:       {},
};

// Troop base cost (matches backend TROOP_BASE_COST)
export const TROOP_BASE_COST: Record<TroopType, ResourceStock> = {
  INFANTRY: { wood: 6, stone: 0, food: 18, gold: 0 },
  ARCHER: { wood: 10, stone: 0, food: 16, gold: 2 },
  CAVALRY: { wood: 12, stone: 0, food: 24, gold: 6 },
};

// Research base cost (matches backend RESEARCH_BASE_COST)
export const RESEARCH_BASE_COST: Record<ResearchType, ResourceStock> = {
  MILITARY_DRILL:  { wood:  90, stone:  60, food:  70, gold:  30 },
  LOGISTICS:       { wood:  70, stone:  40, food:  90, gold:  30 },
  AGRONOMY:        { wood:  80, stone:  20, food: 110, gold:  20 },
  STONEWORK:       { wood:  60, stone: 100, food:  50, gold:  30 },
  GOLD_TRADE:      { wood:  70, stone:  70, food:  40, gold:  60 },
  SCOUTING:        { wood:  80, stone:  50, food:  60, gold:  35 },
  METALLURGY:      { wood:  70, stone:  80, food:  40, gold:  60 },
  MEDICINE:        { wood:  90, stone:  40, food:  80, gold:  40 },
  CAVALRY_TACTICS: { wood:  80, stone:  60, food:  80, gold:  50 },
  CITY_PLANNING:   { wood: 100, stone:  80, food:  60, gold:  50 },
  ARCHERY:         { wood:  80, stone:  50, food:  60, gold:  40 },
};

// UI ONLY: Maximum level of buildings based on Town Hall level
// The backend might not enforce this yet, but we enforce it in UI for progression pacing.
export function getBuildingMaxLevelByTownHall(buildingType: BuildingType, townHallLevel: number): number {
  if (buildingType === "TOWN_HALL") return 25; // Hard cap for town hall
  
  // Some buildings unlock later or have stricter caps
  switch(buildingType) {
    case "ACADEMY":
      return townHallLevel >= 3 ? townHallLevel : 0;
    case "FORGE":
      return townHallLevel >= 5 ? townHallLevel : 0;
    case "HOSPITAL":
      return townHallLevel >= 4 ? townHallLevel : 0;
    case "EMBASSY":
      return townHallLevel >= 2 ? townHallLevel : 0;
    default:
      return townHallLevel;
  }
}

// UI ONLY: Storage Capacity limits based on Town Hall level
export const STORAGE_CAPACITY_BASE = 5000;
export const STORAGE_CAPACITY_PER_LEVEL = 2000;

// Helper to calculate cost exponent multiplier
// In backend it is linear (base * level), but in UI we will show exact backend cost.
// If backend changes to exponential, update this.
export const UPGRADE_COST_MULTIPLIER = 1.0; 
