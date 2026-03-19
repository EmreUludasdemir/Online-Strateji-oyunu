import { Router } from "express";
import { donateAllianceResourcesSchema, updateAllianceRoleSchema } from "@frontier/shared";

import { env } from "../lib/env";
import { parseOrThrow } from "../lib/http";
import { createRateLimit } from "../middleware/rateLimit";
import { requireAuth } from "../middleware/auth";
import { donateAllianceResources, getAllianceState, updateAllianceMemberRole } from "../game/service";

export const allianceRouter = Router();
const mutationRateLimit = createRateLimit({
  max: env.COMMAND_RATE_LIMIT_MAX,
  windowMs: env.COMMAND_RATE_LIMIT_WINDOW_MS,
});

allianceRouter.use(requireAuth);

allianceRouter.get("/", async (request, response) => {
  const state = await getAllianceState(request.authUserId!);
  response.json(state);
});

allianceRouter.post("/donations", mutationRateLimit, async (request, response) => {
  const payload = parseOrThrow(donateAllianceResourcesSchema, request.body);
  const alliance = await donateAllianceResources(request.authUserId!, payload);
  response.json({ alliance });
});

allianceRouter.post("/members/:userId/role", mutationRateLimit, async (request, response) => {
  const payload = parseOrThrow(updateAllianceRoleSchema, request.body);
  const alliance = await updateAllianceMemberRole(request.authUserId!, String(request.params.userId), payload.role);
  response.json({ alliance });
});
