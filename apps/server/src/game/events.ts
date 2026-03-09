import type { SocketEnvelope } from "@frontier/shared";

import { notificationHub } from "../lib/notifications";

export interface GameEventBus {
  notifyUsers(userIds: string[], envelope: SocketEnvelope): void;
  broadcast(envelope: SocketEnvelope): void;
}

class NotificationEventBus implements GameEventBus {
  notifyUsers(userIds: string[], envelope: SocketEnvelope): void {
    notificationHub.notifyUsers(userIds, envelope);
  }

  broadcast(envelope: SocketEnvelope): void {
    notificationHub.broadcast(envelope);
  }
}

export const gameEventBus: GameEventBus = new NotificationEventBus();

export function emitCityUpdated(userIds: string[], cityId: string): void {
  gameEventBus.notifyUsers(userIds, {
    type: "city.updated",
    payload: { cityId },
  });
}

export function emitMapUpdated(cityId: string): void {
  gameEventBus.broadcast({
    type: "map.updated",
    payload: { cityId },
  });
}

export function emitUpgradeCompleted(userId: string, cityId: string): void {
  gameEventBus.notifyUsers([userId], {
    type: "upgrade.completed",
    payload: { cityId },
  });
}

export function emitTrainingCompleted(userId: string, cityId: string): void {
  gameEventBus.notifyUsers([userId], {
    type: "training.completed",
    payload: { cityId },
  });
}

export function emitResearchCompleted(userId: string, cityId: string): void {
  gameEventBus.notifyUsers([userId], {
    type: "research.completed",
    payload: { cityId },
  });
}

export function emitMarchCreated(userIds: string[], cityId: string, marchId: string): void {
  gameEventBus.notifyUsers(userIds, {
    type: "march.created",
    payload: { cityId, marchId },
  });
}

export function emitMarchUpdated(userIds: string[], cityId: string, marchId: string): void {
  gameEventBus.notifyUsers(userIds, {
    type: "march.updated",
    payload: { cityId, marchId },
  });
}

export function emitBattleResolved(userIds: string[], cityId: string, marchId: string): void {
  gameEventBus.notifyUsers(userIds, {
    type: "battle.resolved",
    payload: { cityId, marchId },
  });
}

export function emitReportCreated(userIds: string[], reportId: string): void {
  gameEventBus.notifyUsers(userIds, {
    type: "report.created",
    payload: { reportId },
  });
}

export function emitFogUpdated(userId: string, cityId: string): void {
  gameEventBus.notifyUsers([userId], {
    type: "fog.updated",
    payload: { cityId },
  });
}

export function emitAllianceUpdated(userIds: string[], allianceId: string): void {
  gameEventBus.notifyUsers(userIds, {
    type: "alliance.updated",
    payload: { allianceId },
  });
}
