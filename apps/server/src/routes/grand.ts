import { Router } from "express";
import { z } from "zod";

import { parseOrThrow } from "../lib/http";
import { requireAuth } from "../middleware/auth";
import { claimProvince, declareWar, getGrandState, runWorldTick } from "../grand/service";

const claimSchema = z.object({
  provinceId: z.string().min(1, "provinceId is required."),
});

const declareWarSchema = z.object({
  attackerId: z.string().min(1, "attackerId is required."),
  defenderId: z.string().min(1, "defenderId is required."),
});

export const grandRouter = Router();

grandRouter.use(requireAuth);

grandRouter.get("/state", async (_request, response) => {
  const state = await getGrandState();
  response.json(state);
});

grandRouter.post("/tick", async (_request, response) => {
  const result = await runWorldTick();
  response.json(result);
});

grandRouter.post("/countries/:id/claim", async (request, response) => {
  const payload = parseOrThrow(claimSchema, request.body);
  const result = await claimProvince(request.params.id, payload.provinceId);
  response.json(result);
});

grandRouter.post("/wars/declare", async (request, response) => {
  const payload = parseOrThrow(declareWarSchema, request.body);
  const result = await declareWar(payload.attackerId, payload.defenderId);
  response.status(201).json(result);
});
