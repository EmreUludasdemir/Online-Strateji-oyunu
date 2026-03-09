import { describe, expect, it } from "vitest";

import {
  applyProduction,
  createResourceLedger,
  createStartingResearchLevels,
  getBattleLoot,
  getMarchDurationMs,
  getResearchCost,
  getTrainingDurationMs,
  getUpgradeCost,
  getUpgradeDurationMs,
  resolveBattle,
  toDisplayResources,
} from "../src/game/engine";

describe("game engine", () => {
  it("reconciles resource production with research bonuses", () => {
    const resources = applyProduction(
      createResourceLedger({ wood: 10, stone: 10, food: 10, gold: 10 }),
      {
        TOWN_HALL: 1,
        FARM: 2,
        LUMBER_MILL: 1,
        QUARRY: 1,
        GOLD_MINE: 1,
        BARRACKS: 1,
        ACADEMY: 1,
        WATCHTOWER: 1,
      },
      {
        ...createStartingResearchLevels(),
        AGRONOMY: 1,
        STONEWORK: 1,
        GOLD_TRADE: 1,
      },
      60_000,
    );

    expect(toDisplayResources(resources)).toEqual({
      wood: 26,
      stone: 27,
      food: 54,
      gold: 21,
    });
  });

  it("computes upgrade, research, and training timings", () => {
    expect(getUpgradeCost("WATCHTOWER", 2)).toEqual({
      wood: 140,
      stone: 220,
      food: 40,
      gold: 70,
    });
    expect(getUpgradeDurationMs("FARM", 4)).toBe(120_000);
    expect(getResearchCost("LOGISTICS", 2)).toEqual({
      wood: 140,
      stone: 80,
      food: 180,
      gold: 60,
    });
    expect(getTrainingDurationMs("CAVALRY", 10, 2)).toBeLessThan(140_000);
  });

  it("derives march eta from troop composition and bonuses", () => {
    const eta = getMarchDurationMs(
      4,
      {
        INFANTRY: 20,
        ARCHER: 10,
        CAVALRY: 6,
      },
      {
        attackBonus: 0.08,
        defenseBonus: 0.08,
        marchSpeedBonus: 0.1,
        carryBonus: 0.15,
      },
      {
        ...createStartingResearchLevels(),
        LOGISTICS: 1,
      },
    );

    expect(eta).toBeGreaterThan(40_000);
    expect(eta).toBeLessThan(90_000);
  });

  it("resolves deterministic troop combat with carry-limited loot", () => {
    const result = resolveBattle(
      {
        INFANTRY: 40,
        ARCHER: 24,
        CAVALRY: 16,
      },
      {
        INFANTRY: 30,
        ARCHER: 20,
        CAVALRY: 8,
      },
      {
        attackBonus: 0.08,
        defenseBonus: 0.08,
        marchSpeedBonus: 0.1,
        carryBonus: 0.15,
      },
      {
        attackBonus: 0,
        defenseBonus: 0.06,
        marchSpeedBonus: 0,
        carryBonus: 0,
      },
      createStartingResearchLevels(),
      createStartingResearchLevels(),
      {
        TOWN_HALL: 1,
        FARM: 1,
        LUMBER_MILL: 1,
        QUARRY: 1,
        GOLD_MINE: 1,
        BARRACKS: 1,
        ACADEMY: 1,
        WATCHTOWER: 1,
      },
      {
        wood: 800,
        stone: 600,
        food: 400,
        gold: 500,
      },
    );

    expect(result.result).toBe("ATTACKER_WIN");
    expect(result.loot).toEqual(getBattleLoot({ wood: 800, stone: 600, food: 400, gold: 500 }, 1307));
    expect(result.attackerLosses.CAVALRY).toBeGreaterThanOrEqual(0);
    expect(result.defenderLosses.INFANTRY).toBeGreaterThan(0);
  });
});
