import Redis from "ioredis";
import { env } from "./env";
import { logger } from "./logger";

let redisClient: Redis | null = null;
let redisSubscriber: Redis | null = null;

export function getRedisClient(): Redis | null {
  if (!env.REDIS_URL) {
    return null;
  }

  if (!redisClient) {
    redisClient = createRedisConnection("redis-client");
  }

  return redisClient;
}

export function getRedisSubscriber(): Redis | null {
  if (!env.REDIS_URL) {
    return null;
  }

  if (!redisSubscriber) {
    redisSubscriber = createRedisConnection("redis-subscriber");
  }

  return redisSubscriber;
}

function createRedisConnection(name: string): Redis {
  const client = new Redis(env.REDIS_URL!, {
    maxRetriesPerRequest: 3,
    retryStrategy(times) {
      const delay = Math.min(times * 100, 3000);
      logger.warn({ times, delay, name }, "Redis connection retry");
      return delay;
    },
    reconnectOnError(err) {
      const targetError = "READONLY";
      if (err.message.includes(targetError)) {
        return true;
      }
      return false;
    },
    lazyConnect: false,
  });

  client.on("connect", () => {
    logger.info({ name }, "Redis connected");
  });

  client.on("ready", () => {
    logger.info({ name }, "Redis ready");
  });

  client.on("error", (error) => {
    logger.error({ error, name }, "Redis error");
  });

  client.on("close", () => {
    logger.warn({ name }, "Redis connection closed");
  });

  return client;
}

export async function pingRedis(): Promise<boolean> {
  const client = getRedisClient();
  if (!client) {
    return false;
  }

  try {
    const result = await client.ping();
    return result === "PONG";
  } catch (error) {
    logger.error({ error }, "Redis ping failed");
    return false;
  }
}

export async function disconnectRedis(): Promise<void> {
  const disconnectPromises: Promise<void>[] = [];

  if (redisClient) {
    disconnectPromises.push(
      redisClient.quit().then(() => {
        logger.info("Redis client disconnected");
      }).catch((error) => {
        logger.error({ error }, "Error disconnecting Redis client");
      })
    );
    redisClient = null;
  }

  if (redisSubscriber) {
    disconnectPromises.push(
      redisSubscriber.quit().then(() => {
        logger.info("Redis subscriber disconnected");
      }).catch((error) => {
        logger.error({ error }, "Error disconnecting Redis subscriber");
      })
    );
    redisSubscriber = null;
  }

  await Promise.all(disconnectPromises);
}

export function isRedisConfigured(): boolean {
  return Boolean(env.REDIS_URL);
}
