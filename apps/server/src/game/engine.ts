import type { BattleResult, BuildingType, ResourceKey, ResourceStock } from "@frontier/shared";
import { BUILDING_TYPES, RESOURCE_KEYS } from "@frontier/shared";

import {
  ATTACK_COST,
  MAX_LOOT,
  PRODUCTION_PER_MINUTE_PER_LEVEL,
  STARTING_BUILDING_LEVEL,
  UPGRADE_COST_BASE,
} from "./constants";

export type BuildingLevelMap = Record<BuildingType, number>;

export function createResourceLedger(seed?: Partial<ResourceStock>): ResourceStock {
  return {
    wood: seed?.wood ?? 0,
    stone: seed?.stone ?? 0,
    food: seed?.food ?? 0,
    gold: seed?.gold ?? 0,
  };
}

export function createStartingBuildingLevels(): BuildingLevelMap {
  return BUILDING_TYPES.reduce<BuildingLevelMap>((levels, type) => {
    levels[type] = STARTING_BUILDING_LEVEL;
    return levels;
  }, {} as BuildingLevelMap);
}

export function getBuildingLevels(
  buildings: Array<{ buildingType: BuildingType; level: number }>,
): BuildingLevelMap {
  const levels = createStartingBuildingLevels();

  for (const building of buildings) {
    levels[building.buildingType] = building.level;
  }

  return levels;
}

export function getUpgradeCost(buildingType: BuildingType, targetLevel: number): ResourceStock {
  const base = UPGRADE_COST_BASE[buildingType];

  return RESOURCE_KEYS.reduce<ResourceStock>((cost, key) => {
    cost[key] = Math.round(base[key] * targetLevel);
    return cost;
  }, createResourceLedger());
}

export function getUpgradeDurationMs(buildingType: BuildingType, targetLevel: number): number {
  const secondsPerLevel = buildingType === "TOWN_HALL" ? 60 : 30;
  return secondsPerLevel * targetLevel * 1000;
}

export function getProductionPerMinute(levels: BuildingLevelMap): ResourceStock {
  const production = createResourceLedger();

  for (const buildingType of BUILDING_TYPES) {
    const level = levels[buildingType];
    const buildingProduction = PRODUCTION_PER_MINUTE_PER_LEVEL[buildingType];

    for (const key of RESOURCE_KEYS) {
      production[key] += (buildingProduction[key] ?? 0) * level;
    }
  }

  return production;
}

export function applyProduction(
  resources: ResourceStock,
  levels: BuildingLevelMap,
  elapsedMs: number,
): ResourceStock {
  if (elapsedMs <= 0) {
    return { ...resources };
  }

  const production = getProductionPerMinute(levels);
  const elapsedMinutes = elapsedMs / 60000;

  return RESOURCE_KEYS.reduce<ResourceStock>((next, key) => {
    next[key] = resources[key] + production[key] * elapsedMinutes;
    return next;
  }, createResourceLedger());
}

export function toDisplayResources(resources: ResourceStock): ResourceStock {
  return RESOURCE_KEYS.reduce<ResourceStock>((next, key) => {
    next[key] = Math.max(0, Math.floor(resources[key]));
    return next;
  }, createResourceLedger());
}

export function hasEnoughResources(resources: ResourceStock, cost: ResourceStock): boolean {
  return RESOURCE_KEYS.every((key) => Math.floor(resources[key]) >= cost[key]);
}

export function spendResources(resources: ResourceStock, cost: ResourceStock): ResourceStock {
  return RESOURCE_KEYS.reduce<ResourceStock>((next, key) => {
    next[key] = Math.max(0, resources[key] - cost[key]);
    return next;
  }, createResourceLedger());
}

export function addResources(resources: ResourceStock, gain: ResourceStock): ResourceStock {
  return RESOURCE_KEYS.reduce<ResourceStock>((next, key) => {
    next[key] = resources[key] + gain[key];
    return next;
  }, createResourceLedger());
}

export function manhattanDistance(
  source: { x: number; y: number },
  target: { x: number; y: number },
): number {
  return Math.abs(source.x - target.x) + Math.abs(source.y - target.y);
}

export function getAttackPower(levels: BuildingLevelMap): number {
  return (
    levels.TOWN_HALL * 20 +
    levels.FARM * 5 +
    levels.LUMBER_MILL * 7 +
    levels.QUARRY * 7 +
    levels.GOLD_MINE * 9
  );
}

export function getDefensePower(levels: BuildingLevelMap): number {
  return (
    levels.TOWN_HALL * 24 +
    levels.FARM * 4 +
    levels.LUMBER_MILL * 6 +
    levels.QUARRY * 8 +
    levels.GOLD_MINE * 10
  );
}

export function getAttackCost(): ResourceStock {
  return { ...ATTACK_COST };
}

export function getBattleLoot(defenderResources: ResourceStock): ResourceStock {
  return RESOURCE_KEYS.reduce<ResourceStock>((loot, key) => {
    loot[key] = Math.min(MAX_LOOT[key], Math.floor(defenderResources[key] * 0.2));
    return loot;
  }, createResourceLedger());
}

export function resolveBattle(attackerPower: number, defenderPower: number): BattleResult {
  return attackerPower > defenderPower ? "ATTACKER_WIN" : "DEFENDER_HOLD";
}

export function projectUpgradeCompletion(
  levels: BuildingLevelMap,
  buildingType: BuildingType,
  nextLevel: number,
): BuildingLevelMap {
  return {
    ...levels,
    [buildingType]: nextLevel,
  };
}

export function sumResources(resources: ResourceStock): number {
  return RESOURCE_KEYS.reduce((sum, key) => sum + resources[key], 0);
}

export function resourceToPairs(resources: ResourceStock): Array<[ResourceKey, number]> {
  return RESOURCE_KEYS.map((key) => [key, resources[key]]);
}
