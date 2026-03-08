import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required."),
  JWT_SECRET: z.string().min(16, "JWT_SECRET must be at least 16 characters."),
  PORT: z.coerce.number().int().positive().default(3101),
  TEST_DATABASE_URL: z.string().optional(),
});

export const env = envSchema.parse(process.env);
