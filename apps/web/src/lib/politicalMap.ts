import type { FogState, FogTileView, PoiResourceType, PoiView } from "@frontier/shared";

import { getKingdomPasses, getKingdomSanctuaries, getKingdomTier } from "../components/kingdomMap";
import type { WorldRegion } from "../components/worldRegions";

export type MapMode = "TERRAIN" | "POLITICAL" | "THREAT" | "RESOURCE" | "ALLIANCE" | "MARCH";
export type RealmRelation = "friendly" | "neutral" | "hostile" | "rival" | "unknown";
export type ProvinceStatus = "friendly" | "neutral" | "hostile" | "contested" | "unknown";
export type ProvinceRiskLevel = "low" | "guarded" | "dangerous" | "deadly" | "unknown";
export type ProvinceAction = "SCOUT" | "MARCH" | "RAID" | "CLAIM" | "SUPPORT" | "TRADE" | "VIEW_REALM";
export type ProvinceTerrain = "steppe" | "mountain" | "pass" | "sanctuary" | "borderland";

export interface RealmIdentity {
  id: string;
  name: string;
  shortTag: string;
  primaryColor: string;
  borderColor: string;
  capitalX: number;
  capitalY: number;
  relation: RealmRelation;
  strength: number;
  preferredUnit: "infantry" | "archer" | "cavalry" | "scout" | "mixed";
  identity: string;
  lore: string;
}

export interface ProvinceResourceValue {
  wood: number;
  stone: number;
  food: number;
  gold: number;
}

export interface ProvinceIntel {
  id: string;
  name: string;
  x: number;
  y: number;
  realm: RealmIdentity;
  terrain: ProvinceTerrain;
  tierLabel: string;
  strategicValue: number;
  resourceValue: ProvinceResourceValue;
  riskLevel: ProvinceRiskLevel;
  status: ProvinceStatus;
  nearbyCamps: number;
  nearbyResources: number;
  nearbyPasses: number;
  nearbySanctuaries: number;
  availableActions: ProvinceAction[];
  advisorText: string;
}

const REALM_IDENTITIES: Record<string, Omit<RealmIdentity, "primaryColor" | "borderColor" | "capitalX" | "capitalY">> = {
  "kut-otagi": {
    id: "kut-otagi",
    name: "Kut Otağı",
    shortTag: "KUT",
    relation: "friendly",
    strength: 92,
    preferredUnit: "mixed",
    identity: "Kut merkezi",
    lore: "Kağanlık töresini ve merkez geçitlerini koruyan otağ.",
  },
  "kok-tore": {
    id: "kok-tore",
    name: "Kök Töre",
    shortTag: "KOK",
    relation: "friendly",
    strength: 64,
    preferredUnit: "scout",
    identity: "Keşif ve töre",
    lore: "Sisli hudutları erken okuyan hafif süvari sancaklarıyla bilinir.",
  },
  "oguz-yurdu": {
    id: "oguz-yurdu",
    name: "Oğuz Yurdu",
    shortTag: "OGZ",
    relation: "neutral",
    strength: 71,
    preferredUnit: "cavalry",
    identity: "Atlı baskı",
    lore: "Açık bozkırda hızlı akın ve erzak baskısı kuran yurt.",
  },
  "uygur-eli": {
    id: "uygur-eli",
    name: "Uygur Eli",
    shortTag: "UYG",
    relation: "neutral",
    strength: 58,
    preferredUnit: "archer",
    identity: "Ticaret ve okçu hatları",
    lore: "Kervan yollarını ve menzilli savunma düzenlerini iyi kullanır.",
  },
  "hazar-kapisi": {
    id: "hazar-kapisi",
    name: "Hazar Kapısı",
    shortTag: "HAZ",
    relation: "rival",
    strength: 83,
    preferredUnit: "mixed",
    identity: "Kapı kontrolü",
    lore: "Doğu geçitlerini tutan, hudut baskısı yüksek güçlü sancak.",
  },
  "selcuk-ucu": {
    id: "selcuk-ucu",
    name: "Selçuk Ucu",
    shortTag: "SEL",
    relation: "hostile",
    strength: 78,
    preferredUnit: "cavalry",
    identity: "Uç akınları",
    lore: "Sınır boyunda fırsat gördüğünde hızlı süvari akını başlatır.",
  },
  "kipcak-bozkiri": {
    id: "kipcak-bozkiri",
    name: "Kıpçak Bozkırı",
    shortTag: "KIP",
    relation: "neutral",
    strength: 67,
    preferredUnit: "cavalry",
    identity: "Bozkır süvarisi",
    lore: "Geniş otlakları ve hızlı rota değişimleriyle öne çıkar.",
  },
  "karluk-dagi": {
    id: "karluk-dagi",
    name: "Karluk Dağı",
    shortTag: "KAR",
    relation: "friendly",
    strength: 61,
    preferredUnit: "infantry",
    identity: "Dağ savunması",
    lore: "Taş ve geçit savunması güçlü, yavaş ama sağlam bir hudut.",
  },
  "avar-siniri": {
    id: "avar-siniri",
    name: "Avar Sınırı",
    shortTag: "AVR",
    relation: "unknown",
    strength: 54,
    preferredUnit: "scout",
    identity: "Bilinmeyen sınır",
    lore: "Sisli uçlarda niyeti tam okunmayan eski bir sınır gücü.",
  },
};

function hashCoordinate(x: number, y: number): number {
  return ((x * 73856093) ^ (y * 19349663)) >>> 0;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function distance(a: { x: number; y: number }, b: { x: number; y: number }) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function getRealmIdentity(region: WorldRegion): RealmIdentity {
  const identity = REALM_IDENTITIES[region.id] ?? REALM_IDENTITIES["avar-siniri"];
  return {
    ...identity,
    primaryColor: region.color,
    borderColor: region.borderColor,
    capitalX: region.capitalX,
    capitalY: region.capitalY,
  };
}

export function getRealmRelation(region: WorldRegion): RealmRelation {
  return getRealmIdentity(region).relation;
}

export function getProvinceTerrain(x: number, y: number, worldSize: number): ProvinceTerrain {
  const passes = getKingdomPasses(worldSize);
  if (passes.some((entry) => distance(entry, { x, y }) <= 1.35)) return "pass";
  if (getKingdomSanctuaries(worldSize).some((entry) => distance(entry, { x, y }) <= 1.15)) return "sanctuary";
  const tier = getKingdomTier(x, y, worldSize).id;
  const h = hashCoordinate(x + 19, y + 41);
  if (tier === "TIER_3" || h % 17 === 0) return "mountain";
  if (h % 7 === 0 || h % 11 === 0) return "borderland";
  return "steppe";
}

export function getProvinceResourceValue(
  x: number,
  y: number,
  worldSize: number,
  pois: ReadonlyArray<Pick<PoiView, "x" | "y" | "kind" | "resourceType" | "remainingAmount" | "level">> = [],
): ProvinceResourceValue {
  const terrain = getProvinceTerrain(x, y, worldSize);
  const h = hashCoordinate(x + 7, y + 97);
  const base: ProvinceResourceValue = {
    wood: 22 + (h % 34),
    stone: 18 + (Math.floor(h / 5) % 36),
    food: 28 + (Math.floor(h / 11) % 42),
    gold: 10 + (Math.floor(h / 17) % 30),
  };

  if (terrain === "mountain" || terrain === "pass") {
    base.stone += 22;
    base.gold += 10;
    base.food -= 8;
  }
  if (terrain === "steppe" || terrain === "borderland") {
    base.food += 16;
    base.wood += 8;
  }
  if (terrain === "sanctuary") {
    base.gold += 26;
    base.food += 10;
  }

  for (const poi of pois) {
    if (poi.kind !== "RESOURCE_NODE" || distance(poi, { x, y }) > 4.2) continue;
    const boost = 8 + poi.level * 4 + Math.min(18, Math.round((poi.remainingAmount ?? 0) / 120));
    applyResourceBoost(base, poi.resourceType, boost);
  }

  return {
    wood: clamp(Math.round(base.wood), 0, 100),
    stone: clamp(Math.round(base.stone), 0, 100),
    food: clamp(Math.round(base.food), 0, 100),
    gold: clamp(Math.round(base.gold), 0, 100),
  };
}

function applyResourceBoost(target: ProvinceResourceValue, resourceType: PoiResourceType | null, amount: number) {
  if (resourceType === "WOOD") target.wood += amount;
  if (resourceType === "STONE") target.stone += amount;
  if (resourceType === "FOOD") target.food += amount;
  if (resourceType === "GOLD") target.gold += amount;
}

export function getProvinceStrategicValue(x: number, y: number, worldSize: number, pois: ReadonlyArray<Pick<PoiView, "x" | "y" | "kind">> = []) {
  const terrain = getProvinceTerrain(x, y, worldSize);
  const tier = getKingdomTier(x, y, worldSize).id;
  const nearbyPasses = getKingdomPasses(worldSize).filter((entry) => distance(entry, { x, y }) <= 4.8).length;
  const nearbySanctuaries = getKingdomSanctuaries(worldSize).filter((entry) => distance(entry, { x, y }) <= 5.2).length;
  const nearbyCamps = pois.filter((poi) => poi.kind === "BARBARIAN_CAMP" && distance(poi, { x, y }) <= 5.2).length;
  const tierValue = tier === "TIER_3" ? 34 : tier === "TIER_2" ? 22 : 12;
  const terrainValue = terrain === "pass" ? 28 : terrain === "sanctuary" ? 24 : terrain === "mountain" ? 16 : terrain === "borderland" ? 14 : 8;

  return clamp(tierValue + terrainValue + nearbyPasses * 11 + nearbySanctuaries * 9 + nearbyCamps * 4, 1, 100);
}

export function getProvinceRiskLevel(
  relation: RealmRelation,
  localThreat: number,
  fogState: FogState | null,
): ProvinceRiskLevel {
  if (fogState === "HIDDEN" || relation === "unknown") return "unknown";
  const relationThreat = relation === "hostile" ? 28 : relation === "rival" ? 20 : relation === "neutral" ? 8 : 0;
  const score = localThreat + relationThreat;
  if (score >= 76) return "deadly";
  if (score >= 48) return "dangerous";
  if (score >= 22) return "guarded";
  return "low";
}

export function getProvinceStatus(relation: RealmRelation, riskLevel: ProvinceRiskLevel, nearbyCamps: number, fogState: FogState | null): ProvinceStatus {
  if (fogState === "HIDDEN" || riskLevel === "unknown") return "unknown";
  if (nearbyCamps >= 1 && (relation === "hostile" || relation === "rival" || riskLevel === "dangerous")) return "contested";
  if (nearbyCamps >= 2 || riskLevel === "deadly") return "contested";
  if (relation === "friendly") return "friendly";
  if (relation === "hostile" || relation === "rival") return "hostile";
  return "neutral";
}

export function canScoutProvince(province: Pick<ProvinceIntel, "status" | "riskLevel">) {
  return province.status !== "friendly" || province.riskLevel === "unknown";
}

export function canMarchToProvince(province: Pick<ProvinceIntel, "status" | "riskLevel">) {
  return province.status !== "unknown" && province.riskLevel !== "deadly";
}

export function getAvailableProvinceActions(province: Pick<ProvinceIntel, "status" | "riskLevel" | "realm">): ProvinceAction[] {
  const actions: ProvinceAction[] = ["VIEW_REALM"];
  if (canScoutProvince(province)) actions.unshift("SCOUT");
  if (canMarchToProvince(province)) actions.push("MARCH");
  if (province.status === "hostile" || province.status === "contested") actions.push("RAID");
  if (province.status === "neutral" || province.status === "contested") actions.push("CLAIM");
  if (province.status === "friendly") actions.push("SUPPORT", "TRADE");
  if (province.realm.relation === "neutral") actions.push("TRADE");
  return Array.from(new Set(actions));
}

export function buildProvinceIntel(params: {
  x: number;
  y: number;
  worldSize: number;
  region: WorldRegion;
  fogState: FogState | null;
  pois?: ReadonlyArray<PoiView>;
  tiles?: ReadonlyArray<FogTileView>;
}): ProvinceIntel {
  const { x, y, worldSize, region, fogState, pois = [] } = params;
  const realm = getRealmIdentity(region);
  const nearbyCamps = pois.filter((poi) => poi.kind === "BARBARIAN_CAMP" && distance(poi, { x, y }) <= 5.5).length;
  const nearbyResources = pois.filter((poi) => poi.kind === "RESOURCE_NODE" && distance(poi, { x, y }) <= 5.5).length;
  const nearbyPasses = getKingdomPasses(worldSize).filter((entry) => distance(entry, { x, y }) <= 5.5).length;
  const nearbySanctuaries = getKingdomSanctuaries(worldSize).filter((entry) => distance(entry, { x, y }) <= 5.5).length;
  const localThreat = nearbyCamps * 18 + nearbyPasses * 6 + (realm.relation === "hostile" ? 18 : realm.relation === "rival" ? 12 : 0);
  const riskLevel = getProvinceRiskLevel(realm.relation, localThreat, fogState);
  const status = getProvinceStatus(realm.relation, riskLevel, nearbyCamps, fogState);
  const terrain = getProvinceTerrain(x, y, worldSize);
  const strategicValue = getProvinceStrategicValue(x, y, worldSize, pois);
  const resourceValue = getProvinceResourceValue(x, y, worldSize, pois);
  const draft: ProvinceIntel = {
    id: `${region.id}:${x}:${y}`,
    name: `${region.label} Hududu ${x},${y}`,
    x,
    y,
    realm,
    terrain,
    tierLabel: getKingdomTier(x, y, worldSize).shortLabel,
    strategicValue,
    resourceValue,
    riskLevel,
    status,
    nearbyCamps,
    nearbyResources,
    nearbyPasses,
    nearbySanctuaries,
    availableActions: [],
    advisorText: "",
  };
  draft.availableActions = getAvailableProvinceActions(draft);
  draft.advisorText = getProvinceAdvisorText(draft);
  return draft;
}

export function getProvinceAdvisorText(province: Pick<ProvinceIntel, "riskLevel" | "terrain" | "resourceValue" | "nearbyPasses" | "status">) {
  if (province.terrain === "pass" || province.nearbyPasses > 0) {
    return "Bu kapı iki büyük yurdu birbirine bağlar; destek olmadan akın pahalıya döner.";
  }
  if (province.riskLevel === "deadly" || province.riskLevel === "dangerous") {
    return "Düşman nüfuzu güçlü. Sadece destekli süvari ve keşif raporuyla ilerle.";
  }
  if (province.resourceValue.food >= 72) {
    return "Erzak zenginliği yüksek; genişleme ve uzun seferler için değerli bir yurt.";
  }
  if (province.status === "friendly") {
    return "Dost sancak altında güvenli destek ve ticaret buyruğu için uygun.";
  }
  return "Hudut zayıf savunuluyor; önce keşif, sonra claim veya sınırlı akın düşün.";
}

export function getMapModeLabel(mode: MapMode) {
  const labels: Record<MapMode, string> = {
    TERRAIN: "Arazi",
    POLITICAL: "Devlet",
    THREAT: "Tehdit",
    RESOURCE: "Bereket",
    ALLIANCE: "Toy",
    MARCH: "Sefer",
  };
  return labels[mode];
}
