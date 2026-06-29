import type { FogState, FogTileView, PoiResourceType, PoiView } from "@frontier/shared";

import { getKingdomPasses, getKingdomSanctuaries, getKingdomTier } from "../components/kingdomMap";
import { getWorldRegionForTile, type WorldRegion } from "../components/worldRegions";

export type MapMode = "TERRAIN" | "POLITICAL" | "THREAT" | "RESOURCE" | "ALLIANCE" | "MARCH";
export type RealmRelation = "allied" | "friendly" | "neutral" | "wary" | "hostile" | "rival" | "unknown";
export type DiplomaticStance = "oathbound" | "open" | "watchful" | "closed" | "aggressive" | "obscured";
export type InfluenceLevel = "none" | "low" | "medium" | "high" | "dominant";
export type BorderTensionLevel = "low" | "medium" | "high" | "critical" | "unknown";
export type TreatyType = "PACT" | "PASSAGE" | "TRIBUTE" | "NON_AGGRESSION";
export type ClaimType = "PLAYER" | "REALM" | "RIVAL";
export type DiplomaticAction =
  | "SEND_ENVOY"
  | "SCOUT_REALM"
  | "OFFER_TRIBUTE"
  | "REQUEST_PASSAGE"
  | "PROPOSE_PACT"
  | "BREAK_PACT"
  | "CLAIM_PROVINCE"
  | "PREPARE_RAID"
  | "VIEW_BORDER_TENSION";
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

export interface Treaty {
  id: string;
  type: TreatyType;
  targetRealmId: string;
  label: string;
  expiresInTurns: number | null;
}

export interface RealmDiplomacy {
  realm: RealmIdentity;
  relation: RealmRelation;
  stance: DiplomaticStance;
  influence: InfluenceLevel;
  controlledProvinces: number;
  militaryIdentity: string;
  borderStatus: BorderTensionLevel;
  activeTreaties: Treaty[];
  knownClaims: Claim[];
  recommendedAction: DiplomaticAction;
  advisorText: string;
}

export interface Claim {
  id: string;
  provinceId: string;
  claimantRealmId: string;
  claimantTag: string;
  type: ClaimType;
  strength: number;
  label: string;
}

export interface BorderTension {
  provinceId: string;
  level: BorderTensionLevel;
  score: number;
  involvedRealmIds: string[];
  label: string;
  reason: string;
}

export interface DiplomaticActionItem {
  action: DiplomaticAction;
  label: string;
  enabled: boolean;
  reason: string;
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
  diplomacy: RealmDiplomacy;
  claims: Claim[];
  borderTension: BorderTension;
  contestingRealms: RealmIdentity[];
  diplomaticRisk: BorderTensionLevel;
  availableDiplomaticActions: DiplomaticActionItem[];
  advisorText: string;
}

const REALM_IDENTITIES: Record<string, Omit<RealmIdentity, "primaryColor" | "borderColor" | "capitalX" | "capitalY">> = {
  "kut-otagi": {
    id: "kut-otagi",
    name: "Kut Otağı",
    shortTag: "KUT",
    relation: "allied",
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
    relation: "wary",
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

const DIPLOMATIC_STANCES: Record<string, DiplomaticStance> = {
  "kut-otagi": "oathbound",
  "kok-tore": "open",
  "oguz-yurdu": "watchful",
  "uygur-eli": "watchful",
  "hazar-kapisi": "aggressive",
  "selcuk-ucu": "aggressive",
  "kipcak-bozkiri": "open",
  "karluk-dagi": "open",
  "avar-siniri": "obscured",
};

const REALM_TREATIES: Record<string, Treaty[]> = {
  "kut-otagi": [
    {
      id: "treaty-kut-oath",
      type: "PACT",
      targetRealmId: "player",
      label: "Kut ahdi",
      expiresInTurns: null,
    },
  ],
  "kok-tore": [
    {
      id: "treaty-kok-scout",
      type: "PASSAGE",
      targetRealmId: "player",
      label: "Keşif geçidi",
      expiresInTurns: 18,
    },
  ],
  "hazar-kapisi": [
    {
      id: "treaty-hazar-tribute",
      type: "TRIBUTE",
      targetRealmId: "uygur-eli",
      label: "Kapı haracı",
      expiresInTurns: 9,
    },
  ],
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

function getControlledProvinceCount(region: WorldRegion) {
  return Math.max(1, (region.x1 - region.x0 + 1) * (region.y1 - region.y0 + 1));
}

function getInfluenceLevel(strength: number, relation: RealmRelation): InfluenceLevel {
  if (relation === "unknown") return "none";
  if (strength >= 86) return "dominant";
  if (strength >= 72) return "high";
  if (strength >= 56) return "medium";
  return "low";
}

function getRelationBaseTension(relation: RealmRelation) {
  const scores: Record<RealmRelation, number> = {
    allied: 0,
    friendly: 6,
    neutral: 18,
    wary: 31,
    hostile: 52,
    rival: 64,
    unknown: 40,
  };
  return scores[relation];
}

function getRelationThreat(relation: RealmRelation) {
  const scores: Record<RealmRelation, number> = {
    allied: 4,
    friendly: 10,
    neutral: 22,
    wary: 38,
    hostile: 66,
    rival: 78,
    unknown: 46,
  };
  return scores[relation];
}

function getBorderTensionLevel(score: number, relation: RealmRelation): BorderTensionLevel {
  if (relation === "unknown") return "unknown";
  if (score >= 82) return "critical";
  if (score >= 58) return "high";
  if (score >= 30) return "medium";
  return "low";
}

function getPreferredMilitaryIdentity(realm: RealmIdentity) {
  const labels: Record<RealmIdentity["preferredUnit"], string> = {
    infantry: "Ağır yaya hattı",
    archer: "Okçu ve menzil hattı",
    cavalry: "Atlı akın düzeni",
    scout: "Keşif ve hafif süvari",
    mixed: "Karma sancak düzeni",
  };
  return labels[realm.preferredUnit];
}

function getRecommendedAction(relation: RealmRelation, borderStatus: BorderTensionLevel): DiplomaticAction {
  if (relation === "unknown") return "SCOUT_REALM";
  if (borderStatus === "critical" || relation === "rival") return "VIEW_BORDER_TENSION";
  if (relation === "hostile") return "OFFER_TRIBUTE";
  if (relation === "wary") return "SEND_ENVOY";
  if (relation === "neutral") return "PROPOSE_PACT";
  if (relation === "allied" || relation === "friendly") return "REQUEST_PASSAGE";
  return "SEND_ENVOY";
}

export function getRealmThreatScore(diplomacy: Pick<RealmDiplomacy, "relation" | "realm" | "borderStatus">) {
  const borderScore: Record<BorderTensionLevel, number> = {
    low: 4,
    medium: 18,
    high: 34,
    critical: 50,
    unknown: 24,
  };
  return clamp(getRelationThreat(diplomacy.relation) + Math.round(diplomacy.realm.strength * 0.36) + borderScore[diplomacy.borderStatus], 0, 100);
}

export function getRealmDiplomacy(region: WorldRegion): RealmDiplomacy {
  const realm = getRealmIdentity(region);
  const relation = realm.relation;
  const baseTension = getRelationBaseTension(relation) + Math.max(0, realm.strength - 62) * 0.18;
  const borderStatus = getBorderTensionLevel(Math.round(baseTension), relation);
  const activeTreaties = REALM_TREATIES[realm.id] ?? [];
  const diplomacy: RealmDiplomacy = {
    realm,
    relation,
    stance: DIPLOMATIC_STANCES[realm.id] ?? "watchful",
    influence: getInfluenceLevel(realm.strength, relation),
    controlledProvinces: getControlledProvinceCount(region),
    militaryIdentity: getPreferredMilitaryIdentity(realm),
    borderStatus,
    activeTreaties,
    knownClaims: [],
    recommendedAction: getRecommendedAction(relation, borderStatus),
    advisorText: "",
  };
  diplomacy.advisorText = getDiplomaticAdvisorMessage(diplomacy);
  return diplomacy;
}

export function getAllRealmDiplomacy(regions: ReadonlyArray<WorldRegion>, worldSize = Math.max(...regions.map((region) => Math.max(region.x1, region.y1))) + 1) {
  return regions.map((region) => {
    const diplomacy = getRealmDiplomacy(region);
    return {
      ...diplomacy,
      knownClaims: getProvinceClaims({
        x: diplomacy.realm.capitalX,
        y: diplomacy.realm.capitalY,
        worldSize,
        region,
      }).filter((claim) => claim.claimantRealmId === diplomacy.realm.id),
    };
  });
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

function buildProvinceId(region: WorldRegion, x: number, y: number) {
  return `${region.id}:${x}:${y}`;
}

function getNeighborRegions(x: number, y: number, worldSize: number, region: WorldRegion) {
  const neighbors = [
    { x: x - 1, y },
    { x: x + 1, y },
    { x, y: y - 1 },
    { x, y: y + 1 },
  ]
    .filter((entry) => entry.x >= 0 && entry.y >= 0 && entry.x < worldSize && entry.y < worldSize)
    .map((entry) => getWorldRegionForTile(entry.x, entry.y, worldSize))
    .filter((entry) => entry.id !== region.id);

  return Array.from(new Map(neighbors.map((entry) => [entry.id, entry])).values());
}

export function getClaimStrength(claim: Pick<Claim, "strength">) {
  return clamp(claim.strength, 0, 100);
}

export function getProvinceClaims(params: {
  x: number;
  y: number;
  worldSize: number;
  region: WorldRegion;
}): Claim[] {
  const { x, y, worldSize, region } = params;
  const provinceId = buildProvinceId(region, x, y);
  const relation = getRealmRelation(region);
  const terrain = getProvinceTerrain(x, y, worldSize);
  const strategicValue = getProvinceStrategicValue(x, y, worldSize);
  const h = hashCoordinate(x + region.capitalX * 3, y + region.capitalY * 5);
  const claims: Claim[] = [];

  if ((relation === "neutral" || relation === "wary" || relation === "hostile" || relation === "rival") && strategicValue >= 52) {
    claims.push({
      id: `claim-player-${provinceId}`,
      provinceId,
      claimantRealmId: "player",
      claimantTag: "BK",
      type: "PLAYER",
      strength: clamp(32 + Math.round(strategicValue * 0.45), 20, 86),
      label: "Bozkır sancağı",
    });
  }

  for (const neighbor of getNeighborRegions(x, y, worldSize, region)) {
    const neighborRealm = getRealmIdentity(neighbor);
    const borderClaimStrength = clamp(28 + Math.round(strategicValue * 0.34) + (terrain === "pass" ? 18 : 0) + (h % 17), 20, 94);
    claims.push({
      id: `claim-${neighbor.id}-${provinceId}`,
      provinceId,
      claimantRealmId: neighbor.id,
      claimantTag: neighborRealm.shortTag,
      type: relation === "rival" || neighborRealm.relation === "rival" ? "RIVAL" : "REALM",
      strength: borderClaimStrength,
      label: `${neighborRealm.shortTag} hudut iddiası`,
    });
  }

  if (relation === "rival" && (terrain === "pass" || strategicValue >= 70)) {
    claims.push({
      id: `claim-rival-${region.id}-${provinceId}`,
      provinceId,
      claimantRealmId: region.id,
      claimantTag: getRealmIdentity(region).shortTag,
      type: "RIVAL",
      strength: clamp(54 + Math.round(strategicValue * 0.36), 42, 96),
      label: "Rakip yurt iddiası",
    });
  }

  return claims.sort((a, b) => b.strength - a.strength);
}

export function getContestingRealms(params: {
  x: number;
  y: number;
  worldSize: number;
  region: WorldRegion;
  claims?: ReadonlyArray<Claim>;
}) {
  const neighbors = getNeighborRegions(params.x, params.y, params.worldSize, params.region).map(getRealmIdentity);
  const claimRealmIds = new Set((params.claims ?? []).filter((claim) => claim.claimantRealmId !== "player").map((claim) => claim.claimantRealmId));
  return neighbors.filter((realm) => claimRealmIds.size === 0 || claimRealmIds.has(realm.id));
}

export function getBorderTension(params: {
  x: number;
  y: number;
  worldSize: number;
  region: WorldRegion;
  fogState?: FogState | null;
  claims?: ReadonlyArray<Claim>;
  nearbyCamps?: number;
  nearbyPasses?: number;
}): BorderTension {
  const { x, y, worldSize, region, fogState = "VISIBLE" } = params;
  const provinceId = buildProvinceId(region, x, y);
  const relation = getRealmRelation(region);
  const claims = params.claims ?? getProvinceClaims({ x, y, worldSize, region });
  const terrain = getProvinceTerrain(x, y, worldSize);
  const nearbyPasses = params.nearbyPasses ?? getKingdomPasses(worldSize).filter((entry) => distance(entry, { x, y }) <= 5.5).length;
  const nearbyCamps = params.nearbyCamps ?? 0;
  const claimPressure = claims.reduce((sum, claim) => sum + getClaimStrength(claim) * (claim.type === "RIVAL" ? 0.2 : 0.13), 0);
  const contestedRealms = getContestingRealms({ x, y, worldSize, region, claims });
  const score = clamp(
    Math.round(
      getRelationBaseTension(relation) +
        claimPressure +
        contestedRealms.length * 12 +
        nearbyCamps * 8 +
        nearbyPasses * 10 +
        (terrain === "pass" ? 14 : terrain === "borderland" ? 8 : 0),
    ),
    0,
    100,
  );
  const level = fogState === "HIDDEN" ? "unknown" : getBorderTensionLevel(score, relation);
  const label: Record<BorderTensionLevel, string> = {
    low: "Sakin hudut",
    medium: "Gergin hudut",
    high: "Sıcak sınır",
    critical: "Kritik sınır",
    unknown: "Bilinmeyen hudut",
  };
  const reason =
    level === "unknown"
      ? "Sis kalkmadan hudut niyeti okunamaz."
      : claims.length > 0
        ? `${claims.length} iddia ve ${contestedRealms.length} komşu yurt bu hududu sıkıştırıyor.`
        : nearbyPasses > 0
          ? "Geçit hattı stratejik baskıyı yükseltiyor."
          : "Sınırda belirgin siyasi baskı düşük.";

  return {
    provinceId,
    level,
    score,
    involvedRealmIds: contestedRealms.map((realm) => realm.id),
    label: label[level],
    reason,
  };
}

export function getDiplomaticRisk(tension: Pick<BorderTension, "level">, relation: RealmRelation): BorderTensionLevel {
  if (relation === "unknown" || tension.level === "unknown") return "unknown";
  if (relation === "rival" && tension.level === "high") return "critical";
  if (relation === "hostile" && tension.level === "medium") return "high";
  return tension.level;
}

export function getProvinceRiskLevel(
  relation: RealmRelation,
  localThreat: number,
  fogState: FogState | null,
): ProvinceRiskLevel {
  if (fogState === "HIDDEN" || relation === "unknown") return "unknown";
  const relationThreat =
    relation === "rival" ? 32 : relation === "hostile" ? 28 : relation === "wary" ? 14 : relation === "neutral" ? 8 : relation === "friendly" ? 2 : 0;
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
  if (relation === "allied" || relation === "friendly") return "friendly";
  if (relation === "hostile" || relation === "rival") return "hostile";
  return "neutral";
}

export function canScoutProvince(province: Pick<ProvinceIntel, "status" | "riskLevel">) {
  return province.status !== "friendly" || province.riskLevel === "unknown";
}

export function canMarchToProvince(province: Pick<ProvinceIntel, "status" | "riskLevel">) {
  return province.status !== "unknown" && province.riskLevel !== "deadly";
}

export function canRequestPassage(province: Pick<ProvinceIntel, "terrain" | "nearbyPasses" | "diplomacy" | "borderTension">) {
  const relation = province.diplomacy.relation;
  return (
    (province.terrain === "pass" || province.nearbyPasses > 0) &&
    relation !== "unknown" &&
    relation !== "rival" &&
    province.borderTension.level !== "critical"
  );
}

export function canOfferTribute(diplomacy: Pick<RealmDiplomacy, "relation">) {
  return diplomacy.relation === "wary" || diplomacy.relation === "hostile" || diplomacy.relation === "rival";
}

export function canProposePact(diplomacy: Pick<RealmDiplomacy, "relation" | "borderStatus" | "activeTreaties">) {
  const hasPact = diplomacy.activeTreaties.some((treaty) => treaty.type === "PACT" || treaty.type === "NON_AGGRESSION");
  return !hasPact && (diplomacy.relation === "friendly" || diplomacy.relation === "neutral" || diplomacy.relation === "wary") && diplomacy.borderStatus !== "critical";
}

export function canPrepareRaid(province: Pick<ProvinceIntel, "diplomacy" | "borderTension" | "status">) {
  return province.status === "contested" || province.diplomacy.relation === "hostile" || province.diplomacy.relation === "rival" || province.borderTension.level === "critical";
}

export function canClaimProvince(province: Pick<ProvinceIntel, "diplomacy" | "strategicValue" | "status" | "riskLevel" | "claims">) {
  if (province.status === "unknown" || province.riskLevel === "unknown") return false;
  if (province.diplomacy.relation === "allied" || province.diplomacy.relation === "friendly") return false;
  if (province.claims.some((claim) => claim.claimantRealmId === "player" && claim.strength >= 70)) return false;
  return province.strategicValue >= 45;
}

export function getDiplomaticActionLabel(action: DiplomaticAction) {
  const labels: Record<DiplomaticAction, string> = {
    SEND_ENVOY: "Elçi Gönder",
    SCOUT_REALM: "Yurdu Keşfet",
    OFFER_TRIBUTE: "Haraç Öner",
    REQUEST_PASSAGE: "Geçit Hakkı",
    PROPOSE_PACT: "Ahid Öner",
    BREAK_PACT: "Ahdi Boz",
    CLAIM_PROVINCE: "Sancak İddiası",
    PREPARE_RAID: "Akın Hazırla",
    VIEW_BORDER_TENSION: "Hudut Gerginliği",
  };
  return labels[action];
}

function actionItem(action: DiplomaticAction, enabled: boolean, reason: string): DiplomaticActionItem {
  return {
    action,
    label: getDiplomaticActionLabel(action),
    enabled,
    reason,
  };
}

export function getAvailableDiplomaticActions(province: ProvinceIntel): DiplomaticActionItem[] {
  const relation = province.diplomacy.relation;
  const actions: DiplomaticActionItem[] = [
    actionItem(
      "SEND_ENVOY",
      relation !== "allied" && relation !== "friendly",
      relation === "allied" || relation === "friendly" ? "Bu yurt zaten açık görüşme halinde." : "İlişkiyi okumak ve baskıyı düşürmek için elçi gönder.",
    ),
    actionItem(
      "SCOUT_REALM",
      relation === "unknown" || relation === "wary" || relation === "hostile" || relation === "rival",
      relation === "allied" || relation === "friendly" ? "Dost yurt için öncelik değil." : "Sisli niyetleri açmak için keşif raporu gerekir.",
    ),
    actionItem(
      "OFFER_TRIBUTE",
      canOfferTribute(province.diplomacy),
      canOfferTribute(province.diplomacy) ? "Geçici sakinlik satın alabilir." : "Bu ilişki haraç gerektirecek kadar gergin değil.",
    ),
    actionItem(
      "REQUEST_PASSAGE",
      canRequestPassage(province),
      canRequestPassage(province) ? "Geçit veya kapı hattı için yürüyüş izni iste." : "Yakın geçit yok ya da hudut çok gergin.",
    ),
    actionItem(
      "PROPOSE_PACT",
      canProposePact(province.diplomacy),
      canProposePact(province.diplomacy) ? "Tarafsız veya temkinli yurtla kısa ahid kurulabilir." : "Pakt için ilişki/tension uygun değil.",
    ),
    actionItem(
      "BREAK_PACT",
      province.diplomacy.activeTreaties.length > 0,
      province.diplomacy.activeTreaties.length > 0 ? "Var olan ahdi bozmak hududu sertleştirir." : "Bozulacak aktif ahid yok.",
    ),
    actionItem(
      "CLAIM_PROVINCE",
      canClaimProvince(province),
      canClaimProvince(province) ? "Bu stratejik yurt için sancak iddiası kurulabilir." : "Dost, düşük değerli veya zaten güçlü iddialı yurt.",
    ),
    actionItem(
      "PREPARE_RAID",
      canPrepareRaid(province),
      canPrepareRaid(province) ? "Siyasi risk askeri hazırlık gerektiriyor." : "Akın için yeterli siyasi gerekçe yok.",
    ),
    actionItem("VIEW_BORDER_TENSION", province.borderTension.level !== "low", province.borderTension.reason),
  ];
  return actions;
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
  const claims = getProvinceClaims({ x, y, worldSize, region });
  const borderTension = getBorderTension({
    x,
    y,
    worldSize,
    region,
    fogState,
    claims,
    nearbyCamps,
    nearbyPasses,
  });
  const diplomacyBase = getRealmDiplomacy(region);
  const diplomacy: RealmDiplomacy = {
    ...diplomacyBase,
    borderStatus: borderTension.level,
    knownClaims: claims.filter((claim) => claim.claimantRealmId === realm.id || claim.claimantRealmId === "player"),
    recommendedAction: getRecommendedAction(realm.relation, borderTension.level),
  };
  diplomacy.advisorText = getDiplomaticAdvisorMessage(diplomacy);
  const contestingRealms = getContestingRealms({ x, y, worldSize, region, claims });
  const draft: ProvinceIntel = {
    id: buildProvinceId(region, x, y),
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
    diplomacy,
    claims,
    borderTension,
    contestingRealms,
    diplomaticRisk: getDiplomaticRisk(borderTension, realm.relation),
    availableDiplomaticActions: [],
    advisorText: "",
  };
  draft.availableActions = getAvailableProvinceActions(draft);
  draft.availableDiplomaticActions = getAvailableDiplomaticActions(draft);
  draft.advisorText = getProvinceAdvisorText(draft);
  return draft;
}

export function getDiplomaticAdvisorMessage(diplomacy: Pick<RealmDiplomacy, "relation" | "borderStatus" | "realm" | "activeTreaties" | "influence">) {
  if (diplomacy.relation === "unknown") {
    return "Bu yurdun niyeti sisli. Elçi veya keşif olmadan sefer kararı zayıf bilgiyle alınır.";
  }
  if (diplomacy.borderStatus === "critical") {
    return "Hudut kritik. Yeni iddia veya akın karşılık doğurabilir; önce güç ve geçit hattını oku.";
  }
  if (diplomacy.relation === "rival") {
    return "Rakip yurt sınırda fırsat arıyor. Claims ve geçitler savaş bahanesine dönüşebilir.";
  }
  if (diplomacy.relation === "hostile") {
    return "Düşman yurtla açık güven yok. Haraç, keşif veya sınırlı akın dışında karar alma.";
  }
  if (diplomacy.activeTreaties.some((treaty) => treaty.type === "PASSAGE")) {
    return "Geçit hakkı mevcut. Bu yurt üzerinden kısa sefer rotaları değerlendirilebilir.";
  }
  if (diplomacy.influence === "dominant" || diplomacy.influence === "high") {
    return "Bu yurt güçlü; dostluk veya pakt, açık savaştan daha ucuz olabilir.";
  }
  return "İlişki açık. Elçi, ticaret veya kısa ahid ile hudut güvenliği artırılabilir.";
}

export function getProvinceAdvisorText(
  province: Pick<
    ProvinceIntel,
    "riskLevel" | "terrain" | "resourceValue" | "nearbyPasses" | "status" | "borderTension" | "claims" | "diplomaticRisk" | "diplomacy"
  >,
) {
  if (province.claims.some((claim) => claim.type === "RIVAL")) {
    return "Rakip iddia bu yurtta kayıtlı. Askeri hamle çatışmayı büyütebilir.";
  }
  if (province.diplomaticRisk === "critical" || province.borderTension.level === "critical") {
    return "Sınır gerginliği kritik. Sancak iddiası misilleme doğurabilir.";
  }
  if (province.diplomacy.relation === "unknown") {
    return "Bu yurt hakkında bilgi az. Yürümeden önce elçi veya keşif gönder.";
  }
  if (province.borderTension.level === "high") {
    return "Hudut ısınıyor. Claim açmak siyasi risk yaratır, ama stratejik baskı sağlayabilir.";
  }
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
