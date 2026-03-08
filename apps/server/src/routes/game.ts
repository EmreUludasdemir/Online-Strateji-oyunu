import { Router } from "express";
import { attackSchema, buildingTypeSchema } from "@frontier/shared";

import { requireAuth } from "../middleware/auth";
import { parseOrThrow } from "../lib/http";
import {
  attackCity,
  getBattleReports,
  getGameState,
  getWorldMap,
  startBuildingUpgrade,
} from "../game/service";

export const gameRouter = Router();

gameRouter.use(requireAuth);

gameRouter.get("/state", async (request, response) => {
  const state = await getGameState(request.authUserId!);
  response.json(state);
});

gameRouter.post("/buildings/:type/upgrade", async (request, response) => {
  const buildingType = parseOrThrow(buildingTypeSchema, request.params.type);
  const state = await startBuildingUpgrade(request.authUserId!, buildingType);
  response.json(state);
});

gameRouter.get("/map", async (request, response) => {
  const worldMap = await getWorldMap(request.authUserId!);
  response.json(worldMap);
});

gameRouter.post("/attacks", async (request, response) => {
  const payload = parseOrThrow(attackSchema, request.body);
  const report = await attackCity(request.authUserId!, payload.targetCityId);
  response.json({ report });
});

gameRouter.get("/reports", async (request, response) => {
  const reports = await getBattleReports(request.authUserId!);
  response.json({ reports });
});
