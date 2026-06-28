import { expect, test, describe } from "vitest";

import {
  canAfford,
  getAdvisorSuggestions,
  getBuildingBenefits,
  getBuildingProductionPerHour,
  getMissingResources,
  getStorageCapacity,
  getUpgradeCost,
} from "./balanceHelpers";

describe("balanceHelpers", () => {
  test("getUpgradeCost calculates linearly correctly with baseline multiplier", () => {
    // TOWN_HALL base: { wood: 120, stone: 120, food:  60, gold:  40 }
    const cost = getUpgradeCost("TOWN_HALL", 3);
    expect(cost.wood).toBe(360);
    expect(cost.stone).toBe(360);
    expect(cost.food).toBe(180);
    expect(cost.gold).toBe(120);
  });

  test("canAfford checks resources correctly", () => {
    const cost = { wood: 100, stone: 100, food: 50, gold: 10 };
    expect(canAfford({ wood: 100, stone: 100, food: 50, gold: 10 }, cost)).toBe(true);
    expect(canAfford({ wood: 100, stone: 100, food: 50, gold: 9 }, cost)).toBe(false);
  });

  test("getMissingResources returns only deficits", () => {
    const cost = { wood: 100, stone: 100, food: 50, gold: 10 };
    const missing = getMissingResources({ wood: 120, stone: 90, food: 50, gold: 0 }, cost);
    expect(missing).toEqual({ stone: 10, gold: 10 });
  });

  test("getStorageCapacity scales properly", () => {
    expect(getStorageCapacity(1)).toBe(5000);
    expect(getStorageCapacity(2)).toBe(7000); // 5000 + 2000
    expect(getStorageCapacity(10)).toBe(23000); // 5000 + (9 * 2000)
  });

  test("getBuildingProductionPerHour scales properly", () => {
    // FARM base: { food: 20 }
    const prod = getBuildingProductionPerHour("FARM", 5);
    expect(prod.food).toBe(6000); // 20 * 5 * 60
    expect(prod.wood).toBe(0);
  });

  test("getBuildingBenefits returns non-empty string for valid building", () => {
    expect(getBuildingBenefits("BARRACKS", 5).length).toBeGreaterThan(0);
    expect(getBuildingBenefits("ACADEMY", 3).length).toBeGreaterThan(0);
  });

  test("getAdvisorSuggestions flags storage capacity issue", () => {
    const mockCity = {
      buildings: [{ type: "TOWN_HALL", level: 1 }],
      resources: { wood: 4600, stone: 100, food: 100, gold: 100 }, // Cap is 5000
      troops: [{ quantity: 100 }], // Army > 50 (no warning)
      activeUpgrade: { buildingType: "FARM" }, // Has builder (no warning)
    };
    
    const suggestions = getAdvisorSuggestions(mockCity);
    expect(suggestions.find((s) => s.id === "storage_full")).toBeDefined();
  });

  test("getAdvisorSuggestions flags low army issue", () => {
    const mockCity = {
      buildings: [{ type: "TOWN_HALL", level: 2 }],
      resources: { wood: 100, stone: 100, food: 100, gold: 100 }, // Cap is 7000
      troops: [{ quantity: 20 }], // Target is 2 * 50 = 100
      activeUpgrade: { buildingType: "FARM" },
    };
    
    const suggestions = getAdvisorSuggestions(mockCity);
    expect(suggestions.find((s) => s.id === "low_army")).toBeDefined();
  });

  test("getAdvisorSuggestions flags idle builder", () => {
    const mockCity = {
      buildings: [{ type: "TOWN_HALL", level: 1 }],
      resources: { wood: 100, stone: 100, food: 100, gold: 100 },
      troops: [{ quantity: 100 }],
      activeUpgrade: null, // Idle builder!
    };
    
    const suggestions = getAdvisorSuggestions(mockCity);
    expect(suggestions.find((s) => s.id === "idle_builder")).toBeDefined();
  });
});
