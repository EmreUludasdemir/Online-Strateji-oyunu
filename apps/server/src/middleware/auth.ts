import type { NextFunction, Request, Response } from "express";

import { JWT_COOKIE_NAME } from "../game/constants";
import { verifySessionToken } from "../lib/auth";
import { HttpError } from "../lib/http";

export function requireAuth(request: Request, _response: Response, next: NextFunction): void {
  const token = request.cookies?.[JWT_COOKIE_NAME];
  const session = token ? verifySessionToken(token) : null;

  if (!session) {
    next(new HttpError(401, "UNAUTHORIZED", "Authentication is required."));
    return;
  }

  request.authUserId = session.userId;
  next();
}
