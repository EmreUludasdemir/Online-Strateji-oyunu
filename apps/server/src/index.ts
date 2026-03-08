import "dotenv/config";
import http from "node:http";

import { WebSocketServer } from "ws";

import { createApp } from "./app";
import { JWT_COOKIE_NAME } from "./game/constants";
import { env } from "./lib/env";
import { notificationHub } from "./lib/notifications";
import { verifySessionToken } from "./lib/auth";

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

server.listen(env.PORT, () => {
  console.log(`Frontier Dominion server listening on http://localhost:${env.PORT}`);
});
