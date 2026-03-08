import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

import { env } from "./env";

export interface SessionPayload {
  userId: string;
}

const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export function signSessionToken(userId: string): string {
  return jwt.sign({ userId }, env.JWT_SECRET, {
    expiresIn: SESSION_TTL_SECONDS,
  });
}

export function verifySessionToken(token: string): SessionPayload | null {
  try {
    return jwt.verify(token, env.JWT_SECRET) as SessionPayload;
  } catch {
    return null;
  }
}

export function getSessionCookieOptions() {
  const domain = process.env.NODE_ENV === "test" ? undefined : "localhost";

  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: false,
    ...(domain ? { domain } : {}),
    maxAge: SESSION_TTL_SECONDS * 1000,
    path: "/",
  };
}
