import type {
  BattleResult,
  BuildingType,
  ResearchType,
  ResourceKey,
  ResourceStock,
  TroopStock,
  TroopType,
} from "@frontier/shared";
import { BUILDING_TYPES, RESEARCH_TYPES, RESOURCE_KEYS, TROOP_TYPES } from "@frontier/shared";

import {
  ATTACK_LOOT_PERCENT,
  BASE_MARCH_SECONDS_PER_TILE,
  BASE_VISION_RADIUS,
  MAX_LOOT,
  MIN_MARCH_SECONDS,
  PRODUCTION_PER_MINUTE_PER_LEVEL,
  RESEARCH_BASE_COST,
  RESEARCH_DURATION_MINUTES,
  RESEARCH_MAX_LEVEL,
  STARTING_BUILDING_LEVEL,
  STARTING_RESEARCH_LEVEL,
  TROOP_ATTACK,
  TROOP_BASE_COST,
  TROOP_BASE_DURATION_SECONDS,
  TROOP_CARRY,
  TROOP_DEFENSE,
  TROOP_SPEED,
  UPGRADE_COST_BASE,
} from "./constants";

export type BuildingLevelMap = Record<BuildingType, number>;
export type ResearchLevelMap = Record<ResearchType, number>;
export interface CommanderBonuses {
  attackBonus: number;
  defenseBonus: number;
  marchSpeedBonus: number;
  carryBonus: number;
}

export interface BattleResolution {
  result: BattleResult;
  attackerPower: number;
  defenderPower: number;
  loot: ResourceStock;
  attackerLosses: TroopStock;
  defenderLosses: TroopStock;
  attackerSurvivors: TroopStock;
  defenderSurvivors: TroopStock;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function createResourceLedger(seed?: Partial<ResourceStock>): ResourceStock {
  return {
    wood: seed?.wood ?? 0,
    stone: seed?.stone ?? 0,
    food: seed?.food ?? 0,
    gold: seed?.gold ?? 0,
  };
}

export function createTroopLedger(seed?: Partial<TroopStock>): TroopStock {
  return {
    INFANTRY: seed?.INFANTRY ?? 0,
    ARCHER: seed?.ARCHER ?? 0,
    CAVALRY: seed?.CAVALRY ?? 0,
  };
}

export function createStartingBuildingLevels(): BuildingLevelMap {
  return BUILDING_TYPES.reduce<BuildingLevelMap>((levels, type) => {
    levels[type] = STARTING_BUILDING_LEVEL;
    return levels;
  }, {} as BuildingLevelMap);
}

export function createStartingResearchLevels(): ResearchLevelMap {
  return RESEARCH_TYPES.reduce<ResearchLevelMap>((levels, type) => {
    levels[type] = STARTING_RESEARCH_LEVEL;
    return levels;
  }, {} as ResearchLevelMap);
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

export function getResearchLevels(
  researchLevels: Array<{ researchType: ResearchType; level: number }>,
): ResearchLevelMap {
  const levels = createStartingResearchLevels();

  for (const research of researchLevels) {
    levels[research.researchType] = research.level;
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

export function getUpgradeDurationMs(
  buildingType: BuildingType,
  targetLevel: number,
  researchLevels?: ResearchLevelMap,
): number {
  const secondsPerLevel = buildingType === "TOWN_HALL" ? 60 : 30;
  const baseMs = secondsPerLevel * targetLevel * 1000;
  if (!researchLevels) return baseMs;
  const reduction = researchLevels.CITY_PLANNING * 0.1;
  return Math.max(5000, Math.round(baseMs * (1 - reduction)));
}

export function getProductionPerMinute(
  buildings: BuildingLevelMap,
  researchLevels: ResearchLevelMap,
): ResourceStock {
  const production = createResourceLedger();

  for (const buildingType of BUILDING_TYPES) {
    const level = buildings[buildingType];
    const buildingProduction = PRODUCTION_PER_MINUTE_PER_LEVEL[buildingType];

    for (const key of RESOURCE_KEYS) {
      production[key] += (buildingProduction[key] ?? 0) * level;
    }
  }

  production.food *= 1 + researchLevels.AGRONOMY * 0.12;
  production.stone *= 1 + researchLevels.STONEWORK * 0.12;
  production.gold *= 1 + researchLevels.GOLD_TRADE * 0.12;

  return production;
}

export function applyProduction(
  resources: ResourceStock,
  buildings: BuildingLevelMap,
  researchLevels: ResearchLevelMap,
  elapsedMs: number,
): ResourceStock {
  if (elapsedMs <= 0) {
    return { ...resources };
  }

  const production = getProductionPerMinute(buildings, researchLevels);
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

export function addTroops(troops: TroopStock, gain: TroopStock): TroopStock {
  return TROOP_TYPES.reduce<TroopStock>((next, key) => {
    next[key] = troops[key] + gain[key];
    return next;
  }, createTroopLedger());
}

export function spendTroops(troops: TroopStock, loss: TroopStock): TroopStock {
  return TROOP_TYPES.reduce<TroopStock>((next, key) => {
    next[key] = Math.max(0, troops[key] - loss[key]);
    return next;
  }, createTroopLedger());
}

export function hasEnoughTroops(troops: TroopStock, requested: TroopStock): boolean {
  return TROOP_TYPES.every((type) => troops[type] >= requested[type]);
}

export function getTroopTrainingCost(troopType: TroopType, quantity: number): ResourceStock {
  const base = TROOP_BASE_COST[troopType];

  return RESOURCE_KEYS.reduce<ResourceStock>((cost, key) => {
    cost[key] = base[key] * quantity;
    return cost;
  }, createResourceLedger());
}

export function getTrainingDurationMs(
  troopType: TroopType,
  quantity: number,
  barracksLevel: number,
): number {
  const baseSeconds = TROOP_BASE_DURATION_SECONDS[troopType] * quantity;
  const speedMultiplier = 1 + Math.max(0, barracksLevel - 1) * 0.12;
  return Math.ceil((baseSeconds / speedMultiplier) * 1000);
}

export function getResearchCost(researchType: ResearchType, nextLevel: number): ResourceStock {
  const base = RESEARCH_BASE_COST[researchType];
  return RESOURCE_KEYS.reduce<ResourceStock>((cost, key) => {
    cost[key] = Math.round(base[key] * nextLevel);
    return cost;
  }, createResourceLedger());
}

export function getResearchDurationMs(researchType: ResearchType, nextLevel: number): number {
  return RESEARCH_DURATION_MINUTES[researchType] * nextLevel * 60 * 1000;
}

export function canAdvanceResearch(level: number): boolean {
  return level < RESEARCH_MAX_LEVEL;
}

export function manhattanDistance(
  source: { x: number; y: number },
  target: { x: number; y: number },
): number {
  return Math.abs(source.x - target.x) + Math.abs(source.y - target.y);
}

export function getVisionRadius(
  watchtowerLevel: number,
  researchLevels: ResearchLevelMap,
): number {
  return BASE_VISION_RADIUS + Math.max(0, watchtowerLevel - 1) + researchLevels.SCOUTING;
}

export function getTroopAttackPower(troops: TroopStock): number {
  return TROOP_TYPES.reduce((sum, type) => sum + troops[type] * TROOP_ATTACK[type], 0);
}

export function getTroopDefensePower(troops: TroopStock): number {
  return TROOP_TYPES.reduce((sum, type) => sum + troops[type] * TROOP_DEFENSE[type], 0);
}

export function getStructuralDefense(
  buildingLevels: BuildingLevelMap,
  researchLevels: ResearchLevelMap,
): number {
  const base =
    buildingLevels.TOWN_HALL * 34 +
    buildingLevels.WATCHTOWER * 28 +
    buildingLevels.QUARRY * 8 +
    buildingLevels.WALL * 40;

  return Math.round(base * (1 + researchLevels.STONEWORK * 0.05));
}

export function getAttackPower(
  troops: TroopStock,
  commander: CommanderBonuses,
  researchLevels: ResearchLevelMap,
  buildingLevels?: BuildingLevelMap,
): number {
  // Per-type bonuses from specialisation research
  const infantryPower = troops.INFANTRY * TROOP_ATTACK.INFANTRY;
  const archerPower = troops.ARCHER * TROOP_ATTACK.ARCHER * (1 + researchLevels.ARCHERY * 0.08);
  const cavalryPower =
    troops.CAVALRY * TROOP_ATTACK.CAVALRY * (1 + researchLevels.CAVALRY_TACTICS * 0.08);
  const troopPower = infantryPower + archerPower + cavalryPower;

  const forgeMult = buildingLevels ? 1 + buildingLevels.FORGE * 0.04 : 1;
  const globalMult =
    1 + commander.attackBonus + researchLevels.MILITARY_DRILL * 0.05 + researchLevels.METALLURGY * 0.05;

  return Math.round(troopPower * globalMult * forgeMult);
}

export function getDefensePower(
  troops: TroopStock,
  buildingLevels: BuildingLevelMap,
  commander: CommanderBonuses,
  researchLevels: ResearchLevelMap,
): number {
  const troopPower = getTroopDefensePower(troops);
  const structural = getStructuralDefense(buildingLevels, researchLevels);
  return Math.round(troopPower * (1 + commander.defenseBonus) + structural);
}

export function getMarchDurationMs(
  distance: number,
  troops: TroopStock,
  commander: CommanderBonuses,
  researchLevels: ResearchLevelMap,
): number {
  const totalTroops = sumTroops(troops);
  if (distance <= 0 || totalTroops <= 0) {
    return MIN_MARCH_SECONDS * 1000;
  }

  // Cavalry Tactics research boosts cavalry march speed contribution
  const weightedSpeed =
    TROOP_TYPES.reduce((sum, type) => {
      const speed =
        type === "CAVALRY"
          ? TROOP_SPEED[type] * (1 + researchLevels.CAVALRY_TACTICS * 0.06)
          : TROOP_SPEED[type];
      return sum + troops[type] * speed;
    }, 0) / totalTroops;
  const speedModifier =
    Math.max(0.6, weightedSpeed) *
    (1 + commander.marchSpeedBonus + researchLevels.LOGISTICS * 0.08);

  return Math.max(
    MIN_MARCH_SECONDS * 1000,
    Math.ceil((distance * BASE_MARCH_SECONDS_PER_TILE * 1000) / speedModifier),
  );
}

export function sumResources(resources: ResourceStock): number {
  return RESOURCE_KEYS.reduce((sum, key) => sum + resources[key], 0);
}

export function sumTroops(troops: TroopStock): number {
  return TROOP_TYPES.reduce((sum, key) => sum + troops[key], 0);
}

export function getBattleLoot(defenderResources: ResourceStock, carryCapacity: number): ResourceStock {
  const requested = RESOURCE_KEYS.reduce<ResourceStock>((loot, key) => {
    loot[key] = Math.min(MAX_LOOT[key], Math.floor(defenderResources[key] * ATTACK_LOOT_PERCENT));
    return loot;
  }, createResourceLedger());

  const totalRequested = sumResources(requested);
  if (totalRequested <= carryCapacity) {
    return requested;
  }

  if (carryCapacity <= 0) {
    return createResourceLedger();
  }

  const scaled = RESOURCE_KEYS.reduce<ResourceStock>((loot, key) => {
    loot[key] = Math.floor((requested[key] / totalRequested) * carryCapacity);
    return loot;
  }, createResourceLedger());

  let remainder = carryCapacity - sumResources(scaled);
  const sortedKeys = [...RESOURCE_KEYS].sort((left, right) => requested[right] - requested[left]);

  for (const key of sortedKeys) {
    if (remainder <= 0) {
      break;
    }

    if (scaled[key] < requested[key]) {
      scaled[key] += 1;
      remainder -= 1;
    }
  }

  return scaled;
}

function scaleTroops(troops: TroopStock, survivalRatio: number): TroopStock {
  return TROOP_TYPES.reduce<TroopStock>((next, type) => {
    next[type] = Math.floor(troops[type] * survivalRatio);
    return next;
  }, createTroopLedger());
}

function invertLosses(original: TroopStock, survivors: TroopStock): TroopStock {
  return TROOP_TYPES.reduce<TroopStock>((losses, type) => {
    losses[type] = Math.max(0, original[type] - survivors[type]);
    return losses;
  }, createTroopLedger());
}

export function getCarryCapacity(troops: TroopStock, commander: CommanderBonuses): number {
  const rawCapacity = TROOP_TYPES.reduce((sum, type) => sum + troops[type] * TROOP_CARRY[type], 0);
  return Math.round(rawCapacity * (1 + commander.carryBonus));
}

export function getMarchPosition(
  origin: { x: number; y: number },
  target: { x: number; y: number },
  startsAt: Date,
  etaAt: Date,
  now: Date,
): { x: number; y: number } {
  const totalMs = Math.max(1, etaAt.getTime() - startsAt.getTime());
  const elapsed = clamp((now.getTime() - startsAt.getTime()) / totalMs, 0, 1);

  return {
    x: Math.round(origin.x + (target.x - origin.x) * elapsed),
    y: Math.round(origin.y + (target.y - origin.y) * elapsed),
  };
}

export function getHospitalHealingCapacity(
  buildingLevels: BuildingLevelMap,
  researchLevels: ResearchLevelMap,
): number {
  if (buildingLevels.HOSPITAL < 1) return 0;
  const base = buildingLevels.HOSPITAL * 5;
  return Math.round(base * (1 + researchLevels.MEDICINE * 0.2));
}

export function resolveBattle(
  attackerTroops: TroopStock,
  defenderTroops: TroopStock,
  attackerCommander: CommanderBonuses,
  defenderCommander: CommanderBonuses,
  attackerResearch: ResearchLevelMap,
  defenderResearch: ResearchLevelMap,
  defenderBuildings: BuildingLevelMap,
  defenderResources: ResourceStock,
  attackerBuildings?: BuildingLevelMap,
): BattleResolution {
  const attackerPower = getAttackPower(attackerTroops, attackerCommander, attackerResearch, attackerBuildings);
  const defenderPower = getDefensePower(
    defenderTroops,
    defenderBuildings,
    defenderCommander,
    defenderResearch,
  );

  const result: BattleResult = attackerPower > defenderPower ? "ATTACKER_WIN" : "DEFENDER_HOLD";
  const gap = Math.abs(attackerPower - defenderPower) / Math.max(1, attackerPower + defenderPower);

  const attackerSurvivalRatio =
    result === "ATTACKER_WIN"
      ? clamp(0.58 + gap * 0.3, 0.58, 0.88)
      : clamp(0.16 + gap * 0.08, 0.16, 0.28);
  const defenderSurvivalRatio =
    result === "ATTACKER_WIN"
      ? clamp(0.08 + gap * 0.08, 0.08, 0.18)
      : clamp(0.62 + gap * 0.22, 0.62, 0.88);

  const attackerSurvivors = scaleTroops(attackerTroops, attackerSurvivalRatio);
  const defenderSurvivors = scaleTroops(defenderTroops, defenderSurvivalRatio);
  const attackerLosses = invertLosses(attackerTroops, attackerSurvivors);
  const defenderLosses = invertLosses(defenderTroops, defenderSurvivors);
  const loot =
    result === "ATTACKER_WIN"
      ? getBattleLoot(defenderResources, getCarryCapacity(attackerSurvivors, attackerCommander))
      : createResourceLedger();

  return {
    result,
    attackerPower,
    defenderPower,
    loot,
    attackerLosses,
    defenderLosses,
    attackerSurvivors,
    defenderSurvivors,
  };
}

export function defaultCommanderBonuses(): CommanderBonuses {
  return {
    attackBonus: 0,
    defenseBonus: 0,
    marchSpeedBonus: 0,
    carryBonus: 0,
  };
}

export function resourceToPairs(resources: ResourceStock): Array<[ResourceKey, number]> {
  return RESOURCE_KEYS.map((key) => [key, resources[key]]);
}
