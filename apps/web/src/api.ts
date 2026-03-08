import type {
  AttackResponse,
  AuthResponse,
  BattleReportsResponse,
  GameStateResponse,
  OkResponse,
  WorldMapResponse,
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
  worldMap: () => apiRequest<WorldMapResponse>("/api/game/map"),
  attack: (targetCityId: string) =>
    apiRequest<AttackResponse>("/api/game/attacks", {
      method: "POST",
      body: JSON.stringify({ targetCityId }),
    }),
  reports: () => apiRequest<BattleReportsResponse>("/api/game/reports"),
};
