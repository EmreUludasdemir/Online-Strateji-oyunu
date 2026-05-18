export type KingdomTierId = "TIER_1" | "TIER_2" | "TIER_3";

export interface KingdomTierDefinition {
  id: KingdomTierId;
  label: string;
  shortLabel: string;
  description: string;
  color: string;
  fill: number;
}

export interface KingdomPass {
  id: string;
  label: string;
  tier: "TIER_2" | "TIER_3";
  x: number;
  y: number;
  angle: number;
}

export interface KingdomSanctuary {
  id: string;
  label: string;
  tier: KingdomTierId;
  x: number;
  y: number;
  color: string;
}

export const KINGDOM_TIER_DEFINITIONS: Record<KingdomTierId, KingdomTierDefinition> = {
  TIER_1: {
    id: "TIER_1",
    label: "Tier 1 Outer Provinces",
    shortLabel: "T1 Outer",
    description: "Starting lands and early alliance resource rushes.",
    color: "#6cb1a6",
    fill: 0x293d34,
  },
  TIER_2: {
    id: "TIER_2",
    label: "Tier 2 Gate Belt",
    shortLabel: "T2 Belt",
    description: "Mid-kingdom lands gated by alliance-held passes.",
    color: "#6ca7d8",
    fill: 0x29384a,
  },
  TIER_3: {
    id: "TIER_3",
    label: "Tier 3 Crown Core",
    shortLabel: "T3 Core",
    description: "Central objective lands around the kingdom temple.",
    color: "#a888d8",
    fill: 0x3a304f,
  },
};

const INNER_RING_RATIO = 0.29;
const OUTER_RING_RATIO = 0.58;

function hashCoordinate(x: number, y: number): number {
  return ((x * 73856093) ^ (y * 19349663)) >>> 0;
}

export function getKingdomCenter(worldSize: number) {
  const center = (worldSize - 1) / 2;
  return { x: center, y: center };
}

export function getKingdomMaxRadius(worldSize: number) {
  const center = getKingdomCenter(worldSize);
  return Math.hypot(center.x, center.y);
}

export function getKingdomRadiusRatio(x: number, y: number, worldSize: number) {
  const center = getKingdomCenter(worldSize);
  return Math.hypot(x - center.x, y - center.y) / getKingdomMaxRadius(worldSize);
}

export function getKingdomTier(x: number, y: number, worldSize: number): KingdomTierDefinition {
  const ratio = getKingdomRadiusRatio(x, y, worldSize);
  if (ratio <= INNER_RING_RATIO) {
    return KINGDOM_TIER_DEFINITIONS.TIER_3;
  }
  if (ratio <= OUTER_RING_RATIO) {
    return KINGDOM_TIER_DEFINITIONS.TIER_2;
  }
  return KINGDOM_TIER_DEFINITIONS.TIER_1;
}

export function getKingdomRingRadii(worldSize: number) {
  const maxRadius = getKingdomMaxRadius(worldSize);
  return {
    inner: maxRadius * INNER_RING_RATIO,
    outer: maxRadius * OUTER_RING_RATIO,
  };
}

function projectRingTile(worldSize: number, radiusRatio: number, angle: number) {
  const center = getKingdomCenter(worldSize);
  const radius = getKingdomMaxRadius(worldSize) * radiusRatio;
  return {
    x: Math.max(1, Math.min(worldSize - 2, Math.round(center.x + Math.cos(angle) * radius))),
    y: Math.max(1, Math.min(worldSize - 2, Math.round(center.y + Math.sin(angle) * radius))),
  };
}

function uniqueByCoordinate<T extends { x: number; y: number }>(entries: T[]) {
  const seen = new Set<string>();
  return entries.filter((entry) => {
    const key = `${entry.x}:${entry.y}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

export function getKingdomPasses(worldSize: number): KingdomPass[] {
  const innerPasses = Array.from({ length: 8 }, (_, index) => {
    const angle = (Math.PI * 2 * index) / 8;
    const point = projectRingTile(worldSize, INNER_RING_RATIO, angle);
    return {
      id: `tier-3-pass-${index}`,
      label: `Crown Pass ${index + 1}`,
      tier: "TIER_3" as const,
      x: point.x,
      y: point.y,
      angle,
    };
  });

  const outerPasses = Array.from({ length: 14 }, (_, index) => {
    const angle = (Math.PI * 2 * index) / 14 + Math.PI / 14;
    const point = projectRingTile(worldSize, OUTER_RING_RATIO, angle);
    return {
      id: `tier-2-pass-${index}`,
      label: `Gate Pass ${index + 1}`,
      tier: "TIER_2" as const,
      x: point.x,
      y: point.y,
      angle,
    };
  });

  return uniqueByCoordinate([...innerPasses, ...outerPasses]);
}

export function getNearestKingdomPass(x: number, y: number, worldSize: number, maxDistance = 1.55) {
  let nearest: KingdomPass | null = null;
  let nearestDistance = Number.POSITIVE_INFINITY;

  for (const pass of getKingdomPasses(worldSize)) {
    const distance = Math.hypot(x - pass.x, y - pass.y);
    if (distance <= maxDistance && distance < nearestDistance) {
      nearest = pass;
      nearestDistance = distance;
    }
  }

  return nearest;
}

export function getKingdomSanctuaries(worldSize: number): KingdomSanctuary[] {
  const center = getKingdomCenter(worldSize);
  const maxRadius = getKingdomMaxRadius(worldSize);
  const crown = {
    x: Math.round(center.x),
    y: Math.round(center.y),
  };
  const shrineRadius = maxRadius * 0.18;
  const shrines = [
    { id: "north-altar", label: "North Altar", angle: -Math.PI / 2, color: "#85d0a1" },
    { id: "east-altar", label: "East Altar", angle: 0, color: "#e2bb72" },
    { id: "south-altar", label: "South Altar", angle: Math.PI / 2, color: "#d47b5a" },
    { id: "west-altar", label: "West Altar", angle: Math.PI, color: "#72ced1" },
  ].map((entry) => ({
    id: entry.id,
    label: entry.label,
    tier: "TIER_3" as const,
    x: Math.max(1, Math.min(worldSize - 2, Math.round(center.x + Math.cos(entry.angle) * shrineRadius))),
    y: Math.max(1, Math.min(worldSize - 2, Math.round(center.y + Math.sin(entry.angle) * shrineRadius))),
    color: entry.color,
  }));

  return [
    {
      id: "crown-temple",
      label: "Crown Temple",
      tier: "TIER_3",
      x: crown.x,
      y: crown.y,
      color: "#f4d79c",
    },
    ...shrines,
  ];
}

export function isKingdomSanctuaryTile(x: number, y: number, worldSize: number) {
  return getKingdomSanctuaries(worldSize).some((sanctuary) => sanctuary.x === x && sanctuary.y === y);
}

export function isKingdomMountainTile(x: number, y: number, worldSize: number) {
  if (x <= 0 || y <= 0 || x >= worldSize - 1 || y >= worldSize - 1) {
    return true;
  }

  if (getNearestKingdomPass(x, y, worldSize, 2.05) || isKingdomSanctuaryTile(x, y, worldSize)) {
    return false;
  }

  const ratio = getKingdomRadiusRatio(x, y, worldSize);
  const hash = hashCoordinate(x + 41, y + 83);
  const jitter = ((hash % 100) / 100 - 0.5) * 0.04;
  const innerRidge = Math.abs(ratio - (INNER_RING_RATIO + jitter)) < 0.031;
  const outerRidge = Math.abs(ratio - (OUTER_RING_RATIO + jitter)) < 0.036;
  const spur = ratio > 0.38 && ratio < 0.93 && (hash % 31 === 0 || hash % 43 === 0);

  return innerRidge || outerRidge || spur;
}

