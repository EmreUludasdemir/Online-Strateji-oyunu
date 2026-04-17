import { Prisma } from "@prisma/client";
import {
  BUILDING_TYPES,
  BUILDING_DESCRIPTIONS,
  BUILDING_LABELS,
  COMMANDER_TALENT_LABELS,
  POI_KIND_LABELS,
  POI_RESOURCE_LABELS,
  RESEARCH_TYPES,
  RESEARCH_DESCRIPTIONS,
  RESEARCH_LABELS,
  TROOP_LABELS,
  TROOP_TYPES,
  type CargoView,
  type AllianceHelpRequestView,
  type AllianceListItemView,
  type AllianceContributionView,
  type AllianceDonationView,
  type AllianceLogEntryView,
  type AllianceMarkerView,
  type AllianceSummaryView,
  type AllianceView,
  type AuthUser,
  type BattleWindowParticipantView,
  type BattleWindowView,
  type BattleReportsResponse,
  type BuildingType,
  type BuildingView,
  type CityState,
  type CommanderView,
  type MapCity,
  type PoiView,
  type PoiResourceType,
  type RallyView,
  type ReportEntryView,
  type ResearchType,
  type ResearchView,
  type ResourceKey,
  type ResourceStock,
  type TrainingQueueView,
  type TroopStock,
  type TroopType,
} from "@frontier/shared";

import { HttpError } from "../lib/http";
import {
  defaultCommanderBonuses,
  getAttackPower,
  getBuildingLevels,
  getCarryCapacity,
  getDefensePower,
  getHospitalHealingCapacity,
  getMarchPosition,
  getResearchCost,
  getResearchDurationMs,
  getResearchLevels,
  getTrainingDurationMs,
  getTroopDefensePower,
  getTroopTrainingCost,
  getUpgradeCost,
  getUpgradeDurationMs,
  getVisionRadius,
  toDisplayResources,
  type CommanderBonuses,
} from "./engine";
import {
  BARBARIAN_CAMP_REWARDS,
  BARBARIAN_CAMP_TROOPS,
  ALLIANCE_CHAT_HISTORY_LIMIT,
  MAX_MARCH_DISTANCE,
  STARTING_BUILDING_LEVEL,
  RESEARCH_MAX_LEVEL,
  RESOURCE_TYPE_TO_KEY,
  STARTING_TROOPS,
  TROOP_ATTACK,
  TROOP_CARRY,
  TROOP_DEFENSE,
  TROOP_SPEED,
} from "./constants";
import { buildCommanderPresetLabel, COMMANDER_TEMPLATES } from "./content";

export const battleWindowInclude = Prisma.validator<Prisma.BattleWindowInclude>()({
  targetCity: true,
  targetPoi: true,
  marches: {
    where: {
      state: "STAGING",
    },
    include: {
      commander: true,
      ownerUser: {
        include: {
          allianceMembership: {
            include: {
              alliance: {
                select: {
                  tag: true,
                },
              },
            },
          },
        },
      },
    },
    orderBy: [{ etaAt: "asc" }, { startsAt: "asc" }],
  },
});

export const cityStateInclude = Prisma.validator<Prisma.CityInclude>()({
  owner: {
    include: {
      allianceMembership: {
        include: {
          alliance: {
            include: {
              members: {
                select: {
                  userId: true,
                  role: true,
                },
              },
            },
          },
        },
      },
      commanders: {
        orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
      },
    },
  },
  buildings: true,
  upgrades: {
    where: {
      status: "ACTIVE",
    },
    orderBy: {
      completesAt: "asc",
    },
  },
  troopGarrisons: true,
  trainingQueues: {
    where: {
      status: "ACTIVE",
    },
    orderBy: {
      completesAt: "asc",
    },
  },
  researchLevels: true,
  researchQueues: {
    where: {
      status: "ACTIVE",
    },
    orderBy: {
      completesAt: "asc",
    },
  },
  outgoingMarches: {
    where: {
      state: {
        in: ["ENROUTE", "STAGING", "GATHERING", "RETURNING"],
      },
    },
    include: {
      commander: true,
      ownerUser: {
        include: {
          allianceMembership: {
            include: {
              alliance: {
                select: {
                  tag: true,
                },
              },
            },
          },
        },
      },
      targetCity: {
        include: {
          owner: true,
        },
      },
      targetPoi: true,
      battleWindow: true,
    },
    orderBy: {
      etaAt: "asc",
    },
  },
});

export const mapCityInclude = Prisma.validator<Prisma.CityInclude>()({
  owner: {
    include: {
      commanders: {
        orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
      },
    },
  },
  buildings: true,
  troopGarrisons: true,
  researchLevels: true,
  battleWindows: {
    where: {
      resolvedAt: null,
    },
    orderBy: {
      closesAt: "asc",
    },
    take: 1,
    include: battleWindowInclude,
  },
});

export const battleReportInclude = Prisma.validator<Prisma.BattleReportInclude>()({
  attackerUser: true,
  defenderUser: true,
  attackerCity: true,
  defenderCity: true,
});

export const marchReportInclude = Prisma.validator<Prisma.MarchReportInclude>()({
  ownerUser: true,
  ownerCity: true,
  poi: true,
});

export const mapPoiInclude = Prisma.validator<Prisma.MapPoiInclude>()({
  targetMarches: {
    where: {
      state: {
        in: ["ENROUTE", "STAGING", "GATHERING"],
      },
    },
    select: {
      id: true,
      state: true,
      objective: true,
    },
    take: 8,
  },
  battleWindows: {
    where: {
      resolvedAt: null,
    },
    orderBy: {
      closesAt: "asc",
    },
    take: 1,
    include: battleWindowInclude,
  },
});

export const rallyInclude = Prisma.validator<Prisma.RallyInclude>()({
  leaderUser: true,
  commander: true,
  targetCity: true,
  targetPoi: true,
  members: {
    include: {
      user: true,
    },
    orderBy: {
      joinedAt: "asc",
    },
  },
});

export const allianceStateInclude = Prisma.validator<Prisma.AllianceInclude>()({
  members: {
    include: {
      user: {
        include: {
          city: {
            select: {
              name: true,
            },
          },
        },
      },
    },
    orderBy: [{ role: "asc" }, { createdAt: "asc" }],
  },
  announcement: true,
  markers: {
    orderBy: {
      createdAt: "desc",
    },
    take: 12,
  },
  logs: {
    orderBy: {
      createdAt: "desc",
    },
    take: 50,
  },
  contributions: {
    include: {
      user: true,
    },
    orderBy: [{ points: "desc" }, { userId: "asc" }],
    take: 12,
  },
  donations: {
    include: {
      user: true,
    },
    orderBy: {
      createdAt: "desc",
    },
    take: 12,
  },
  chatMessages: {
    include: {
      user: true,
    },
    orderBy: {
      createdAt: "desc",
    },
    take: 20,
  },
  helpRequests: {
    where: {
      isOpen: true,
    },
    include: {
      requesterUser: true,
      responses: true,
    },
    orderBy: {
      createdAt: "desc",
    },
    take: 12,
  },
});

export type CityStateRecord = Prisma.CityGetPayload<{ include: typeof cityStateInclude }>;
export type MapCityRecord = Prisma.CityGetPayload<{ include: typeof mapCityInclude }>;
export type BattleReportRecord = Prisma.BattleReportGetPayload<{ include: typeof battleReportInclude }>;
export type MarchReportRecord = Prisma.MarchReportGetPayload<{ include: typeof marchReportInclude }>;
export type AllianceStateRecord = Prisma.AllianceGetPayload<{ include: typeof allianceStateInclude }>;
export type MapPoiRecord = Prisma.MapPoiGetPayload<{ include: typeof mapPoiInclude }>;
export type BattleWindowRecord = Prisma.BattleWindowGetPayload<{ include: typeof battleWindowInclude }>;
export type RallyRecord = Prisma.RallyGetPayload<{ include: typeof rallyInclude }>;

export function getResourceLedger(city: {
  wood: number;
  stone: number;
  food: number;
  gold: number;
}): ResourceStock {
  return {
    wood: city.wood,
    stone: city.stone,
    food: city.food,
    gold: city.gold,
  };
}

export function getTroopLedger(
  troops: Array<{ troopType: TroopType | string; quantity: number }>,
): TroopStock {
  return TROOP_TYPES.reduce<TroopStock>((ledger, type) => {
    const row = troops.find((entry) => entry.troopType === type);
    ledger[type] = row?.quantity ?? 0;
    return ledger;
  }, {
    INFANTRY: 0,
    ARCHER: 0,
    CAVALRY: 0,
  });
}

export function getPoiResourceKey(resourceType: PoiResourceType): ResourceKey {
  return RESOURCE_TYPE_TO_KEY[resourceType];
}

export function getBarbarianCampTroops(level: number): TroopStock {
  return BARBARIAN_CAMP_TROOPS[Math.max(1, Math.min(3, level))];
}

export function getBarbarianCampReward(level: number): ResourceStock {
  return BARBARIAN_CAMP_REWARDS[Math.max(1, Math.min(3, level))];
}

export function getMarchTargetCoordinates(march: {
  targetCity: { x: number; y: number } | null;
  targetPoi: { x: number; y: number } | null;
}) {
  if (march.targetCity) {
    return { x: march.targetCity.x, y: march.targetCity.y };
  }

  if (march.targetPoi) {
    return { x: march.targetPoi.x, y: march.targetPoi.y };
  }

  throw new HttpError(500, "MARCH_TARGET_MISSING", "The march target is missing.");
}

export function resourceLedgerToCityUpdate(resources: ResourceStock, resourceUpdatedAt: Date) {
  return {
    wood: resources.wood,
    stone: resources.stone,
    food: resources.food,
    gold: resources.gold,
    resourceUpdatedAt,
  };
}

export function buildCityName(username: string): string {
  return `${username} Hold`;
}

export function toAuthUser(user: {
  id: string;
  username: string;
  city: { id: string; name: string } | null;
}): AuthUser {
  if (!user.city) {
    throw new HttpError(404, "CITY_NOT_FOUND", "This account does not have a city.");
  }

  return {
    id: user.id,
    username: user.username,
    cityId: user.city.id,
    cityName: user.city.name,
  };
}

export function toCommanderBonuses(
  commander:
    | {
        attackBonus: number;
        defenseBonus: number;
        marchSpeedBonus: number;
        carryBonus: number;
      }
    | null
    | undefined,
): CommanderBonuses {
  return commander
    ? {
        attackBonus: commander.attackBonus,
        defenseBonus: commander.defenseBonus,
        marchSpeedBonus: commander.marchSpeedBonus,
        carryBonus: commander.carryBonus,
      }
    : defaultCommanderBonuses();
}

export function getPrimaryCommander(city: CityStateRecord | MapCityRecord) {
  return city.owner.commanders.find((commander) => commander.isPrimary) ?? city.owner.commanders[0] ?? null;
}

export async function ensureCityInfrastructureTx(
  tx: Prisma.TransactionClient,
  options: { cityId: string; userId: string; username: string },
) {
  const city = await tx.city.findUnique({
    where: { id: options.cityId },
    include: {
      buildings: true,
      troopGarrisons: true,
      researchLevels: true,
      owner: {
        include: {
          commanders: true,
        },
      },
    },
  });

  if (!city) {
    throw new HttpError(404, "CITY_NOT_FOUND", "The requested city was not found.");
  }

  const existingBuildings = new Set(city.buildings.map((building) => building.buildingType));
  const missingBuildings = BUILDING_TYPES.filter((buildingType) => !existingBuildings.has(buildingType));
  if (missingBuildings.length > 0) {
    await tx.building.createMany({
      data: missingBuildings.map((buildingType) => ({
        cityId: city.id,
        buildingType,
        level: STARTING_BUILDING_LEVEL,
      })),
    });
  }

  const existingTroops = new Set(city.troopGarrisons.map((troop) => troop.troopType));
  const missingTroops = TROOP_TYPES.filter((troopType) => !existingTroops.has(troopType));
  if (missingTroops.length > 0) {
    await tx.troopGarrison.createMany({
      data: missingTroops.map((troopType) => ({
        cityId: city.id,
        troopType,
        quantity: STARTING_TROOPS[troopType],
      })),
    });
  }

  const existingResearch = new Set(city.researchLevels.map((research) => research.researchType));
  const missingResearch = RESEARCH_TYPES.filter((researchType) => !existingResearch.has(researchType));
  if (missingResearch.length > 0) {
    await tx.researchLevel.createMany({
      data: missingResearch.map((researchType) => ({
        cityId: city.id,
        researchType,
        level: 0,
      })),
    });
  }

  const existingCommanderTemplates = new Set(city.owner.commanders.map((commander) => commander.templateKey));
  for (const template of COMMANDER_TEMPLATES) {
    if (existingCommanderTemplates.has(template.key)) {
      continue;
    }

    await tx.commander.create({
      data: {
        userId: options.userId,
        name: template.isPrimary ? `${options.username} ${template.name}` : template.name,
        templateKey: template.key,
        level: 1,
        xp: 0,
        starLevel: 1,
        talentTrack: template.track,
        talentPointsSpent: 0,
        assignedPreset: buildCommanderPresetLabel(template.track),
        attackBonus: template.attackBonus,
        defenseBonus: template.defenseBonus,
        marchSpeedBonus: template.marchSpeedBonus,
        carryBonus: template.carryBonus,
        isPrimary: template.isPrimary ?? false,
      },
    });
  }
}

function mapCargoView(march: {
  cargoResourceType: PoiResourceType | null;
  cargoAmount: number;
}): CargoView {
  return {
    resourceType: march.cargoResourceType,
    amount: march.cargoAmount,
  };
}

function getMarchDisplayPosition(
  march: {
    state: CityState["activeMarches"][number]["state"];
    startsAt: Date;
    etaAt: Date;
    returnEtaAt: Date | null;
    battleWindow: { closesAt: Date } | null;
    targetCity: { x: number; y: number } | null;
    targetPoi: { x: number; y: number } | null;
  },
  origin: { x: number; y: number },
  now: Date,
) {
  const finalTarget = getMarchTargetCoordinates(march);

  if (march.state === "STAGING" || march.state === "GATHERING") {
    return finalTarget;
  }

  if (march.state === "RETURNING" && march.returnEtaAt) {
    return getMarchPosition(finalTarget, origin, march.etaAt, march.returnEtaAt, now);
  }

  return getMarchPosition(origin, finalTarget, march.startsAt, march.etaAt, now);
}

function getMarchRemainingSeconds(
  march: {
    state: CityState["activeMarches"][number]["state"];
    etaAt: Date;
    returnEtaAt: Date | null;
    battleWindow: { closesAt: Date } | null;
  },
  now: Date,
) {
  const deadline =
    march.state === "RETURNING"
      ? march.returnEtaAt ?? march.etaAt
      : march.state === "STAGING" && march.battleWindow
        ? march.battleWindow.closesAt
        : march.etaAt;
  return Math.max(0, Math.ceil((deadline.getTime() - now.getTime()) / 1000));
}

export function mapMarchView(
  march: CityStateRecord["outgoingMarches"][number],
  origin: { x: number; y: number },
  now: Date,
) {
  const launchOrigin = { x: march.originX, y: march.originY };
  const currentTarget = getMarchDisplayPosition(march, origin, now);
  const finalTarget = getMarchTargetCoordinates(march);

  return {
    id: march.id,
    objective: march.objective,
    state: march.state,
    battleWindowId: march.battleWindowId,
    battleWindowClosesAt: march.battleWindow?.closesAt.toISOString() ?? null,
    ownerUserId: march.ownerUserId,
    ownerName: march.ownerUser.username,
    ownerAllianceTag: march.ownerUser.allianceMembership?.alliance?.tag ?? null,
    targetCityId: march.targetCityId,
    targetCityName: march.targetCity?.name ?? null,
    targetPoiId: march.targetPoiId,
    targetPoiName: march.targetPoi?.label ?? null,
    commanderId: march.commanderId,
    commanderName: march.commander.name,
    troops: {
      INFANTRY: march.infantryCount,
      ARCHER: march.archerCount,
      CAVALRY: march.cavalryCount,
    },
    cargo: mapCargoView(march),
    startedAt: march.startsAt.toISOString(),
    etaAt: march.etaAt.toISOString(),
    gatherStartedAt: march.gatherStartedAt?.toISOString() ?? null,
    returnEtaAt: march.returnEtaAt?.toISOString() ?? null,
    remainingSeconds: getMarchRemainingSeconds(march, now),
    distance: Math.abs(finalTarget.x - launchOrigin.x) + Math.abs(finalTarget.y - launchOrigin.y),
    origin: launchOrigin,
    target: currentTarget,
    projectedOutcome:
      march.defenderPowerSnapshot == null
        ? null
        : march.attackerPowerSnapshot > march.defenderPowerSnapshot
          ? ("ATTACKER_WIN" as const)
          : ("DEFENDER_HOLD" as const),
  };
}

function mapBattleWindowParticipant(
  march: BattleWindowRecord["marches"][number],
): BattleWindowParticipantView {
  return {
    marchId: march.id,
    ownerUserId: march.ownerUserId,
    ownerName: march.ownerUser.username,
    ownerAllianceTag: march.ownerUser.allianceMembership?.alliance?.tag ?? null,
    commanderName: march.commander.name,
    troops: {
      INFANTRY: march.infantryCount,
      ARCHER: march.archerCount,
      CAVALRY: march.cavalryCount,
    },
    objective: march.objective,
    etaAt: march.etaAt.toISOString(),
  };
}

export function mapBattleWindowView(window: BattleWindowRecord | null, now: Date): BattleWindowView | null {
  if (!window) {
    return null;
  }

  const participants = window.marches.map(mapBattleWindowParticipant);
  const targetKind = window.targetPoiId ? "POI" : "CITY";
  const attackerLabel =
    window.objective === "RESOURCE_GATHER"
      ? "Gathering crews"
      : window.objective === "BARBARIAN_ATTACK"
        ? "Expedition force"
        : "Assault force";
  const defenderLabel =
    targetKind === "CITY"
      ? window.targetCity?.name ?? "Frontier City"
      : window.objective === "RESOURCE_GATHER"
        ? `${window.targetPoi?.label ?? "Resource Node"} claim`
        : window.targetPoi?.label ?? "Barbarian Camp";

  return {
    id: window.id,
    objective: window.objective,
    targetKind,
    targetCityId: window.targetCityId,
    targetPoiId: window.targetPoiId,
    label: window.targetCity?.name ?? window.targetPoi?.label ?? "Battle Window",
    attackerLabel,
    defenderLabel,
    closesAt: window.closesAt.toISOString(),
    remainingSeconds: Math.max(0, Math.ceil((window.closesAt.getTime() - now.getTime()) / 1000)),
    participantCount: participants.length,
    participants,
  };
}

export function mapCommanderViews(city: CityStateRecord): CommanderView[] {
  return city.owner.commanders.map((commander) => {
    const assignedSkills = Array.isArray(commander.assignedSkills) 
      ? (commander.assignedSkills as string[]) 
      : [];
    return {
      id: commander.id,
      name: commander.name,
      templateKey: commander.templateKey,
      level: commander.level,
      xp: commander.xp,
      xpToNextLevel: Math.max(0, 80 + Math.max(0, commander.level - 1) * 35 - commander.xp),
      starLevel: commander.starLevel,
      talentTrack: commander.talentTrack,
      talentPointsSpent: commander.talentPointsSpent,
      assignedSkills,
      assignedPreset: commander.assignedPreset,
      attackBonusPct: Math.round(commander.attackBonus * 100),
      defenseBonusPct: Math.round(commander.defenseBonus * 100),
      marchSpeedBonusPct: Math.round(commander.marchSpeedBonus * 100),
      carryBonusPct: Math.round(commander.carryBonus * 100),
      isPrimary: commander.isPrimary,
    };
  });
}

export function mapBuildingViews(city: CityStateRecord): BuildingView[] {
  const levels = getBuildingLevels(
    city.buildings.map((building) => ({
      buildingType: building.buildingType as BuildingType,
      level: building.level,
    })),
  );
  const researchLevels = getResearchLevels(
    city.researchLevels.map((r) => ({ researchType: r.researchType as ResearchType, level: r.level })),
  );

  const activeUpgrade = city.upgrades[0] ?? null;

  return BUILDING_TYPES.map((type) => {
    const currentLevel = levels[type];
    const nextLevel = currentLevel + 1;

    return {
      type,
      label: BUILDING_LABELS[type],
      description: BUILDING_DESCRIPTIONS[type],
      level: currentLevel,
      nextLevel,
      upgradeCost: getUpgradeCost(type, nextLevel),
      upgradeDurationSeconds: Math.floor(getUpgradeDurationMs(type, nextLevel, researchLevels) / 1000),
      isUpgradeActive: activeUpgrade?.buildingType === type,
    };
  });
}

export function mapTroopViews(city: CityStateRecord) {
  const barracksLevel =
    city.buildings.find((building) => building.buildingType === "BARRACKS")?.level ?? 1;
  const militaryDrillLevel =
    city.researchLevels.find((r) => r.researchType === "MILITARY_DRILL")?.level ?? 0;
  const troopLedger = getTroopLedger(
    city.troopGarrisons.map((entry) => ({
      troopType: entry.troopType as TroopType,
      quantity: entry.quantity,
    })),
  );

  return TROOP_TYPES.map((type) => ({
    type,
    label: TROOP_LABELS[type],
    quantity: troopLedger[type],
    attack: TROOP_ATTACK[type],
    defense: TROOP_DEFENSE[type],
    speed: TROOP_SPEED[type],
    carry: TROOP_CARRY[type],
    trainingCost: getTroopTrainingCost(type, 1),
    trainingDurationSeconds: Math.floor(getTrainingDurationMs(type, 1, barracksLevel, militaryDrillLevel) / 1000),
  }));
}

export function mapTrainingQueueView(city: CityStateRecord, now: Date): TrainingQueueView | null {
  const activeTraining = city.trainingQueues[0] ?? null;
  if (!activeTraining) {
    return null;
  }

  return {
    id: activeTraining.id,
    troopType: activeTraining.troopType as TroopType,
    quantity: activeTraining.quantity,
    startedAt: activeTraining.startedAt.toISOString(),
    completesAt: activeTraining.completesAt.toISOString(),
    remainingSeconds: Math.max(0, Math.ceil((activeTraining.completesAt.getTime() - now.getTime()) / 1000)),
    totalCost: getTroopTrainingCost(activeTraining.troopType as TroopType, activeTraining.quantity),
  };
}

export function mapResearchViews(city: CityStateRecord): ResearchView[] {
  const researchLevels = getResearchLevels(
    city.researchLevels.map((research) => ({
      researchType: research.researchType as ResearchType,
      level: research.level,
    })),
  );
  const academyLevel = city.buildings.find((b) => b.buildingType === "ACADEMY")?.level ?? 0;
  const activeResearch = city.researchQueues[0] ?? null;

  return RESEARCH_TYPES.map((type) => {
    const level = researchLevels[type];
    const nextLevel = Math.min(level + 1, RESEARCH_MAX_LEVEL);

    return {
      type,
      label: RESEARCH_LABELS[type],
      description: RESEARCH_DESCRIPTIONS[type],
      level,
      nextLevel,
      maxLevel: RESEARCH_MAX_LEVEL,
      startCost: getResearchCost(type, nextLevel),
      durationSeconds: Math.floor(getResearchDurationMs(type, nextLevel, academyLevel) / 1000),
      isActive: activeResearch?.researchType === type,
    };
  });
}

export function mapResearchQueueView(city: CityStateRecord, now: Date) {
  const activeResearch = city.researchQueues[0] ?? null;
  if (!activeResearch) {
    return null;
  }

  return {
    id: activeResearch.id,
    researchType: activeResearch.researchType as ResearchType,
    startedAt: activeResearch.startedAt.toISOString(),
    completesAt: activeResearch.completesAt.toISOString(),
    toLevel: activeResearch.toLevel,
    remainingSeconds: Math.max(0, Math.ceil((activeResearch.completesAt.getTime() - now.getTime()) / 1000)),
  };
}

export function mapCityState(city: CityStateRecord, now: Date = new Date()): CityState {
  const buildingLevels = getBuildingLevels(
    city.buildings.map((building) => ({
      buildingType: building.buildingType as BuildingType,
      level: building.level,
    })),
  );
  const researchLevels = getResearchLevels(
    city.researchLevels.map((research) => ({
      researchType: research.researchType as ResearchType,
      level: research.level,
    })),
  );
  const activeUpgrade = city.upgrades[0] ?? null;
  const commander = getPrimaryCommander(city);
  const commanderBonuses = toCommanderBonuses(commander);
  const troopLedger = getTroopLedger(
    city.troopGarrisons.map((entry) => ({
      troopType: entry.troopType as TroopType,
      quantity: entry.quantity,
    })),
  );

  return {
    cityId: city.id,
    cityName: city.name,
    coordinates: {
      x: city.x,
      y: city.y,
    },
    resources: toDisplayResources(getResourceLedger(city)),
    resourcesUpdatedAt: city.resourceUpdatedAt.toISOString(),
    buildings: mapBuildingViews(city),
    activeUpgrade: activeUpgrade
      ? {
          id: activeUpgrade.id,
          buildingType: activeUpgrade.buildingType as BuildingType,
          startedAt: activeUpgrade.startedAt.toISOString(),
          completesAt: activeUpgrade.completesAt.toISOString(),
          toLevel: activeUpgrade.toLevel,
          remainingSeconds: Math.max(0, Math.ceil((activeUpgrade.completesAt.getTime() - now.getTime()) / 1000)),
        }
      : null,
    activeTraining: mapTrainingQueueView(city, now),
    activeResearch: mapResearchQueueView(city, now),
    troops: mapTroopViews(city),
    woundedTroops: {
      INFANTRY: city.woundedInfantry,
      ARCHER: city.woundedArcher,
      CAVALRY: city.woundedCavalry,
    },
    commanders: mapCommanderViews(city),
    research: mapResearchViews(city),
    activeMarches: city.outgoingMarches.map((march) => mapMarchView(march, { x: city.x, y: city.y }, now)),
    openMarchCount: city.outgoingMarches.length,
    visionRadius: getVisionRadius(buildingLevels.WATCHTOWER, researchLevels),
    attackPower: getAttackPower(troopLedger, commanderBonuses, researchLevels, buildingLevels),
    defensePower: getDefensePower(troopLedger, buildingLevels, commanderBonuses, researchLevels),
    hospitalHealingCapacity: getHospitalHealingCapacity(buildingLevels, researchLevels),
    peaceShieldUntil: city.peaceShieldUntil?.toISOString() ?? null,
  };
}

export function mapMapCity(
  city: MapCityRecord,
  currentCity: CityStateRecord,
  now: Date,
  fogState: MapCity["fogState"],
  maxDistance: number,
): MapCity {
  const currentCommander = getPrimaryCommander(currentCity);
  const currentCommanderBonuses = toCommanderBonuses(currentCommander);
  const currentResearchLevels = getResearchLevels(
    currentCity.researchLevels.map((research) => ({
      researchType: research.researchType as ResearchType,
      level: research.level,
    })),
  );
  const currentTroops = getTroopLedger(
    currentCity.troopGarrisons.map((troop) => ({
      troopType: troop.troopType as TroopType,
      quantity: troop.quantity,
    })),
  );

  const targetCommander = getPrimaryCommander(city);
  const targetCommanderBonuses = toCommanderBonuses(targetCommander);
  const targetResearchLevels = getResearchLevels(
    city.researchLevels.map((research) => ({
      researchType: research.researchType as ResearchType,
      level: research.level,
    })),
  );
  const targetBuildings = getBuildingLevels(
    city.buildings.map((building) => ({
      buildingType: building.buildingType as BuildingType,
      level: building.level,
    })),
  );
  const targetTroops = getTroopLedger(
    city.troopGarrisons.map((troop) => ({
      troopType: troop.troopType as TroopType,
      quantity: troop.quantity,
    })),
  );
  const currentAttack = getAttackPower(currentTroops, currentCommanderBonuses, currentResearchLevels);
  const targetDefense = getDefensePower(targetTroops, targetBuildings, targetCommanderBonuses, targetResearchLevels);
  const isCurrentPlayer = currentCity.id === city.id;
  const distance = isCurrentPlayer ? null : Math.abs(currentCity.x - city.x) + Math.abs(currentCity.y - city.y);
  const townHall = city.buildings.find((building) => building.buildingType === "TOWN_HALL");
  const battleWindow = city.battleWindows[0] ?? null;
  const battleWindowView = mapBattleWindowView(battleWindow, now);

  return {
    cityId: city.id,
    cityName: city.name,
    ownerName: city.owner.username,
    x: city.x,
    y: city.y,
    fogState,
    isCurrentPlayer,
    canSendMarch: !isCurrentPlayer && distance !== null && distance <= maxDistance && fogState !== "HIDDEN",
    distance,
    townHallLevel: townHall?.level ?? 1,
    attackPower: currentAttack,
    defensePower: targetDefense,
    battleWindowClosesAt: battleWindow?.closesAt.toISOString() ?? null,
    stagedMarchCount: battleWindow?.marches.length ?? 0,
    battleWindow: battleWindowView,
    projectedOutcome:
      isCurrentPlayer || fogState === "HIDDEN"
        ? null
        : currentAttack > targetDefense
          ? "ATTACKER_WIN"
          : "DEFENDER_HOLD",
  };
}

export function mapPoiView(
  poi: MapPoiRecord,
  currentCity: CityStateRecord,
  fogState: PoiView["fogState"],
  now: Date,
): PoiView {
  const currentCommander = getPrimaryCommander(currentCity);
  const currentCommanderBonuses = toCommanderBonuses(currentCommander);
  const currentResearchLevels = getResearchLevels(
    currentCity.researchLevels.map((research) => ({
      researchType: research.researchType as ResearchType,
      level: research.level,
    })),
  );
  const currentTroops = getTroopLedger(
    currentCity.troopGarrisons.map((troop) => ({
      troopType: troop.troopType as TroopType,
      quantity: troop.quantity,
    })),
  );
  const currentAttack = getAttackPower(currentTroops, currentCommanderBonuses, currentResearchLevels);
  const distance = Math.abs(currentCity.x - poi.x) + Math.abs(currentCity.y - poi.y);
  const occupantMarchId = poi.targetMarches[0]?.id ?? null;
  const battleWindow = poi.battleWindows[0] ?? null;
  const hasLockedOccupant = poi.targetMarches.some((entry) => entry.state === "GATHERING");
  const campTroops = poi.kind === "BARBARIAN_CAMP" ? getBarbarianCampTroops(poi.level) : null;
  const projectedOutcome =
    poi.kind === "BARBARIAN_CAMP" && fogState !== "HIDDEN" && poi.state === "ACTIVE" && campTroops
      ? currentAttack > getTroopDefensePower(campTroops)
        ? "ATTACKER_WIN"
        : "DEFENDER_HOLD"
      : null;

  return {
    id: poi.id,
    kind: poi.kind,
    state: poi.state,
    label: poi.label,
    level: poi.level,
    x: poi.x,
    y: poi.y,
    fogState,
    distance,
    resourceType: poi.resourceType,
    remainingAmount: poi.remainingAmount,
    maxAmount: poi.maxAmount,
    respawnsAt: poi.respawnsAt?.toISOString() ?? null,
    occupantMarchId,
    canSendMarch:
      fogState !== "HIDDEN" &&
      distance <= MAX_MARCH_DISTANCE &&
      poi.kind === "BARBARIAN_CAMP" &&
      (poi.state === "ACTIVE" || poi.state === "OCCUPIED" || battleWindow != null) &&
      !hasLockedOccupant,
    canGather:
      fogState !== "HIDDEN" &&
      distance <= MAX_MARCH_DISTANCE &&
      poi.kind === "RESOURCE_NODE" &&
      (poi.state === "ACTIVE" || poi.state === "OCCUPIED" || battleWindow != null) &&
      !hasLockedOccupant &&
      (poi.remainingAmount ?? 0) > 0,
    battleWindowClosesAt: battleWindow?.closesAt.toISOString() ?? null,
    stagedMarchCount: battleWindow?.marches.length ?? 0,
    battleWindow: mapBattleWindowView(battleWindow, now),
    projectedOutcome,
    projectedLoad: getCarryCapacity(currentTroops, currentCommanderBonuses),
  };
}

export function mapRallyView(rally: RallyRecord, now: Date = new Date()): RallyView {
  return {
    id: rally.id,
    state: rally.state,
    objective: rally.objective,
    targetCityId: rally.targetCityId,
    targetCityName: rally.targetCity?.name ?? null,
    targetPoiId: rally.targetPoiId,
    targetPoiName: rally.targetPoi?.label ?? null,
    leaderUserId: rally.leaderUserId,
    leaderName: rally.leaderUser.username,
    leaderCommanderId: rally.commanderId,
    leaderCommanderName: rally.commander.name,
    supportBonusPct: Math.round(rally.supportBonusPct * 100),
    launchAt: rally.launchAt.toISOString(),
    remainingSeconds: Math.max(0, Math.ceil((rally.launchAt.getTime() - now.getTime()) / 1000)),
    launchedMarchId: rally.launchedMarchId,
    members: rally.members.map((member) => ({
      userId: member.userId,
      username: member.user.username,
      pledgedTroops: {
        INFANTRY: member.infantryCount,
        ARCHER: member.archerCount,
        CAVALRY: member.cavalryCount,
      },
      joinedAt: member.joinedAt.toISOString(),
    })),
  };
}

export function mapBattleReport(report: BattleReportRecord): ReportEntryView {
  return {
    id: report.id,
    kind: "CITY_BATTLE",
    createdAt: report.createdAt.toISOString(),
    attackerName: report.attackerUser.username,
    defenderName: report.defenderUser.username,
    attackerCityName: report.attackerCity.name,
    defenderCityName: report.defenderCity.name,
    result: report.result,
    attackerPower: report.attackerPower,
    defenderPower: report.defenderPower,
    loot: {
      wood: report.lootWood,
      stone: report.lootStone,
      food: report.lootFood,
      gold: report.lootGold,
    },
    attackerLosses: {
      INFANTRY: report.attackerLossInfantry,
      ARCHER: report.attackerLossArcher,
      CAVALRY: report.attackerLossCavalry,
    },
    defenderLosses: {
      INFANTRY: report.defenderLossInfantry,
      ARCHER: report.defenderLossArcher,
      CAVALRY: report.defenderLossCavalry,
    },
    location: {
      from: {
        x: report.fromX,
        y: report.fromY,
      },
      to: {
        x: report.toX,
        y: report.toY,
      },
      distance: report.distance,
    },
  };
}

export function mapMarchReport(report: MarchReportRecord): ReportEntryView {
  if (report.kind === "BARBARIAN_BATTLE") {
    return {
      id: report.id,
      kind: "BARBARIAN_BATTLE",
      createdAt: report.createdAt.toISOString(),
      attackerName: report.ownerUser.username,
      attackerCityName: report.ownerCity.name,
      poiName: report.poiName,
      poiLevel: report.poiLevel,
      result: report.result ?? "DEFENDER_HOLD",
      attackerPower: report.attackerPower ?? 0,
      defenderPower: report.defenderPower ?? 0,
      loot: {
        wood: report.lootWood,
        stone: report.lootStone,
        food: report.lootFood,
        gold: report.lootGold,
      },
      attackerLosses: {
        INFANTRY: report.attackerLossInfantry,
        ARCHER: report.attackerLossArcher,
        CAVALRY: report.attackerLossCavalry,
      },
      defenderLosses: {
        INFANTRY: report.defenderLossInfantry,
        ARCHER: report.defenderLossArcher,
        CAVALRY: report.defenderLossCavalry,
      },
      location: {
        from: {
          x: report.fromX,
          y: report.fromY,
        },
        to: {
          x: report.toX,
          y: report.toY,
        },
        distance: report.distance,
      },
    };
  }

  return {
    id: report.id,
    kind: "RESOURCE_GATHER",
    createdAt: report.createdAt.toISOString(),
    ownerName: report.ownerUser.username,
    cityName: report.ownerCity.name,
    poiName: report.poiName,
    resourceType: report.resourceType ?? "WOOD",
    amount: report.resourceAmount,
    troops: {
      INFANTRY: report.infantryCount,
      ARCHER: report.archerCount,
      CAVALRY: report.cavalryCount,
    },
    location: {
      from: {
        x: report.fromX,
        y: report.fromY,
      },
      to: {
        x: report.toX,
        y: report.toY,
      },
      distance: report.distance,
    },
  };
}

export function mapAllianceHelpRequest(request: AllianceStateRecord["helpRequests"][number]): AllianceHelpRequestView {
  return {
    id: request.id,
    requesterUserId: request.requesterUserId,
    requesterName: request.requesterUser.username,
    kind: request.kind,
    label: request.label,
    targetId: request.targetId,
    helpCount: request.helpCount,
    maxHelps: request.maxHelps,
    isOpen: request.isOpen,
    createdAt: request.createdAt.toISOString(),
  };
}

export function mapAllianceView(
  alliance: AllianceStateRecord,
  currentUserId: string,
): AllianceView {
  const membership = alliance.members.find((member) => member.userId === currentUserId);
  if (!membership) {
    throw new HttpError(403, "ALLIANCE_ACCESS_DENIED", "The current player is not a member of this alliance.");
  }

  return {
    id: alliance.id,
    name: alliance.name,
    tag: alliance.tag,
    description: alliance.description,
    role: membership.role,
    memberCount: alliance.members.length,
    treasury: {
      wood: Math.floor(alliance.wood),
      stone: Math.floor(alliance.stone),
      food: Math.floor(alliance.food),
      gold: Math.floor(alliance.gold),
    },
    announcement: alliance.announcement?.content ?? null,
    members: alliance.members.map((member) => ({
      userId: member.userId,
      username: member.user.username,
      cityName: member.user.city?.name ?? "Unknown City",
      role: member.role,
      joinedAt: member.createdAt.toISOString(),
    })),
    chatMessages: alliance.chatMessages.map((message) => ({
      id: message.id,
      userId: message.userId,
      username: message.user.username,
      content: message.content,
      createdAt: message.createdAt.toISOString(),
    })),
    helpRequests: alliance.helpRequests.map(mapAllianceHelpRequest),
    markers: alliance.markers.map<AllianceMarkerView>((marker) => ({
      id: marker.id,
      label: marker.label,
      x: marker.x,
      y: marker.y,
      createdAt: marker.createdAt.toISOString(),
      expiresAt: marker.expiresAt?.toISOString() ?? null,
      createdByUserId: marker.userId,
      canDelete: marker.userId === currentUserId || membership.role !== "MEMBER",
    })),
    logs: alliance.logs.map<AllianceLogEntryView>((entry) => ({
      id: entry.id,
      kind: entry.kind,
      body: entry.body,
      createdAt: entry.createdAt.toISOString(),
    })),
    contributions: alliance.contributions.map<AllianceContributionView>((entry) => ({
      userId: entry.userId,
      username: entry.user.username,
      points: entry.points,
    })),
    donations: alliance.donations.map<AllianceDonationView>((entry) => ({
      id: entry.id,
      userId: entry.userId,
      username: entry.user.username,
      resources: {
        wood: entry.wood,
        stone: entry.stone,
        food: entry.food,
        gold: entry.gold,
      },
      totalValue: entry.totalValue,
      createdAt: entry.createdAt.toISOString(),
    })),
  };
}

export function mapAllianceSummary(
  alliance: {
    id: string;
    name: string;
    tag: string;
    description: string | null;
    wood: number;
    stone: number;
    food: number;
    gold: number;
    members: Array<{ role: AllianceSummaryView["role"]; userId: string }>;
  },
  currentUserId: string,
): AllianceSummaryView {
  const membership = alliance.members.find((member) => member.userId === currentUserId);
  if (!membership) {
    throw new HttpError(403, "ALLIANCE_ACCESS_DENIED", "The current player is not a member of this alliance.");
  }

  return {
    id: alliance.id,
    name: alliance.name,
    tag: alliance.tag,
    description: alliance.description,
    role: membership.role,
    memberCount: alliance.members.length,
    treasury: {
      wood: Math.floor(alliance.wood),
      stone: Math.floor(alliance.stone),
      food: Math.floor(alliance.food),
      gold: Math.floor(alliance.gold),
    },
  };
}

export function mapAllianceListItem(
  alliance: {
    id: string;
    name: string;
    tag: string;
    description: string | null;
    members: Array<{ userId: string }>;
  },
  currentUserId: string,
): AllianceListItemView {
  return {
    id: alliance.id,
    name: alliance.name,
    tag: alliance.tag,
    description: alliance.description,
    memberCount: alliance.members.length,
    joined: alliance.members.some((member) => member.userId === currentUserId),
  };
}

export async function getAllianceMembershipTx(tx: Prisma.TransactionClient, userId: string) {
  return tx.allianceMember.findUnique({
    where: { userId },
    include: {
      alliance: {
        include: allianceStateInclude,
      },
    },
  });
}

export async function getUserWithCityOrThrow(
  tx: Prisma.TransactionClient,
  userId: string,
): Promise<{ id: string; username: string; city: { id: string; name: string } | null }> {
  const user = await tx.user.findUnique({
    where: { id: userId },
    include: {
      city: {
        select: {
          id: true,
          name: true,
        },
      },
    },
  });

  if (!user) {
    throw new HttpError(404, "USER_NOT_FOUND", "The user account was not found.");
  }

  return user;
}

export async function loadCityStateRecordOrThrow(
  tx: Prisma.TransactionClient,
  cityId: string,
): Promise<CityStateRecord> {
  const city = await tx.city.findUnique({
    where: { id: cityId },
    include: cityStateInclude,
  });

  if (!city) {
    throw new HttpError(404, "CITY_NOT_FOUND", "The requested city was not found.");
  }

  return city;
}

export async function loadMapPoiRecordOrThrow(
  tx: Prisma.TransactionClient,
  poiId: string,
): Promise<MapPoiRecord> {
  const poi = await tx.mapPoi.findUnique({
    where: { id: poiId },
    include: mapPoiInclude,
  });

  if (!poi) {
    throw new HttpError(404, "POI_NOT_FOUND", "The requested point of interest was not found.");
  }

  return poi;
}
