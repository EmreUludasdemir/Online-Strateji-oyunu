import cookieParser from "cookie-parser";
import express, { type NextFunction, type Request, type Response } from "express";

import { env } from "./lib/env";
import { HttpError, toApiError } from "./lib/http";
import { incrementCounter, observeDuration, snapshotMetrics } from "./lib/metrics";
import { getRealtimeAdapterDiagnostics } from "./lib/notifications";
import { storeValidationPort } from "./lib/storeValidation";
import { allianceRouter } from "./routes/alliance";
import { authRouter } from "./routes/auth";
import { gameRouter } from "./routes/game";
import { publicRouter } from "./routes/public";
import { storeRouter } from "./routes/store";

function getStatusClass(statusCode: number): string {
  return String(Math.floor(statusCode / 100)) + "xx";
}

function canAccessOps(request: Request): boolean {
  if (env.OPS_METRICS_TOKEN) {
    return request.header("x-ops-token") === env.OPS_METRICS_TOKEN;
  }

  return ["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(request.ip ?? "");
}

function requestLogger(request: Request, response: Response, next: NextFunction) {
  const startedAt = Date.now();
  response.on("finish", () => {
    const durationMs = Date.now() - startedAt;
    const tags = {
      method: request.method,
      path: request.path,
      statusClass: getStatusClass(response.statusCode),
    };

    incrementCounter("http_requests_total", tags);
    observeDuration("http_request_duration_ms", durationMs, tags);
    console.info(
      JSON.stringify({
        channel: "http",
        method: request.method,
        path: request.path,
        status: response.statusCode,
        durationMs,
      }),
    );
  });
  next();
}

export function createApp() {
  const app = express();

  app.use(requestLogger);
  app.use(express.json());
  app.use(cookieParser());

  app.get("/api/health", (_request, response) => {
    response.json({ ok: true });
  });

  app.get("/api/ops/health", (_request, response) => {
    response.json({
      ok: true,
      realtime: getRealtimeAdapterDiagnostics(),
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

  app.use("/api/public", publicRouter);
  app.use("/api/auth", authRouter);
  app.use("/api/alliance", allianceRouter);
  app.use("/api/game", gameRouter);
  app.use("/api/store", storeRouter);

  app.use((error: unknown, _request: Request, response: Response, _next: NextFunction) => {
    const statusCode = error instanceof HttpError ? error.statusCode : 500;
    response.status(statusCode).json({ error: toApiError(error) });
  });

  return app;
}
