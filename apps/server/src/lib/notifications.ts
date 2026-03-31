import { socketEnvelopeSchema, type SocketEnvelope } from "@frontier/shared";
import type WebSocket from "ws";

import { env } from "./env";
import { logger } from "./logger";
import { incrementCounter, setGauge } from "./metrics";
import { getRedisClient, getRedisSubscriber, isRedisConfigured } from "./redis";

const REDIS_CHANNEL_PREFIX = "frontier:notify:";
const REDIS_BROADCAST_CHANNEL = "frontier:broadcast";

export interface NotificationAdapterDiagnostics {
  mode: "in_memory" | "redis";
  requestedMode: "in_memory" | "redis";
  redisUrlConfigured: boolean;
  redisConnected?: boolean;
}

export interface NotificationAdapter {
  register(userId: string, socket: WebSocket): void;
  unregister(userId: string, socket: WebSocket): void;
  notifyUsers(userIds: string[], envelope: SocketEnvelope): void;
  broadcast(envelope: SocketEnvelope): void;
  getDiagnostics(): NotificationAdapterDiagnostics;
  initialize?(): Promise<void>;
  shutdown?(): Promise<void>;
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
      redisUrlConfigured: isRedisConfigured(),
    };
  }

  private syncConnectionMetrics(): void {
    const currentConnections = [...this.socketsByUserId.values()].reduce((sum, sockets) => sum + sockets.size, 0);
    this.peakConnections = Math.max(this.peakConnections, currentConnections);
    setGauge("realtime_connections_current", currentConnections);
    setGauge("realtime_connections_peak", this.peakConnections);
    setGauge("realtime_users_connected", this.socketsByUserId.size);
  }

  protected dispatch(userIds: string[], envelope: SocketEnvelope): void {
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

interface RedisMessage {
  userIds?: string[];
  envelope: SocketEnvelope;
  broadcast?: boolean;
}

class RedisNotificationAdapter extends InMemoryNotificationAdapter {
  private subscribedChannels = new Set<string>();
  private isInitialized = false;

  constructor() {
    super("redis");
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    const subscriber = getRedisSubscriber();
    if (!subscriber) {
      logger.warn("Redis subscriber not available, falling back to in-memory only");
      return;
    }

    // Subscribe to broadcast channel
    await subscriber.subscribe(REDIS_BROADCAST_CHANNEL);
    this.subscribedChannels.add(REDIS_BROADCAST_CHANNEL);
    logger.info({ channel: REDIS_BROADCAST_CHANNEL }, "Subscribed to Redis broadcast channel");

    // Handle incoming messages
    subscriber.on("message", (channel, message) => {
      this.handleRedisMessage(channel, message);
    });

    this.isInitialized = true;
    logger.info("Redis notification adapter initialized");
  }

  async shutdown(): Promise<void> {
    const subscriber = getRedisSubscriber();
    if (subscriber && this.subscribedChannels.size > 0) {
      for (const channel of this.subscribedChannels) {
        await subscriber.unsubscribe(channel);
      }
      this.subscribedChannels.clear();
      logger.info("Redis notification adapter shut down");
    }
  }

  override register(userId: string, socket: WebSocket): void {
    super.register(userId, socket);
    
    // Subscribe to user-specific channel
    const channel = `${REDIS_CHANNEL_PREFIX}${userId}`;
    if (!this.subscribedChannels.has(channel)) {
      const subscriber = getRedisSubscriber();
      if (subscriber) {
        subscriber.subscribe(channel).then(() => {
          this.subscribedChannels.add(channel);
          logger.debug({ userId, channel }, "Subscribed to user channel");
        }).catch((error) => {
          logger.error({ error, userId, channel }, "Failed to subscribe to user channel");
        });
      }
    }
  }

  override unregister(userId: string, socket: WebSocket): void {
    super.unregister(userId, socket);
    
    // Note: We don't unsubscribe immediately as other sockets might still be connected
    // In production, you'd want to check if this was the last socket for this user
  }

  override notifyUsers(userIds: string[], envelope: SocketEnvelope): void {
    incrementCounter("realtime_messages_total", {
      type: envelope.type,
      channel: "direct",
    });

    // Publish to Redis for other instances
    const publisher = getRedisClient();
    if (publisher) {
      const message: RedisMessage = { userIds, envelope };
      
      for (const userId of new Set(userIds)) {
        const channel = `${REDIS_CHANNEL_PREFIX}${userId}`;
        publisher.publish(channel, JSON.stringify(message)).catch((error) => {
          logger.error({ error, userId }, "Failed to publish to Redis");
        });
      }
    }

    // Also dispatch locally
    this.dispatch(userIds, envelope);
  }

  override broadcast(envelope: SocketEnvelope): void {
    incrementCounter("realtime_messages_total", {
      type: envelope.type,
      channel: "broadcast",
    });

    // Publish to Redis broadcast channel
    const publisher = getRedisClient();
    if (publisher) {
      const message: RedisMessage = { envelope, broadcast: true };
      publisher.publish(REDIS_BROADCAST_CHANNEL, JSON.stringify(message)).catch((error) => {
        logger.error({ error }, "Failed to publish broadcast to Redis");
      });
    }

    // Also dispatch locally to all connected users
    this.dispatchBroadcastLocally(envelope);
  }

  override getDiagnostics(): NotificationAdapterDiagnostics {
    const client = getRedisClient();
    return {
      mode: "redis",
      requestedMode: "redis",
      redisUrlConfigured: isRedisConfigured(),
      redisConnected: client?.status === "ready",
    };
  }

  private handleRedisMessage(channel: string, message: string): void {
    try {
      const parsed = JSON.parse(message) as RedisMessage;
      
      if (channel === REDIS_BROADCAST_CHANNEL) {
        // Broadcast to all local users
        this.dispatchBroadcastLocally(parsed.envelope);
      } else if (channel.startsWith(REDIS_CHANNEL_PREFIX)) {
        // Direct message to specific users
        const userId = channel.slice(REDIS_CHANNEL_PREFIX.length);
        this.dispatch([userId], parsed.envelope);
      }
      
      incrementCounter("realtime_redis_messages_received", { channel: channel === REDIS_BROADCAST_CHANNEL ? "broadcast" : "direct" });
    } catch (error) {
      logger.error({ error, channel, message }, "Failed to parse Redis message");
    }
  }

  private dispatchBroadcastLocally(envelope: SocketEnvelope): void {
    // Get all local user IDs and dispatch
    const localUserIds = this.getLocalUserIds();
    if (localUserIds.length > 0) {
      this.dispatch(localUserIds, envelope);
    }
  }

  private getLocalUserIds(): string[] {
    // Access parent class's socketsByUserId through a getter
    return Array.from((this as any).socketsByUserId?.keys() ?? []);
  }
}

function createNotificationAdapter(): NotificationAdapter {
  if (env.REALTIME_ADAPTER === "redis" && isRedisConfigured()) {
    logger.info("Using Redis notification adapter for multi-instance support");
    return new RedisNotificationAdapter();
  }

  if (env.REALTIME_ADAPTER === "redis" && !isRedisConfigured()) {
    logger.warn("REALTIME_ADAPTER=redis requested but REDIS_URL not configured. Falling back to in-memory.");
  }

  return new InMemoryNotificationAdapter(env.REALTIME_ADAPTER);
}

export const notificationHub: NotificationAdapter = createNotificationAdapter();

export function getRealtimeAdapterDiagnostics(): NotificationAdapterDiagnostics {
  return notificationHub.getDiagnostics();
}

export async function initializeNotificationHub(): Promise<void> {
  if (notificationHub.initialize) {
    await notificationHub.initialize();
  }
}

export async function shutdownNotificationHub(): Promise<void> {
  if (notificationHub.shutdown) {
    await notificationHub.shutdown();
  }
}
