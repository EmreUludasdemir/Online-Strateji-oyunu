export interface WorldRegion {
  id: string;
  label: string;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  anchorX: number;
  anchorY: number;
  color: string;
}

export function getWorldRegions(worldSize: number): WorldRegion[] {
  const half = Math.floor(worldSize / 2);
  const max = worldSize - 1;

  return [
    {
      id: "cedar-basin",
      label: "Cedar Basin",
      x0: 0,
      y0: 0,
      x1: half - 1,
      y1: half - 1,
      anchorX: Math.floor(half * 0.45),
      anchorY: Math.floor(half * 0.38),
      color: "#6cb1a6",
    },
    {
      id: "sunscar-steppe",
      label: "Sunscar Steppe",
      x0: half,
      y0: 0,
      x1: max,
      y1: half - 1,
      anchorX: half + Math.floor(half * 0.42),
      anchorY: Math.floor(half * 0.34),
      color: "#d7b062",
    },
    {
      id: "quarry-marches",
      label: "Quarry Marches",
      x0: 0,
      y0: half,
      x1: half - 1,
      y1: max,
      anchorX: Math.floor(half * 0.36),
      anchorY: half + Math.floor(half * 0.5),
      color: "#9eb0bf",
    },
    {
      id: "ember-frontier",
      label: "Ember Frontier",
      x0: half,
      y0: half,
      x1: max,
      y1: max,
      anchorX: half + Math.floor(half * 0.46),
      anchorY: half + Math.floor(half * 0.5),
      color: "#d47b5a",
    },
  ];
}

