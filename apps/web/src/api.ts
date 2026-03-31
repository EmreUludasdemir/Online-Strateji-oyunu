import type {
  AllianceMutationResponse,
  AllianceStateResponse,
  AnalyticsEventRequest,
  AuthResponse,
  BattleReportsResponse,
  CommanderProgressView,
  EntitlementsResponse,
  GameEventsResponse,
  GameStateResponse,
  InventoryResponse,
  ItemUseRequest,
  LeaderboardResponse,
  MailboxResponse,
  MarchObjective,
  MarchCommandResponse,
  OkResponse,
  PublicBootstrapResponse,
  PurchaseVerifyRequest,
  PurchaseVerifyResponse,
  RallyMutationResponse,
  RalliesResponse,
  ScoutMutationResponse,
  StartResearchResponse,
  StoreCatalogResponse,
  TasksResponse,
  TrainTroopsResponse,
  TroopStock,
  TroopType,
  WorldChunkResponse,
} from "@frontier/shared";

const DEFAULT_TIMEOUT_MS = 30_000;

export class ApiClientError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details: string[];

  constructor(status: number, code: string, message: string, details: string[] = []) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export class ApiTimeoutError extends Error {
  constructor(message = "Request timed out") {
    super(message);
    this.name = "ApiTimeoutError";
  }
}

async function parseResponse<T>(response: Response): Promise<T> {
  const payload = (await response.json()) as T | { error?: { code?: string; message?: string; details?: string[] } };

  if (!response.ok) {
    const error = (payload as { error?: { code?: string; message?: string; details?: string[] } }).error;
    throw new ApiClientError(
      response.status,
      error?.code ?? "REQUEST_FAILED",
      error?.message ?? "The request failed.",
      error?.details ?? [],
    );
  }

  return payload as T;
}

interface ApiRequestOptions extends RequestInit {
  timeout?: number;
}

export async function apiRequest<T>(path: string, init?: ApiRequestOptions): Promise<T> {
  const { timeout = DEFAULT_TIMEOUT_MS, ...fetchInit } = init ?? {};
  const headers = new Headers(fetchInit?.headers);

  if (fetchInit?.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(path, {
      credentials: "include",
      ...fetchInit,
      headers,
      signal: controller.signal,
    });

    return await parseResponse<T>(response);
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new ApiTimeoutError(`Request to ${path} timed out after ${timeout}ms`);
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

export type CreateMarchPayload =
  | {
      objective?: "CITY_ATTACK";
      targetCityId: string;
      commanderId: string;
      troops: TroopStock;
    }
  | {
      objective: Extract<MarchObjective, "BARBARIAN_ATTACK" | "RESOURCE_GATHER">;
      targetPoiId: string;
      commanderId: string;
      troops: TroopStock;
    };

export const api = {
  publicBootstrap: () => apiRequest<PublicBootstrapResponse>("/api/public/bootstrap"),
  session: () => apiRequest<AuthResponse>("/api/auth/me"),
  login: (body: { username: string; password: string }) =>
    apiRequest<AuthResponse>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  register: (body: { username: string; password: string }) =>
    apiRequest<AuthResponse>("/api/auth/register", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  logout: () =>
    apiRequest<OkResponse>("/api/auth/logout", {
      method: "POST",
    }),
  gameState: () => apiRequest<GameStateResponse>("/api/game/state"),
  commanders: () => apiRequest<{ commanders: CommanderProgressView[] }>("/api/game/commanders"),
  startUpgrade: (buildingType: string) =>
    apiRequest<GameStateResponse>(`/api/game/buildings/${buildingType}/upgrade`, {
      method: "POST",
    }),
  worldChunk: (query?: { centerX?: number; centerY?: number; radius?: number }) => {
    const params = new URLSearchParams();
    if (query?.centerX != null) params.set("centerX", String(query.centerX));
    if (query?.centerY != null) params.set("centerY", String(query.centerY));
    if (query?.radius != null) params.set("radius", String(query.radius));
    const suffix = params.size > 0 ? `?${params.toString()}` : "";
    return apiRequest<WorldChunkResponse>(`/api/game/world/chunk${suffix}`);
  },
  trainTroops: (body: { troopType: TroopType; quantity: number }) =>
    apiRequest<TrainTroopsResponse>("/api/game/troops/train", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  startResearch: (body: { researchType: string }) =>
    apiRequest<StartResearchResponse>("/api/game/research/start", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  createMarch: (body: CreateMarchPayload) =>
    apiRequest<MarchCommandResponse>("/api/game/marches", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  retargetMarch: (marchId: string, body: { targetCityId?: string; targetPoiId?: string }) =>
    apiRequest<MarchCommandResponse>(`/api/game/marches/${marchId}/retarget`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
  recallMarch: (marchId: string) =>
    apiRequest<{ city: GameStateResponse["city"] }>(`/api/game/marches/${marchId}/recall`, {
      method: "POST",
    }),
  createScout: (body: { targetCityId?: string; targetPoiId?: string }) =>
    apiRequest<ScoutMutationResponse>("/api/game/scouts", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  rallies: () => apiRequest<RalliesResponse>("/api/game/rallies"),
  createRally: (body: { objective?: "CITY_ATTACK"; targetCityId?: string; targetPoiId?: string; commanderId: string; troops: TroopStock }) =>
    apiRequest<RallyMutationResponse>("/api/game/rallies", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  joinRally: (rallyId: string, troops: TroopStock) =>
    apiRequest<RallyMutationResponse>(`/api/game/rallies/${rallyId}/join`, {
      method: "POST",
      body: JSON.stringify({ troops }),
    }),
  launchRally: (rallyId: string) =>
    apiRequest<RallyMutationResponse>(`/api/game/rallies/${rallyId}/launch`, {
      method: "POST",
    }),
  attack: (targetCityId: string) =>
    apiRequest<MarchCommandResponse>("/api/game/attacks", {
      method: "POST",
      body: JSON.stringify({ targetCityId }),
    }),
  reports: () => apiRequest<BattleReportsResponse>("/api/game/reports"),
  tasks: () => apiRequest<TasksResponse>("/api/game/tasks"),
  claimTask: (taskId: string) =>
    apiRequest<OkResponse>(`/api/game/tasks/${taskId}/claim`, {
      method: "POST",
      body: JSON.stringify({ taskId }),
    }),
  inventory: () => apiRequest<InventoryResponse>("/api/game/inventory"),
  useInventoryItem: (body: ItemUseRequest) =>
    apiRequest<OkResponse>("/api/game/inventory/use", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  upgradeCommander: (commanderId: string) =>
    apiRequest<{ commanders: GameStateResponse["city"]["commanders"] }>(`/api/game/commanders/${commanderId}/upgrade`, {
      method: "POST",
      body: JSON.stringify({}),
    }),
  mailbox: () => apiRequest<MailboxResponse>("/api/game/mailbox"),
  claimMailbox: (mailboxId: string) =>
    apiRequest<OkResponse>(`/api/game/mailbox/${mailboxId}/claim`, {
      method: "POST",
      body: JSON.stringify({ mailboxId }),
    }),
  events: () => apiRequest<GameEventsResponse>("/api/game/events"),
  leaderboard: (leaderboardId: string) => apiRequest<LeaderboardResponse>(`/api/game/leaderboards/${leaderboardId}`),
  allianceState: () => apiRequest<AllianceStateResponse>("/api/alliance"),
  createAlliance: (body: { name: string; tag: string; description?: string }) =>
    apiRequest<AllianceMutationResponse>("/api/game/alliances", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  joinAlliance: (allianceId: string) =>
    apiRequest<AllianceMutationResponse>(`/api/game/alliances/${allianceId}/join`, {
      method: "POST",
    }),
  leaveAlliance: () =>
    apiRequest<OkResponse>("/api/game/alliances/leave", {
      method: "POST",
    }),
  sendAllianceChat: (content: string) =>
    apiRequest<AllianceMutationResponse>("/api/game/alliance/chat", {
      method: "POST",
      body: JSON.stringify({ content }),
    }),
  updateAllianceAnnouncement: (content: string) =>
    apiRequest<AllianceMutationResponse>("/api/game/alliance/announcement", {
      method: "POST",
      body: JSON.stringify({ content }),
    }),
  createAllianceMarker: (body: { label: string; x: number; y: number }) =>
    apiRequest<AllianceMutationResponse>("/api/game/alliance/markers", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  deleteAllianceMarker: (markerId: string) =>
    apiRequest<AllianceMutationResponse>(`/api/game/alliance/markers/${markerId}`, {
      method: "DELETE",
    }),
  donateAllianceResources: (body: { wood: number; stone: number; food: number; gold: number }) =>
    apiRequest<AllianceMutationResponse>("/api/alliance/donations", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  updateAllianceRole: (userId: string, role: "LEADER" | "OFFICER" | "MEMBER" | "RECRUIT") =>
    apiRequest<AllianceMutationResponse>(`/api/alliance/members/${userId}/role`, {
      method: "POST",
      body: JSON.stringify({ role }),
    }),
  requestAllianceHelp: (kind: "BUILDING_UPGRADE" | "TRAINING" | "RESEARCH") =>
    apiRequest<AllianceMutationResponse>("/api/game/alliance-help", {
      method: "POST",
      body: JSON.stringify({ kind }),
    }),
  respondAllianceHelp: (helpRequestId: string) =>
    apiRequest<AllianceMutationResponse>(`/api/game/alliance-help/${helpRequestId}/respond`, {
      method: "POST",
    }),
  trackAnalytics: (body: AnalyticsEventRequest) =>
    apiRequest<OkResponse>("/api/game/analytics", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  storeCatalog: () => apiRequest<StoreCatalogResponse>("/api/store/catalog"),
  storeOffers: () => apiRequest<{ offers: StoreCatalogResponse["catalog"]["offers"] }>("/api/store/offers"),
  entitlements: () => apiRequest<EntitlementsResponse>("/api/store/entitlements"),
  verifyPurchase: (body: PurchaseVerifyRequest) =>
    apiRequest<PurchaseVerifyResponse>("/api/store/verify", {
      method: "POST",
      body: JSON.stringify(body),
    }),
};
