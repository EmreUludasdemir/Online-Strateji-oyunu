import { z } from "zod";

import { BATTLE_RESULTS, BUILDING_TYPES, RESOURCE_KEYS, SOCKET_EVENT_TYPES } from "./game";

export const resourceStockSchema = z.object(
  Object.fromEntries(RESOURCE_KEYS.map((key) => [key, z.number().int().nonnegative()])) as Record<
    (typeof RESOURCE_KEYS)[number],
    z.ZodNumber
  >,
);

export const authSchema = z.object({
  username: z
    .string()
    .min(3, "Username must be at least 3 characters.")
    .max(24, "Username must be at most 24 characters.")
    .regex(/^[a-zA-Z0-9_]+$/, "Username may only contain letters, numbers, and underscores."),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters.")
    .max(72, "Password must be at most 72 characters."),
});

export const buildingTypeSchema = z.enum(BUILDING_TYPES);

export const attackSchema = z.object({
  targetCityId: z.string().min(1),
});

export const battleResultSchema = z.enum(BATTLE_RESULTS);

export const socketEnvelopeSchema = z.object({
  type: z.enum(SOCKET_EVENT_TYPES),
  payload: z.object({
    cityId: z.string().optional(),
    reportId: z.string().optional(),
  }),
});
