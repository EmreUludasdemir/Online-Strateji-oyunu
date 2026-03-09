import type { NextFunction, Request, Response } from "express";

import { HttpError } from "../lib/http";

interface RateLimitOptions {
  max: number;
  windowMs: number;
}

const buckets = new Map<string, { count: number; resetAt: number }>();

export function createRateLimit(options: RateLimitOptions) {
  return (request: Request, _response: Response, next: NextFunction) => {
    const ip = request.ip ?? "unknown";
    const key = `${request.method}:${request.path}:${ip}`;
    const now = Date.now();
    const current = buckets.get(key);

    if (!current || current.resetAt <= now) {
      buckets.set(key, { count: 1, resetAt: now + options.windowMs });
      next();
      return;
    }

    if (current.count >= options.max) {
      next(
        new HttpError(
          429,
          "RATE_LIMITED",
          "Too many requests hit this endpoint. Please wait a moment and try again.",
        ),
      );
      return;
    }

    current.count += 1;
    next();
  };
}
