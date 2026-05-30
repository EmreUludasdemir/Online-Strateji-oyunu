import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";

import { createApp } from "../src/app";
import {
  getCountryIncome,
  getCountryManpowerGrowth,
  getProvinceIncome,
  validateWarDeclaration,
} from "../src/grand/engine";
import { seedGrandStrategy } from "../src/grand/seed";
import { claimProvince, declareWar, getGrandState, runWorldTick } from "../src/grand/service";
import { prisma } from "../src/lib/prisma";

async function registerAgent() {
  const app = createApp();
  const agent = request.agent(app);
  await agent
    .post("/api/auth/register")
    .send({ username: `grand_${Math.random().toString(36).slice(2, 10)}`, password: "grand12345" });
  return { app, agent };
}

describe("grand-strategy engine (pure)", () => {
  it("computes province income from base tax and development", () => {
    expect(getProvinceIncome({ baseTax: 4, development: 2 })).toBe(6); // 4 * (1 + 2*0.25)
    expect(getProvinceIncome({ baseTax: 2, development: 1 })).toBe(2.5);
  });

  it("sums country income across provinces", () => {
    const income = getCountryIncome([
      { baseTax: 4, development: 2 },
      { baseTax: 2, development: 1 },
    ]);
    expect(income).toBe(8.5);
  });

  it("caps manpower growth at the country ceiling", () => {
    const provinces = [{ baseManpower: 1000, development: 0 }];
    // 1000 * 0.05 * (1 + 0) = 50 per tick
    expect(getCountryManpowerGrowth(provinces, 0, 100000)).toBe(50);
    // Only 10 headroom left -> clamps to 10.
    expect(getCountryManpowerGrowth(provinces, 99990, 100000)).toBe(10);
    expect(getCountryManpowerGrowth(provinces, 100000, 100000)).toBe(0);
  });

  it("rejects self-war and duplicate wars", () => {
    expect(validateWarDeclaration({ attackerId: "a", defenderId: "a", activeWarPairs: [] }).ok).toBe(false);
    expect(
      validateWarDeclaration({
        attackerId: "a",
        defenderId: "b",
        activeWarPairs: [{ attackerId: "b", defenderId: "a" }],
      }).ok,
    ).toBe(false);
    expect(validateWarDeclaration({ attackerId: "a", defenderId: "b", activeWarPairs: [] }).ok).toBe(true);
  });
});

describe("grand-strategy services (db)", () => {
  beforeEach(async () => {
    await seedGrandStrategy();
  });

  it("seeds 3 countries and 30 owned provinces", async () => {
    const state = await getGrandState();
    expect(state.countries).toHaveLength(3);
    expect(state.provinces).toHaveLength(30);
    expect(state.provinces.every((province) => province.ownerCountryId !== null)).toBe(true);
    // Each country owns exactly 10 provinces.
    for (const country of state.countries) {
      expect(country.provinceCount).toBe(10);
    }
  });

  it("transfers province ownership on claim", async () => {
    const before = await getGrandState();
    const province = before.provinces[0];
    const newOwner = before.countries.find((country) => country.id !== province.ownerCountryId)!;

    await claimProvince(newOwner.id, province.id);

    const after = await getGrandState();
    const claimed = after.provinces.find((entry) => entry.id === province.id)!;
    expect(claimed.ownerCountryId).toBe(newOwner.id);
    expect(after.countries.find((c) => c.id === newOwner.id)!.provinceCount).toBe(11);
  });

  it("grows treasury and manpower on a world tick", async () => {
    const before = await getGrandState();
    const target = before.countries[0];

    const result = await runWorldTick();
    expect(result.tickNumber).toBe(1);

    const after = await getGrandState();
    const tickedCountry = after.countries.find((c) => c.id === target.id)!;
    const gain = result.countries.find((c) => c.id === target.id)!;

    expect(gain.incomeGained).toBeGreaterThan(0);
    expect(tickedCountry.treasury).toBeCloseTo(target.treasury + gain.incomeGained, 2);
    expect(after.lastTick?.tickNumber).toBe(1);

    // Tick numbers increment monotonically.
    const second = await runWorldTick();
    expect(second.tickNumber).toBe(2);
  });

  it("declares war and sets relations, rejecting duplicates", async () => {
    const state = await getGrandState();
    const [attacker, defender] = state.countries;

    const war = await declareWar(attacker.id, defender.id);
    expect(war.status).toBe("ACTIVE");

    const after = await getGrandState();
    expect(after.wars).toHaveLength(1);
    const relation = after.relations.find(
      (entry) => entry.fromCountryId === attacker.id && entry.toCountryId === defender.id,
    );
    expect(relation?.kind).toBe("WAR");

    await expect(declareWar(attacker.id, defender.id)).rejects.toThrow();
    await expect(declareWar(attacker.id, attacker.id)).rejects.toThrow();
  });
});

describe("grand-strategy API", () => {
  beforeEach(async () => {
    await seedGrandStrategy();
  });

  it("requires authentication", async () => {
    const app = createApp();
    const response = await request(app).get("/api/grand/state");
    expect(response.status).toBe(401);
  });

  it("returns world state and processes a tick for an authed player", async () => {
    const { agent } = await registerAgent();

    const stateResponse = await agent.get("/api/grand/state");
    expect(stateResponse.status).toBe(200);
    expect(stateResponse.body.countries).toHaveLength(3);

    const tickResponse = await agent.post("/api/grand/tick");
    expect(tickResponse.status).toBe(200);
    expect(tickResponse.body.tickNumber).toBe(1);

    const [attacker, defender] = stateResponse.body.countries;
    const warResponse = await agent
      .post("/api/grand/wars/declare")
      .send({ attackerId: attacker.id, defenderId: defender.id });
    expect(warResponse.status).toBe(201);
    expect(warResponse.body.status).toBe("ACTIVE");
  });

  it("claims a province through the API", async () => {
    const { agent } = await registerAgent();
    const stateResponse = await agent.get("/api/grand/state");
    const province = stateResponse.body.provinces[0];
    const newOwner = stateResponse.body.countries.find(
      (country: { id: string }) => country.id !== province.ownerCountryId,
    );

    const claimResponse = await agent
      .post(`/api/grand/countries/${newOwner.id}/claim`)
      .send({ provinceId: province.id });

    expect(claimResponse.status).toBe(200);
    expect(claimResponse.body.countryId).toBe(newOwner.id);

    const ownership = await prisma.provinceOwnership.findUnique({ where: { provinceId: province.id } });
    expect(ownership?.countryId).toBe(newOwner.id);
  });
});
