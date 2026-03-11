import { socketEnvelopeSchema, type SocketEnvelope } from "@frontier/shared";
import type WebSocket from "ws";

import { env } from "./env";
import { incrementCounter, setGauge } from "./metrics";

export interface NotificationAdapterDiagnostics {
  mode: "in_memory";
  requestedMode: "in_memory" | "redis";
  redisUrlConfigured: boolean;
}

export interface NotificationAdapter {
  register(userId: string, socket: WebSocket): void;
  unregister(userId: string, socket: WebSocket): void;
  notifyUsers(userIds: string[], envelope: SocketEnvelope): void;
  broadcast(envelope: SocketEnvelope): void;
  getDiagnostics(): NotificationAdapterDiagnostics;
}

class InMemoryNotificationAdapter implements NotificationAdapter {
  private readonly socketsByUserId = new Map<string, Set<WebSocket>>();
  private peakConnections = 0;

  constructor(private readonly requestedMode: "in_memory" | "redis") {
    this.syncConnectionMetrics();
  }

  register(userId: string, socket: WebSocket): void {
    const sockets = this.socketsByUserId.get(userId) ?? new Set<WebSocket>();
    sockets.add(socket);
    this.socketsByUserId.set(userId, sockets);
    this.syncConnectionMetrics();
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

    this.syncConnectionMetrics();
  }

  notifyUsers(userIds: string[], envelope: SocketEnvelope): void {
    incrementCounter("realtime_messages_total", {
      type: envelope.type,
      channel: "direct",
    });
    this.dispatch(userIds, envelope);
  }

  broadcast(envelope: SocketEnvelope): void {
    incrementCounter("realtime_messages_total", {
      type: envelope.type,
      channel: "broadcast",
    });
    this.dispatch([...this.socketsByUserId.keys()], envelope);
  }

  getDiagnostics(): NotificationAdapterDiagnostics {
    return {
      mode: "in_memory",
      requestedMode: this.requestedMode,
      redisUrlConfigured: Boolean(env.REDIS_URL),
    };
  }

  private syncConnectionMetrics(): void {
    const currentConnections = [...this.socketsByUserId.values()].reduce((sum, sockets) => sum + sockets.size, 0);
    this.peakConnections = Math.max(this.peakConnections, currentConnections);
    setGauge("realtime_connections_current", currentConnections);
    setGauge("realtime_connections_peak", this.peakConnections);
    setGauge("realtime_users_connected", this.socketsByUserId.size);
  }

  private dispatch(userIds: string[], envelope: SocketEnvelope): void {
    const payload = JSON.stringify(socketEnvelopeSchema.parse(envelope));
    let deliveries = 0;

    for (const userId of new Set(userIds)) {
      const sockets = this.socketsByUserId.get(userId);
      if (!sockets) {
        continue;
      }

      for (const socket of sockets) {
        if (socket.readyState === socket.OPEN) {
          socket.send(payload);
          deliveries += 1;
        }
      }
    }

    incrementCounter(
      "realtime_deliveries_total",
      {
        type: envelope.type,
      },
      deliveries,
    );
  }
}

function createNotificationAdapter(): NotificationAdapter {
  if (env.REALTIME_ADAPTER === "redis") {
    console.warn("REALTIME_ADAPTER=redis requested, but only the in-memory adapter is implemented. Falling back.");
  }

  return new InMemoryNotificationAdapter(env.REALTIME_ADAPTER);
}

export const notificationHub: NotificationAdapter = createNotificationAdapter();

export function getRealtimeAdapterDiagnostics(): NotificationAdapterDiagnostics {
  return notificationHub.getDiagnostics();
}
