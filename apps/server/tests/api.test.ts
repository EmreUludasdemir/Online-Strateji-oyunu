import request from "supertest";
import { describe, expect, it } from "vitest";

import { createApp } from "../src/app";

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

  it("runs the main game flow with upgrades, attacks, and reports", async () => {
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
    expect(stateResponse.body.city.buildings).toHaveLength(5);

    const upgradeResponse = await attacker.post("/api/game/buildings/FARM/upgrade");
    expect(upgradeResponse.status).toBe(200);
    expect(upgradeResponse.body.city.activeUpgrade.buildingType).toBe("FARM");

    const secondUpgradeResponse = await attacker.post("/api/game/buildings/QUARRY/upgrade");
    expect(secondUpgradeResponse.status).toBe(409);

    const mapResponse = await attacker.get("/api/game/map");
    expect(mapResponse.status).toBe(200);
    const targetCity = mapResponse.body.cities.find(
      (city: { isCurrentPlayer: boolean; canAttack: boolean; cityId: string }) =>
        !city.isCurrentPlayer && city.canAttack,
    );

    expect(targetCity).toBeTruthy();

    const attackResponse = await attacker.post("/api/game/attacks").send({
      targetCityId: targetCity.cityId,
    });
    expect(attackResponse.status).toBe(200);
    expect(attackResponse.body.report.id).toBeTruthy();

    const reportsResponse = await attacker.get("/api/game/reports");
    expect(reportsResponse.status).toBe(200);
    expect(reportsResponse.body.reports).toHaveLength(1);
  });
});
