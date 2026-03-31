import type {
  AllianceHelpKind,
  AllianceRole,
  AnalyticsEventType,
  BattleResult,
  BuildingType,
  CommanderTalentTrack,
  FogState,
  ItemKey,
  ItemTargetKind,
  LiveEventKey,
  MailboxKind,
  MarchObjective,
  MarchState,
  PoiKind,
  PoiResourceType,
  PoiState,
  PurchaseStatus,
  RallyState,
  ReportEntryKind,
  ResearchType,
  ResourceKey,
  ScoutState,
  ScoutTargetKind,
  SocketEventType,
  TaskKind,
  TroopType,
} from "./game";

export type ResourceStock = Record<ResourceKey, number>;
export type TroopStock = Record<TroopType, number>;
export type ResourceGrant = Partial<ResourceStock>;
export type AnalyticsMetadataValue = string | number | boolean | null;
export type AnalyticsMetadata = Record<string, AnalyticsMetadataValue>;

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

export type LaunchPhase = "closed_alpha" | "public";
export type RegistrationMode = "open" | "login_only";

export interface PublicBootstrapResponse {
  launchPhase: LaunchPhase;
  registrationMode: RegistrationMode;
  storeEnabled: boolean;
}

export interface OkResponse {
  ok: true;
}

export interface AnalyticsEventRequest {
  event: AnalyticsEventType;
  metadata?: AnalyticsMetadata;
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
  xp: number;
  xpToNextLevel: number;
  starLevel: number;
  talentTrack: CommanderTalentTrack;
  talentPointsSpent: number;
  assignedSkills: string[];
  assignedPreset: string | null;
  attackBonusPct: number;
  defenseBonusPct: number;
  marchSpeedBonusPct: number;
  carryBonusPct: number;
  isPrimary: boolean;
}

export interface CommanderSkillNodeView {
  id: string;
  label: string;
  description: string;
  tier: number;
  lane: number;
  icon: string;
  unlocked: boolean;
  active: boolean;
  requiredPoints: number;
  bonusLabel: string;
}

export interface CommanderSkillLinkView {
  from: string;
  to: string;
}

export interface CommanderSkillTreeView {
  track: CommanderTalentTrack;
  trackLabel: string;
  availablePoints: number;
  nodes: CommanderSkillNodeView[];
  links: CommanderSkillLinkView[];
}

export interface CommanderProgressView extends CommanderView {
  totalPowerScore: number;
  xpForCurrentLevel: number;
  xpForNextLevel: number;
  talentPointsAvailable: number;
  skillTree: CommanderSkillTreeView;
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

export interface CargoView {
  resourceType: PoiResourceType | null;
  amount: number;
}

export interface MarchView {
  id: string;
  objective: MarchObjective;
  state: MarchState;
  battleWindowId: string | null;
  battleWindowClosesAt: string | null;
  ownerUserId: string;
  ownerName: string;
  ownerAllianceTag: string | null;
  targetCityId: string | null;
  targetCityName: string | null;
  targetPoiId: string | null;
  targetPoiName: string | null;
  commanderId: string;
  commanderName: string;
  troops: TroopStock;
  cargo: CargoView;
  startedAt: string;
  etaAt: string;
  gatherStartedAt: string | null;
  returnEtaAt: string | null;
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

export interface BattleWindowParticipantView {
  marchId: string;
  ownerUserId: string;
  ownerName: string;
  ownerAllianceTag: string | null;
  commanderName: string;
  troops: TroopStock;
  objective: MarchObjective;
  etaAt: string;
}

export interface BattleWindowView {
  id: string;
  objective: MarchObjective;
  targetKind: "CITY" | "POI";
  targetCityId: string | null;
  targetPoiId: string | null;
  label: string;
  attackerLabel: string;
  defenderLabel: string;
  closesAt: string;
  remainingSeconds: number;
  participantCount: number;
  participants: BattleWindowParticipantView[];
}

export interface PoiView {
  id: string;
  kind: PoiKind;
  state: PoiState;
  label: string;
  level: number;
  x: number;
  y: number;
  fogState: FogState;
  distance: number | null;
  resourceType: PoiResourceType | null;
  remainingAmount: number | null;
  maxAmount: number | null;
  respawnsAt: string | null;
  occupantMarchId: string | null;
  canSendMarch: boolean;
  canGather: boolean;
  battleWindowClosesAt: string | null;
  stagedMarchCount: number;
  battleWindow: BattleWindowView | null;
  projectedOutcome: BattleResult | null;
  projectedLoad: number | null;
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
  peaceShieldUntil: string | null;
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
  announcement: string | null;
  members: AllianceMemberView[];
  chatMessages: AllianceChatMessageView[];
  helpRequests: AllianceHelpRequestView[];
  markers: AllianceMarkerView[];
  logs: AllianceLogEntryView[];
  contributions: AllianceContributionView[];
  donations: AllianceDonationView[];
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

export interface AllianceMarkerView {
  id: string;
  label: string;
  x: number;
  y: number;
  createdAt: string;
  expiresAt: string | null;
  createdByUserId: string;
  canDelete: boolean;
}

export interface AllianceLogEntryView {
  id: string;
  kind: string;
  body: string;
  createdAt: string;
}

export interface AllianceContributionView {
  userId: string;
  username: string;
  points: number;
}

export interface AllianceDonationView {
  id: string;
  userId: string;
  username: string;
  resources: ResourceStock;
  totalValue: number;
  createdAt: string;
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
  battleWindowClosesAt: string | null;
  stagedMarchCount: number;
  battleWindow: BattleWindowView | null;
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
  pois: PoiView[];
  marches: MarchView[];
}

export interface CityBattleReportView {
  id: string;
  kind: Extract<ReportEntryKind, "CITY_BATTLE">;
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

export interface BarbarianBattleReportView {
  id: string;
  kind: Extract<ReportEntryKind, "BARBARIAN_BATTLE">;
  createdAt: string;
  attackerName: string;
  attackerCityName: string;
  poiName: string;
  poiLevel: number;
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

export interface ResourceGatherReportView {
  id: string;
  kind: Extract<ReportEntryKind, "RESOURCE_GATHER">;
  createdAt: string;
  ownerName: string;
  cityName: string;
  poiName: string;
  resourceType: PoiResourceType;
  amount: number;
  troops: TroopStock;
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

export type ReportEntryView =
  | CityBattleReportView
  | BarbarianBattleReportView
  | ResourceGatherReportView;

export interface BattleReportsResponse {
  reports: ReportEntryView[];
}

export interface RewardBundleView {
  resources: ResourceGrant;
  items: Array<{
    itemKey: ItemKey;
    quantity: number;
  }>;
  commanderXp: number;
  seasonPassXp: number;
}

export interface TaskView {
  id: string;
  taskKey: string;
  kind: TaskKind;
  title: string;
  description: string;
  progress: number;
  target: number;
  isCompleted: boolean;
  isClaimed: boolean;
  reward: RewardBundleView;
  completedAt: string | null;
  claimedAt: string | null;
}

export interface TasksResponse {
  tutorial: TaskView[];
  daily: TaskView[];
  tutorialCompleted: boolean;
  dailyKey: string;
}

export interface InventoryItemView {
  itemKey: ItemKey;
  label: string;
  description: string;
  quantity: number;
}

export interface InventoryResponse {
  items: InventoryItemView[];
}

export interface ItemUseRequest {
  itemKey: ItemKey;
  targetKind?: ItemTargetKind;
  targetId?: string;
}

export interface ScoutReportView {
  id: string;
  targetKind: ScoutTargetKind;
  createdAt: string;
  title: string;
  summary: string;
  cityIntel:
    | {
        cityId: string;
        cityName: string;
        ownerName: string;
        resources: ResourceStock;
        troops: TroopStock;
        defensePower: number;
        peaceShieldUntil: string | null;
      }
    | null;
  poiIntel:
    | {
        poiId: string;
        poiName: string;
        poiKind: PoiKind;
        state: PoiState;
        level: number;
        resourceType: PoiResourceType | null;
        remainingAmount: number | null;
      }
    | null;
}

export interface ScoutMissionView {
  id: string;
  state: ScoutState;
  targetKind: ScoutTargetKind;
  targetCityId: string | null;
  targetPoiId: string | null;
  etaAt: string;
  remainingSeconds: number;
}

export interface RallyMemberView {
  userId: string;
  username: string;
  pledgedTroops: TroopStock;
  joinedAt: string;
}

export interface RallyView {
  id: string;
  state: RallyState;
  objective: MarchObjective;
  targetCityId: string | null;
  targetCityName: string | null;
  targetPoiId: string | null;
  targetPoiName: string | null;
  leaderUserId: string;
  leaderName: string;
  leaderCommanderId: string;
  leaderCommanderName: string;
  supportBonusPct: number;
  launchAt: string;
  remainingSeconds: number;
  launchedMarchId: string | null;
  members: RallyMemberView[];
}

export interface MailboxEntryView {
  id: string;
  kind: MailboxKind;
  title: string;
  body: string;
  createdAt: string;
  claimedAt: string | null;
  canClaim: boolean;
  reward: RewardBundleView | null;
  scoutReport: ScoutReportView | null;
}

export interface MailboxResponse {
  entries: MailboxEntryView[];
  unreadCount: number;
}

export interface StoreProductView {
  productId: string;
  label: string;
  description: string;
  priceLabel: string;
  reward: RewardBundleView;
}

export interface StoreOfferView {
  offerId: string;
  title: string;
  description: string;
  productIds: string[];
  segmentTags: string[];
}

export interface StoreCatalogView {
  products: StoreProductView[];
  offers: StoreOfferView[];
}

export interface StoreCatalogResponse {
  catalog: StoreCatalogView;
}

export interface EntitlementView {
  id: string;
  entitlementKey: string;
  productId: string;
  status: string;
  grantedAt: string;
}

export interface EntitlementsResponse {
  entitlements: EntitlementView[];
}

export interface PurchaseVerifyRequest {
  platform: "APPLE_APP_STORE" | "GOOGLE_PLAY";
  productId: string;
  purchaseToken: string;
}

export interface PurchaseVerifyResponse {
  status: PurchaseStatus;
  entitlements: EntitlementView[];
}

export interface SeasonPassTierView {
  tier: number;
  requiredXp: number;
  freeReward: RewardBundleView;
  premiumReward: RewardBundleView | null;
  claimedFree: boolean;
  claimedPremium: boolean;
}

export interface SeasonPassView {
  seasonKey: string;
  label: string;
  xp: number;
  premiumUnlocked: boolean;
  tiers: SeasonPassTierView[];
}

export interface LiveEventView {
  eventKey: LiveEventKey;
  label: string;
  description: string;
  score: number;
  target: number;
  reward: RewardBundleView;
}

export interface GameEventsResponse {
  events: LiveEventView[];
  seasonPass: SeasonPassView;
}

export interface LeaderboardEntryView {
  rank: number;
  userId: string;
  username: string;
  value: number;
  secondaryLabel: string | null;
}

export interface LeaderboardResponse {
  leaderboardId: string;
  entries: LeaderboardEntryView[];
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

export interface ScoutMutationResponse {
  scout: ScoutMissionView;
}

export interface RallyMutationResponse {
  rally: RallyView;
}

export interface RalliesResponse {
  rallies: RallyView[];
}

export interface SocketEnvelope {
  type: SocketEventType;
  payload: {
    cityId?: string;
    reportId?: string;
    marchId?: string;
    scoutId?: string;
    rallyId?: string;
    mailboxId?: string;
    poiId?: string;
    allianceId?: string;
    helpRequestId?: string;
  };
}
