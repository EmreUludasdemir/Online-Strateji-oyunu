import { Router } from "express";
import { authSchema } from "@frontier/shared";

import { JWT_COOKIE_NAME } from "../game/constants";
import { getSessionCookieOptions, signSessionToken, verifySessionToken } from "../lib/auth";
import { env } from "../lib/env";
import { parseOrThrow } from "../lib/http";
import { createRateLimit } from "../middleware/rateLimit";
import { getSessionUser, loginPlayer, registerPlayer } from "../game/service";

export const authRouter = Router();
const authRateLimit = createRateLimit({
  max: env.AUTH_RATE_LIMIT_MAX,
  windowMs: env.AUTH_RATE_LIMIT_WINDOW_MS,
});

authRouter.post("/register", authRateLimit, async (request, response) => {
  const payload = parseOrThrow(authSchema, request.body);
  const user = await registerPlayer(payload);

  response.cookie(JWT_COOKIE_NAME, signSessionToken(user.id), getSessionCookieOptions());
  response.status(201).json({ user });
});

authRouter.post("/login", authRateLimit, async (request, response) => {
  const payload = parseOrThrow(authSchema, request.body);
  const user = await loginPlayer(payload);

  response.cookie(JWT_COOKIE_NAME, signSessionToken(user.id), getSessionCookieOptions());
  response.json({ user });
});

authRouter.post("/logout", (_request, response) => {
  response.clearCookie(JWT_COOKIE_NAME, getSessionCookieOptions());
  response.json({ ok: true });
});

authRouter.get("/me", async (request, response) => {
  const token = request.cookies?.[JWT_COOKIE_NAME];
  const session = token ? verifySessionToken(token) : null;

  if (!session) {
    response.json({ user: null });
    return;
  }

  const user = await getSessionUser(session.userId);
  response.json({ user });
});
