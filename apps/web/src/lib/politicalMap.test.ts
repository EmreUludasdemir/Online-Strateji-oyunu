import { describe, expect, it } from "vitest";

import {
  applyExpansionActionMock,
  buildProvinceIntel,
  getAllRealmDiplomacy,
  getAvailableExpansionActions,
  getAvailableProvinceActions,
  getBorderTension,
  getContestingRealms,
  getClaimProgress,
  getExpansionAdvisorMessage,
  getExpansionDifficulty,
  getInfluenceProgress,
  getInitialProvinceControlState,
  getProvinceClaims,
  getProvinceControlStatus,
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
    expect(getAvailableExpansionActions(province).find((entry) => entry.action === "PREPARE_RAID")?.enabled).toBe(false);
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

  it("derives initial province control state with progress values", () => {
    const province = buildProvinceIntel({
      x: 32,
      y: 49,
      worldSize: 64,
      region: hostileRegion,
      fogState: "VISIBLE",
      pois: [],
    });
    const control = getInitialProvinceControlState(province);

    expect(control.ownerRealmId).toBe("selcuk-ucu");
    expect(control.controllerRealmId).toBe("selcuk-ucu");
    expect(getClaimProgress(control)).toBeGreaterThanOrEqual(0);
    expect(getInfluenceProgress(control)).toBeGreaterThanOrEqual(0);
    expect(getProvinceControlStatus(province, control)).toBe(control.controlStatus);
  });

  it("calculates available expansion actions from relation, claim, and control state", () => {
    const province = buildProvinceIntel({
      x: 32,
      y: 49,
      worldSize: 64,
      region: hostileRegion,
      fogState: "VISIBLE",
      pois: [],
    });
    const control = getInitialProvinceControlState(province);
    const actions = getAvailableExpansionActions(province, control);

    expect(actions.some((entry) => entry.action === "ESTABLISH_INFLUENCE")).toBe(true);
    expect(actions.some((entry) => entry.action === "CLAIM_PROVINCE")).toBe(true);
    expect(actions.some((entry) => entry.recommended)).toBe(true);
  });

  it("mock expansion actions increase influence and record claim progress", () => {
    const province = buildProvinceIntel({
      x: 32,
      y: 49,
      worldSize: 64,
      region: hostileRegion,
      fogState: "VISIBLE",
      pois: [],
    });
    const initial = getInitialProvinceControlState(province);
    const influenced = applyExpansionActionMock(province, initial, "ESTABLISH_INFLUENCE", new Date("2026-01-01T00:00:00.000Z"));
    const claimed = applyExpansionActionMock(province, influenced.nextState, "CLAIM_PROVINCE", new Date("2026-01-01T00:01:00.000Z"));

    expect(getInfluenceProgress(influenced.nextState)).toBeGreaterThan(getInfluenceProgress(initial));
    expect(getClaimProgress(claimed.nextState)).toBeGreaterThan(getClaimProgress(influenced.nextState));
    expect(["claimed", "contested", "influenced"]).toContain(claimed.nextState.controlStatus);
    expect(claimed.message.length).toBeGreaterThan(0);
  });

  it("mock raid flow can move a weak province toward occupation", () => {
    const province = buildProvinceIntel({
      x: 40,
      y: 42,
      worldSize: 64,
      region: hostileRegion,
      fogState: "VISIBLE",
      pois: [],
    });
    const initial = {
      ...getInitialProvinceControlState(province),
      resistance: 28,
      playerClaimStrength: 70,
      influenceByRealm: {
        [province.realm.id]: 44,
        player: 62,
      },
    };
    const prepared = applyExpansionActionMock(province, initial, "PREPARE_RAID", new Date("2026-01-01T00:00:00.000Z"));
    const raided = applyExpansionActionMock(province, prepared.nextState, "LAUNCH_RAID", new Date("2026-01-01T00:01:00.000Z"));

    expect(prepared.nextState.raidPrepared).toBe(true);
    expect(raided.nextState.controllerRealmId).toBe("player");
    expect(["occupied", "controlled"]).toContain(raided.nextState.controlStatus);
  });

  it("reports expansion difficulty and advisor guidance", () => {
    const province = buildProvinceIntel({
      x: 32,
      y: 49,
      worldSize: 64,
      region: hostileRegion,
      fogState: "VISIBLE",
      pois: [],
    });
    const control = getInitialProvinceControlState(province);

    expect(getExpansionDifficulty(province, control)).toBeGreaterThan(0);
    expect(getExpansionAdvisorMessage(province, control).length).toBeGreaterThan(12);
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
