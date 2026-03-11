import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required."),
  JWT_SECRET: z.string().min(16, "JWT_SECRET must be at least 16 characters."),
  PORT: z.coerce.number().int().positive().default(3101),
  TEST_DATABASE_URL: z.string().optional(),
  COOKIE_DOMAIN: z.string().optional(),
  SESSION_TTL_SECONDS: z.coerce.number().int().positive().default(60 * 60 * 24 * 7),
  COOKIE_SECURE: z
    .enum(["true", "false"])
    .optional()
    .transform((value) => value === "true"),
  COOKIE_SAMESITE: z.enum(["lax", "strict", "none"]).optional().default("lax"),
  AUTH_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(15),
  AUTH_RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60_000),
  COMMAND_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(30),
  COMMAND_RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60_000),
  OPS_METRICS_TOKEN: z.string().optional(),
  REALTIME_ADAPTER: z.enum(["in_memory", "redis"]).optional().default("in_memory"),
  REDIS_URL: z.preprocess(
    (value) => (typeof value === "string" && value.trim().length === 0 ? undefined : value),
    z.string().url().optional(),
  ),
});

export const env = envSchema.parse(process.env);
