import { socketEnvelopeSchema, type SocketEnvelope } from "@frontier/shared";
import type WebSocket from "ws";

export class NotificationHub {
  private readonly socketsByUserId = new Map<string, Set<WebSocket>>();

  register(userId: string, socket: WebSocket): void {
    const sockets = this.socketsByUserId.get(userId) ?? new Set<WebSocket>();
    sockets.add(socket);
    this.socketsByUserId.set(userId, sockets);
  }

  unregister(userId: string, socket: WebSocket): void {
    const sockets = this.socketsByUserId.get(userId);
    if (!sockets) {
      return;
    }

    sockets.delete(socket);

    if (sockets.size === 0) {
      this.socketsByUserId.delete(userId);
    }
  }

  notifyUsers(userIds: string[], envelope: SocketEnvelope): void {
    const payload = JSON.stringify(socketEnvelopeSchema.parse(envelope));

    for (const userId of new Set(userIds)) {
      const sockets = this.socketsByUserId.get(userId);
      if (!sockets) {
        continue;
      }

      for (const socket of sockets) {
        if (socket.readyState === socket.OPEN) {
          socket.send(payload);
        }
      }
    }
  }

  broadcast(envelope: SocketEnvelope): void {
    this.notifyUsers([...this.socketsByUserId.keys()], envelope);
  }
}

export const notificationHub = new NotificationHub();
