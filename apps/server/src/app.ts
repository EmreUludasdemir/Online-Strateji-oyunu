import crypto from "node:crypto";
import cookieParser from "cookie-parser";
import cors from "cors";
import express, { type NextFunction, type Request, type Response } from "express";
import promClient from "prom-client";

import { env } from "./lib/env";
import { HttpError, toApiError } from "./lib/http";
import { logger } from "./lib/logger";
import { incrementCounter, observeDuration, snapshotMetrics } from "./lib/metrics";
import { getRealtimeAdapterDiagnostics } from "./lib/notifications";
import { prisma } from "./lib/prisma";
import { isRedisConfigured, pingRedis } from "./lib/redis";
import { storeValidationPort } from "./lib/storeValidation";
import { requestIdMiddleware } from "./middleware/requestId";
import { allianceRouter } from "./routes/alliance";
import { authRouter } from "./routes/auth";
import { gameRouter } from "./routes/game";
import { publicRouter } from "./routes/public";
import { storeRouter } from "./routes/store";

// Initialize Prometheus metrics
const prometheusRegister = new promClient.Registry();
promClient.collectDefaultMetrics({ register: prometheusRegister });

const httpRequestsTotal = new promClient.Counter({
  name: "http_requests_total",
  help: "Total number of HTTP requests",
  labelNames: ["method", "path", "status_class"],
  registers: [prometheusRegister],
});

const httpRequestDuration = new promClient.Histogram({
  name: "http_request_duration_seconds",
  help: "HTTP request duration in seconds",
  labelNames: ["method", "path"],
  buckets: [0.01, 0.05, 0.1, 0.5, 1, 2, 5],
  registers: [prometheusRegister],
});

function getStatusClass(statusCode: number): string {
  return String(Math.floor(statusCode / 100)) + "xx";
}

function timingSafeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }
  return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

function canAccessOps(request: Request): boolean {
  if (env.OPS_METRICS_TOKEN) {
    const token = request.header("x-ops-token");
    return token ? timingSafeCompare(token, env.OPS_METRICS_TOKEN) : false;
  }

  return ["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(request.ip ?? "");
}

function requestLogger(request: Request, response: Response, next: NextFunction) {
  const startedAt = Date.now();
  response.on("finish", () => {
    const durationMs = Date.now() - startedAt;
    const durationSec = durationMs / 1000;
    const statusClass = getStatusClass(response.statusCode);
    const tags = {
      method: request.method,
      path: request.path,
      statusClass,
    };

    incrementCounter("http_requests_total", tags);
    observeDuration("http_request_duration_ms", durationMs, tags);
    
    httpRequestsTotal.inc({ method: request.method, path: request.path, status_class: statusClass });
    httpRequestDuration.observe({ method: request.method, path: request.path }, durationSec);
    
    logger.info({
      channel: "http",
      requestId: request.requestId,
      method: request.method,
      path: request.path,
      status: response.statusCode,
      durationMs,
      ip: request.ip,
    });
  });
  next();
}

function getAllowedOrigins(): string[] {
  if (env.ALLOWED_ORIGINS) {
    return env.ALLOWED_ORIGINS.split(",").map((origin) => origin.trim());
  }
  
  if (env.NODE_ENV === "production") {
    return [];
  }
  
  return ["http://localhost:5173", "http://localhost:3000", "http://127.0.0.1:5173"];
}

export function createApp() {
  const app = express();

  // Trust proxy for production (behind reverse proxy like Caddy/Nginx)
  if (env.TRUST_PROXY || env.NODE_ENV === "production") {
    app.set("trust proxy", 1);
  }

  // Request ID for tracing
  app.use(requestIdMiddleware);

  // CORS configuration
  const allowedOrigins = getAllowedOrigins();
  app.use(cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (mobile apps, curl, etc.)
      if (!origin) {
        callback(null, true);
        return;
      }
      
      if (allowedOrigins.length === 0 || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        logger.warn({ origin, channel: "cors" }, "CORS rejected origin");
        callback(new Error("CORS not allowed"));
      }
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "x-request-id"],
    exposedHeaders: ["x-request-id"],
  }));

  app.use(requestLogger);
  app.use(express.json({ limit: "100kb" }));
  app.use(cookieParser());

  // Liveness probe - just check if process is running
  app.get("/api/health/live", (_request, response) => {
    response.json({ status: "alive", timestamp: new Date().toISOString() });
  });

  // Readiness probe - check database and Redis connectivity
  app.get("/api/health/ready", async (_request, response) => {
    const checks: { database: boolean; redis?: boolean } = { database: false };
    
    try {
      await prisma.$queryRaw`SELECT 1`;
      checks.database = true;
    } catch (error) {
      logger.error({ error, channel: "health" }, "Database readiness check failed");
    }

    // Check Redis if configured
    if (isRedisConfigured()) {
      checks.redis = await pingRedis();
      if (!checks.redis) {
        logger.error({ channel: "health" }, "Redis readiness check failed");
      }
    }

    const isReady = checks.database && (checks.redis !== false);
    
    if (isReady) {
      response.json({ 
        status: "ready", 
        timestamp: new Date().toISOString(),
        checks,
      });
    } else {
      response.status(503).json({ 
        status: "not_ready", 
        timestamp: new Date().toISOString(),
        checks,
        error: env.NODE_ENV === "development" ? "One or more services unavailable" : undefined,
      });
    }
  });

  // Legacy health endpoint
  app.get("/api/health", (_request, response) => {
    response.json({ ok: true });
  });

  app.get("/api/ops/health", async (_request, response) => {
    const redisStatus = isRedisConfigured() ? await pingRedis() : null;
    
    response.json({
      ok: true,
      realtime: getRealtimeAdapterDiagnostics(),
      redis: redisStatus !== null ? { connected: redisStatus } : undefined,
      storeValidation: {
        mode: storeValidationPort.mode,
      },
    });
  });

  app.get("/api/ops/metrics", (request, response) => {
    if (!canAccessOps(request)) {
      throw new HttpError(403, "OPS_FORBIDDEN", "Metrics access is not allowed from this client.");
    }

    response.json({
      metrics: snapshotMetrics(),
      realtime: getRealtimeAdapterDiagnostics(),
      storeValidation: {
        mode: storeValidationPort.mode,
      },
    });
  });

  // Prometheus metrics endpoint
  app.get("/metrics", async (request, response) => {
    if (!canAccessOps(request)) {
      throw new HttpError(403, "OPS_FORBIDDEN", "Metrics access is not allowed from this client.");
    }

    try {
      response.set("Content-Type", prometheusRegister.contentType);
      response.end(await prometheusRegister.metrics());
    } catch (error) {
      response.status(500).end(String(error));
    }
  });

  app.use("/api/public", publicRouter);
  app.use("/api/auth", authRouter);
  app.use("/api/alliance", allianceRouter);
  app.use("/api/game", gameRouter);
  app.use("/api/store", storeRouter);

  app.use((error: unknown, request: Request, response: Response, _next: NextFunction) => {
    const statusCode = error instanceof HttpError ? error.statusCode : 500;
    
    if (statusCode >= 500) {
      logger.error({ 
        error, 
        requestId: request.requestId,
        path: request.path,
        channel: "error",
      }, "Internal server error");
    }
    
    response.status(statusCode).json({ error: toApiError(error) });
  });

  return app;
}

export { prometheusRegister };
