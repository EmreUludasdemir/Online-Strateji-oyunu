import cookieParser from "cookie-parser";
import express, { type NextFunction, type Request, type Response } from "express";

import { authRouter } from "./routes/auth";
import { gameRouter } from "./routes/game";
import { HttpError, toApiError } from "./lib/http";

export function createApp() {
  const app = express();

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
