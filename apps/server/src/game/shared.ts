import { Prisma } from "@prisma/client";
import {
  BUILDING_TYPES,
  BUILDING_DESCRIPTIONS,
  BUILDING_LABELS,
  RESEARCH_TYPES,
  RESEARCH_DESCRIPTIONS,
  RESEARCH_LABELS,
  TROOP_LABELS,
  TROOP_TYPES,
  type AllianceHelpRequestView,
  type AllianceListItemView,
  type AllianceSummaryView,
  type AllianceView,
  type AuthUser,
  type BattleReportView,
  type BuildingType,
  type BuildingView,
  type CityState,
  type CommanderView,
  type MapCity,
  type ResearchType,
  type ResearchView,
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
  getMarchPosition,
  getResearchCost,
  getResearchDurationMs,
  getResearchLevels,
  getTrainingDurationMs,
  getTroopTrainingCost,
  getUpgradeCost,
  getUpgradeDurationMs,
  getVisionRadius,
  toDisplayResources,
  type CommanderBonuses,
} from "./engine";
import {
  STARTING_BUILDING_LEVEL,
  TROOP_ATTACK,
  TROOP_CARRY,
  TROOP_DEFENSE,
  TROOP_SPEED,
  RESEARCH_MAX_LEVEL,
  STARTING_TROOPS,
} from "./constants";

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
      state: "ENROUTE",
    },
    include: {
      commander: true,
      targetCity: {
        include: {
          owner: true,
        },
      },
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
});

export const battleReportInclude = Prisma.validator<Prisma.BattleReportInclude>()({
  attackerUser: true,
  defenderUser: true,
  attackerCity: true,
  defenderCity: true,
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
export type AllianceStateRecord = Prisma.AllianceGetPayload<{ include: typeof allianceStateInclude }>;

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

  if (city.owner.commanders.length === 0) {
    await tx.commander.create({
      data: {
        userId: options.userId,
        name: `${options.username} Vanguard`,
        templateKey: "VANGUARD_MARSHAL",
        level: 1,
        attackBonus: 0.08,
        defenseBonus: 0.08,
        marchSpeedBonus: 0.1,
        carryBonus: 0.15,
        isPrimary: true,
      },
    });
  }
}

export function mapCommanderViews(city: CityStateRecord): CommanderView[] {
  return city.owner.commanders.map((commander) => ({
    id: commander.id,
    name: commander.name,
    templateKey: commander.templateKey,
    level: commander.level,
    attackBonusPct: Math.round(commander.attackBonus * 100),
    defenseBonusPct: Math.round(commander.defenseBonus * 100),
    marchSpeedBonusPct: Math.round(commander.marchSpeedBonus * 100),
    carryBonusPct: Math.round(commander.carryBonus * 100),
    isPrimary: commander.isPrimary,
  }));
}

export function mapBuildingViews(city: CityStateRecord): BuildingView[] {
  const levels = getBuildingLevels(
    city.buildings.map((building) => ({
      buildingType: building.buildingType as BuildingType,
      level: building.level,
    })),
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
      upgradeDurationSeconds: Math.floor(getUpgradeDurationMs(type, nextLevel) / 1000),
      isUpgradeActive: activeUpgrade?.buildingType === type,
    };
  });
}

export function mapTroopViews(city: CityStateRecord) {
  const barracksLevel =
    city.buildings.find((building) => building.buildingType === "BARRACKS")?.level ?? 1;
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
    trainingDurationSeconds: Math.floor(getTrainingDurationMs(type, 1, barracksLevel) / 1000),
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
      durationSeconds: Math.floor(getResearchDurationMs(type, nextLevel) / 1000),
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
    commanders: mapCommanderViews(city),
    research: mapResearchViews(city),
    activeMarches: city.outgoingMarches.map((march) => ({
      id: march.id,
      state: march.state,
      targetCityId: march.targetCityId,
      targetCityName: march.targetCity.name,
      commanderId: march.commanderId,
      commanderName: march.commander.name,
      troops: {
        INFANTRY: march.infantryCount,
        ARCHER: march.archerCount,
        CAVALRY: march.cavalryCount,
      },
      startedAt: march.startsAt.toISOString(),
      etaAt: march.etaAt.toISOString(),
      remainingSeconds: Math.max(0, Math.ceil((march.etaAt.getTime() - now.getTime()) / 1000)),
      distance: Math.abs(march.targetCity.x - city.x) + Math.abs(march.targetCity.y - city.y),
      origin: { x: city.x, y: city.y },
      target: { x: march.targetCity.x, y: march.targetCity.y },
      projectedOutcome:
        march.defenderPowerSnapshot == null
          ? null
          : march.attackerPowerSnapshot > march.defenderPowerSnapshot
            ? "ATTACKER_WIN"
            : "DEFENDER_HOLD",
    })),
    openMarchCount: city.outgoingMarches.length,
    visionRadius: getVisionRadius(buildingLevels.WATCHTOWER, researchLevels),
    attackPower: getAttackPower(troopLedger, commanderBonuses, researchLevels),
    defensePower: getDefensePower(troopLedger, buildingLevels, commanderBonuses, researchLevels),
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
    projectedOutcome:
      isCurrentPlayer || fogState === "HIDDEN"
        ? null
        : currentAttack > targetDefense
          ? "ATTACKER_WIN"
          : "DEFENDER_HOLD",
  };
}

export function mapBattleReport(report: BattleReportRecord): BattleReportView {
  return {
    id: report.id,
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
