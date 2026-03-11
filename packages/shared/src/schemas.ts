import { z } from "zod";

import {
  ANALYTICS_EVENT_TYPES,
  ALLIANCE_HELP_KINDS,
  ALLIANCE_ROLES,
  BATTLE_RESULTS,
  BUILDING_TYPES,
  COMMANDER_TALENT_TRACKS,
  FOG_STATES,
  ITEM_KEYS,
  ITEM_TARGET_KINDS,
  LIVE_EVENT_KEYS,
  MAILBOX_KINDS,
  MARCH_OBJECTIVES,
  MARCH_STATES,
  POI_KINDS,
  POI_RESOURCE_TYPES,
  POI_STATES,
  PURCHASE_STATUSES,
  RALLY_STATES,
  REPORT_ENTRY_KINDS,
  RESEARCH_TYPES,
  RESOURCE_KEYS,
  SCOUT_STATES,
  SCOUT_TARGET_KINDS,
  SOCKET_EVENT_TYPES,
  TASK_KINDS,
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
export const commanderTalentTrackSchema = z.enum(COMMANDER_TALENT_TRACKS);
export const battleResultSchema = z.enum(BATTLE_RESULTS);
export const poiKindSchema = z.enum(POI_KINDS);
export const poiStateSchema = z.enum(POI_STATES);
export const poiResourceTypeSchema = z.enum(POI_RESOURCE_TYPES);
export const marchObjectiveSchema = z.enum(MARCH_OBJECTIVES);
export const marchStateSchema = z.enum(MARCH_STATES);
export const fogStateSchema = z.enum(FOG_STATES);
export const reportEntryKindSchema = z.enum(REPORT_ENTRY_KINDS);
export const itemKeySchema = z.enum(ITEM_KEYS);
export const itemTargetKindSchema = z.enum(ITEM_TARGET_KINDS);
export const taskKindSchema = z.enum(TASK_KINDS);
export const scoutStateSchema = z.enum(SCOUT_STATES);
export const scoutTargetKindSchema = z.enum(SCOUT_TARGET_KINDS);
export const rallyStateSchema = z.enum(RALLY_STATES);
export const mailboxKindSchema = z.enum(MAILBOX_KINDS);
export const purchaseStatusSchema = z.enum(PURCHASE_STATUSES);
export const liveEventKeySchema = z.enum(LIVE_EVENT_KEYS);
export const analyticsEventSchema = z.object({
  event: z.enum(ANALYTICS_EVENT_TYPES),
  metadata: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])).optional(),
});

export const attackSchema = z.object({
  targetCityId: z.string().min(1),
});

export const trainTroopsSchema = z.object({
  troopType: troopTypeSchema,
  quantity: z.number().int().min(1).max(500),
});

const assignedTroopsSchema = troopStockSchema.refine(
  (troops) => Object.values(troops).some((value) => value > 0),
  "At least one troop must be assigned.",
);

export const createMarchSchema = z.union([
  z.object({
    objective: z.literal("CITY_ATTACK").optional(),
    targetCityId: z.string().min(1),
    commanderId: z.string().min(1),
    troops: assignedTroopsSchema,
  }),
  z.object({
    objective: z.literal("BARBARIAN_ATTACK"),
    targetPoiId: z.string().min(1),
    commanderId: z.string().min(1),
    troops: assignedTroopsSchema,
  }),
  z.object({
    objective: z.literal("RESOURCE_GATHER"),
    targetPoiId: z.string().min(1),
    commanderId: z.string().min(1),
    troops: assignedTroopsSchema,
  }),
]);

export const recallMarchSchema = z.object({
  marchId: z.string().min(1),
});

export const retargetMarchSchema = z.union([
  z.object({
    targetCityId: z.string().min(1),
  }),
  z.object({
    targetPoiId: z.string().min(1),
  }),
]);

export const startResearchSchema = z.object({
  researchType: researchTypeSchema,
});

export const claimTaskSchema = z.object({
  taskId: z.string().min(1),
});

export const itemUseSchema = z.object({
  itemKey: itemKeySchema,
  targetKind: itemTargetKindSchema.optional(),
  targetId: z.string().min(1).optional(),
});

export const upgradeCommanderSchema = z.object({
  commanderId: z.string().min(1),
});

export const createScoutSchema = z.union([
  z.object({
    targetCityId: z.string().min(1),
  }),
  z.object({
    targetPoiId: z.string().min(1),
  }),
]);

export const createRallySchema = z.union([
  z.object({
    objective: z.literal("CITY_ATTACK").optional(),
    targetCityId: z.string().min(1),
    commanderId: z.string().min(1),
    troops: assignedTroopsSchema,
  }),
  z.object({
    objective: z.literal("BARBARIAN_ATTACK"),
    targetPoiId: z.string().min(1),
    commanderId: z.string().min(1),
    troops: assignedTroopsSchema,
  }),
]);

export const joinRallySchema = z.object({
  troops: assignedTroopsSchema,
});

export const allianceAnnouncementSchema = z.object({
  content: z.string().min(1).max(180),
});

export const allianceMarkerSchema = z.object({
  label: z.string().min(1).max(60),
  x: z.number().int().min(0),
  y: z.number().int().min(0),
});

export const claimMailboxSchema = z.object({
  mailboxId: z.string().min(1),
});

export const storeVerifySchema = z.object({
  platform: z.enum(["APPLE_APP_STORE", "GOOGLE_PLAY"]),
  productId: z.string().min(1),
  purchaseToken: z.string().min(8),
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
    scoutId: z.string().optional(),
    rallyId: z.string().optional(),
    mailboxId: z.string().optional(),
    poiId: z.string().optional(),
    allianceId: z.string().optional(),
    helpRequestId: z.string().optional(),
  }),
});
