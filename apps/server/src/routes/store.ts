import { Router } from "express";
import { storeVerifySchema } from "@frontier/shared";

import { requireAuth } from "../middleware/auth";
import { env } from "../lib/env";
import { parseOrThrow } from "../lib/http";
import { assertStoreEnabled } from "../lib/launch";
import { createRateLimit } from "../middleware/rateLimit";
import { getEntitlements, getStoreCatalog, verifyStorePurchase } from "../game/service";

export const storeRouter = Router();

const mutationRateLimit = createRateLimit({
  max: Math.max(4, Math.floor(env.COMMAND_RATE_LIMIT_MAX / 2)),
  windowMs: env.COMMAND_RATE_LIMIT_WINDOW_MS,
});

storeRouter.use(requireAuth);
storeRouter.use((_request, _response, next) => {
  assertStoreEnabled();
  next();
});

storeRouter.get("/catalog", async (request, response) => {
  const catalog = await getStoreCatalog(request.authUserId!);
  response.json(catalog);
});

storeRouter.get("/offers", async (request, response) => {
  const catalog = await getStoreCatalog(request.authUserId!);
  response.json({ offers: catalog.catalog.offers });
});

storeRouter.get("/entitlements", async (request, response) => {
  const entitlements = await getEntitlements(request.authUserId!);
  response.json(entitlements);
});

storeRouter.post("/verify", mutationRateLimit, async (request, response) => {
  const payload = parseOrThrow(storeVerifySchema, request.body);
  const purchase = await verifyStorePurchase(request.authUserId!, payload);
  response.json(purchase);
});
