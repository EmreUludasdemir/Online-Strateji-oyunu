import type { BuildingType, ResourceKey, ResourceStock } from "@frontier/shared";

import {
  getBuildingMaxLevelByTownHall,
  PRODUCTION_PER_MINUTE_PER_LEVEL,
  STORAGE_CAPACITY_BASE,
  STORAGE_CAPACITY_PER_LEVEL,
  UPGRADE_COST_BASE,
  UPGRADE_COST_MULTIPLIER,
} from "./balanceConfig";

export const RESOURCE_KEYS: ResourceKey[] = ["wood", "stone", "food", "gold"];

function createResourceLedger(): ResourceStock {
  return { wood: 0, stone: 0, food: 0, gold: 0 };
}

// Mirrors backend `engine.ts:getUpgradeCost`
export function getUpgradeCost(buildingType: BuildingType, targetLevel: number): ResourceStock {
  const base = UPGRADE_COST_BASE[buildingType];
  const multiplier = Math.round(targetLevel * UPGRADE_COST_MULTIPLIER);

  return RESOURCE_KEYS.reduce<ResourceStock>((cost, key) => {
    cost[key] = Math.round(base[key] * multiplier);
    return cost;
  }, createResourceLedger());
}

export function getMissingResources(current: Record<ResourceKey, number>, cost: ResourceStock): Partial<ResourceStock> {
  const missing: Partial<ResourceStock> = {};
  for (const key of RESOURCE_KEYS) {
    if (current[key] < cost[key]) {
      missing[key] = cost[key] - current[key];
    }
  }
  return missing;
}

export function canAfford(current: Record<ResourceKey, number>, cost: ResourceStock): boolean {
  return RESOURCE_KEYS.every((key) => current[key] >= cost[key]);
}

// Mirrors backend `engine.ts:getProductionPerMinute` for a specific building
export function getBuildingProductionPerHour(buildingType: BuildingType, level: number): ResourceStock {
  const production = createResourceLedger();
  const base = PRODUCTION_PER_MINUTE_PER_LEVEL[buildingType];

  for (const key of RESOURCE_KEYS) {
    production[key] = (base[key] ?? 0) * level * 60;
  }
  return production;
}

export function getStorageCapacity(townHallLevel: number): number {
  return STORAGE_CAPACITY_BASE + Math.max(0, townHallLevel - 1) * STORAGE_CAPACITY_PER_LEVEL;
}

// Generate progression guidance text for a building
export function getBuildingBenefits(buildingType: BuildingType, level: number): string {
  switch (buildingType) {
    case "TOWN_HALL":
      return `Maksimum seviye kapasitesi L${level}, Depo kapasitesi: ${getStorageCapacity(level).toLocaleString()}`;
    case "BARRACKS":
      return `Asker eğitim hızı bonusu: +${Math.max(0, level - 1) * 12}%`;
    case "ACADEMY":
      return `Araştırma hızı bonusu: +${Math.max(0, level - 1) * 10}%`;
    case "WATCHTOWER":
      return `Harita görüş alanı: ${4 + Math.max(0, level - 1)} kare`;
    case "HOSPITAL":
      return `Şifa kapasitesi: ${level * 5} yaralı/tur`;
    case "WALL":
      return `Sur dayanıklılığı: +${level * 40} Savunma`;
    case "FORGE":
      return `Silah geliştirme: +${level * 4}% Saldırı Gücü`;
    case "FARM":
      return `Gıda üretimi: +${(PRODUCTION_PER_MINUTE_PER_LEVEL.FARM.food ?? 0) * level * 60}/saat`;
    case "LUMBER_MILL":
      return `Odun üretimi: +${(PRODUCTION_PER_MINUTE_PER_LEVEL.LUMBER_MILL.wood ?? 0) * level * 60}/saat`;
    case "QUARRY":
      return `Taş üretimi: +${(PRODUCTION_PER_MINUTE_PER_LEVEL.QUARRY.stone ?? 0) * level * 60}/saat`;
    case "GOLD_MINE":
      return `Altın üretimi: +${(PRODUCTION_PER_MINUTE_PER_LEVEL.GOLD_MINE.gold ?? 0) * level * 60}/saat`;
    case "EMBASSY":
      return `İttifak üye kapasitesi desteği`;
    default:
      return "";
  }
}

// Advisor Logic
export interface AdvisorSuggestion {
  id: string;
  type: "URGENT" | "UPGRADE" | "ARMY" | "ECONOMY";
  message: string;
  actionLabel: string;
  actionRoute?: string;
  actionBuilding?: BuildingType;
}

export function getAdvisorSuggestions(city: any): AdvisorSuggestion[] {
  const suggestions: AdvisorSuggestion[] = [];
  const townHall = city.buildings.find((b: any) => b.type === "TOWN_HALL");
  const thLevel = townHall?.level ?? 1;
  const capacity = getStorageCapacity(thLevel);

  // Check storage limit warning
  const highResources = RESOURCE_KEYS.some((key) => city.resources[key] > capacity * 0.9);
  if (highResources) {
    suggestions.push({
      id: "storage_full",
      type: "URGENT",
      message: "Depo kapasitesi dolmak üzere! Kağan Otağını yükselterek kapasiteyi artırın veya kaynakları harcayın.",
      actionLabel: "Otağı Yükselt",
      actionBuilding: "TOWN_HALL",
    });
  }

  // Check army power relative to TH level
  const totalTroops = city.troops.reduce((sum: number, t: any) => sum + t.quantity, 0);
  if (totalTroops < thLevel * 50) {
    suggestions.push({
      id: "low_army",
      type: "ARMY",
      message: "Ordu boyutunuz şehir seviyenize göre yetersiz. Olası kuşatmalara karşı savunmasızsınız.",
      actionLabel: "Asker Eğit",
      actionRoute: "/app/army",
    });
  }

  // Check economy building balance
  const lowestEco = city.buildings
    .filter((b: any) => ["FARM", "LUMBER_MILL", "QUARRY"].includes(b.type))
    .sort((a: any, b: any) => a.level - b.level)[0];
  
  if (lowestEco && lowestEco.level < thLevel - 2) {
    const nameMap: Record<string, string> = { FARM: "Erzak Tarlası", LUMBER_MILL: "Odunluk", QUARRY: "Taş Ocağı" };
    suggestions.push({
      id: "eco_lag",
      type: "ECONOMY",
      message: `${nameMap[lowestEco.type] ?? "Üretim binası"} seviyeniz düşük kaldı. Ekonomiyi güçlendirmek için yükseltin.`,
      actionLabel: "Üretimi Artır",
      actionBuilding: lowestEco.type,
    });
  }

  // Check idle builder
  if (!city.activeUpgrade) {
    suggestions.push({
      id: "idle_builder",
      type: "UPGRADE",
      message: "İnşa kuyruğunuz boş. Şehrin gelişimini hızlandırmak için bir bina yükseltmesi başlatın.",
      actionLabel: "Bina Seç",
      actionRoute: "/app/city",
    });
  }

  return suggestions;
}
