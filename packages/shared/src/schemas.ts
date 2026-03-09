import { z } from "zod";

import {
  ALLIANCE_HELP_KINDS,
  ALLIANCE_ROLES,
  BATTLE_RESULTS,
  BUILDING_TYPES,
  FOG_STATES,
  MARCH_STATES,
  RESEARCH_TYPES,
  RESOURCE_KEYS,
  SOCKET_EVENT_TYPES,
  TROOP_TYPES,
} from "./game";

export const resourceStockSchema = z.object(
  Object.fromEntries(RESOURCE_KEYS.map((key) => [key, z.number().int().nonnegative()])) as Record<
    (typeof RESOURCE_KEYS)[number],
    z.ZodNumber
  >,
);

export const troopStockSchema = z.object(
  Object.fromEntries(TROOP_TYPES.map((key) => [key, z.number().int().nonnegative()])) as Record<
    (typeof TROOP_TYPES)[number],
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
export const troopTypeSchema = z.enum(TROOP_TYPES);
export const researchTypeSchema = z.enum(RESEARCH_TYPES);
export const allianceRoleSchema = z.enum(ALLIANCE_ROLES);
export const allianceHelpKindSchema = z.enum(ALLIANCE_HELP_KINDS);
export const battleResultSchema = z.enum(BATTLE_RESULTS);
export const marchStateSchema = z.enum(MARCH_STATES);
export const fogStateSchema = z.enum(FOG_STATES);

export const attackSchema = z.object({
  targetCityId: z.string().min(1),
});

export const trainTroopsSchema = z.object({
  troopType: troopTypeSchema,
  quantity: z.number().int().min(1).max(500),
});

export const createMarchSchema = z.object({
  targetCityId: z.string().min(1),
  commanderId: z.string().min(1),
  troops: troopStockSchema.refine(
    (troops) => Object.values(troops).some((value) => value > 0),
    "At least one troop must be assigned.",
  ),
});

export const recallMarchSchema = z.object({
  marchId: z.string().min(1),
});

export const startResearchSchema = z.object({
  researchType: researchTypeSchema,
});

export const createAllianceSchema = z.object({
  name: z.string().min(3).max(32),
  tag: z
    .string()
    .min(2)
    .max(6)
    .regex(/^[A-Z0-9]+$/, "Alliance tag must use uppercase letters and numbers only."),
  description: z.string().max(180).optional().transform((value) => value?.trim() || undefined),
});

export const sendAllianceChatSchema = z.object({
  content: z.string().min(1).max(240),
});

export const requestAllianceHelpSchema = z.object({
  kind: allianceHelpKindSchema,
});

export const donateAllianceResourcesSchema = resourceStockSchema.refine(
  (resources) => Object.values(resources).some((value) => value > 0),
  "At least one resource amount must be donated.",
);

export const updateAllianceRoleSchema = z.object({
  role: allianceRoleSchema,
});

export const worldChunkQuerySchema = z.object({
  centerX: z.preprocess(
    (value) => (value == null || value === "" ? undefined : Number(value)),
    z.number().int().min(0).optional(),
  ),
  centerY: z.preprocess(
    (value) => (value == null || value === "" ? undefined : Number(value)),
    z.number().int().min(0).optional(),
  ),
  radius: z.preprocess(
    (value) => (value == null || value === "" ? 8 : Number(value)),
    z.number().int().min(4).max(12),
  ),
});

export const socketEnvelopeSchema = z.object({
  type: z.enum(SOCKET_EVENT_TYPES),
  payload: z.object({
    cityId: z.string().optional(),
    reportId: z.string().optional(),
    marchId: z.string().optional(),
    allianceId: z.string().optional(),
    helpRequestId: z.string().optional(),
  }),
});
