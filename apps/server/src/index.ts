import "dotenv/config";
import http from "node:http";

import { WebSocketServer } from "ws";

import { createApp } from "./app";
import { JWT_COOKIE_NAME, WORLD_RECONCILE_INTERVAL_MS } from "./game/constants";
import { reconcileWorld } from "./game/service";
import { verifySessionToken } from "./lib/auth";
import { env } from "./lib/env";
import { notificationHub } from "./lib/notifications";

function parseCookieHeader(rawCookieHeader: string | undefined): Record<string, string> {
  if (!rawCookieHeader) {
    return {};
  }

  return rawCookieHeader.split(";").reduce<Record<string, string>>((cookies, chunk) => {
    const [name, ...valueParts] = chunk.trim().split("=");
    if (!name) {
      return cookies;
    }

    cookies[name] = decodeURIComponent(valueParts.join("="));
    return cookies;
  }, {});
}

const app = createApp();
const server = http.createServer(app);
const webSocketServer = new WebSocketServer({
  server,
  path: "/ws",
});

webSocketServer.on("connection", (socket, request) => {
  const cookies = parseCookieHeader(request.headers.cookie);
  const token = cookies[JWT_COOKIE_NAME];
  const session = token ? verifySessionToken(token) : null;

  if (!session) {
    socket.close(1008, "Unauthorized");
    return;
  }

  notificationHub.register(session.userId, socket);

  socket.on("close", () => {
    notificationHub.unregister(session.userId, socket);
  });
});

const reconcileTimer = setInterval(() => {
  void reconcileWorld().catch((error) => {
    console.error("World reconcile failed", error);
  });
}, WORLD_RECONCILE_INTERVAL_MS);

server.listen(env.PORT, () => {
  console.log(`Frontier Dominion server listening on http://localhost:${env.PORT}`);
});

process.on("SIGINT", () => {
  clearInterval(reconcileTimer);
  process.exit(0);
});
