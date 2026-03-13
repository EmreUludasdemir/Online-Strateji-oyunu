import type { FogTileView, MapCity, MarchView, PoiView, WorldChunkResponse } from "@frontier/shared";

import type { ActiveMapChunkMeta } from "./worldMapShared";

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function tileRank(state: FogTileView["state"]) {
  if (state === "VISIBLE") {
    return 2;
  }
  if (state === "DISCOVERED") {
    return 1;
  }
  return 0;
}

function sortTiles(left: FogTileView, right: FogTileView) {
  if (left.y !== right.y) {
    return left.y - right.y;
  }
  return left.x - right.x;
}

function sortCities(left: MapCity, right: MapCity) {
  if (left.isCurrentPlayer !== right.isCurrentPlayer) {
    return left.isCurrentPlayer ? -1 : 1;
  }
  return left.cityName.localeCompare(right.cityName);
}

function sortPois(left: PoiView, right: PoiView) {
  if (left.kind !== right.kind) {
    return left.kind.localeCompare(right.kind);
  }
  if (left.y !== right.y) {
    return left.y - right.y;
  }
  return left.x - right.x;
}

function sortMarches(left: MarchView, right: MarchView) {
  return Date.parse(left.etaAt) - Date.parse(right.etaAt);
}

export function buildChunkPrefetchRequests(anchor: ActiveMapChunkMeta, worldSize: number): ActiveMapChunkMeta[] {
  const step = Math.max(4, anchor.radius);
  const requests: ActiveMapChunkMeta[] = [];

  for (const deltaY of [-step, 0, step]) {
    for (const deltaX of [-step, 0, step]) {
      const centerTileX = clamp(anchor.centerTileX + deltaX, 0, worldSize - 1);
      const centerTileY = clamp(anchor.centerTileY + deltaY, 0, worldSize - 1);
      if (requests.some((entry) => entry.centerTileX === centerTileX && entry.centerTileY === centerTileY && entry.radius === anchor.radius)) {
        continue;
      }
      requests.push({
        centerTileX,
        centerTileY,
        radius: anchor.radius,
      });
    }
  }

  return requests.sort((left, right) => {
    const leftDistance = Math.abs(left.centerTileX - anchor.centerTileX) + Math.abs(left.centerTileY - anchor.centerTileY);
    const rightDistance = Math.abs(right.centerTileX - anchor.centerTileX) + Math.abs(right.centerTileY - anchor.centerTileY);
    return leftDistance - rightDistance;
  });
}

export function mergeWorldChunks(
  anchor: ActiveMapChunkMeta,
  primaryChunk: WorldChunkResponse | null,
  cachedChunks: WorldChunkResponse[],
): WorldChunkResponse | null {
  const chunks = cachedChunks.filter(
    (chunk) =>
      chunk.radius === anchor.radius &&
      Math.abs(chunk.center.x - anchor.centerTileX) <= anchor.radius &&
      Math.abs(chunk.center.y - anchor.centerTileY) <= anchor.radius,
  );
  const sourceChunks = chunks.length > 0 ? chunks : primaryChunk ? [primaryChunk] : [];

  if (sourceChunks.length === 0) {
    return null;
  }

  const tileMap = new Map<string, FogTileView>();
  const cityMap = new Map<string, MapCity>();
  const poiMap = new Map<string, PoiView>();
  const marchMap = new Map<string, MarchView>();

  for (const chunk of sourceChunks) {
    for (const tile of chunk.tiles) {
      const key = `${tile.x}:${tile.y}`;
      const existing = tileMap.get(key);
      if (!existing || tileRank(tile.state) > tileRank(existing.state)) {
        tileMap.set(key, tile);
      }
    }

    for (const city of chunk.cities) {
      const existing = cityMap.get(city.cityId);
      if (!existing || (city.distance ?? Number.POSITIVE_INFINITY) < (existing.distance ?? Number.POSITIVE_INFINITY)) {
        cityMap.set(city.cityId, city);
      }
    }

    for (const poi of chunk.pois) {
      const existing = poiMap.get(poi.id);
      if (!existing || (poi.distance ?? Number.POSITIVE_INFINITY) < (existing.distance ?? Number.POSITIVE_INFINITY)) {
        poiMap.set(poi.id, poi);
      }
    }

    for (const march of chunk.marches) {
      marchMap.set(march.id, march);
    }
  }

  const anchorChunk =
    sourceChunks.find(
      (chunk) => chunk.center.x === anchor.centerTileX && chunk.center.y === anchor.centerTileY && chunk.radius === anchor.radius,
    ) ??
    primaryChunk ??
    sourceChunks[0];

  return {
    size: anchorChunk.size,
    center: anchorChunk.center,
    radius: anchorChunk.radius,
    tiles: [...tileMap.values()].sort(sortTiles),
    cities: [...cityMap.values()].sort(sortCities),
    pois: [...poiMap.values()].sort(sortPois),
    marches: [...marchMap.values()].sort(sortMarches),
  };
}
