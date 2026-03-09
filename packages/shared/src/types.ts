import type {
  AllianceHelpKind,
  AllianceRole,
  BattleResult,
  BuildingType,
  FogState,
  MarchState,
  ResearchType,
  ResourceKey,
  SocketEventType,
  TroopType,
} from "./game";

export type ResourceStock = Record<ResourceKey, number>;
export type TroopStock = Record<TroopType, number>;

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

export interface AllianceSummaryView {
  id: string;
  name: string;
  tag: string;
  description: string | null;
  role: AllianceRole;
  memberCount: number;
  treasury: ResourceStock;
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

export interface TrainingQueueView {
  id: string;
  troopType: TroopType;
  quantity: number;
  startedAt: string;
  completesAt: string;
  remainingSeconds: number;
  totalCost: ResourceStock;
}

export interface ResearchQueueView {
  id: string;
  researchType: ResearchType;
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

export interface TroopView {
  type: TroopType;
  label: string;
  quantity: number;
  attack: number;
  defense: number;
  speed: number;
  carry: number;
  trainingCost: ResourceStock;
  trainingDurationSeconds: number;
}

export interface CommanderView {
  id: string;
  name: string;
  templateKey: string;
  level: number;
  attackBonusPct: number;
  defenseBonusPct: number;
  marchSpeedBonusPct: number;
  carryBonusPct: number;
  isPrimary: boolean;
}

export interface ResearchView {
  type: ResearchType;
  label: string;
  description: string;
  level: number;
  nextLevel: number;
  maxLevel: number;
  startCost: ResourceStock;
  durationSeconds: number;
  isActive: boolean;
}

export interface MarchView {
  id: string;
  state: MarchState;
  targetCityId: string;
  targetCityName: string;
  commanderId: string;
  commanderName: string;
  troops: TroopStock;
  startedAt: string;
  etaAt: string;
  remainingSeconds: number;
  distance: number;
  origin: {
    x: number;
    y: number;
  };
  target: {
    x: number;
    y: number;
  };
  projectedOutcome: BattleResult | null;
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
  activeTraining: TrainingQueueView | null;
  activeResearch: ResearchQueueView | null;
  troops: TroopView[];
  commanders: CommanderView[];
  research: ResearchView[];
  activeMarches: MarchView[];
  openMarchCount: number;
  visionRadius: number;
  attackPower: number;
  defensePower: number;
}

export interface GameStateResponse {
  player: AuthUser;
  city: CityState;
  alliance: AllianceSummaryView | null;
}

export interface AllianceMemberView {
  userId: string;
  username: string;
  cityName: string;
  role: AllianceRole;
  joinedAt: string;
}

export interface AllianceChatMessageView {
  id: string;
  userId: string;
  username: string;
  content: string;
  createdAt: string;
}

export interface AllianceHelpRequestView {
  id: string;
  requesterUserId: string;
  requesterName: string;
  kind: AllianceHelpKind;
  label: string;
  targetId: string;
  helpCount: number;
  maxHelps: number;
  isOpen: boolean;
  createdAt: string;
}

export interface AllianceView {
  id: string;
  name: string;
  tag: string;
  description: string | null;
  role: AllianceRole;
  memberCount: number;
  treasury: ResourceStock;
  members: AllianceMemberView[];
  chatMessages: AllianceChatMessageView[];
  helpRequests: AllianceHelpRequestView[];
}

export interface AllianceListItemView {
  id: string;
  name: string;
  tag: string;
  description: string | null;
  memberCount: number;
  joined: boolean;
}

export interface AllianceStateResponse {
  alliance: AllianceView | null;
  alliances: AllianceListItemView[];
}

export interface MapCity {
  cityId: string;
  cityName: string;
  ownerName: string;
  x: number;
  y: number;
  fogState: FogState;
  isCurrentPlayer: boolean;
  canSendMarch: boolean;
  distance: number | null;
  townHallLevel: number;
  attackPower: number;
  defensePower: number;
  projectedOutcome: BattleResult | null;
}

export interface FogTileView {
  x: number;
  y: number;
  state: FogState;
}

export interface WorldChunkResponse {
  size: number;
  center: {
    x: number;
    y: number;
  };
  radius: number;
  tiles: FogTileView[];
  cities: MapCity[];
  marches: MarchView[];
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
  attackerLosses: TroopStock;
  defenderLosses: TroopStock;
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

export interface MarchCommandResponse {
  march: MarchView;
}

export interface TrainTroopsResponse {
  city: CityState;
}

export interface StartResearchResponse {
  city: CityState;
}

export interface AllianceMutationResponse {
  alliance: AllianceView;
}

export interface SocketEnvelope {
  type: SocketEventType;
  payload: {
    cityId?: string;
    reportId?: string;
    marchId?: string;
    allianceId?: string;
    helpRequestId?: string;
  };
}
