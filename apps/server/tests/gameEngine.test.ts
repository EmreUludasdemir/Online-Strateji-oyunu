import { describe, expect, it } from "vitest";

import {
  applyProduction,
  createResourceLedger,
  getBattleLoot,
  getDefensePower,
  getProductionPerMinute,
  getUpgradeCost,
  getUpgradeDurationMs,
  resolveBattle,
  toDisplayResources,
} from "../src/game/engine";

describe("game engine", () => {
  it("reconciles resource production over elapsed time", () => {
    const resources = applyProduction(
      createResourceLedger({ wood: 10, stone: 10, food: 10, gold: 10 }),
      {
        TOWN_HALL: 1,
        FARM: 2,
        LUMBER_MILL: 1,
        QUARRY: 1,
        GOLD_MINE: 1,
      },
      60_000,
    );

    expect(toDisplayResources(resources)).toEqual({
      wood: 26,
      stone: 26,
      food: 50,
      gold: 20,
    });
  });

  it("computes the configured upgrade cost and duration", () => {
    expect(getUpgradeCost("TOWN_HALL", 3)).toEqual({
      wood: 360,
      stone: 360,
      food: 180,
      gold: 120,
    });
    expect(getUpgradeDurationMs("FARM", 4)).toBe(120_000);
  });

  it("resolves deterministic combat and loot caps", () => {
    const result = resolveBattle(90, getDefensePower({
      TOWN_HALL: 1,
      FARM: 1,
      LUMBER_MILL: 1,
      QUARRY: 1,
      GOLD_MINE: 1,
    }));

    expect(result).toBe("ATTACKER_WIN");
    expect(
      getBattleLoot({
        wood: 800,
        stone: 600,
        food: 40,
        gold: 500,
      }),
    ).toEqual({
      wood: 100,
      stone: 100,
      food: 8,
      gold: 60,
    });
  });

  it("aggregates production per building level", () => {
    expect(
      getProductionPerMinute({
        TOWN_HALL: 1,
        FARM: 3,
        LUMBER_MILL: 2,
        QUARRY: 1,
        GOLD_MINE: 4,
      }),
    ).toEqual({
      wood: 32,
      stone: 16,
      food: 60,
      gold: 40,
    });
  });
});
