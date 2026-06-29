import { describe, expect, it } from "vitest";

import {
  buildProvinceIntel,
  getAllRealmDiplomacy,
  getAvailableProvinceActions,
  getBorderTension,
  getContestingRealms,
  getProvinceClaims,
  getProvinceRiskLevel,
  getProvinceStrategicValue,
  getRealmIdentity,
} from "./politicalMap";
import type { WorldRegion } from "../components/worldRegions";

const hostileRegion: WorldRegion = {
  id: "selcuk-ucu",
  label: "Selçuk Ucu",
  shortLabel: "SEL",
  x0: 32,
  y0: 32,
  x1: 63,
  y1: 63,
  anchorX: 48,
  anchorY: 48,
  capitalX: 48,
  capitalY: 48,
  color: "#d47b5a",
  borderColor: "#ffd9c8",
  fill: 0x663625,
};

const friendlyRegion: WorldRegion = {
  ...hostileRegion,
  id: "kok-tore",
  label: "Kök Töre",
  shortLabel: "KOK",
};

const unknownRegion: WorldRegion = {
  ...hostileRegion,
  id: "avar-siniri",
  label: "Avar Siniri",
  shortLabel: "AVR",
};

describe("political map helpers", () => {
  it("maps deterministic regions to realm identity", () => {
    const realm = getRealmIdentity(hostileRegion);

    expect(realm.name).toBe("Selçuk Ucu");
    expect(realm.shortTag).toBe("SEL");
    expect(realm.relation).toBe("hostile");
    expect(realm.primaryColor).toBe(hostileRegion.color);
  });

  it("raises risk for hostile provinces with nearby camps", () => {
    const province = buildProvinceIntel({
      x: 47,
      y: 49,
      worldSize: 64,
      region: hostileRegion,
      fogState: "VISIBLE",
      pois: [
        {
          id: "camp-1",
          kind: "BARBARIAN_CAMP",
          state: "ACTIVE",
          label: "Camp",
          level: 5,
          x: 48,
          y: 49,
          fogState: "VISIBLE",
          distance: 2,
          resourceType: null,
          remainingAmount: null,
          maxAmount: null,
          respawnsAt: null,
          occupantMarchId: null,
          canSendMarch: true,
          canGather: false,
          battleWindowClosesAt: null,
          stagedMarchCount: 0,
          battleWindow: null,
          projectedOutcome: null,
          projectedLoad: null,
        },
      ],
    });

    expect(["dangerous", "deadly"]).toContain(province.riskLevel);
    expect(province.status).toBe("contested");
    expect(province.availableActions).toContain("RAID");
    expect(province.availableActions).toContain("CLAIM");
  });

  it("keeps friendly provinces supportive and trade-capable", () => {
    const province = buildProvinceIntel({
      x: 10,
      y: 12,
      worldSize: 64,
      region: friendlyRegion,
      fogState: "VISIBLE",
      pois: [],
    });

    expect(province.status).toBe("friendly");
    expect(province.availableActions).toContain("SUPPORT");
    expect(province.availableActions).toContain("TRADE");
  });

  it("builds realm diplomacy with relations, influence, and treaties", () => {
    const diplomacy = getAllRealmDiplomacy([friendlyRegion], 64)[0];

    expect(diplomacy.realm.shortTag).toBe("KOK");
    expect(diplomacy.relation).toBe("friendly");
    expect(diplomacy.influence).not.toBe("none");
    expect(diplomacy.activeTreaties.some((treaty) => treaty.type === "PASSAGE")).toBe(true);
    expect(diplomacy.recommendedAction).toBe("REQUEST_PASSAGE");
  });

  it("adds claims and border tension around contested frontier provinces", () => {
    const claims = getProvinceClaims({
      x: 32,
      y: 49,
      worldSize: 64,
      region: hostileRegion,
    });
    const contestingRealms = getContestingRealms({
      x: 32,
      y: 49,
      worldSize: 64,
      region: hostileRegion,
      claims,
    });
    const tension = getBorderTension({
      x: 32,
      y: 49,
      worldSize: 64,
      region: hostileRegion,
      claims,
    });

    expect(claims.length).toBeGreaterThan(0);
    expect(contestingRealms.length).toBeGreaterThan(0);
    expect(["medium", "high", "critical"]).toContain(tension.level);
    expect(tension.involvedRealmIds.length).toBeGreaterThan(0);
  });

  it("offers scout actions for unknown realms", () => {
    const province = buildProvinceIntel({
      x: 48,
      y: 49,
      worldSize: 64,
      region: unknownRegion,
      fogState: "VISIBLE",
      pois: [],
    });
    const scoutAction = province.availableDiplomaticActions.find((entry) => entry.action === "SCOUT_REALM");

    expect(province.diplomacy.relation).toBe("unknown");
    expect(province.diplomaticRisk).toBe("unknown");
    expect(scoutAction?.enabled).toBe(true);
  });

  it("marks hidden provinces as unknown and scoutable", () => {
    const risk = getProvinceRiskLevel("neutral", 0, "HIDDEN");
    const actions = getAvailableProvinceActions({
      status: "unknown",
      riskLevel: risk,
      realm: getRealmIdentity(friendlyRegion),
    });

    expect(risk).toBe("unknown");
    expect(actions).toContain("SCOUT");
    expect(actions).not.toContain("MARCH");
  });

  it("increases strategic value around passes and sanctuaries", () => {
    const plain = getProvinceStrategicValue(4, 4, 64, []);
    const central = getProvinceStrategicValue(32, 32, 64, []);

    expect(central).toBeGreaterThan(plain);
  });
});
