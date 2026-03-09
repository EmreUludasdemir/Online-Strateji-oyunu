import cookieParser from "cookie-parser";
import express, { type NextFunction, type Request, type Response } from "express";

import { HttpError, toApiError } from "./lib/http";
import { authRouter } from "./routes/auth";
import { gameRouter } from "./routes/game";

function requestLogger(request: Request, response: Response, next: NextFunction) {
  const startedAt = Date.now();
  response.on("finish", () => {
    console.info(
      JSON.stringify({
        channel: "http",
        method: request.method,
        path: request.path,
        status: response.statusCode,
        durationMs: Date.now() - startedAt,
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

  app.use("/api/auth", authRouter);
  app.use("/api/game", gameRouter);

  app.use((error: unknown, _request: Request, response: Response, _next: NextFunction) => {
    const statusCode = error instanceof HttpError ? error.statusCode : 500;
    response.status(statusCode).json({ error: toApiError(error) });
  });

  return app;
}
