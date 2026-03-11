import request from "supertest";
import { describe, expect, it } from "vitest";

import { createApp } from "../src/app";
import { resetMetrics } from "../src/lib/metrics";
import { prisma } from "../src/lib/prisma";

const MAP_SIZE = 64;

async function findOpenCoordinateNearCity(options: { cityId: string; poiId: string; x: number; y: number }) {
  const candidates = [
    { x: options.x + 2, y: options.y },
    { x: options.x, y: options.y + 2 },
    { x: options.x + 2, y: options.y + 1 },
    { x: options.x + 3, y: options.y },
    { x: options.x + 1, y: options.y + 2 },
    { x: options.x, y: options.y + 3 },
  ].filter((coordinate) => coordinate.x >= 0 && coordinate.y >= 0 && coordinate.x < MAP_SIZE && coordinate.y < MAP_SIZE);

  for (const coordinate of candidates) {
    const [occupiedCity, occupiedPoi] = await Promise.all([
      prisma.city.findFirst({
        where: {
          id: { not: options.cityId },
          x: coordinate.x,
          y: coordinate.y,
        },
        select: { id: true },
      }),
      prisma.mapPoi.findFirst({
        where: {
          id: { not: options.poiId },
          x: coordinate.x,
          y: coordinate.y,
        },
        select: { id: true },
      }),
    ]);

    if (!occupiedCity && !occupiedPoi) {
      return coordinate;
    }
  }

  throw new Error("Unable to find an open coordinate near the city for the POI test.");
}

async function movePoiNearCity(options: {
  cityId: string;
  x: number;
  y: number;
  kind: "BARBARIAN_CAMP" | "RESOURCE_NODE";
  label: string;
  level?: number;
  resourceType?: "WOOD" | "STONE" | "FOOD" | "GOLD";
  remainingAmount?: number;
  maxAmount?: number;
}) {
  const poi = await prisma.mapPoi.findFirst({
    where: {
      kind: options.kind,
    },
    select: {
      id: true,
    },
  });

  if (!poi) {
    throw new Error(`Missing POI seed for ${options.kind}.`);
  }

  const coordinate = await findOpenCoordinateNearCity({
    cityId: options.cityId,
    poiId: poi.id,
    x: options.x,
    y: options.y,
  });

  return prisma.mapPoi.update({
    where: { id: poi.id },
    data: {
      x: coordinate.x,
      y: coordinate.y,
      label: options.label,
      level: options.level ?? 1,
      state: "ACTIVE",
      respawnsAt: null,
      resourceType: options.resourceType ?? null,
      remainingAmount: options.remainingAmount ?? null,
      maxAmount: options.maxAmount ?? null,
    },
  });
}

describe("API smoke", () => {
  it("registers, logs out, and logs back in", async () => {
    const app = createApp();
    const agent = request.agent(app);

    const registerResponse = await agent.post("/api/auth/register").send({
      username: "alpha_test",
      password: "passphrase1",
    });

    expect(registerResponse.status).toBe(201);
    expect(registerResponse.body.user.username).toBe("alpha_test");

    const meResponse = await agent.get("/api/auth/me");
    expect(meResponse.status).toBe(200);
    expect(meResponse.body.user.cityName).toContain("alpha_test");

    const logoutResponse = await agent.post("/api/auth/logout");
    expect(logoutResponse.status).toBe(200);

    const meAfterLogout = await agent.get("/api/auth/me");
    expect(meAfterLogout.status).toBe(200);
    expect(meAfterLogout.body.user).toBeNull();

    const loginResponse = await agent.post("/api/auth/login").send({
      username: "alpha_test",
      password: "passphrase1",
    });

    expect(loginResponse.status).toBe(200);
    expect(loginResponse.body.user.username).toBe("alpha_test");
  });

  it("runs the kingdom core flow with battle staging, resolve, and reports", async () => {
    const app = createApp();
    const attacker = request.agent(app);
    const defender = request.agent(app);

    await attacker.post("/api/auth/register").send({
      username: "attacker_one",
      password: "passphrase1",
    });
    await defender.post("/api/auth/register").send({
      username: "defender_one",
      password: "passphrase1",
    });

    const stateResponse = await attacker.get("/api/game/state");
    expect(stateResponse.status).toBe(200);
    expect(stateResponse.body.city.buildings).toHaveLength(8);
    expect(stateResponse.body.city.troops).toHaveLength(3);
    expect(stateResponse.body.city.commanders).toHaveLength(1);
    expect(stateResponse.body.city.research).toHaveLength(6);

    const upgradeResponse = await attacker.post("/api/game/buildings/FARM/upgrade");
    expect(upgradeResponse.status).toBe(200);
    expect(upgradeResponse.body.city.activeUpgrade.buildingType).toBe("FARM");

    const secondUpgradeResponse = await attacker.post("/api/game/buildings/QUARRY/upgrade");
    expect(secondUpgradeResponse.status).toBe(409);

    const trainResponse = await attacker.post("/api/game/troops/train").send({
      troopType: "INFANTRY",
      quantity: 6,
    });
    expect(trainResponse.status).toBe(200);
    expect(trainResponse.body.city.activeTraining.troopType).toBe("INFANTRY");

    const secondTrainResponse = await attacker.post("/api/game/troops/train").send({
      troopType: "ARCHER",
      quantity: 4,
    });
    expect(secondTrainResponse.status).toBe(409);

    const researchResponse = await attacker.post("/api/game/research/start").send({
      researchType: "LOGISTICS",
    });
    expect(researchResponse.status).toBe(200);
    expect(researchResponse.body.city.activeResearch.researchType).toBe("LOGISTICS");

    const mapResponse = await attacker.get("/api/game/world/chunk");
    expect(mapResponse.status).toBe(200);
    const targetCity = mapResponse.body.cities.find(
      (city: { isCurrentPlayer: boolean; canSendMarch: boolean; cityId: string }) =>
        !city.isCurrentPlayer && city.canSendMarch,
    );

    expect(targetCity).toBeTruthy();

    const commanderId = stateResponse.body.city.commanders[0].id;
    const marchResponse = await attacker.post("/api/game/marches").send({
      targetCityId: targetCity.cityId,
      commanderId,
      troops: {
        INFANTRY: 14,
        ARCHER: 10,
        CAVALRY: 6,
      },
    });
    expect(marchResponse.status).toBe(202);
    expect(marchResponse.body.march.id).toBeTruthy();

    await prisma.march.update({
      where: {
        id: marchResponse.body.march.id,
      },
      data: {
        etaAt: new Date(Date.now() - 5_000),
      },
    });

    const stagedStateResponse = await attacker.get("/api/game/state");
    expect(stagedStateResponse.status).toBe(200);
    expect(stagedStateResponse.body.city.activeMarches[0].state).toBe("STAGING");
    expect(stagedStateResponse.body.city.activeMarches[0].battleWindowId).toBeTruthy();

    await prisma.battleWindow.update({
      where: {
        id: stagedStateResponse.body.city.activeMarches[0].battleWindowId,
      },
      data: {
        closesAt: new Date(Date.now() - 5_000),
      },
    });

    const reportsResponse = await attacker.get("/api/game/reports");
    expect(reportsResponse.status).toBe(200);
    expect(reportsResponse.body.reports).toHaveLength(1);
    expect(reportsResponse.body.reports[0].kind).toBe("CITY_BATTLE");
    expect(reportsResponse.body.reports[0].attackerLosses).toBeTruthy();

    const compatibilityAttackResponse = await attacker.post("/api/game/attacks").send({
      targetCityId: targetCity.cityId,
    });
    expect(compatibilityAttackResponse.status).toBe(202);
    expect(compatibilityAttackResponse.body.march.id).toBeTruthy();
  });

  it("groups city attacks into one battle window before resolving them", async () => {
    const app = createApp();
    const attackerOne = request.agent(app);
    const attackerTwo = request.agent(app);
    const defender = request.agent(app);

    await attackerOne.post("/api/auth/register").send({
      username: "window_attacker_one",
      password: "passphrase1",
    });
    await attackerTwo.post("/api/auth/register").send({
      username: "window_attacker_two",
      password: "passphrase1",
    });
    await defender.post("/api/auth/register").send({
      username: "window_defender",
      password: "passphrase1",
    });

    const [attackerOneState, attackerTwoState, defenderState] = await Promise.all([
      attackerOne.get("/api/game/state"),
      attackerTwo.get("/api/game/state"),
      defender.get("/api/game/state"),
    ]);

    const [marchOneResponse, marchTwoResponse] = await Promise.all([
      attackerOne.post("/api/game/marches").send({
        targetCityId: defenderState.body.city.cityId,
        commanderId: attackerOneState.body.city.commanders[0].id,
        troops: {
          INFANTRY: 14,
          ARCHER: 8,
          CAVALRY: 4,
        },
      }),
      attackerTwo.post("/api/game/marches").send({
        targetCityId: defenderState.body.city.cityId,
        commanderId: attackerTwoState.body.city.commanders[0].id,
        troops: {
          INFANTRY: 12,
          ARCHER: 8,
          CAVALRY: 4,
        },
      }),
    ]);

    expect(marchOneResponse.status).toBe(202);
    expect(marchTwoResponse.status).toBe(202);

    await prisma.march.updateMany({
      where: {
        id: {
          in: [marchOneResponse.body.march.id, marchTwoResponse.body.march.id],
        },
      },
      data: {
        etaAt: new Date(Date.now() - 5_000),
      },
    });

    const stagingTrigger = await attackerOne.get("/api/game/state");
    expect(stagingTrigger.status).toBe(200);

    const stagedMarches = await prisma.march.findMany({
      where: {
        id: {
          in: [marchOneResponse.body.march.id, marchTwoResponse.body.march.id],
        },
      },
      select: {
        id: true,
        state: true,
        battleWindowId: true,
      },
      orderBy: {
        id: "asc",
      },
    });

    expect(stagedMarches).toHaveLength(2);
    expect(stagedMarches.every((march) => march.state === "STAGING")).toBe(true);
    expect(stagedMarches[0].battleWindowId).toBeTruthy();
    expect(stagedMarches[0].battleWindowId).toBe(stagedMarches[1].battleWindowId);

    await prisma.battleWindow.update({
      where: {
        id: stagedMarches[0].battleWindowId!,
      },
      data: {
        closesAt: new Date(Date.now() - 5_000),
      },
    });

    const [attackerOneReports, attackerTwoReports, defenderReports] = await Promise.all([
      attackerOne.get("/api/game/reports"),
      attackerTwo.get("/api/game/reports"),
      defender.get("/api/game/reports"),
    ]);

    expect(attackerOneReports.status).toBe(200);
    expect(attackerTwoReports.status).toBe(200);
    expect(defenderReports.status).toBe(200);
    expect(attackerOneReports.body.reports.some((report: { kind: string }) => report.kind === "CITY_BATTLE")).toBe(true);
    expect(attackerTwoReports.body.reports.some((report: { kind: string }) => report.kind === "CITY_BATTLE")).toBe(true);
    expect(defenderReports.body.reports.filter((report: { kind: string }) => report.kind === "CITY_BATTLE").length).toBe(2);
  });

  it("runs a barbarian camp march and stores a PvE report", async () => {
    const app = createApp();
    const raider = request.agent(app);

    await raider.post("/api/auth/register").send({
      username: "camp_raider",
      password: "passphrase1",
    });

    const stateResponse = await raider.get("/api/game/state");
    expect(stateResponse.status).toBe(200);

    const camp = await movePoiNearCity({
      cityId: stateResponse.body.city.cityId,
      x: stateResponse.body.city.coordinates.x,
      y: stateResponse.body.city.coordinates.y,
      kind: "BARBARIAN_CAMP",
      label: "Ashen Camp",
      level: 1,
    });

    const chunkResponse = await raider.get(
      `/api/game/world/chunk?centerX=${stateResponse.body.city.coordinates.x}&centerY=${stateResponse.body.city.coordinates.y}&radius=8`,
    );
    expect(chunkResponse.status).toBe(200);
    expect(chunkResponse.body.pois.some((poi: { id: string; canSendMarch: boolean }) => poi.id === camp.id && poi.canSendMarch)).toBe(
      true,
    );

    const marchResponse = await raider.post("/api/game/marches").send({
      objective: "BARBARIAN_ATTACK",
      targetPoiId: camp.id,
      commanderId: stateResponse.body.city.commanders[0].id,
      troops: {
        INFANTRY: 18,
        ARCHER: 12,
        CAVALRY: 8,
      },
    });
    expect(marchResponse.status).toBe(202);

    await prisma.march.update({
      where: { id: marchResponse.body.march.id },
      data: {
        etaAt: new Date(Date.now() - 5_000),
      },
    });

    const reportsResponse = await raider.get("/api/game/reports");
    expect(reportsResponse.status).toBe(200);
    const battleReport = reportsResponse.body.reports.find((report: { kind: string; poiName?: string }) => report.kind === "BARBARIAN_BATTLE");
    expect(battleReport).toBeTruthy();
    expect(battleReport.poiName).toBe("Ashen Camp");
  });

  it("runs a resource gather flow and blocks a second march on the same node", async () => {
    const app = createApp();
    const gatherer = request.agent(app);

    await gatherer.post("/api/auth/register").send({
      username: "gather_one",
      password: "passphrase1",
    });

    const initialState = await gatherer.get("/api/game/state");
    expect(initialState.status).toBe(200);

    const node = await movePoiNearCity({
      cityId: initialState.body.city.cityId,
      x: initialState.body.city.coordinates.x,
      y: initialState.body.city.coordinates.y,
      kind: "RESOURCE_NODE",
      label: "Timber Run",
      level: 1,
      resourceType: "WOOD",
      remainingAmount: 800,
      maxAmount: 800,
    });

    const chunkResponse = await gatherer.get(
      `/api/game/world/chunk?centerX=${initialState.body.city.coordinates.x}&centerY=${initialState.body.city.coordinates.y}&radius=8`,
    );
    expect(chunkResponse.status).toBe(200);
    expect(chunkResponse.body.pois.some((poi: { id: string; canGather: boolean }) => poi.id === node.id && poi.canGather)).toBe(true);

    const marchResponse = await gatherer.post("/api/game/marches").send({
      objective: "RESOURCE_GATHER",
      targetPoiId: node.id,
      commanderId: initialState.body.city.commanders[0].id,
      troops: {
        INFANTRY: 18,
        ARCHER: 12,
        CAVALRY: 8,
      },
    });
    expect(marchResponse.status).toBe(202);

    const duplicateResponse = await gatherer.post("/api/game/marches").send({
      objective: "RESOURCE_GATHER",
      targetPoiId: node.id,
      commanderId: initialState.body.city.commanders[0].id,
      troops: {
        INFANTRY: 4,
        ARCHER: 4,
        CAVALRY: 2,
      },
    });
    expect(duplicateResponse.status).toBe(409);

    await prisma.march.update({
      where: { id: marchResponse.body.march.id },
      data: {
        etaAt: new Date(Date.now() - 5_000),
      },
    });

    const gatheringState = await gatherer.get("/api/game/state");
    expect(gatheringState.status).toBe(200);
    expect(gatheringState.body.city.activeMarches[0].state).toBe("GATHERING");

    await prisma.march.update({
      where: { id: marchResponse.body.march.id },
      data: {
        etaAt: new Date(Date.now() - 5_000),
      },
    });

    const returningState = await gatherer.get("/api/game/state");
    expect(returningState.status).toBe(200);
    expect(returningState.body.city.activeMarches[0].state).toBe("RETURNING");

    await prisma.march.update({
      where: { id: marchResponse.body.march.id },
      data: {
        returnEtaAt: new Date(Date.now() - 5_000),
      },
    });

    const finalState = await gatherer.get("/api/game/state");
    expect(finalState.status).toBe(200);
    expect(finalState.body.city.activeMarches).toHaveLength(0);
    expect(finalState.body.city.resources.wood).toBeGreaterThan(initialState.body.city.resources.wood);

    const reportsResponse = await gatherer.get("/api/game/reports");
    expect(reportsResponse.status).toBe(200);
    const gatherReport = reportsResponse.body.reports.find((report: { kind: string; amount?: number }) => report.kind === "RESOURCE_GATHER");
    expect(gatherReport).toBeTruthy();
    expect(gatherReport.amount).toBeGreaterThan(0);

    const refreshedChunk = await gatherer.get(
      `/api/game/world/chunk?centerX=${initialState.body.city.coordinates.x}&centerY=${initialState.body.city.coordinates.y}&radius=8`,
    );
    const refreshedNode = refreshedChunk.body.pois.find((poi: { id: string }) => poi.id === node.id);
    expect(refreshedNode).toBeTruthy();
    expect(refreshedNode.remainingAmount).toBeLessThan(800);
  });

  it("creates an alliance, joins it, chats, and responds to help", async () => {
    const app = createApp();
    const leader = request.agent(app);
    const ally = request.agent(app);

    await leader.post("/api/auth/register").send({
      username: "leader_one",
      password: "passphrase1",
    });
    await ally.post("/api/auth/register").send({
      username: "ally_one",
      password: "passphrase1",
    });

    const createResponse = await leader.post("/api/game/alliances").send({
      name: "Iron League",
      tag: "IRON",
      description: "Queue help and short-range coordination.",
    });
    expect(createResponse.status).toBe(201);
    expect(createResponse.body.alliance.role).toBe("LEADER");

    const allianceState = await leader.get("/api/game/alliance");
    expect(allianceState.status).toBe(200);
    expect(allianceState.body.alliance.memberCount).toBe(1);

    const joinResponse = await ally.post(`/api/game/alliances/${createResponse.body.alliance.id}/join`);
    expect(joinResponse.status).toBe(200);
    expect(joinResponse.body.alliance.memberCount).toBe(2);
    const allyMember = joinResponse.body.alliance.members.find((member: { username: string }) => member.username === "ally_one");
    expect(allyMember).toBeTruthy();

    const donateResponse = await leader.post("/api/game/alliance/donate").send({
      wood: 120,
      stone: 0,
      food: 0,
      gold: 0,
    });
    expect(donateResponse.status).toBe(200);
    expect(donateResponse.body.alliance.treasury.wood).toBe(120);

    const promoteResponse = await leader.post(`/api/game/alliances/members/${allyMember!.userId}/role`).send({
      role: "OFFICER",
    });
    expect(promoteResponse.status).toBe(200);
    expect(promoteResponse.body.alliance.members.some((member: { role: string; username: string }) => member.username === "ally_one" && member.role === "OFFICER")).toBe(true);

    const chatResponse = await leader.post("/api/game/alliance/chat").send({
      content: "Need help on the next construction order.",
    });
    expect(chatResponse.status).toBe(200);
    expect(chatResponse.body.alliance.chatMessages[0].content).toContain("Need help");

    await leader.post("/api/game/buildings/FARM/upgrade");
    const helpRequestResponse = await leader.post("/api/game/alliance-help").send({
      kind: "BUILDING_UPGRADE",
    });
    expect(helpRequestResponse.status).toBe(200);
    expect(helpRequestResponse.body.alliance.helpRequests).toHaveLength(1);

    const helpId = helpRequestResponse.body.alliance.helpRequests[0].id;
    const helpResponse = await ally.post(`/api/game/alliance-help/${helpId}/respond`);
    expect(helpResponse.status).toBe(200);
    expect(helpResponse.body.alliance.helpRequests[0].helpCount).toBe(1);

    const leaveResponse = await ally.post("/api/game/alliances/leave");
    expect(leaveResponse.status).toBe(200);
  });

  it("shares alliance vision when querying a chunk around an allied city", async () => {
    const app = createApp();
    const leader = request.agent(app);
    const scout = request.agent(app);

    await leader.post("/api/auth/register").send({
      username: "vision_leader",
      password: "passphrase1",
    });
    await scout.post("/api/auth/register").send({
      username: "vision_scout",
      password: "passphrase1",
    });

    const leaderState = await leader.get("/api/game/state");
    const scoutState = await scout.get("/api/game/state");

    const createResponse = await leader.post("/api/game/alliances").send({
      name: "Sightbound",
      tag: "SIGHT",
      description: "Alliance vision test.",
    });
    expect(createResponse.status).toBe(201);

    const joinResponse = await scout.post(`/api/game/alliances/${createResponse.body.alliance.id}/join`);
    expect(joinResponse.status).toBe(200);

    const sharedNode = await movePoiNearCity({
      cityId: scoutState.body.city.cityId,
      x: scoutState.body.city.coordinates.x,
      y: scoutState.body.city.coordinates.y,
      kind: "RESOURCE_NODE",
      label: "Alliance Quarry",
      level: 1,
      resourceType: "STONE",
      remainingAmount: 800,
      maxAmount: 800,
    });

    const chunkResponse = await leader.get(
      `/api/game/world/chunk?centerX=${scoutState.body.city.coordinates.x}&centerY=${scoutState.body.city.coordinates.y}&radius=6`,
    );
    expect(chunkResponse.status).toBe(200);
    expect(chunkResponse.body.cities.some((city: { cityId: string }) => city.cityId === scoutState.body.city.cityId)).toBe(true);
    expect(chunkResponse.body.pois.some((poi: { id: string }) => poi.id === sharedNode.id)).toBe(true);
    expect(chunkResponse.body.center.x).toBe(scoutState.body.city.coordinates.x);
    expect(chunkResponse.body.center.y).toBe(scoutState.body.city.coordinates.y);
    expect(leaderState.status).toBe(200);
  });

  it("accepts analytics events and exposes ops metrics", async () => {
    resetMetrics();

    const app = createApp();
    const agent = request.agent(app);

    await agent.post("/api/auth/register").send({
      username: "ops_probe",
      password: "passphrase1",
    });

    const analyticsResponse = await agent.post("/api/game/analytics").send({
      event: "first_march",
      metadata: {
        objective: "CITY_ATTACK",
        count: 1,
        tutorial: true,
      },
    });

    expect(analyticsResponse.status).toBe(202);

    const metricsResponse = await request(app).get("/api/ops/metrics");
    expect(metricsResponse.status).toBe(200);
    expect(metricsResponse.body.realtime.mode).toBe("in_memory");
    expect(metricsResponse.body.storeValidation.mode).toBe("noop");
    expect(
      metricsResponse.body.metrics.counters.some(
        (metric: { name: string; tags: { event?: string } }) =>
          metric.name === "product_analytics_events_total" && metric.tags.event === "first_march",
      ),
    ).toBe(true);
  });
});
