import type { BuildingType, BattleResult, ResourceKey, SocketEventType } from "./game";

export type ResourceStock = Record<ResourceKey, number>;

export interface ApiError {
  code: string;
  message: string;
  details?: string[];
}

export interface AuthUser {
  id: string;
  username: string;
  cityId: string;
  cityName: string;
}

export interface AuthResponse {
  user: AuthUser | null;
}

export interface OkResponse {
  ok: true;
}

export interface ActiveUpgradeView {
  id: string;
  buildingType: BuildingType;
  startedAt: string;
  completesAt: string;
  toLevel: number;
  remainingSeconds: number;
}

export interface BuildingView {
  type: BuildingType;
  label: string;
  description: string;
  level: number;
  nextLevel: number;
  upgradeCost: ResourceStock;
  upgradeDurationSeconds: number;
  isUpgradeActive: boolean;
}

export interface CityState {
  cityId: string;
  cityName: string;
  coordinates: {
    x: number;
    y: number;
  };
  resources: ResourceStock;
  resourcesUpdatedAt: string;
  buildings: BuildingView[];
  activeUpgrade: ActiveUpgradeView | null;
  attackPower: number;
  defensePower: number;
}

export interface GameStateResponse {
  player: AuthUser;
  city: CityState;
}

export interface MapCity {
  cityId: string;
  cityName: string;
  ownerName: string;
  x: number;
  y: number;
  isCurrentPlayer: boolean;
  canAttack: boolean;
  distance: number | null;
  townHallLevel: number;
  attackPower: number;
  defensePower: number;
  projectedOutcome: BattleResult | null;
}

export interface WorldMapResponse {
  size: number;
  cities: MapCity[];
}

export interface BattleReportView {
  id: string;
  createdAt: string;
  attackerName: string;
  defenderName: string;
  attackerCityName: string;
  defenderCityName: string;
  result: BattleResult;
  attackerPower: number;
  defenderPower: number;
  loot: ResourceStock;
  location: {
    from: {
      x: number;
      y: number;
    };
    to: {
      x: number;
      y: number;
    };
    distance: number;
  };
}

export interface BattleReportsResponse {
  reports: BattleReportView[];
}

export interface AttackResponse {
  report: BattleReportView;
}

export interface SocketEnvelope {
  type: SocketEventType;
  payload: {
    cityId?: string;
    reportId?: string;
  };
}
