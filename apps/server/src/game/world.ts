import type { PoiKind, PoiResourceType } from "@frontier/shared";
import { POI_KIND_LABELS, POI_RESOURCE_LABELS } from "@frontier/shared";
import type { Prisma } from "@prisma/client";

import { BARBARIAN_CAMP_COUNT, GAME_MAP_SIZE, RESOURCE_NODE_AMOUNTS, RESOURCE_NODE_COUNT } from "./constants";

function isWithinBounds(x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < GAME_MAP_SIZE && y < GAME_MAP_SIZE;
}

export function buildSpiralCoordinates(): Array<{ x: number; y: number }> {
  const center = Math.floor(GAME_MAP_SIZE / 2);
  const coordinates: Array<{ x: number; y: number }> = [];
  const seen = new Set<string>();

  const pushCoordinate = (x: number, y: number) => {
    const key = `${x},${y}`;
    if (isWithinBounds(x, y) && !seen.has(key)) {
      seen.add(key);
      coordinates.push({ x, y });
    }
  };

  pushCoordinate(center, center);

  for (let radius = 1; coordinates.length < GAME_MAP_SIZE * GAME_MAP_SIZE; radius += 1) {
    for (let dx = -radius; dx <= radius; dx += 1) {
      pushCoordinate(center + dx, center - radius);
      pushCoordinate(center + dx, center + radius);
    }

    for (let dy = -radius + 1; dy <= radius - 1; dy += 1) {
      pushCoordinate(center - radius, center + dy);
      pushCoordinate(center + radius, center + dy);
    }
  }

  return coordinates;
}

export function findOpenCoordinate(
  takenCoordinates: Array<{ x: number; y: number }>,
): { x: number; y: number } {
  const taken = new Set(takenCoordinates.map((coordinate) => `${coordinate.x},${coordinate.y}`));

  for (const coordinate of buildSpiralCoordinates()) {
    if (!taken.has(`${coordinate.x},${coordinate.y}`)) {
      return coordinate;
    }
  }

  throw new Error("The world map is full.");
}

function buildBlockedCoordinateSet(cityCoordinates: Array<{ x: number; y: number }>) {
  const blocked = new Set<string>();

  for (const coordinate of cityCoordinates) {
    for (let y = coordinate.y - 1; y <= coordinate.y + 1; y += 1) {
      for (let x = coordinate.x - 1; x <= coordinate.x + 1; x += 1) {
        if (isWithinBounds(x, y) && Math.abs(coordinate.x - x) + Math.abs(coordinate.y - y) <= 1) {
          blocked.add(`${x},${y}`);
        }
      }
    }
  }

  return blocked;
}

function getCampLevel(index: number) {
  return [1, 2, 3][index % 3];
}

function getNodeLevel(index: number) {
  return [1, 2, 3][index % 3];
}

function getNodeResourceType(index: number): PoiResourceType {
  return (["WOOD", "STONE", "FOOD", "GOLD"] as const)[index % 4];
}

interface PoiSeedRecord {
  kind: PoiKind;
  label: string;
  level: number;
  x: number;
  y: number;
  resourceType: PoiResourceType | null;
  remainingAmount: number | null;
  maxAmount: number | null;
}

function buildPoiSeeds(
  existingCoordinates: Array<{ x: number; y: number }>,
  cityCoordinates: Array<{ x: number; y: number }>,
): PoiSeedRecord[] {
  const taken = new Set(existingCoordinates.map((coordinate) => `${coordinate.x},${coordinate.y}`));
  const blocked = buildBlockedCoordinateSet(cityCoordinates);
  const seeds: PoiSeedRecord[] = [];
  let campIndex = 0;
  let nodeIndex = 0;

  for (const coordinate of buildSpiralCoordinates()) {
    const key = `${coordinate.x},${coordinate.y}`;
    if (taken.has(key) || blocked.has(key)) {
      continue;
    }

    if (campIndex < BARBARIAN_CAMP_COUNT) {
      const level = getCampLevel(campIndex);
      seeds.push({
        kind: "BARBARIAN_CAMP",
        label: `${POI_KIND_LABELS.BARBARIAN_CAMP} ${campIndex + 1}`,
        level,
        x: coordinate.x,
        y: coordinate.y,
        resourceType: null,
        remainingAmount: null,
        maxAmount: null,
      });
      taken.add(key);
      campIndex += 1;
      continue;
    }

    if (nodeIndex < RESOURCE_NODE_COUNT) {
      const level = getNodeLevel(nodeIndex);
      const resourceType = getNodeResourceType(nodeIndex);
      const amount = RESOURCE_NODE_AMOUNTS[level];
      seeds.push({
        kind: "RESOURCE_NODE",
        label: `${POI_RESOURCE_LABELS[resourceType]} ${POI_KIND_LABELS.RESOURCE_NODE} ${nodeIndex + 1}`,
        level,
        x: coordinate.x,
        y: coordinate.y,
        resourceType,
        remainingAmount: amount,
        maxAmount: amount,
      });
      taken.add(key);
      nodeIndex += 1;
    }

    if (campIndex >= BARBARIAN_CAMP_COUNT && nodeIndex >= RESOURCE_NODE_COUNT) {
      break;
    }
  }

  return seeds;
}

export async function ensureWorldPoisTx(tx: Prisma.TransactionClient): Promise<void> {
  const [cities, existingPois] = await Promise.all([
    tx.city.findMany({
      select: {
        x: true,
        y: true,
      },
    }),
    tx.mapPoi.findMany({
      select: {
        id: true,
        kind: true,
        x: true,
        y: true,
      },
    }),
  ]);

  const campCount = existingPois.filter((poi) => poi.kind === "BARBARIAN_CAMP").length;
  const nodeCount = existingPois.filter((poi) => poi.kind === "RESOURCE_NODE").length;
  if (campCount >= BARBARIAN_CAMP_COUNT && nodeCount >= RESOURCE_NODE_COUNT) {
    return;
  }

  const seeded = buildPoiSeeds(existingPois, cities);
  const missingCampCount = Math.max(0, BARBARIAN_CAMP_COUNT - campCount);
  const missingNodeCount = Math.max(0, RESOURCE_NODE_COUNT - nodeCount);

  const toCreate = [
    ...seeded.filter((poi) => poi.kind === "BARBARIAN_CAMP").slice(0, missingCampCount),
    ...seeded.filter((poi) => poi.kind === "RESOURCE_NODE").slice(0, missingNodeCount),
  ];

  if (toCreate.length === 0) {
    return;
  }

  await tx.mapPoi.createMany({
    data: toCreate,
  });
}
