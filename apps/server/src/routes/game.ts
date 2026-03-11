import { Router } from "express";
import {
  analyticsEventSchema,
  attackSchema,
  buildingTypeSchema,
  createAllianceSchema,
  createMarchSchema,
  donateAllianceResourcesSchema,
  requestAllianceHelpSchema,
  sendAllianceChatSchema,
  startResearchSchema,
  trainTroopsSchema,
  updateAllianceRoleSchema,
} from "@frontier/shared";

import { requireAuth } from "../middleware/auth";
import { ingestAnalyticsEvent } from "../lib/analytics";
import { env } from "../lib/env";
import { createRateLimit } from "../middleware/rateLimit";
import { parseOrThrow } from "../lib/http";
import {
  createMarch,
  createMarchFromAttack,
  createAlliance,
  donateAllianceResources,
  getBattleReports,
  getAllianceState,
  getCommanders,
  getGameState,
  getTroops,
  getWorldChunk,
  joinAlliance,
  leaveAlliance,
  recallMarch,
  requestAllianceHelp,
  respondAllianceHelp,
  sendAllianceChatMessage,
  startBuildingUpgrade,
  startResearch,
  trainTroops,
  updateAllianceMemberRole,
} from "../game/service";

export const gameRouter = Router();
const mutationRateLimit = createRateLimit({
  max: env.COMMAND_RATE_LIMIT_MAX,
  windowMs: env.COMMAND_RATE_LIMIT_WINDOW_MS,
});

gameRouter.use(requireAuth);

gameRouter.get("/state", async (request, response) => {
  const state = await getGameState(request.authUserId!);
  response.json(state);
});

gameRouter.post("/buildings/:type/upgrade", mutationRateLimit, async (request, response) => {
  const buildingType = parseOrThrow(buildingTypeSchema, request.params.type);
  const state = await startBuildingUpgrade(request.authUserId!, buildingType);
  response.json(state);
});

gameRouter.get("/world/chunk", async (request, response) => {
  const centerX = typeof request.query.centerX === "string" ? Number(request.query.centerX) : undefined;
  const centerY = typeof request.query.centerY === "string" ? Number(request.query.centerY) : undefined;
  const radius = typeof request.query.radius === "string" ? Number(request.query.radius) : undefined;
  const chunk = await getWorldChunk(request.authUserId!, {
    centerX: Number.isFinite(centerX) ? centerX : undefined,
    centerY: Number.isFinite(centerY) ? centerY : undefined,
    radius: Number.isFinite(radius) ? radius : undefined,
  });
  response.json(chunk);
});

gameRouter.get("/map", async (request, response) => {
  const chunk = await getWorldChunk(request.authUserId!, {});
  response.json(chunk);
});

gameRouter.get("/troops", async (request, response) => {
  const troops = await getTroops(request.authUserId!);
  response.json({ troops });
});

gameRouter.post("/troops/train", mutationRateLimit, async (request, response) => {
  const payload = parseOrThrow(trainTroopsSchema, request.body);
  const city = await trainTroops(request.authUserId!, payload.troopType, payload.quantity);
  response.json({ city });
});

gameRouter.get("/commanders", async (request, response) => {
  const commanders = await getCommanders(request.authUserId!);
  response.json({ commanders });
});

gameRouter.get("/alliance", async (request, response) => {
  const state = await getAllianceState(request.authUserId!);
  response.json(state);
});

gameRouter.post("/alliances", mutationRateLimit, async (request, response) => {
  const payload = parseOrThrow(createAllianceSchema, request.body);
  const alliance = await createAlliance(request.authUserId!, payload);
  response.status(201).json({ alliance });
});

gameRouter.post("/alliances/:id/join", mutationRateLimit, async (request, response) => {
  const alliance = await joinAlliance(request.authUserId!, String(request.params.id));
  response.json({ alliance });
});

gameRouter.post("/alliances/leave", mutationRateLimit, async (request, response) => {
  await leaveAlliance(request.authUserId!);
  response.json({ ok: true });
});

gameRouter.post("/alliance/chat", mutationRateLimit, async (request, response) => {
  const payload = parseOrThrow(sendAllianceChatSchema, request.body);
  const alliance = await sendAllianceChatMessage(request.authUserId!, payload.content);
  response.json({ alliance });
});

gameRouter.post("/alliance/donate", mutationRateLimit, async (request, response) => {
  const payload = parseOrThrow(donateAllianceResourcesSchema, request.body);
  const alliance = await donateAllianceResources(request.authUserId!, payload);
  response.json({ alliance });
});

gameRouter.post("/alliances/members/:userId/role", mutationRateLimit, async (request, response) => {
  const payload = parseOrThrow(updateAllianceRoleSchema, request.body);
  const alliance = await updateAllianceMemberRole(request.authUserId!, String(request.params.userId), payload.role);
  response.json({ alliance });
});

gameRouter.post("/alliance-help", mutationRateLimit, async (request, response) => {
  const payload = parseOrThrow(requestAllianceHelpSchema, request.body);
  const alliance = await requestAllianceHelp(request.authUserId!, payload.kind);
  response.json({ alliance });
});

gameRouter.post("/alliance-help/:id/respond", mutationRateLimit, async (request, response) => {
  const alliance = await respondAllianceHelp(request.authUserId!, String(request.params.id));
  response.json({ alliance });
});

gameRouter.post("/research/start", mutationRateLimit, async (request, response) => {
  const payload = parseOrThrow(startResearchSchema, request.body);
  const city = await startResearch(request.authUserId!, payload.researchType);
  response.json({ city });
});

gameRouter.post("/marches", mutationRateLimit, async (request, response) => {
  const payload = parseOrThrow(createMarchSchema, request.body);
  const march = await createMarch(request.authUserId!, payload);
  response.status(202).json(march);
});

gameRouter.post("/marches/:id/recall", mutationRateLimit, async (request, response) => {
  const city = await recallMarch(request.authUserId!, String(request.params.id));
  response.json({ city });
});

gameRouter.post("/analytics", mutationRateLimit, async (request, response) => {
  const payload = parseOrThrow(analyticsEventSchema, request.body);
  ingestAnalyticsEvent(request.authUserId!, payload);
  response.status(202).json({ ok: true });
});

gameRouter.post("/attacks", mutationRateLimit, async (request, response) => {
  const payload = parseOrThrow(attackSchema, request.body);
  const march = await createMarchFromAttack(request.authUserId!, payload.targetCityId);
  response.status(202).json(march);
});

gameRouter.get("/reports", async (request, response) => {
  const reports = await getBattleReports(request.authUserId!);
  response.json({ reports });
});
