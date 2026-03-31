import type { IncomingMessage } from "node:http";
import { logger } from "../lib/logger";

interface WsRateLimitOptions {
  max: number;
  windowMs: number;
}

const buckets = new Map<string, { count: number; resetAt: number }>();

const WS_RATE_LIMIT_OPTIONS: WsRateLimitOptions = {
  max: 10,
  windowMs: 60_000,
};

export function isWsRateLimited(request: IncomingMessage): boolean {
  const ip = request.socket.remoteAddress ?? "unknown";
  const now = Date.now();
  const current = buckets.get(ip);

  if (!current || current.resetAt <= now) {
    buckets.set(ip, { count: 1, resetAt: now + WS_RATE_LIMIT_OPTIONS.windowMs });
    return false;
  }

  if (current.count >= WS_RATE_LIMIT_OPTIONS.max) {
    logger.warn({ ip, channel: "ws_rate_limit" }, "WebSocket connection rate limited");
    return true;
  }

  current.count += 1;
  return false;
}

// Cleanup old buckets periodically
setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) {
      buckets.delete(key);
    }
  }
}, 60_000);
