import { GAME_MAP_SIZE } from "./constants";

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
