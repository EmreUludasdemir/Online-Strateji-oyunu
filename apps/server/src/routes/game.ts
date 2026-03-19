import { Router } from "express";
import {
  analyticsEventSchema,
  attackSchema,
  allianceAnnouncementSchema,
  allianceMarkerSchema,
  buildingTypeSchema,
  claimMailboxSchema,
  claimTaskSchema,
  createAllianceSchema,
  createMarchSchema,
  createRallySchema,
  createScoutSchema,
  donateAllianceResourcesSchema,
  itemUseSchema,
  joinRallySchema,
  retargetMarchSchema,
  requestAllianceHelpSchema,
  sendAllianceChatSchema,
  startResearchSchema,
  trainTroopsSchema,
  upgradeCommanderSchema,
  updateAllianceRoleSchema,
} from "@frontier/shared";

import { requireAuth } from "../middleware/auth";
import { ingestAnalyticsEvent } from "../lib/analytics";
import { env } from "../lib/env";
import { createRateLimit } from "../middleware/rateLimit";
import { parseOrThrow } from "../lib/http";
import {
  claimMailboxReward,
  claimTaskReward,
  deleteAllianceMarker,
  createAllianceMarker,
  createMarch,
  createMarchFromAttack,
  createAlliance,
  createRally,
  createScout,
  donateAllianceResources,
  getBattleReports,
  getAllianceState,
  getCommanders,
  getEvents,
  getGameState,
  getInventory,
  getLeaderboard,
  getMailbox,
  getRallies,
  getTasks,
  getTroops,
  getWorldChunk,
  joinAlliance,
  joinRally,
  leaveAlliance,
  launchRally,
  recallMarch,
  requestAllianceHelp,
  retargetMarch,
  respondAllianceHelp,
  sendAllianceChatMessage,
  startBuildingUpgrade,
  startResearch,
  trainTroops,
  updateAllianceAnnouncement,
  updateAllianceMemberRole,
  upgradeCommander,
  useInventoryItem,
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

gameRouter.post("/commanders/:id/upgrade", mutationRateLimit, async (request, response) => {
  parseOrThrow(upgradeCommanderSchema, request.body);
  const commanders = await upgradeCommander(request.authUserId!, String(request.params.id));
  response.json(commanders);
});

gameRouter.get("/tasks", async (request, response) => {
  const tasks = await getTasks(request.authUserId!);
  response.json(tasks);
});

gameRouter.post("/tasks/:id/claim", mutationRateLimit, async (request, response) => {
  parseOrThrow(claimTaskSchema, { taskId: String(request.params.id) });
  await claimTaskReward(request.authUserId!, String(request.params.id));
  response.json({ ok: true });
});

gameRouter.get("/inventory", async (request, response) => {
  const inventory = await getInventory(request.authUserId!);
  response.json(inventory);
});

gameRouter.post("/inventory/use", mutationRateLimit, async (request, response) => {
  const payload = parseOrThrow(itemUseSchema, request.body);
  await useInventoryItem(request.authUserId!, payload);
  response.json({ ok: true });
});

gameRouter.get("/mailbox", async (request, response) => {
  const mailbox = await getMailbox(request.authUserId!);
  response.json(mailbox);
});

gameRouter.post("/mailbox/:id/claim", mutationRateLimit, async (request, response) => {
  parseOrThrow(claimMailboxSchema, { mailboxId: String(request.params.id) });
  await claimMailboxReward(request.authUserId!, String(request.params.id));
  response.json({ ok: true });
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

gameRouter.post("/alliance/announcement", mutationRateLimit, async (request, response) => {
  const payload = parseOrThrow(allianceAnnouncementSchema, request.body);
  const alliance = await updateAllianceAnnouncement(request.authUserId!, payload.content);
  response.json({ alliance });
});

gameRouter.post("/alliance/markers", mutationRateLimit, async (request, response) => {
  const payload = parseOrThrow(allianceMarkerSchema, request.body);
  const alliance = await createAllianceMarker(request.authUserId!, payload);
  response.json({ alliance });
});

gameRouter.delete("/alliance/markers/:id", mutationRateLimit, async (request, response) => {
  const alliance = await deleteAllianceMarker(request.authUserId!, String(request.params.id));
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

gameRouter.post("/marches/:id/retarget", mutationRateLimit, async (request, response) => {
  const payload = parseOrThrow(retargetMarchSchema, request.body);
  const march = await retargetMarch(request.authUserId!, String(request.params.id), payload);
  response.json(march);
});

gameRouter.post("/scouts", mutationRateLimit, async (request, response) => {
  const payload = parseOrThrow(createScoutSchema, request.body);
  const scout = await createScout(request.authUserId!, payload);
  response.status(202).json(scout);
});

gameRouter.get("/rallies", async (request, response) => {
  const rallies = await getRallies(request.authUserId!);
  response.json(rallies);
});

gameRouter.post("/rallies", mutationRateLimit, async (request, response) => {
  const payload = parseOrThrow(createRallySchema, request.body);
  const rally = await createRally(request.authUserId!, payload);
  response.status(201).json(rally);
});

gameRouter.post("/rallies/:id/join", mutationRateLimit, async (request, response) => {
  const payload = parseOrThrow(joinRallySchema, request.body);
  const rally = await joinRally(request.authUserId!, String(request.params.id), payload);
  response.json(rally);
});

gameRouter.post("/rallies/:id/launch", mutationRateLimit, async (request, response) => {
  const rally = await launchRally(request.authUserId!, String(request.params.id));
  response.json(rally);
});

gameRouter.post("/analytics", mutationRateLimit, async (request, response) => {
  const payload = parseOrThrow(analyticsEventSchema, request.body);
  await ingestAnalyticsEvent(request.authUserId!, payload);
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

gameRouter.get("/events", async (request, response) => {
  const events = await getEvents(request.authUserId!);
  response.json(events);
});

gameRouter.get("/leaderboards/:id", async (request, response) => {
  const leaderboard = await getLeaderboard(request.authUserId!, String(request.params.id));
  response.json(leaderboard);
});
