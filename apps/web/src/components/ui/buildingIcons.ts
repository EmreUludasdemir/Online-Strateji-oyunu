import type { BuildingType } from "@frontier/shared";

export const BUILDING_ICONS: Record<BuildingType, string> = {
  TOWN_HALL: "/assets/icons/buildings/town_hall.svg",
  FARM: "/assets/icons/buildings/farm.svg",
  LUMBER_MILL: "/assets/icons/buildings/lumber_mill.svg",
  QUARRY: "/assets/icons/buildings/quarry.svg",
  GOLD_MINE: "/assets/icons/buildings/gold_mine.svg",
  BARRACKS: "/assets/icons/buildings/barracks.svg",
  ACADEMY: "/assets/icons/buildings/academy.svg",
  WATCHTOWER: "/assets/icons/buildings/watchtower.svg",
  HOSPITAL: "/assets/icons/buildings/hospital.svg",
  WALL: "/assets/icons/buildings/wall.svg",
  EMBASSY: "/assets/icons/buildings/embassy.svg",
  FORGE: "/assets/icons/buildings/forge.svg",
};

export function buildingIcon(type: BuildingType): string {
  return BUILDING_ICONS[type] ?? BUILDING_ICONS.TOWN_HALL;
}
