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
export type ProvinceControlStatus = "unknown" | "observed" | "influenced" | "claimed" | "contested" | "occupied" | "controlled";
export type ExpansionAction =
  | "SCOUT_PROVINCE"
  | "SEND_ENVOY"
  | "ESTABLISH_INFLUENCE"
  | "CLAIM_PROVINCE"
  | "PREPARE_RAID"
  | "LAUNCH_RAID"
  | "DEMAND_SUBMISSION"
  | "FORTIFY_BORDER"
  | "WITHDRAW_CLAIM";
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

export interface ProvinceControlState {
  provinceId: string;
  ownerRealmId: string;
  controllerRealmId: string;
  influenceByRealm: Record<string, number>;
  playerClaimStrength: number;
  contestedByRealmIds: string[];
  controlStatus: ProvinceControlStatus;
  lastScoutedAt: string | null;
  unrest: number;
  resistance: number;
  expansionDifficulty: number;
  raidPrepared: boolean;
  fortified: boolean;
}

export interface ExpansionActionItem {
  action: ExpansionAction;
  label: string;
  enabled: boolean;
  reason: string;
  recommended: boolean;
}

export interface ExpansionActionResult {
  action: ExpansionAction;
  nextState: ProvinceControlState;
  message: string;
  advisorText: string;
  realmReaction: string;
  tensionDelta: number;
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

export function buildProvinceId(region: WorldRegion, x: number, y: number) {
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

export function canPrepareRaid(province: Pick<ProvinceIntel, "diplomacy" | "borderTension" | "status"> & { controlState?: Pick<ProvinceControlState, "playerClaimStrength" | "controlStatus" | "controllerRealmId" | "raidPrepared"> }) {
  if (province.controlState?.controllerRealmId === "player" || province.controlState?.controlStatus === "controlled") return false;
  if (province.controlState?.raidPrepared) return false;
  if (province.diplomacy.relation === "allied" || province.diplomacy.relation === "friendly") return false;
  return (
    province.status === "contested" ||
    province.diplomacy.relation === "hostile" ||
    province.diplomacy.relation === "rival" ||
    province.borderTension.level === "critical" ||
    (province.controlState?.playerClaimStrength ?? 0) >= 45
  );
}

export function canClaimProvince(province: Pick<ProvinceIntel, "diplomacy" | "strategicValue" | "status" | "riskLevel" | "claims"> & { controlState?: ProvinceControlState }) {
  if (province.status === "unknown" || province.riskLevel === "unknown") return false;
  if (province.diplomacy.relation === "allied" || province.diplomacy.relation === "friendly") return false;
  if (province.controlState?.controlStatus === "controlled") return false;
  if ((province.controlState?.playerClaimStrength ?? 0) >= 70) return false;
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

function getRiskResistance(riskLevel: ProvinceRiskLevel) {
  const scores: Record<ProvinceRiskLevel, number> = {
    low: 4,
    guarded: 18,
    dangerous: 34,
    deadly: 48,
    unknown: 26,
  };
  return scores[riskLevel];
}

function getTensionDifficulty(level: BorderTensionLevel) {
  const scores: Record<BorderTensionLevel, number> = {
    low: 2,
    medium: 12,
    high: 24,
    critical: 38,
    unknown: 18,
  };
  return scores[level];
}

export function getInfluenceProgress(controlState: Pick<ProvinceControlState, "influenceByRealm">) {
  return clamp(Math.round(controlState.influenceByRealm.player ?? 0), 0, 100);
}

export function getClaimProgress(controlState: Pick<ProvinceControlState, "playerClaimStrength">) {
  return clamp(Math.round(controlState.playerClaimStrength), 0, 100);
}

export function getExpansionDifficulty(province: Pick<ProvinceIntel, "strategicValue" | "riskLevel" | "realm" | "borderTension">, controlState?: Pick<ProvinceControlState, "resistance" | "unrest" | "influenceByRealm" | "playerClaimStrength" | "fortified">) {
  const playerInfluence = controlState ? getInfluenceProgress(controlState) : 0;
  const playerClaim = controlState ? getClaimProgress(controlState) : 0;
  const fortifyPenalty = controlState?.fortified ? 8 : 0;
  return clamp(
    Math.round(
      province.strategicValue * 0.25 +
        province.realm.strength * 0.22 +
        getRiskResistance(province.riskLevel) +
        getTensionDifficulty(province.borderTension.level) +
        (controlState?.resistance ?? 36) * 0.34 +
        (controlState?.unrest ?? 18) * 0.16 +
        fortifyPenalty -
        playerInfluence * 0.24 -
        playerClaim * 0.18,
    ),
    1,
    100,
  );
}

export function getProvinceControlStatus(
  province: Pick<ProvinceIntel, "status" | "riskLevel" | "borderTension">,
  controlState: Pick<ProvinceControlState, "controllerRealmId" | "influenceByRealm" | "playerClaimStrength" | "contestedByRealmIds" | "resistance">,
): ProvinceControlStatus {
  if (province.status === "unknown" || province.riskLevel === "unknown") return "unknown";
  const playerInfluence = getInfluenceProgress(controlState);
  const playerClaim = getClaimProgress(controlState);
  if (controlState.controllerRealmId === "player" && playerInfluence >= 72 && controlState.resistance <= 34) return "controlled";
  if (controlState.controllerRealmId === "player") return "occupied";
  if (controlState.contestedByRealmIds.length > 0 || province.borderTension.level === "high" || province.borderTension.level === "critical") return "contested";
  if (playerClaim >= 42) return "claimed";
  if (playerInfluence >= 24) return "influenced";
  return "observed";
}

export function getInitialProvinceControlState(province: Pick<ProvinceIntel, "id" | "realm" | "claims" | "contestingRealms" | "diplomacy" | "riskLevel" | "status" | "strategicValue" | "borderTension">): ProvinceControlState {
  const playerClaim = province.claims.find((claim) => claim.claimantRealmId === "player")?.strength ?? 0;
  const playerInfluence = clamp(Math.round(playerClaim * 0.28 + (province.diplomacy.relation === "neutral" ? 8 : province.diplomacy.relation === "wary" ? 4 : 0)), 0, 38);
  const ownerInfluence = clamp(Math.round(48 + province.realm.strength * 0.34 + getRelationThreat(province.diplomacy.relation) * 0.18), 35, 94);
  const resistance = clamp(
    Math.round(20 + getRelationThreat(province.diplomacy.relation) * 0.38 + getRiskResistance(province.riskLevel) * 0.64 + province.strategicValue * 0.1),
    8,
    96,
  );
  const base: ProvinceControlState = {
    provinceId: province.id,
    ownerRealmId: province.realm.id,
    controllerRealmId: province.realm.id,
    influenceByRealm: {
      [province.realm.id]: ownerInfluence,
      player: playerInfluence,
    },
    playerClaimStrength: playerClaim,
    contestedByRealmIds: province.contestingRealms.map((realm) => realm.id),
    controlStatus: "observed",
    lastScoutedAt: province.status === "unknown" ? null : new Date(0).toISOString(),
    unrest: clamp(Math.round(getTensionDifficulty(province.borderTension.level) + province.strategicValue * 0.12), 0, 100),
    resistance,
    expansionDifficulty: 0,
    raidPrepared: false,
    fortified: false,
  };
  base.controlStatus = getProvinceControlStatus(province, base);
  base.expansionDifficulty = getExpansionDifficulty(province, base);
  return base;
}

export function canEstablishInfluence(province: Pick<ProvinceIntel, "status" | "diplomacy" | "borderTension">, controlState: Pick<ProvinceControlState, "controlStatus" | "resistance" | "controllerRealmId">) {
  if (province.status === "unknown" || controlState.controlStatus === "unknown") return false;
  if (controlState.controllerRealmId === "player" || controlState.controlStatus === "controlled") return false;
  if (province.diplomacy.relation === "allied" || province.diplomacy.relation === "friendly") return false;
  return controlState.resistance < 86 && province.borderTension.level !== "critical";
}

export function canLaunchRaid(province: Pick<ProvinceIntel, "riskLevel" | "diplomacy" | "borderTension">, controlState: Pick<ProvinceControlState, "raidPrepared" | "playerClaimStrength" | "resistance" | "controllerRealmId">) {
  if (province.riskLevel === "unknown" || controlState.controllerRealmId === "player") return false;
  if (!controlState.raidPrepared) return false;
  if (province.diplomacy.relation === "allied" || province.diplomacy.relation === "friendly") return false;
  return controlState.playerClaimStrength >= 32 || province.borderTension.level === "critical" || controlState.resistance <= 58;
}

export function canDemandSubmission(province: Pick<ProvinceIntel, "status" | "diplomacy">, controlState: Pick<ProvinceControlState, "controllerRealmId" | "playerClaimStrength" | "resistance" | "influenceByRealm">) {
  if (province.status === "unknown" || controlState.controllerRealmId === "player") return false;
  if (province.diplomacy.relation === "allied" || province.diplomacy.relation === "friendly") return false;
  return getInfluenceProgress(controlState) >= 52 && controlState.playerClaimStrength >= 48 && controlState.resistance <= 58;
}

export function getExpansionActionLabel(action: ExpansionAction) {
  const labels: Record<ExpansionAction, string> = {
    SCOUT_PROVINCE: "Yurdu Keşfet",
    SEND_ENVOY: "Elçi Yolla",
    ESTABLISH_INFLUENCE: "Etki Kur",
    CLAIM_PROVINCE: "Sancak İddiası",
    PREPARE_RAID: "Akın Hazırla",
    LAUNCH_RAID: "Akın Başlat",
    DEMAND_SUBMISSION: "Bağlılık İste",
    FORTIFY_BORDER: "Hududu Pekiştir",
    WITHDRAW_CLAIM: "İddiayı Çek",
  };
  return labels[action];
}

function expansionActionItem(action: ExpansionAction, enabled: boolean, reason: string, recommended: boolean): ExpansionActionItem {
  return {
    action,
    label: getExpansionActionLabel(action),
    enabled,
    reason,
    recommended,
  };
}

function getRecommendedExpansionAction(province: ProvinceIntel, controlState: ProvinceControlState): ExpansionAction {
  if (controlState.controlStatus === "unknown" || !controlState.lastScoutedAt) return "SCOUT_PROVINCE";
  if (getInfluenceProgress(controlState) < 28 && canEstablishInfluence(province, controlState)) return "ESTABLISH_INFLUENCE";
  if (controlState.playerClaimStrength < 45 && canClaimProvince({ ...province, controlState })) return "CLAIM_PROVINCE";
  if (!controlState.raidPrepared && canPrepareRaid({ ...province, controlState })) return "PREPARE_RAID";
  if (canDemandSubmission(province, controlState)) return "DEMAND_SUBMISSION";
  if (canLaunchRaid(province, controlState)) return "LAUNCH_RAID";
  return "SEND_ENVOY";
}

export function getAvailableExpansionActions(province: ProvinceIntel, controlState: ProvinceControlState = getInitialProvinceControlState(province)): ExpansionActionItem[] {
  const recommended = getRecommendedExpansionAction(province, controlState);
  const scoutEnabled = controlState.controlStatus === "unknown" || !controlState.lastScoutedAt || province.riskLevel === "unknown";
  const influenceEnabled = canEstablishInfluence(province, controlState);
  const claimEnabled = canClaimProvince({ ...province, controlState });
  const prepareRaidEnabled = canPrepareRaid({ ...province, controlState });
  const launchRaidEnabled = canLaunchRaid(province, controlState);
  const demandEnabled = canDemandSubmission(province, controlState);
  const fortifyEnabled =
    controlState.controlStatus === "claimed" ||
    controlState.controlStatus === "contested" ||
    controlState.controlStatus === "occupied" ||
    controlState.controlStatus === "controlled" ||
    getInfluenceProgress(controlState) >= 38;
  const withdrawEnabled = controlState.playerClaimStrength > 0 || controlState.controlStatus === "claimed";

  return [
    expansionActionItem("SCOUT_PROVINCE", scoutEnabled, scoutEnabled ? "Keşif, risk ve direnci netleştirir." : "Bu yurt zaten gözlenmiş.", recommended === "SCOUT_PROVINCE"),
    expansionActionItem(
      "SEND_ENVOY",
      province.diplomacy.relation !== "allied" && province.diplomacy.relation !== "friendly",
      province.diplomacy.relation === "allied" || province.diplomacy.relation === "friendly" ? "Dost yurtta baskı kurma önceliği yok." : "Elçi, düşük riskli nüfuz sağlar.",
      recommended === "SEND_ENVOY",
    ),
    expansionActionItem("ESTABLISH_INFLUENCE", influenceEnabled, influenceEnabled ? "Yerel beyleri Toy etkisine yaklaştır." : "Direnç, ilişki veya hudut durumu etki için uygun değil.", recommended === "ESTABLISH_INFLUENCE"),
    expansionActionItem("CLAIM_PROVINCE", claimEnabled, claimEnabled ? "Siyasi iddiayı Toy kayıtlarına geçir." : "Dost, zayıf gerekçeli veya zaten güçlü iddialı yurt.", recommended === "CLAIM_PROVINCE"),
    expansionActionItem("PREPARE_RAID", prepareRaidEnabled, prepareRaidEnabled ? "Akın için sancak ve rota hazırlığı yap." : "Akın için siyasi gerekçe zayıf.", recommended === "PREPARE_RAID"),
    expansionActionItem("LAUNCH_RAID", launchRaidEnabled, launchRaidEnabled ? "Hazırlanan akını başlat." : "Önce akın hazırlığı, iddia veya zayıf direnç gerekir.", recommended === "LAUNCH_RAID"),
    expansionActionItem("DEMAND_SUBMISSION", demandEnabled, demandEnabled ? "Güçlü iddia ve nüfuzla bağlılık iste." : "Nüfuz/iddia düşük veya direnç yüksek.", recommended === "DEMAND_SUBMISSION"),
    expansionActionItem("FORTIFY_BORDER", fortifyEnabled, fortifyEnabled ? "Hudut çizgisini pekiştir, direnci düşür." : "Önce etki veya iddia oluştur.", recommended === "FORTIFY_BORDER"),
    expansionActionItem("WITHDRAW_CLAIM", withdrawEnabled, withdrawEnabled ? "Siyasi baskıyı düşür, iddiayı geri çek." : "Geri çekilecek iddia yok.", recommended === "WITHDRAW_CLAIM"),
  ];
}

export function getExpansionAdvisorMessage(province: ProvinceIntel, controlState: ProvinceControlState = getInitialProvinceControlState(province)) {
  const influence = getInfluenceProgress(controlState);
  const claim = getClaimProgress(controlState);
  if (controlState.controlStatus === "unknown") {
    return "Bu yurt sisli. Önce keşif yapmadan claim veya akın kararı zayıf bilgiye dayanır.";
  }
  if (province.borderTension.level === "critical") {
    return "Hudut zaten kritik. Yeni baskı misilleme doğurabilir; önce nüfuz veya tahkimat düşün.";
  }
  if (province.strategicValue >= 72 && influence < 30) {
    return "Bu yurt stratejik ama siyasi zemin zayıf. Claimden önce etki kurmak daha güvenli.";
  }
  if (claim > 0 && claim < 45) {
    return "Claim zayıf. Akın başlatmadan önce elçi ve nüfuzla iddiayı güçlendir.";
  }
  if (controlState.resistance <= 34 && province.realm.strength < 70) {
    return "Düşük direnç ve zayıf kontrol burayı iyi bir genişleme hedefi yapıyor.";
  }
  if (province.terrain === "pass") {
    return "Bu geçit hattını kontrol etmek yürüyüş ve hudut baskısını iyileştirir.";
  }
  return "Nüfuz, claim ve direnç dengesini koru; acele akın yerine siyasi zemin kurmak daha ucuz olabilir.";
}

export function applyExpansionActionMock(
  province: ProvinceIntel,
  currentState: ProvinceControlState = getInitialProvinceControlState(province),
  action: ExpansionAction,
  now = new Date(),
): ExpansionActionResult {
  const nextState: ProvinceControlState = {
    ...currentState,
    influenceByRealm: { ...currentState.influenceByRealm },
    contestedByRealmIds: [...currentState.contestedByRealmIds],
  };
  let message = "";
  let realmReaction = "Yurt şimdilik tepki vermedi.";
  let tensionDelta = 0;

  const addInfluence = (amount: number) => {
    nextState.influenceByRealm.player = clamp((nextState.influenceByRealm.player ?? 0) + amount, 0, 100);
  };

  if (action === "SCOUT_PROVINCE") {
    nextState.lastScoutedAt = now.toISOString();
    nextState.resistance = clamp(nextState.resistance - 6, 0, 100);
    addInfluence(4);
    message = "Keşif kolu yurttaki direnci ve geçit baskısını raporladı.";
    realmReaction = province.diplomacy.relation === "unknown" ? "Sisli yurt keşif izini fark etmedi." : "Yerel nöbetçiler keşif hareketini izledi.";
  } else if (action === "SEND_ENVOY") {
    addInfluence(10);
    nextState.unrest = clamp(nextState.unrest - 3, 0, 100);
    tensionDelta = province.diplomacy.relation === "hostile" || province.diplomacy.relation === "rival" ? 2 : -2;
    message = `${province.realm.name} içinde elçiler Toy sözünü yaydı.`;
    realmReaction = "Yerel beyler daha dikkatli ama görüşmeye açık.";
  } else if (action === "ESTABLISH_INFLUENCE") {
    addInfluence(18);
    nextState.unrest = clamp(nextState.unrest + 3, 0, 100);
    nextState.resistance = clamp(nextState.resistance - 4, 0, 100);
    tensionDelta = 5;
    message = "Toy etkisi yurtta güç kazandı; sınırdaki dikkat arttı.";
    realmReaction = "Kontrol eden yurt bu nüfuzu siyasi baskı sayabilir.";
  } else if (action === "CLAIM_PROVINCE") {
    nextState.playerClaimStrength = clamp(nextState.playerClaimStrength + 28 + Math.round(getInfluenceProgress(nextState) * 0.12), 0, 100);
    nextState.unrest = clamp(nextState.unrest + 8, 0, 100);
    tensionDelta = 10;
    message = "Sancak iddiası Toy kayıtlarına geçti. Rakip yurtlar bunu not etti.";
    realmReaction = province.diplomacy.relation === "rival" ? "Rakip yurt karşı iddiayı sertleştirdi." : "Hudut beyleri iddiayı tartışmaya başladı.";
  } else if (action === "PREPARE_RAID") {
    nextState.raidPrepared = true;
    nextState.unrest = clamp(nextState.unrest + 5, 0, 100);
    tensionDelta = 8;
    message = "Akın sancağı hazırlandı; rota ve iaşe düzeni kuruldu.";
    realmReaction = "Sınır nöbetleri sıkılaştı.";
  } else if (action === "LAUNCH_RAID") {
    const raidPressure = 18 + Math.round((nextState.playerClaimStrength + getInfluenceProgress(nextState)) * 0.16);
    nextState.resistance = clamp(nextState.resistance - raidPressure, 0, 100);
    nextState.unrest = clamp(nextState.unrest + 14, 0, 100);
    addInfluence(12);
    nextState.playerClaimStrength = clamp(nextState.playerClaimStrength + 10, 0, 100);
    nextState.raidPrepared = false;
    tensionDelta = 16;
    if (nextState.resistance <= 38 && getInfluenceProgress(nextState) >= 42) {
      nextState.controllerRealmId = "player";
      message = "Akın başarılı oldu; yurt fiilen işgal altına alındı.";
      realmReaction = "Eski sahipleri karşı hamle için sancak topluyor.";
    } else {
      message = "Akın baskı kurdu ama yurt henüz teslim olmadı.";
      realmReaction = "Direnç sürüyor; ikinci baskı daha pahalı olabilir.";
    }
  } else if (action === "DEMAND_SUBMISSION") {
    nextState.controllerRealmId = "player";
    addInfluence(16);
    nextState.resistance = clamp(nextState.resistance - 18, 0, 100);
    nextState.unrest = clamp(nextState.unrest + 6, 0, 100);
    tensionDelta = 12;
    message = "Bağlılık talebi kabul gördü; yurt Toy denetimine geçti.";
    realmReaction = "Komşu yurtlar bu bağlılığı sınır genişlemesi olarak okuyacak.";
  } else if (action === "FORTIFY_BORDER") {
    nextState.fortified = true;
    addInfluence(8);
    nextState.resistance = clamp(nextState.resistance - 5, 0, 100);
    nextState.unrest = clamp(nextState.unrest - 8, 0, 100);
    tensionDelta = 3;
    message = "Hudut pekiştirildi; Toy etkisi daha görünür hale geldi.";
    realmReaction = "Tahkimat, yakın yurtlarda dikkat uyandırdı.";
  } else if (action === "WITHDRAW_CLAIM") {
    nextState.playerClaimStrength = 0;
    nextState.raidPrepared = false;
    nextState.unrest = clamp(nextState.unrest - 10, 0, 100);
    tensionDelta = -12;
    message = "Sancak iddiası geri çekildi; hudut baskısı azaldı.";
    realmReaction = "Yerel beyler geri adımı siyasi nefes olarak gördü.";
  }

  nextState.controlStatus = getProvinceControlStatus(province, nextState);
  nextState.expansionDifficulty = getExpansionDifficulty(province, nextState);

  return {
    action,
    nextState,
    message,
    advisorText: getExpansionAdvisorMessage(province, nextState),
    realmReaction,
    tensionDelta,
  };
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
