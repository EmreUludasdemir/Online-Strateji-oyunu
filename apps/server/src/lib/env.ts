import { z } from "zod";

const emptyStringToUndefined = (value: unknown) =>
  typeof value === "string" && value.trim().length === 0 ? undefined : value;

const envSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).optional().default("development"),
    DATABASE_URL: z.string().min(1, "DATABASE_URL is required."),
    JWT_SECRET: z.string().min(16, "JWT_SECRET must be at least 16 characters."),
    PORT: z.coerce.number().int().positive().default(3101),
    TEST_DATABASE_URL: z.string().optional(),
    LAUNCH_PHASE: z.enum(["closed_alpha", "public"]).optional().default("public"),
    REGISTRATION_MODE: z.enum(["open", "login_only"]).optional().default("open"),
    STORE_ENABLED: z
      .enum(["true", "false"])
      .optional()
      .default("true")
      .transform((value) => value === "true"),
    COOKIE_DOMAIN: z.preprocess(emptyStringToUndefined, z.string().optional()),
    SESSION_TTL_SECONDS: z.coerce.number().int().positive().default(60 * 60 * 24 * 7),
    COOKIE_SECURE: z
      .enum(["true", "false"])
      .optional()
      .default("false")
      .transform((value) => value === "true"),
    COOKIE_SAMESITE: z.enum(["lax", "strict", "none"]).optional().default("lax"),
    AUTH_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(15),
    AUTH_RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60_000),
    COMMAND_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(30),
    COMMAND_RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60_000),
    OPS_METRICS_TOKEN: z.preprocess(emptyStringToUndefined, z.string().optional()),
    REALTIME_ADAPTER: z.enum(["in_memory", "redis"]).optional().default("in_memory"),
    REDIS_URL: z.preprocess(emptyStringToUndefined, z.string().url().optional()),
    ALLOWED_ORIGINS: z.preprocess(emptyStringToUndefined, z.string().optional()),
    TRUST_PROXY: z
      .enum(["true", "false"])
      .optional()
      .default("false")
      .transform((value) => value === "true"),
    GRACEFUL_SHUTDOWN_TIMEOUT_MS: z.coerce.number().int().positive().default(30_000),
  })
  .superRefine((value, context) => {
    if (value.NODE_ENV !== "production") {
      return;
    }

    if (!value.COOKIE_SECURE) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["COOKIE_SECURE"],
        message: "COOKIE_SECURE must be true in production.",
      });
    }

    if (!value.COOKIE_DOMAIN) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["COOKIE_DOMAIN"],
        message: "COOKIE_DOMAIN is required in production.",
      });
    }

    if (!value.OPS_METRICS_TOKEN) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["OPS_METRICS_TOKEN"],
        message: "OPS_METRICS_TOKEN is required in production.",
      });
    }

    if (value.JWT_SECRET.length < 32) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["JWT_SECRET"],
        message: "JWT_SECRET must be at least 32 characters in production.",
      });
    }
  });

export const env = envSchema.parse(process.env);
