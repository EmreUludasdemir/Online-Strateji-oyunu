import { Router } from "express";

import { getPublicBootstrap } from "../lib/launch";

export const publicRouter = Router();

publicRouter.get("/bootstrap", (_request, response) => {
  response.json(getPublicBootstrap());
});
