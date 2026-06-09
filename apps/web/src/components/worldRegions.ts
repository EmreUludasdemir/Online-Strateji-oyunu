export interface WorldRegion {
  id: string;
  label: string;
  shortLabel: string;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  anchorX: number;
  anchorY: number;
  capitalX: number;
  capitalY: number;
  color: string;
  borderColor: string;
  fill: number;
}

interface WorldRegionTemplate {
  id: string;
  label: string;
  shortLabel: string;
  nx: number;
  ny: number;
  color: string;
  borderColor: string;
  fill: number;
  reach: number;
  central?: boolean;
}

const REGION_TEMPLATES: WorldRegionTemplate[] = [
  {
    id: "kut-otagi",
    label: "Kut Otağı",
    shortLabel: "KUT",
    nx: 0.5,
    ny: 0.5,
    color: "#d7b4ff",
    borderColor: "#f4d79c",
    fill: 0x4a315f,
    reach: 0.18,
    central: true,
  },
  {
    id: "kok-tore",
    label: "Kök Töre",
    shortLabel: "KÖK",
    nx: 0.22,
    ny: 0.18,
    color: "#72ced1",
    borderColor: "#d9ffff",
    fill: 0x24565c,
    reach: 0.24,
  },
  {
    id: "oguz-yurdu",
    label: "Oğuz Yurdu",
    shortLabel: "OĞZ",
    nx: 0.5,
    ny: 0.13,
    color: "#e2bb72",
    borderColor: "#fff1c6",
    fill: 0x5b4924,
    reach: 0.22,
  },
  {
    id: "uygur-eli",
    label: "Uygur Eli",
    shortLabel: "UYG",
    nx: 0.78,
    ny: 0.2,
    color: "#85d0a1",
    borderColor: "#e8ffe8",
    fill: 0x2d5a3d,
    reach: 0.24,
  },
  {
    id: "hazar-kapisi",
    label: "Hazar Kapısı",
    shortLabel: "HAZ",
    nx: 0.87,
    ny: 0.5,
    color: "#6ca7d8",
    borderColor: "#d6eeff",
    fill: 0x274b68,
    reach: 0.23,
  },
  {
    id: "selcuk-ucu",
    label: "Selçuk Ucu",
    shortLabel: "SEL",
    nx: 0.74,
    ny: 0.8,
    color: "#d47b5a",
    borderColor: "#ffd9c8",
    fill: 0x663625,
    reach: 0.25,
  },
  {
    id: "kipcak-bozkiri",
    label: "Kıpçak Bozkırı",
    shortLabel: "KIP",
    nx: 0.5,
    ny: 0.88,
    color: "#c9c06b",
    borderColor: "#fff8bd",
    fill: 0x5a5528,
    reach: 0.22,
  },
  {
    id: "karluk-dagi",
    label: "Karluk Dağı",
    shortLabel: "KAR",
    nx: 0.22,
    ny: 0.78,
    color: "#9eb0bf",
    borderColor: "#edf4ff",
    fill: 0x3e4c58,
    reach: 0.24,
  },
  {
    id: "avar-siniri",
    label: "Avar Sınırı",
    shortLabel: "AVR",
    nx: 0.12,
    ny: 0.5,
    color: "#c88fd6",
    borderColor: "#fde6ff",
    fill: 0x573665,
    reach: 0.23,
  },
];

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function hashCoordinate(x: number, y: number): number {
  return ((x * 73856093) ^ (y * 19349663)) >>> 0;
}

function toTile(worldSize: number, ratio: number) {
  return clamp(Math.round((worldSize - 1) * ratio), 0, worldSize - 1);
}

export function getWorldRegions(worldSize: number): WorldRegion[] {
  const max = worldSize - 1;

  return REGION_TEMPLATES.map((template) => {
    const capitalX = toTile(worldSize, template.nx);
    const capitalY = toTile(worldSize, template.ny);
    const radius = Math.max(4, Math.round(worldSize * template.reach));

    return {
      id: template.id,
      label: template.label,
      shortLabel: template.shortLabel,
      x0: clamp(capitalX - radius, 0, max),
      y0: clamp(capitalY - radius, 0, max),
      x1: clamp(capitalX + radius, 0, max),
      y1: clamp(capitalY + radius, 0, max),
      anchorX: capitalX,
      anchorY: capitalY,
      capitalX,
      capitalY,
      color: template.color,
      borderColor: template.borderColor,
      fill: template.fill,
    };
  });
}

export function getWorldRegionForTile(x: number, y: number, worldSize: number): WorldRegion {
  const regions = getWorldRegions(worldSize);
  const center = (worldSize - 1) / 2;
  const maxRadius = Math.hypot(center, center);
  const centerRatio = Math.hypot(x - center, y - center) / maxRadius;
  const centralRegion = regions.find((region) => region.id === "kut-otagi") ?? regions[0];

  if (centerRatio <= 0.21) {
    return centralRegion;
  }

  let bestRegion = regions[0];
  let bestScore = Number.POSITIVE_INFINITY;

  for (const region of regions) {
    if (region.id === "kut-otagi") {
      continue;
    }

    const distance = Math.hypot(x - region.capitalX, y - region.capitalY);
    const borderJitter = ((hashCoordinate(x + region.capitalX, y + region.capitalY) % 100) / 100 - 0.5) * worldSize * 0.04;
    const score = distance + borderJitter;
    if (score < bestScore) {
      bestScore = score;
      bestRegion = region;
    }
  }

  return bestRegion;
}
