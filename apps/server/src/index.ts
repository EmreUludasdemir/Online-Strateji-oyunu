// OpenTelemetry MUST be initialized before any other imports
import { initTelemetry, shutdownTelemetry } from "./lib/telemetry";
initTelemetry();

import "dotenv/config";
import http from "node:http";

import type WebSocket from "ws";
import { WebSocketServer } from "ws";

import { createApp } from "./app";
import { JWT_COOKIE_NAME, WORLD_RECONCILE_INTERVAL_MS } from "./game/constants";
import { reconcileWorld } from "./game/service";
import { verifySessionToken } from "./lib/auth";
import { env } from "./lib/env";
import { logger } from "./lib/logger";
import { initializeNotificationHub, notificationHub, shutdownNotificationHub } from "./lib/notifications";
import { prisma } from "./lib/prisma";
import { disconnectRedis } from "./lib/redis";
import { isWsRateLimited } from "./middleware/wsRateLimit";

const HEARTBEAT_INTERVAL_MS = 30_000;

interface ExtendedWebSocket extends WebSocket {
  isAlive: boolean;
  userId: string;
}

function parseCookieHeader(rawCookieHeader: string | undefined): Record<string, string> {
  if (!rawCookieHeader) {
    return {};
  }

  return rawCookieHeader.split(";").reduce<Record<string, string>>((cookies, chunk) => {
    const [name, ...valueParts] = chunk.trim().split("=");
    if (!name) {
      return cookies;
    }

    cookies[name] = decodeURIComponent(valueParts.join("="));
    return cookies;
  }, {});
}

async function startServer() {
  // Initialize notification hub (Redis if configured)
  await initializeNotificationHub();

  const app = createApp();
  const server = http.createServer(app);
  const webSocketServer = new WebSocketServer({
    server,
    path: "/ws",
    maxPayload: 64 * 1024, // 64KB max message size
  });

  webSocketServer.on("connection", (socket: WebSocket, request) => {
    // Rate limit WebSocket connections
    if (isWsRateLimited(request)) {
      logger.warn({ ip: request.socket.remoteAddress, channel: "ws" }, "WebSocket connection rate limited");
      socket.close(1008, "Rate limited");
      return;
    }

    const cookies = parseCookieHeader(request.headers.cookie);
    const token = cookies[JWT_COOKIE_NAME];
    const session = token ? verifySessionToken(token) : null;

    if (!session) {
      socket.close(1008, "Unauthorized");
      return;
    }

    const extSocket = socket as ExtendedWebSocket;
    extSocket.isAlive = true;
    extSocket.userId = session.userId;

    notificationHub.register(session.userId, socket);
    logger.debug({ userId: session.userId, channel: "ws" }, "WebSocket connected");

    socket.on("pong", () => {
      extSocket.isAlive = true;
    });

    socket.on("close", () => {
      notificationHub.unregister(session.userId, socket);
      logger.debug({ userId: session.userId, channel: "ws" }, "WebSocket disconnected");
    });

    socket.on("error", (error) => {
      logger.error({ error, userId: session.userId, channel: "ws" }, "WebSocket error");
    });
  });

  // Heartbeat to detect dead connections
  const heartbeatInterval = setInterval(() => {
    webSocketServer.clients.forEach((socket) => {
      const extSocket = socket as ExtendedWebSocket;
      if (!extSocket.isAlive) {
        logger.debug({ userId: extSocket.userId, channel: "ws" }, "Terminating dead WebSocket connection");
        return socket.terminate();
      }
      extSocket.isAlive = false;
      socket.ping();
    });
  }, HEARTBEAT_INTERVAL_MS);

  const reconcileTimer = setInterval(() => {
    void reconcileWorld().catch((error) => {
      logger.error({ error, channel: "reconcile" }, "World reconcile failed");
    });
  }, WORLD_RECONCILE_INTERVAL_MS);

  server.listen(env.PORT, () => {
    logger.info({ 
      port: env.PORT, 
      env: env.NODE_ENV,
      realtimeAdapter: env.REALTIME_ADAPTER,
      redisConfigured: Boolean(env.REDIS_URL),
    }, "Frontier Dominion server started");
  });

  // Graceful shutdown
  let isShuttingDown = false;

  async function gracefulShutdown(signal: string) {
    if (isShuttingDown) {
      return;
    }
    isShuttingDown = true;

    logger.info({ signal }, "Graceful shutdown initiated");

    // Stop accepting new connections
    server.close((error) => {
      if (error) {
        logger.error({ error }, "Error closing HTTP server");
      } else {
        logger.info("HTTP server closed");
      }
    });

    // Clear intervals
    clearInterval(reconcileTimer);
    clearInterval(heartbeatInterval);

    // Close all WebSocket connections
    webSocketServer.clients.forEach((socket) => {
      socket.close(1001, "Server shutting down");
    });

    // Close WebSocket server
    webSocketServer.close((error) => {
      if (error) {
        logger.error({ error }, "Error closing WebSocket server");
      } else {
        logger.info("WebSocket server closed");
      }
    });

    // Shutdown notification hub (Redis subscriptions)
    try {
      await shutdownNotificationHub();
      logger.info("Notification hub shut down");
    } catch (error) {
      logger.error({ error }, "Error shutting down notification hub");
    }

    // Disconnect Redis
    try {
      await disconnectRedis();
      logger.info("Redis disconnected");
    } catch (error) {
      logger.error({ error }, "Error disconnecting Redis");
    }

    // Disconnect database
    try {
      await prisma.$disconnect();
      logger.info("Database disconnected");
    } catch (error) {
      logger.error({ error }, "Error disconnecting database");
    }

    // Shutdown OpenTelemetry
    try {
      await shutdownTelemetry();
      logger.info("OpenTelemetry shut down");
    } catch (error) {
      logger.error({ error }, "Error shutting down OpenTelemetry");
    }

    logger.info("Graceful shutdown complete");
    process.exit(0);
  }

  // Force exit after timeout
  function forceExit() {
    logger.error("Graceful shutdown timeout, forcing exit");
    process.exit(1);
  }

  process.on("SIGTERM", () => {
    void gracefulShutdown("SIGTERM");
    setTimeout(forceExit, env.GRACEFUL_SHUTDOWN_TIMEOUT_MS);
  });

  process.on("SIGINT", () => {
    void gracefulShutdown("SIGINT");
    setTimeout(forceExit, env.GRACEFUL_SHUTDOWN_TIMEOUT_MS);
  });

  process.on("uncaughtException", (error) => {
    logger.fatal({ error }, "Uncaught exception");
    process.exit(1);
  });

  process.on("unhandledRejection", (reason) => {
    logger.error({ reason }, "Unhandled promise rejection");
  });
}

// Start the server
startServer().catch((error) => {
  logger.fatal({ error }, "Failed to start server");
  process.exit(1);
});
