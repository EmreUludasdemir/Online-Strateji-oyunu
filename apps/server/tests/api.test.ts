import request from "supertest";
import { describe, expect, it } from "vitest";

import { createApp } from "../src/app";
import { prisma } from "../src/lib/prisma";

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

  it("runs the kingdom core flow with queues, march resolve, and reports", async () => {
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

    const reportsResponse = await attacker.get("/api/game/reports");
    expect(reportsResponse.status).toBe(200);
    expect(reportsResponse.body.reports).toHaveLength(1);
    expect(reportsResponse.body.reports[0].attackerLosses).toBeTruthy();

    const compatibilityAttackResponse = await attacker.post("/api/game/attacks").send({
      targetCityId: targetCity.cityId,
    });
    expect(compatibilityAttackResponse.status).toBe(202);
    expect(compatibilityAttackResponse.body.march.id).toBeTruthy();
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
});
