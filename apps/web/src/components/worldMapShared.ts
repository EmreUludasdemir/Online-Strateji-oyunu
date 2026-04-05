export const MAP_TILE_WORLD_SIZE = 128;
export const MAP_CAMERA_DEFAULT_ZOOM = 0.9;
export const MAP_CAMERA_MIN_ZOOM = 0.45;
export const MAP_CAMERA_MAX_ZOOM = 1.8;

export type MapDetailLevel = "far" | "mid" | "near";

export interface MapCameraState {
  centerTileX: number;
  centerTileY: number;
  zoom: number;
  detailLevel: MapDetailLevel;
}

export interface ActiveMapChunkMeta {
  centerTileX: number;
  centerTileY: number;
  radius: number;
}

export interface ScoutTrailView {
  id: string;
  from: {
    x: number;
    y: number;
  };
  to: {
    x: number;
    y: number;
  };
  startedAt: string;
  durationMs: number;
  targetKind: "CITY" | "POI";
  targetLabel: string;
}

export function getMapDetailLevel(zoom: number): MapDetailLevel {
  if (zoom <= 0.84) {
    return "far";
  }
  if (zoom <= 1.26) {
    return "mid";
  }
  return "near";
}

export function getMapRadiusForDetail(detailLevel: MapDetailLevel): 6 | 8 | 10 {
  if (detailLevel === "near") {
    return 6;
  }
  if (detailLevel === "mid") {
    return 8;
  }
  return 10;
}

export function clampTileCoordinate(value: number, worldSize: number): number {
  return Math.max(0, Math.min(worldSize - 1, value));
}

export function tileToWorld(x: number, y: number) {
  return {
    x: (x + 0.5) * MAP_TILE_WORLD_SIZE,
    y: (y + 0.5) * MAP_TILE_WORLD_SIZE,
  };
}

export function worldToTile(x: number, y: number, worldSize: number) {
  return {
    x: clampTileCoordinate(Math.floor(x / MAP_TILE_WORLD_SIZE), worldSize),
    y: clampTileCoordinate(Math.floor(y / MAP_TILE_WORLD_SIZE), worldSize),
  };
}
