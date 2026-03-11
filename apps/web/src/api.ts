import type {
  AllianceMutationResponse,
  AllianceStateResponse,
  AnalyticsEventRequest,
  AuthResponse,
  BattleReportsResponse,
  GameStateResponse,
  MarchObjective,
  MarchCommandResponse,
  OkResponse,
  StartResearchResponse,
  TrainTroopsResponse,
  TroopStock,
  TroopType,
  WorldChunkResponse,
} from "@frontier/shared";

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

export async function apiRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);

  if (init?.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(path, {
    credentials: "include",
    ...init,
    headers,
  });

  return parseResponse<T>(response);
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
  recallMarch: (marchId: string) =>
    apiRequest<{ city: GameStateResponse["city"] }>(`/api/game/marches/${marchId}/recall`, {
      method: "POST",
    }),
  attack: (targetCityId: string) =>
    apiRequest<MarchCommandResponse>("/api/game/attacks", {
      method: "POST",
      body: JSON.stringify({ targetCityId }),
    }),
  reports: () => apiRequest<BattleReportsResponse>("/api/game/reports"),
  allianceState: () => apiRequest<AllianceStateResponse>("/api/game/alliance"),
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
  donateAllianceResources: (body: { wood: number; stone: number; food: number; gold: number }) =>
    apiRequest<AllianceMutationResponse>("/api/game/alliance/donate", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  updateAllianceRole: (userId: string, role: "LEADER" | "OFFICER" | "MEMBER") =>
    apiRequest<AllianceMutationResponse>(`/api/game/alliances/members/${userId}/role`, {
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
};
