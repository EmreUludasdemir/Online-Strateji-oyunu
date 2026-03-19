import { TroopType as PrismaTroopType, type Prisma } from "@prisma/client";
import type {
  AllianceHelpKind,
  AllianceRole,
  AllianceView,
  AuthUser,
  BuildingType,
  CityState,
  ItemKey,
  ItemTargetKind,
  MarchCommandResponse,
  MarchObjective,
  PurchaseVerifyResponse,
  PoiKind,
  RallyMutationResponse,
  ResearchType,
  ScoutMutationResponse,
  TroopType,
  TroopStock,
} from "@frontier/shared";
import { BUILDING_TYPES, RESEARCH_TYPES, TROOP_TYPES } from "@frontier/shared";

import { hashPassword, verifyPassword } from "../lib/auth";
import { writeAuditEntry } from "../lib/audit";
import { HttpError } from "../lib/http";
import { prisma } from "../lib/prisma";
import { storeValidationPort } from "../lib/storeValidation";
import {
  emitAllianceUpdated,
  emitCityUpdated,
  emitCommanderUpdated,
  emitFogUpdated,
  emitInventoryUpdated,
  emitEventUpdated,
  emitLeaderboardUpdated,
  emitMapUpdated,
  emitMailboxUpdated,
  emitMarchCreated,
  emitMarchUpdated,
  emitRallyUpdated,
  emitStoreUpdated,
  emitTaskUpdated,
} from "./events";
import {
  addResources,
  addTroops,
  canAdvanceResearch,
  getAttackPower,
  getBuildingLevels,
  getCarryCapacity,
  getDefensePower,
  getMarchDurationMs,
  getMarchPosition,
  getResearchCost,
  getResearchDurationMs,
  getResearchLevels,
  getTrainingDurationMs,
  getTroopDefensePower,
  getTroopTrainingCost,
  getUpgradeCost,
  getUpgradeDurationMs,
  hasEnoughResources,
  hasEnoughTroops,
  manhattanDistance,
  spendResources,
  spendTroops,
  sumTroops,
} from "./engine";
import {
  ALLIANCE_CHAT_HISTORY_LIMIT,
  ALLIANCE_HELP_MAX_RESPONSES,
  ALLIANCE_MARKER_DURATION_MS,
  ALLIANCE_HELP_REDUCTION_MS,
  ALLIANCE_MAX_MEMBERS,
  BARBARIAN_CAMP_RESPAWN_MS,
  BATTLE_WINDOW_DURATION_MS,
  MAX_MARCH_DISTANCE,
  RESOURCE_GATHER_DURATION_MS,
  RESOURCE_NODE_RESPAWN_MS,
  STARTING_BUILDING_LEVEL,
  STARTING_RESOURCES,
  STARTING_TROOPS,
} from "./constants";
import { reconcileWorld, refreshFogOfWar, syncCityStateTx } from "./reconcile";
import {
  claimMailboxEntryTx,
  claimTaskTx,
  createMailboxEntryTx,
  ensureCommanderCollectionTx,
  ensureRetentionStateTx,
  getCommanderProgressViewTx,
  grantRewardBundleTx,
  getEntitlementsViewTx,
  progressGameTriggerTx,
  getMailboxViewTx,
  getStoreCatalogViewTx,
  getStoreOffersViewTx,
  upgradeCommanderTx,
  useInventoryItemTx,
  verifySandboxPurchaseToken,
} from "./progression";
import {
  allianceStateInclude,
  buildCityName,
  ensureCityInfrastructureTx,
  getAllianceMembershipTx,
  getBarbarianCampTroops,
  getMarchTargetCoordinates,
  getPrimaryCommander,
  getPoiResourceKey,
  getResourceLedger,
  getTroopLedger,
  getUserWithCityOrThrow,
  loadCityStateRecordOrThrow,
  loadMapPoiRecordOrThrow,
  mapAllianceView,
  mapMarchView,
  mapRallyView,
  mapCityState,
  rallyInclude,
  resourceLedgerToCityUpdate,
  toAuthUser,
  toCommanderBonuses,
} from "./shared";
import { addAllianceContributionTx, appendAllianceLogTx, getAllianceMemberIdsTx } from "./allianceUtils";
import { ensureWorldPoisTx, findOpenCoordinate } from "./world";

interface InternalMarchResult {
  response: MarchCommandResponse;
  originCityId: string;
  targetCityId: string | null;
  targetPoiId: string | null;
}

function isAllianceOfficerRole(role: AllianceRole) {
  return role === "LEADER" || role === "OFFICER";
}

type CreateMarchPayload =
  | ({
      objective?: "CITY_ATTACK";
      targetCityId: string;
      commanderId: string;
      troops: TroopStock;
      supportBonusPct?: number;
    })
  | ({
      objective: "BARBARIAN_ATTACK" | "RESOURCE_GATHER";
      targetPoiId: string;
      commanderId: string;
      troops: TroopStock;
      supportBonusPct?: number;
    });

async function createStarterCityTx(
  tx: Prisma.TransactionClient,
  options: {
    userId: string;
    username: string;
    cityName?: string;
    coordinate?: { x: number; y: number };
  },
): Promise<void> {
  let coordinate = options.coordinate;

  if (!coordinate) {
    const [takenCoordinates, takenPoiCoordinates] = await Promise.all([
      tx.city.findMany({
        select: {
          x: true,
          y: true,
        },
      }),
      tx.mapPoi.findMany({
        select: {
          x: true,
          y: true,
        },
      }),
    ]);

    coordinate = findOpenCoordinate([...takenCoordinates, ...takenPoiCoordinates]);
  } else {
    const [occupied, occupiedPoi] = await Promise.all([
      tx.city.findUnique({
        where: {
          x_y: {
            x: coordinate.x,
            y: coordinate.y,
          },
        },
        select: {
          id: true,
        },
      }),
      tx.mapPoi.findUnique({
        where: {
          x_y: {
            x: coordinate.x,
            y: coordinate.y,
          },
        },
        select: {
          id: true,
        },
      }),
    ]);

    if (occupied || occupiedPoi) {
      throw new HttpError(409, "MAP_TILE_OCCUPIED", "That map coordinate is already occupied.");
    }
  }

  const now = new Date();
  const city = await tx.city.create({
    data: {
      ownerId: options.userId,
      name: options.cityName ?? buildCityName(options.username),
      x: coordinate.x,
      y: coordinate.y,
      wood: STARTING_RESOURCES.wood,
      stone: STARTING_RESOURCES.stone,
      food: STARTING_RESOURCES.food,
      gold: STARTING_RESOURCES.gold,
      resourceUpdatedAt: now,
    },
  });

  await tx.building.createMany({
    data: BUILDING_TYPES.map((buildingType) => ({
      cityId: city.id,
      buildingType,
      level: STARTING_BUILDING_LEVEL,
    })),
  });

  await tx.troopGarrison.createMany({
    data: TROOP_TYPES.map((troopType) => ({
      cityId: city.id,
      troopType,
      quantity: STARTING_TROOPS[troopType],
    })),
  });

  await tx.researchLevel.createMany({
    data: RESEARCH_TYPES.map((researchType) => ({
      cityId: city.id,
      researchType,
      level: 0,
    })),
  });

  await ensureCommanderCollectionTx(tx, options.userId, options.username);
  await ensureRetentionStateTx(tx, options.userId, now);
}

async function snapshotCityTx(tx: Prisma.TransactionClient, userId: string, now: Date) {
  await ensureWorldPoisTx(tx);
  const user = await getUserWithCityOrThrow(tx, userId);
  await ensureCityInfrastructureTx(tx, {
    cityId: user.city!.id,
    userId: user.id,
    username: user.username,
  });
  await ensureCommanderCollectionTx(tx, user.id, user.username);
  await ensureRetentionStateTx(tx, user.id, now);
  const synced = await syncCityStateTx(tx, user.city!.id, now);
  await refreshFogOfWar(tx, synced.city, now);

  return {
    user,
    city: await loadCityStateRecordOrThrow(tx, synced.city.id),
  };
}

async function updateTroopGarrisonTx(tx: Prisma.TransactionClient, cityId: string, troops: TroopStock) {
  for (const troopType of TROOP_TYPES) {
    await tx.troopGarrison.update({
      where: {
        cityId_troopType: {
          cityId,
          troopType: troopType as PrismaTroopType,
        },
      },
      data: {
        quantity: troops[troopType],
      },
    });
  }
}

async function syncPoiOccupancyStateTx(tx: Prisma.TransactionClient, poiId: string) {
  const poi = await tx.mapPoi.findUnique({
    where: { id: poiId },
    select: {
      state: true,
    },
  });

  if (!poi || (poi.state !== "ACTIVE" && poi.state !== "OCCUPIED")) {
    return;
  }

  const [activeMarches, openWindows] = await Promise.all([
    tx.march.count({
      where: {
        targetPoiId: poiId,
        state: {
          in: ["ENROUTE", "STAGING", "GATHERING"],
        },
      },
    }),
    tx.battleWindow.count({
      where: {
        targetPoiId: poiId,
        resolvedAt: null,
      },
    }),
  ]);

  await tx.mapPoi.update({
    where: { id: poiId },
    data: {
      state: activeMarches > 0 || openWindows > 0 ? "OCCUPIED" : "ACTIVE",
    },
  });
}

function buildCompatibilityTroopPayload(troops: TroopStock): TroopStock {
  return {
    INFANTRY: Math.max(0, Math.floor(troops.INFANTRY * 0.6)),
    ARCHER: Math.max(0, Math.floor(troops.ARCHER * 0.6)),
    CAVALRY: Math.max(0, Math.floor(troops.CAVALRY * 0.6)),
  };
}

function getMarchLimit(city: Awaited<ReturnType<typeof loadCityStateRecordOrThrow>>) {
  const townHallLevel = city.buildings.find((entry) => entry.buildingType === "TOWN_HALL")?.level ?? 1;
  return Math.max(1, Math.ceil(townHallLevel / 2));
}

async function createMarchTx(
  tx: Prisma.TransactionClient,
  userId: string,
  now: Date,
  payload: CreateMarchPayload,
): Promise<InternalMarchResult> {
  const { city } = await snapshotCityTx(tx, userId, now);
  const commander = city.owner.commanders.find((entry) => entry.id === payload.commanderId);
  if (!commander) {
    throw new HttpError(404, "COMMANDER_NOT_FOUND", "That commander is not owned by the current player.");
  }

  const garrison = getTroopLedger(
    city.troopGarrisons.map((troop) => ({
      troopType: troop.troopType as TroopType,
      quantity: troop.quantity,
    })),
  );
  if (!hasEnoughTroops(garrison, payload.troops)) {
    throw new HttpError(400, "INSUFFICIENT_TROOPS", "Not enough troops are available for that march.");
  }

  if (city.outgoingMarches.length >= getMarchLimit(city)) {
    throw new HttpError(409, "MARCH_LIMIT_REACHED", "Current command capacity is already fully committed.");
  }

  const objective: MarchObjective = payload.objective ?? "CITY_ATTACK";
  const attackerResearch = getResearchLevels(
    city.researchLevels.map((research) => ({
      researchType: research.researchType as ResearchType,
      level: research.level,
    })),
  );
  let distance = 0;
  let targetCity: Awaited<ReturnType<typeof loadCityStateRecordOrThrow>> | null = null;
  let targetPoi: Awaited<ReturnType<typeof loadMapPoiRecordOrThrow>> | null = null;
  let defenderPowerSnapshot: number | null = null;
  let cargoResourceType: "WOOD" | "STONE" | "FOOD" | "GOLD" | null = null;

  if (objective === "CITY_ATTACK" && "targetCityId" in payload) {
    targetCity = await loadCityStateRecordOrThrow(tx, payload.targetCityId);

    if (targetCity.ownerId === userId) {
      throw new HttpError(400, "INVALID_TARGET", "You cannot send a march to your own city.");
    }

    if (targetCity.peaceShieldUntil && targetCity.peaceShieldUntil > now) {
      throw new HttpError(409, "TARGET_SHIELDED", "That city is currently protected by a peace shield.");
    }

    distance = manhattanDistance(
      { x: city.x, y: city.y },
      { x: targetCity.x, y: targetCity.y },
    );
    if (distance > MAX_MARCH_DISTANCE) {
      throw new HttpError(400, "TARGET_OUT_OF_RANGE", "That target is outside the current command range.");
    }

    const defenderResearch = getResearchLevels(
      targetCity.researchLevels.map((research) => ({
        researchType: research.researchType as ResearchType,
        level: research.level,
      })),
    );
    const defenderBuildings = getBuildingLevels(
      targetCity.buildings.map((building) => ({
        buildingType: building.buildingType as BuildingType,
        level: building.level,
      })),
    );
    const defenderTroops = getTroopLedger(
      targetCity.troopGarrisons.map((troop) => ({
        troopType: troop.troopType as TroopType,
        quantity: troop.quantity,
      })),
    );
    defenderPowerSnapshot = getDefensePower(
      defenderTroops,
      defenderBuildings,
      toCommanderBonuses(getPrimaryCommander(targetCity)),
      defenderResearch,
    );
  } else if ("targetPoiId" in payload) {
    targetPoi = await loadMapPoiRecordOrThrow(tx, payload.targetPoiId);
    const hasLockedOccupant = targetPoi.targetMarches.some((entry) => entry.state === "GATHERING");
    if (hasLockedOccupant || (targetPoi.state !== "ACTIVE" && targetPoi.state !== "OCCUPIED")) {
      throw new HttpError(409, "POI_OCCUPIED", "That point of interest is already occupied.");
    }

    distance = manhattanDistance(
      { x: city.x, y: city.y },
      { x: targetPoi.x, y: targetPoi.y },
    );
    if (distance > MAX_MARCH_DISTANCE) {
      throw new HttpError(400, "TARGET_OUT_OF_RANGE", "That target is outside the current command range.");
    }

    if (objective === "BARBARIAN_ATTACK") {
      if (targetPoi.kind !== "BARBARIAN_CAMP") {
        throw new HttpError(400, "INVALID_POI_TARGET", "Only barbarian camps can receive an assault march.");
      }

      defenderPowerSnapshot = getTroopDefensePower(getBarbarianCampTroops(targetPoi.level));
    } else {
      if (targetPoi.kind !== "RESOURCE_NODE" || !targetPoi.resourceType) {
        throw new HttpError(400, "INVALID_POI_TARGET", "Only resource nodes can receive a gather march.");
      }
      if ((targetPoi.remainingAmount ?? 0) <= 0) {
        throw new HttpError(409, "POI_DEPLETED", "That resource node has already been depleted.");
      }

      cargoResourceType = targetPoi.resourceType;
    }
  } else {
    throw new HttpError(400, "INVALID_MARCH_TARGET", "The march target is invalid.");
  }

  const attackerPower = Math.round(
    getAttackPower(payload.troops, toCommanderBonuses(commander), attackerResearch) * (1 + (payload.supportBonusPct ?? 0)),
  );
  const etaAt = new Date(
    now.getTime() + getMarchDurationMs(distance, payload.troops, toCommanderBonuses(commander), attackerResearch),
  );

  const createdMarch = await tx.march.create({
    data: {
      ownerUserId: userId,
      ownerCityId: city.id,
      originX: city.x,
      originY: city.y,
      targetCityId: targetCity?.id ?? null,
      targetPoiId: targetPoi?.id ?? null,
      commanderId: commander.id,
      objective,
      supportBonusPct: payload.supportBonusPct ?? 0,
      infantryCount: payload.troops.INFANTRY,
      archerCount: payload.troops.ARCHER,
      cavalryCount: payload.troops.CAVALRY,
      cargoResourceType,
      attackerPowerSnapshot: attackerPower,
      defenderPowerSnapshot,
      etaAt,
    },
  });

  if (targetPoi) {
    await syncPoiOccupancyStateTx(tx, targetPoi.id);
  }

  await updateTroopGarrisonTx(tx, city.id, spendTroops(garrison, payload.troops));

  const updated = await loadCityStateRecordOrThrow(tx, city.id);
  await refreshFogOfWar(tx, updated, now);
  const latestState = mapCityState(updated, now);
  const march = latestState.activeMarches.find((entry) => entry.id === createdMarch.id);
  if (!march) {
    throw new HttpError(500, "MARCH_CREATE_FAILED", "The march could not be created.");
  }

  return {
    response: { march },
    originCityId: city.id,
    targetCityId: targetCity?.id ?? null,
    targetPoiId: targetPoi?.id ?? null,
  };
}

async function getAllianceForMemberTx(tx: Prisma.TransactionClient, userId: string) {
  const membership = await getAllianceMembershipTx(tx, userId);
  if (!membership) {
    throw new HttpError(404, "ALLIANCE_NOT_FOUND", "This player is not currently in an alliance.");
  }

  return membership;
}

function getHelpRequestLabel(kind: AllianceHelpKind, city: Awaited<ReturnType<typeof loadCityStateRecordOrThrow>>) {
  if (kind === "BUILDING_UPGRADE") {
    const upgrade = city.upgrades[0];
    if (!upgrade) {
      throw new HttpError(409, "HELP_TARGET_MISSING", "No active building upgrade is available for alliance help.");
    }

    return {
      targetId: upgrade.id,
      label: `${upgrade.buildingType.replaceAll("_", " ")} upgrade`,
    };
  }

  if (kind === "TRAINING") {
    const training = city.trainingQueues[0];
    if (!training) {
      throw new HttpError(409, "HELP_TARGET_MISSING", "No active training queue is available for alliance help.");
    }

    return {
      targetId: training.id,
      label: `${training.quantity} ${training.troopType.toLowerCase()} drill`,
    };
  }

  const research = city.researchQueues[0];
  if (!research) {
    throw new HttpError(409, "HELP_TARGET_MISSING", "No active research queue is available for alliance help.");
  }

  return {
    targetId: research.id,
    label: `${research.researchType.replaceAll("_", " ")} doctrine`,
  };
}

async function applyAllianceHelpReductionTx(
  tx: Prisma.TransactionClient,
  request: {
    kind: AllianceHelpKind;
    targetId: string;
  },
  now: Date,
) {
  const nextTime = (current: Date) =>
    new Date(Math.max(now.getTime() + 5_000, current.getTime() - ALLIANCE_HELP_REDUCTION_MS));

  if (request.kind === "BUILDING_UPGRADE") {
    const upgrade = await tx.buildingUpgrade.findUnique({
      where: { id: request.targetId },
    });

    if (!upgrade || upgrade.status !== "ACTIVE") {
      throw new HttpError(409, "HELP_TARGET_EXPIRED", "That building upgrade is no longer active.");
    }

    await tx.buildingUpgrade.update({
      where: { id: request.targetId },
      data: {
        completesAt: nextTime(upgrade.completesAt),
      },
    });
    return;
  }

  if (request.kind === "TRAINING") {
    const training = await tx.troopTrainingQueue.findUnique({
      where: { id: request.targetId },
    });

    if (!training || training.status !== "ACTIVE") {
      throw new HttpError(409, "HELP_TARGET_EXPIRED", "That training queue is no longer active.");
    }

    await tx.troopTrainingQueue.update({
      where: { id: request.targetId },
      data: {
        completesAt: nextTime(training.completesAt),
      },
    });
    return;
  }

  const research = await tx.researchQueue.findUnique({
    where: { id: request.targetId },
  });

  if (!research || research.status !== "ACTIVE") {
    throw new HttpError(409, "HELP_TARGET_EXPIRED", "That research queue is no longer active.");
  }

  await tx.researchQueue.update({
    where: { id: request.targetId },
    data: {
      completesAt: nextTime(research.completesAt),
    },
  });
}

export async function registerPlayer(input: {
  username: string;
  password: string;
}): Promise<AuthUser> {
  const passwordHash = await hashPassword(input.password);

  const user = await prisma.$transaction(async (tx) => {
    const existingUser = await tx.user.findUnique({
      where: { username: input.username },
      select: { id: true },
    });

    if (existingUser) {
      throw new HttpError(409, "USERNAME_TAKEN", "That username is already taken.");
    }

    const createdUser = await tx.user.create({
      data: {
        username: input.username,
        passwordHash,
      },
    });

    await createStarterCityTx(tx, {
      userId: createdUser.id,
      username: createdUser.username,
    });
    await ensureWorldPoisTx(tx);

    return getUserWithCityOrThrow(tx, createdUser.id);
  });

  writeAuditEntry("auth.register", { userId: user.id, username: user.username });
  emitMapUpdated(user.city!.id);
  return toAuthUser(user);
}

export async function loginPlayer(input: {
  username: string;
  password: string;
}): Promise<AuthUser> {
  const user = await prisma.user.findUnique({
    where: { username: input.username },
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
    throw new HttpError(401, "INVALID_CREDENTIALS", "Invalid username or password.");
  }

  const isPasswordValid = await verifyPassword(input.password, user.passwordHash);
  if (!isPasswordValid) {
    throw new HttpError(401, "INVALID_CREDENTIALS", "Invalid username or password.");
  }

  writeAuditEntry("auth.login", { userId: user.id, username: user.username });
  return toAuthUser(user);
}

export async function startBuildingUpgrade(userId: string, buildingType: BuildingType) {
  await reconcileWorld();
  const now = new Date();

  const result = await prisma.$transaction(async (tx) => {
    const { user, city } = await snapshotCityTx(tx, userId, now);

    if (city.upgrades.length > 0) {
      throw new HttpError(409, "UPGRADE_ALREADY_ACTIVE", "Only one building upgrade can run at a time.");
    }

    const building = city.buildings.find((entry) => entry.buildingType === buildingType);
    if (!building) {
      throw new HttpError(404, "BUILDING_NOT_FOUND", "That building type does not exist.");
    }

    const targetLevel = building.level + 1;
    const cost = getUpgradeCost(buildingType, targetLevel);
    const resources = getResourceLedger(city);
    if (!hasEnoughResources(resources, cost)) {
      throw new HttpError(400, "INSUFFICIENT_RESOURCES", "Not enough resources for that upgrade.");
    }

    await tx.city.update({
      where: { id: city.id },
      data: resourceLedgerToCityUpdate(spendResources(resources, cost), now),
    });
    await tx.buildingUpgrade.create({
      data: {
        cityId: city.id,
        buildingType,
        fromLevel: building.level,
        toLevel: targetLevel,
        startedAt: now,
        completesAt: new Date(now.getTime() + getUpgradeDurationMs(buildingType, targetLevel)),
      },
    });
    await progressGameTriggerTx(tx, userId, "building_upgrade_started", 1, now);

    const updated = await loadCityStateRecordOrThrow(tx, city.id);
    await refreshFogOfWar(tx, updated, now);
    return {
      player: toAuthUser(user),
      city: mapCityState(updated, now),
    };
  });

  writeAuditEntry("game.upgrade.start", { userId, buildingType });
  emitCityUpdated([userId], result.city.cityId);
  emitMapUpdated(result.city.cityId);
  return result;
}

export async function trainTroops(userId: string, troopType: TroopType, quantity: number): Promise<CityState> {
  await reconcileWorld();
  const now = new Date();

  const state = await prisma.$transaction(async (tx) => {
    const { city } = await snapshotCityTx(tx, userId, now);

    if (city.trainingQueues.length > 0) {
      throw new HttpError(409, "TRAINING_ALREADY_ACTIVE", "Only one training queue can run at a time.");
    }

    const barracksLevel = city.buildings.find((building) => building.buildingType === "BARRACKS")?.level ?? 0;
    if (barracksLevel <= 0) {
      throw new HttpError(400, "BARRACKS_REQUIRED", "Barracks must be built before training troops.");
    }

    const cost = getTroopTrainingCost(troopType, quantity);
    const resources = getResourceLedger(city);
    if (!hasEnoughResources(resources, cost)) {
      throw new HttpError(400, "INSUFFICIENT_RESOURCES", "Not enough resources to train that many troops.");
    }

    await tx.city.update({
      where: { id: city.id },
      data: resourceLedgerToCityUpdate(spendResources(resources, cost), now),
    });
    await tx.troopTrainingQueue.create({
      data: {
        cityId: city.id,
        troopType,
        quantity,
        completesAt: new Date(now.getTime() + getTrainingDurationMs(troopType, quantity, barracksLevel)),
      },
    });
    await progressGameTriggerTx(tx, userId, "troop_train_started", 1, now);

    return mapCityState(await loadCityStateRecordOrThrow(tx, city.id), now);
  });

  writeAuditEntry("game.troops.train", { userId, troopType, quantity });
  emitCityUpdated([userId], state.cityId);
  return state;
}

export async function startResearch(userId: string, researchType: ResearchType): Promise<CityState> {
  await reconcileWorld();
  const now = new Date();

  const state = await prisma.$transaction(async (tx) => {
    const { city } = await snapshotCityTx(tx, userId, now);

    if (city.researchQueues.length > 0) {
      throw new HttpError(409, "RESEARCH_ALREADY_ACTIVE", "Only one research queue can run at a time.");
    }

    const academyLevel = city.buildings.find((building) => building.buildingType === "ACADEMY")?.level ?? 0;
    if (academyLevel <= 0) {
      throw new HttpError(400, "ACADEMY_REQUIRED", "Academy must be built before research.");
    }

    const currentLevel = city.researchLevels.find((entry) => entry.researchType === researchType)?.level ?? 0;
    if (!canAdvanceResearch(currentLevel)) {
      throw new HttpError(409, "RESEARCH_MAXED", "This research has already reached its maximum level.");
    }

    const nextLevel = currentLevel + 1;
    const cost = getResearchCost(researchType, nextLevel);
    const resources = getResourceLedger(city);
    if (!hasEnoughResources(resources, cost)) {
      throw new HttpError(400, "INSUFFICIENT_RESOURCES", "Not enough resources to start that research.");
    }

    await tx.city.update({
      where: { id: city.id },
      data: resourceLedgerToCityUpdate(spendResources(resources, cost), now),
    });
    await tx.researchQueue.create({
      data: {
        cityId: city.id,
        researchType,
        fromLevel: currentLevel,
        toLevel: nextLevel,
        completesAt: new Date(now.getTime() + getResearchDurationMs(researchType, nextLevel)),
      },
    });
    await progressGameTriggerTx(tx, userId, "research_started", 1, now);

    const updated = await loadCityStateRecordOrThrow(tx, city.id);
    await refreshFogOfWar(tx, updated, now);
    return mapCityState(updated, now);
  });

  writeAuditEntry("game.research.start", { userId, researchType });
  emitCityUpdated([userId], state.cityId);
  emitFogUpdated(userId, state.cityId);
  return state;
}

export async function createMarch(
  userId: string,
  payload: CreateMarchPayload,
): Promise<MarchCommandResponse> {
  await reconcileWorld();
  const now = new Date();
  const result = await prisma.$transaction((tx) => createMarchTx(tx, userId, now, payload));

  writeAuditEntry("game.march.create", {
    userId,
    objective: payload.objective ?? "CITY_ATTACK",
    targetCityId: "targetCityId" in payload ? payload.targetCityId : null,
    targetPoiId: "targetPoiId" in payload ? payload.targetPoiId : null,
    commanderId: payload.commanderId,
    troops: payload.troops,
  });
  emitMarchCreated([userId], result.originCityId, result.response.march.id);
  emitCityUpdated([userId], result.originCityId);
  if (result.targetCityId) {
    emitMapUpdated(result.targetCityId);
  }
  if (result.targetPoiId) {
    emitMapUpdated(result.originCityId);
  }
  return result.response;
}

export async function createMarchFromAttack(userId: string, targetCityId: string): Promise<MarchCommandResponse> {
  await reconcileWorld();
  const now = new Date();
  const result = await prisma.$transaction(async (tx) => {
    const { city } = await snapshotCityTx(tx, userId, now);
    const commander = getPrimaryCommander(city);
    if (!commander) {
      throw new HttpError(400, "COMMANDER_REQUIRED", "A primary commander is required to launch a march.");
    }

    const garrison = getTroopLedger(
      city.troopGarrisons.map((troop) => ({
        troopType: troop.troopType as TroopType,
        quantity: troop.quantity,
      })),
    );
    const troops = buildCompatibilityTroopPayload(garrison);
    if (Object.values(troops).every((value) => value <= 0)) {
      throw new HttpError(400, "INSUFFICIENT_TROOPS", "No troops are available for an immediate compatibility attack.");
    }

    return createMarchTx(tx, userId, now, {
      targetCityId,
      commanderId: commander.id,
      troops,
    });
  });

  writeAuditEntry("game.attack.compat", { userId, targetCityId });
  emitMarchCreated([userId], result.originCityId, result.response.march.id);
  emitCityUpdated([userId], result.originCityId);
  if (result.targetCityId) {
    emitMapUpdated(result.targetCityId);
  }
  return result.response;
}

export async function recallMarch(userId: string, marchId: string): Promise<CityState> {
  await reconcileWorld();
  const now = new Date();

  const state = await prisma.$transaction(async (tx) => {
    const { city } = await snapshotCityTx(tx, userId, now);
    const march = city.outgoingMarches.find((entry) => entry.id === marchId);
    if (!march) {
      throw new HttpError(404, "MARCH_NOT_FOUND", "That march could not be found.");
    }

    const garrison = getTroopLedger(
      city.troopGarrisons.map((troop) => ({
        troopType: troop.troopType as TroopType,
        quantity: troop.quantity,
      })),
    );
    const returningTroops = {
      INFANTRY: march.infantryCount,
      ARCHER: march.archerCount,
      CAVALRY: march.cavalryCount,
    };
    await updateTroopGarrisonTx(tx, city.id, addTroops(garrison, returningTroops));

    const cargoKey = march.cargoResourceType ? getPoiResourceKey(march.cargoResourceType) : null;
    if (march.state === "RETURNING" && cargoKey && march.cargoAmount > 0) {
      const nextResources = addResources(getResourceLedger(city), {
        wood: cargoKey === "wood" ? march.cargoAmount : 0,
        stone: cargoKey === "stone" ? march.cargoAmount : 0,
        food: cargoKey === "food" ? march.cargoAmount : 0,
        gold: cargoKey === "gold" ? march.cargoAmount : 0,
      });

      await tx.city.update({
        where: { id: city.id },
        data: resourceLedgerToCityUpdate(nextResources, now),
      });
    }

    await tx.march.update({
      where: { id: marchId },
      data: {
        state: "RECALLED",
        battleWindowId: null,
        cargoAmount: 0,
        resolvedAt: now,
      },
    });

    if (march.battleWindowId) {
      const remainingWindowMarches = await tx.march.count({
        where: {
          battleWindowId: march.battleWindowId,
          state: "STAGING",
        },
      });

      if (remainingWindowMarches === 0) {
        await tx.battleWindow.update({
          where: { id: march.battleWindowId },
          data: {
            resolvedAt: now,
          },
        });
      }
    }

    if (march.targetPoiId) {
      await syncPoiOccupancyStateTx(tx, march.targetPoiId);
    }

    const updated = await loadCityStateRecordOrThrow(tx, city.id);
    await refreshFogOfWar(tx, updated, now);
    return mapCityState(updated, now);
  });

  writeAuditEntry("game.march.recall", { userId, marchId });
  emitMarchUpdated([userId], state.cityId, marchId);
  emitCityUpdated([userId], state.cityId);
  return state;
}

export async function createAlliance(
  userId: string,
  payload: { name: string; tag: string; description?: string },
): Promise<AllianceView> {
  const result = await prisma.$transaction(async (tx) => {
    const existingMembership = await tx.allianceMember.findUnique({
      where: { userId },
      select: { id: true },
    });
    if (existingMembership) {
      throw new HttpError(409, "ALLIANCE_ALREADY_JOINED", "Leave the current alliance before creating a new one.");
    }

    const alliance = await tx.alliance.create({
      data: {
        name: payload.name.trim(),
        tag: payload.tag.trim(),
        description: payload.description?.trim() || null,
      },
    });

    await tx.allianceMember.create({
      data: {
        allianceId: alliance.id,
        userId,
        role: "LEADER",
      },
    });
    await appendAllianceLogTx(tx, alliance.id, "ALLIANCE_CREATED", `Alliance ${payload.name.trim()} was founded.`, userId);
    await progressGameTriggerTx(tx, userId, "alliance_joined", 1);

    const membership = await getAllianceForMemberTx(tx, userId);
    return {
      alliance: mapAllianceView(membership.alliance, userId),
      memberIds: membership.alliance.members.map((member) => member.userId),
    };
  });

  writeAuditEntry("alliance.create", { userId, allianceId: result.alliance.id, tag: result.alliance.tag });
  emitAllianceUpdated(result.memberIds, result.alliance.id);
  return result.alliance;
}

export async function joinAlliance(userId: string, allianceId: string): Promise<AllianceView> {
  const result = await prisma.$transaction(async (tx) => {
    const existingMembership = await tx.allianceMember.findUnique({
      where: { userId },
      select: { id: true },
    });
    if (existingMembership) {
      throw new HttpError(409, "ALLIANCE_ALREADY_JOINED", "Leave the current alliance before joining another.");
    }

    const alliance = await tx.alliance.findUnique({
      where: { id: allianceId },
      include: allianceStateInclude,
    });
    if (!alliance) {
      throw new HttpError(404, "ALLIANCE_NOT_FOUND", "That alliance could not be found.");
    }

    if (alliance.members.length >= ALLIANCE_MAX_MEMBERS) {
      throw new HttpError(409, "ALLIANCE_FULL", "That alliance is already at full capacity.");
    }

    await tx.allianceMember.create({
      data: {
        allianceId,
        userId,
        role: "RECRUIT",
      },
    });
    await appendAllianceLogTx(tx, allianceId, "MEMBER_JOINED", `A new member joined the alliance.`, userId);
    await progressGameTriggerTx(tx, userId, "alliance_joined", 1);

    const membership = await getAllianceForMemberTx(tx, userId);
    return {
      alliance: mapAllianceView(membership.alliance, userId),
      memberIds: membership.alliance.members.map((member) => member.userId),
    };
  });

  writeAuditEntry("alliance.join", { userId, allianceId });
  emitAllianceUpdated(result.memberIds, result.alliance.id);
  return result.alliance;
}

export async function leaveAlliance(userId: string): Promise<void> {
  const result = await prisma.$transaction(async (tx) => {
    const membership = await getAllianceForMemberTx(tx, userId);
    const remainingMembers = membership.alliance.members.filter((member) => member.userId !== userId);

    await tx.allianceHelpRequest.updateMany({
      where: {
        requesterUserId: userId,
        isOpen: true,
      },
      data: {
        isOpen: false,
        fulfilledAt: new Date(),
      },
    });

    await tx.allianceMember.delete({
      where: {
        userId,
      },
    });
    await appendAllianceLogTx(tx, membership.allianceId, "MEMBER_LEFT", "A member departed the alliance.", userId);

    if (remainingMembers.length === 0) {
      await tx.alliance.delete({
        where: { id: membership.allianceId },
      });

      return {
        allianceId: membership.allianceId,
        notifyUserIds: [userId],
      };
    }

    if (membership.role === "LEADER") {
      const successor = remainingMembers[0];
      await tx.allianceMember.update({
        where: { userId: successor.userId },
        data: { role: "LEADER" },
      });
    }

    return {
      allianceId: membership.allianceId,
      notifyUserIds: remainingMembers.map((member) => member.userId),
    };
  });

  writeAuditEntry("alliance.leave", { userId, allianceId: result.allianceId });
  emitAllianceUpdated(result.notifyUserIds, result.allianceId);
}

export async function sendAllianceChatMessage(userId: string, content: string): Promise<AllianceView> {
  const result = await prisma.$transaction(async (tx) => {
    const membership = await getAllianceForMemberTx(tx, userId);

    await tx.allianceChatMessage.create({
      data: {
        allianceId: membership.allianceId,
        userId,
        content: content.trim(),
      },
    });
    await appendAllianceLogTx(tx, membership.allianceId, "CHAT_MESSAGE", "Alliance channel updated.", userId);

    const overflow = await tx.allianceChatMessage.findMany({
      where: {
        allianceId: membership.allianceId,
      },
      orderBy: {
        createdAt: "desc",
      },
      skip: ALLIANCE_CHAT_HISTORY_LIMIT,
      select: { id: true },
    });

    if (overflow.length > 0) {
      await tx.allianceChatMessage.deleteMany({
        where: {
          id: {
            in: overflow.map((message) => message.id),
          },
        },
      });
    }

    const refreshed = await getAllianceForMemberTx(tx, userId);
    return {
      alliance: mapAllianceView(refreshed.alliance, userId),
      memberIds: refreshed.alliance.members.map((member) => member.userId),
    };
  });

  writeAuditEntry("alliance.chat.send", { userId, allianceId: result.alliance.id });
  emitAllianceUpdated(result.memberIds, result.alliance.id);
  return result.alliance;
}

export async function requestAllianceHelp(userId: string, kind: AllianceHelpKind): Promise<AllianceView> {
  await reconcileWorld();
  const now = new Date();

  const result = await prisma.$transaction(async (tx) => {
    const membership = await getAllianceForMemberTx(tx, userId);
    const { city } = await snapshotCityTx(tx, userId, now);
    const helpTarget = getHelpRequestLabel(kind, city);

    const existing = await tx.allianceHelpRequest.findUnique({
      where: {
        kind_targetId: {
          kind,
          targetId: helpTarget.targetId,
        },
      },
    });
    if (existing?.isOpen) {
      throw new HttpError(409, "HELP_ALREADY_REQUESTED", "Alliance help is already open for that queue.");
    }

    await tx.allianceHelpRequest.upsert({
      where: {
        kind_targetId: {
          kind,
          targetId: helpTarget.targetId,
        },
      },
      create: {
        allianceId: membership.allianceId,
        requesterUserId: userId,
        cityId: city.id,
        kind,
        targetId: helpTarget.targetId,
        label: helpTarget.label,
        maxHelps: ALLIANCE_HELP_MAX_RESPONSES,
      },
      update: {
        allianceId: membership.allianceId,
        requesterUserId: userId,
        cityId: city.id,
        label: helpTarget.label,
        helpCount: 0,
        maxHelps: ALLIANCE_HELP_MAX_RESPONSES,
        isOpen: true,
        fulfilledAt: null,
        createdAt: now,
      },
    });

    const refreshed = await getAllianceForMemberTx(tx, userId);
    return {
      alliance: mapAllianceView(refreshed.alliance, userId),
      memberIds: refreshed.alliance.members.map((member) => member.userId),
    };
  });

  writeAuditEntry("alliance.help.request", { userId, kind, allianceId: result.alliance.id });
  emitAllianceUpdated(result.memberIds, result.alliance.id);
  return result.alliance;
}

export async function respondAllianceHelp(userId: string, helpRequestId: string): Promise<AllianceView> {
  await reconcileWorld();
  const now = new Date();

  const result = await prisma.$transaction(async (tx) => {
    const membership = await getAllianceForMemberTx(tx, userId);
    const helpRequest = await tx.allianceHelpRequest.findUnique({
      where: { id: helpRequestId },
      include: {
        responses: true,
      },
    });

    if (!helpRequest || helpRequest.allianceId !== membership.allianceId) {
      throw new HttpError(404, "HELP_REQUEST_NOT_FOUND", "That alliance help request could not be found.");
    }
    if (!helpRequest.isOpen) {
      throw new HttpError(409, "HELP_REQUEST_CLOSED", "That alliance help request is already closed.");
    }
    if (helpRequest.requesterUserId === userId) {
      throw new HttpError(409, "HELP_SELF_RESPONSE", "You cannot answer your own alliance help request.");
    }

    if (helpRequest.responses.some((response) => response.helperUserId === userId)) {
      throw new HttpError(409, "HELP_ALREADY_GIVEN", "This player has already responded to that help request.");
    }

    await applyAllianceHelpReductionTx(tx, helpRequest, now);
    await tx.allianceHelpResponse.create({
      data: {
        helpRequestId,
        helperUserId: userId,
      },
    });
    await addAllianceContributionTx(tx, membership.allianceId, userId, 5);
    await appendAllianceLogTx(tx, membership.allianceId, "HELP_RESPONSE", "An alliance help request was answered.", userId);
    await progressGameTriggerTx(tx, userId, "alliance_help_responded", 1, now);

    const nextHelpCount = helpRequest.helpCount + 1;
    await tx.allianceHelpRequest.update({
      where: { id: helpRequestId },
      data: {
        helpCount: nextHelpCount,
        isOpen: nextHelpCount < helpRequest.maxHelps,
        fulfilledAt: nextHelpCount < helpRequest.maxHelps ? null : now,
      },
    });

    const refreshed = await getAllianceForMemberTx(tx, userId);
    return {
      alliance: mapAllianceView(refreshed.alliance, userId),
      memberIds: refreshed.alliance.members.map((member) => member.userId),
    };
  });

  writeAuditEntry("alliance.help.respond", { userId, helpRequestId, allianceId: result.alliance.id });
  emitAllianceUpdated(result.memberIds, result.alliance.id);
  return result.alliance;
}

export async function donateAllianceResources(
  userId: string,
  donation: { wood: number; stone: number; food: number; gold: number },
): Promise<AllianceView> {
  await reconcileWorld();
  const now = new Date();

  const result = await prisma.$transaction(async (tx) => {
    const membership = await getAllianceForMemberTx(tx, userId);
    const { city } = await snapshotCityTx(tx, userId, now);
    const cityResources = getResourceLedger(city);

    if (!hasEnoughResources(cityResources, donation)) {
      throw new HttpError(400, "INSUFFICIENT_RESOURCES", "Not enough city resources are available for that donation.");
    }

    await tx.city.update({
      where: { id: city.id },
      data: resourceLedgerToCityUpdate(spendResources(cityResources, donation), now),
    });

    await tx.alliance.update({
      where: { id: membership.allianceId },
      data: {
        wood: { increment: donation.wood },
        stone: { increment: donation.stone },
        food: { increment: donation.food },
        gold: { increment: donation.gold },
      },
    });
    await tx.allianceDonation.create({
      data: {
        allianceId: membership.allianceId,
        userId,
        wood: donation.wood,
        stone: donation.stone,
        food: donation.food,
        gold: donation.gold,
        totalValue: donation.wood + donation.stone + donation.food + donation.gold,
      },
    });
    await addAllianceContributionTx(
      tx,
      membership.allianceId,
      userId,
      Math.max(1, Math.floor((donation.wood + donation.stone + donation.food + donation.gold) / 100)),
    );
    await appendAllianceLogTx(tx, membership.allianceId, "TREASURY_DONATION", "Alliance treasury received a donation.", userId);

    const refreshed = await getAllianceForMemberTx(tx, userId);
    return {
      alliance: mapAllianceView(refreshed.alliance, userId),
      memberIds: refreshed.alliance.members.map((member) => member.userId),
      cityId: city.id,
    };
  });

  writeAuditEntry("alliance.donate", { userId, allianceId: result.alliance.id, donation });
  emitCityUpdated([userId], result.cityId);
  emitAllianceUpdated(result.memberIds, result.alliance.id);
  return result.alliance;
}

export async function updateAllianceMemberRole(
  userId: string,
  targetUserId: string,
  role: AllianceRole,
): Promise<AllianceView> {
  const result = await prisma.$transaction(async (tx) => {
    const actorMembership = await getAllianceForMemberTx(tx, userId);
    if (!isAllianceOfficerRole(actorMembership.role)) {
      throw new HttpError(403, "ALLIANCE_FORBIDDEN", "Only alliance officers can change member roles.");
    }

    const targetMembership = actorMembership.alliance.members.find((member) => member.userId === targetUserId);
    if (!targetMembership) {
      throw new HttpError(404, "ALLIANCE_MEMBER_NOT_FOUND", "That alliance member could not be found.");
    }

    if (targetUserId === userId && role !== "LEADER") {
      throw new HttpError(409, "ALLIANCE_SELF_ROLE_BLOCKED", "The leader cannot demote themselves directly.");
    }

    if (actorMembership.role === "OFFICER") {
      if (targetMembership.role === "LEADER" || targetMembership.role === "OFFICER") {
        throw new HttpError(403, "ALLIANCE_FORBIDDEN", "Officers cannot change the alliance command staff.");
      }
      if (role === "LEADER" || role === "OFFICER") {
        throw new HttpError(403, "ALLIANCE_FORBIDDEN", "Only alliance leaders can promote officers or transfer leadership.");
      }
    }

    if (targetMembership.role === role) {
      const refreshed = await getAllianceForMemberTx(tx, userId);
      return {
        alliance: mapAllianceView(refreshed.alliance, userId),
        memberIds: refreshed.alliance.members.map((member) => member.userId),
      };
    }

    if (role === "LEADER") {
      await tx.allianceMember.update({
        where: { userId: targetUserId },
        data: { role: "LEADER" },
      });
      await tx.allianceMember.update({
        where: { userId },
        data: { role: "OFFICER" },
      });
    } else {
      await tx.allianceMember.update({
        where: { userId: targetUserId },
        data: { role },
      });
    }

    const refreshed = await getAllianceForMemberTx(tx, userId);
    return {
      alliance: mapAllianceView(refreshed.alliance, userId),
      memberIds: refreshed.alliance.members.map((member) => member.userId),
    };
  });

  writeAuditEntry("alliance.role.update", { userId, targetUserId, role, allianceId: result.alliance.id });
  emitAllianceUpdated(result.memberIds, result.alliance.id);
  return result.alliance;
}

function buildRallySupportBonus(troops: TroopStock): number {
  return Math.min(0.18, sumTroops(troops) / 1200);
}

const RALLY_PREP_DURATION_MS = 5 * 60 * 1000;
const RALLY_MAX_PARTICIPANTS = 3;

function mergeTroops(parts: TroopStock[]): TroopStock {
  return parts.reduce<TroopStock>(
    (sum, troops) => ({
      INFANTRY: sum.INFANTRY + troops.INFANTRY,
      ARCHER: sum.ARCHER + troops.ARCHER,
      CAVALRY: sum.CAVALRY + troops.CAVALRY,
    }),
    { INFANTRY: 0, ARCHER: 0, CAVALRY: 0 },
  );
}

function mapScoutMissionView(
  scout: {
    id: string;
    state: "ENROUTE" | "RESOLVED" | "RECALLED";
    targetKind: "CITY" | "POI";
    targetCityId: string | null;
    targetPoiId: string | null;
    etaAt: Date;
  },
  now: Date,
) {
  return {
    id: scout.id,
    state: scout.state,
    targetKind: scout.targetKind,
    targetCityId: scout.targetCityId,
    targetPoiId: scout.targetPoiId,
    etaAt: scout.etaAt.toISOString(),
    remainingSeconds: Math.max(0, Math.ceil((scout.etaAt.getTime() - now.getTime()) / 1000)),
  };
}

export async function claimTaskReward(userId: string, taskId: string) {
  await reconcileWorld();
  const now = new Date();
  await prisma.$transaction((tx) => claimTaskTx(tx, userId, taskId, now));
  writeAuditEntry("game.task.claim", { userId, taskId });
}

export async function useInventoryItem(userId: string, payload: { itemKey: ItemKey; targetKind?: ItemTargetKind; targetId?: string }) {
  await reconcileWorld();
  const now = new Date();
  const cityId = await prisma.$transaction(async (tx) => {
    await useInventoryItemTx(tx, userId, payload, now);
    const city = await tx.user.findUniqueOrThrow({
      where: { id: userId },
      select: { city: { select: { id: true } } },
    });
    return city.city?.id ?? null;
  });
  writeAuditEntry("game.inventory.use", { userId, itemKey: payload.itemKey, targetKind: payload.targetKind ?? null });
  if (cityId) {
    emitCityUpdated([userId], cityId);
  }
}

export async function upgradeCommander(userId: string, commanderId: string) {
  await reconcileWorld();
  const now = new Date();
  const response = await prisma.$transaction(async (tx) => {
    await upgradeCommanderTx(tx, userId, commanderId, now);
    return getCommanderProgressViewTx(tx, userId);
  });
  writeAuditEntry("game.commander.upgrade", { userId, commanderId });
  return { commanders: response };
}

export async function createScout(
  userId: string,
  payload: { targetCityId?: string; targetPoiId?: string },
): Promise<ScoutMutationResponse> {
  await reconcileWorld();
  const now = new Date();
  const scout = await prisma.$transaction(async (tx) => {
    const { city } = await snapshotCityTx(tx, userId, now);
    const targetKind = payload.targetCityId ? "CITY" : "POI";
    const targetCity = payload.targetCityId ? await loadCityStateRecordOrThrow(tx, payload.targetCityId) : null;
    const targetPoi = payload.targetPoiId ? await loadMapPoiRecordOrThrow(tx, payload.targetPoiId) : null;

    if (!targetCity && !targetPoi) {
      throw new HttpError(400, "SCOUT_TARGET_REQUIRED", "A scout target is required.");
    }

    const distance = manhattanDistance(
      { x: city.x, y: city.y },
      targetCity ? { x: targetCity.x, y: targetCity.y } : { x: targetPoi!.x, y: targetPoi!.y },
    );
    if (distance > MAX_MARCH_DISTANCE) {
      throw new HttpError(400, "TARGET_OUT_OF_RANGE", "That scout target is outside the current command range.");
    }

    const scoutMission = await tx.scoutMission.create({
      data: {
        ownerUserId: userId,
        ownerCityId: city.id,
        originX: city.x,
        originY: city.y,
        targetKind,
        targetCityId: targetCity?.id ?? null,
        targetPoiId: targetPoi?.id ?? null,
        etaAt: new Date(now.getTime() + Math.max(8_000, distance * 12_000)),
      },
    });

    return mapScoutMissionView(scoutMission, now);
  });

  await prisma.$transaction((tx) => progressGameTriggerTx(tx, userId, "power_gain", 1, now));
  writeAuditEntry("game.scout.create", { userId, targetCityId: payload.targetCityId ?? null, targetPoiId: payload.targetPoiId ?? null });
  return { scout };
}

export async function retargetMarch(
  userId: string,
  marchId: string,
  payload: { targetCityId?: string; targetPoiId?: string },
): Promise<MarchCommandResponse> {
  await reconcileWorld();
  const now = new Date();

  const march = await prisma.$transaction(async (tx) => {
    const { city } = await snapshotCityTx(tx, userId, now);
    const currentMarch = city.outgoingMarches.find((entry) => entry.id === marchId);
    if (!currentMarch || currentMarch.state !== "ENROUTE") {
      throw new HttpError(409, "MARCH_RETARGET_BLOCKED", "Only enroute marches can be retargeted.");
    }

    const oldTarget = getMarchTargetCoordinates(currentMarch);
    const currentPosition = getMarchPosition(
      { x: currentMarch.originX, y: currentMarch.originY },
      oldTarget,
      currentMarch.startsAt,
      currentMarch.etaAt,
      now,
    );

    let targetCityId: string | null = null;
    let targetPoiId: string | null = null;
    let targetCoordinates = oldTarget;
    let defenderPowerSnapshot = currentMarch.defenderPowerSnapshot;

    if (currentMarch.objective === "CITY_ATTACK") {
      if (!payload.targetCityId) {
        throw new HttpError(400, "RETARGET_CITY_REQUIRED", "A city target is required for this march.");
      }
      const targetCity = await loadCityStateRecordOrThrow(tx, payload.targetCityId);
      if (targetCity.peaceShieldUntil && targetCity.peaceShieldUntil > now) {
        throw new HttpError(409, "TARGET_SHIELDED", "That city is currently protected by a peace shield.");
      }
      targetCityId = targetCity.id;
      targetCoordinates = { x: targetCity.x, y: targetCity.y };

      const defenderResearch = getResearchLevels(
        targetCity.researchLevels.map((research) => ({
          researchType: research.researchType as ResearchType,
          level: research.level,
        })),
      );
      const defenderBuildings = getBuildingLevels(
        targetCity.buildings.map((building) => ({
          buildingType: building.buildingType as BuildingType,
          level: building.level,
        })),
      );
      const defenderTroops = getTroopLedger(
        targetCity.troopGarrisons.map((troop) => ({
          troopType: troop.troopType as TroopType,
          quantity: troop.quantity,
        })),
      );
      defenderPowerSnapshot = getDefensePower(
        defenderTroops,
        defenderBuildings,
        toCommanderBonuses(getPrimaryCommander(targetCity)),
        defenderResearch,
      );
    } else {
      if (!payload.targetPoiId) {
        throw new HttpError(400, "RETARGET_POI_REQUIRED", "A POI target is required for this march.");
      }
      const targetPoi = await loadMapPoiRecordOrThrow(tx, payload.targetPoiId);
      const hasLockedOccupant = targetPoi.targetMarches.some((entry) => entry.state === "GATHERING" && entry.id !== marchId);
      if (hasLockedOccupant || (targetPoi.state !== "ACTIVE" && targetPoi.state !== "OCCUPIED")) {
        throw new HttpError(409, "POI_OCCUPIED", "That point of interest is not available.");
      }
      targetPoiId = targetPoi.id;
      targetCoordinates = { x: targetPoi.x, y: targetPoi.y };
      defenderPowerSnapshot = currentMarch.objective === "BARBARIAN_ATTACK" ? getTroopDefensePower(getBarbarianCampTroops(targetPoi.level)) : null;
    }

    const commander = city.owner.commanders.find((entry) => entry.id === currentMarch.commanderId) ?? getPrimaryCommander(city);
    const researchLevels = getResearchLevels(
      city.researchLevels.map((research) => ({
        researchType: research.researchType as ResearchType,
        level: research.level,
      })),
    );
    const durationMs = getMarchDurationMs(
      manhattanDistance(currentPosition, targetCoordinates),
      {
        INFANTRY: currentMarch.infantryCount,
        ARCHER: currentMarch.archerCount,
        CAVALRY: currentMarch.cavalryCount,
      },
      toCommanderBonuses(commander),
      researchLevels,
    );

    const updatedMarch = await tx.march.update({
      where: { id: marchId },
      data: {
        originX: currentPosition.x,
        originY: currentPosition.y,
        targetCityId,
        targetPoiId,
        etaAt: new Date(now.getTime() + durationMs),
        defenderPowerSnapshot,
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
    });

    if (currentMarch.targetPoiId && currentMarch.targetPoiId !== targetPoiId) {
      await syncPoiOccupancyStateTx(tx, currentMarch.targetPoiId);
    }

    if (targetPoiId) {
      await syncPoiOccupancyStateTx(tx, targetPoiId);
    }

    return mapMarchView(updatedMarch, { x: city.x, y: city.y }, now);
  });

  writeAuditEntry("game.march.retarget", { userId, marchId, targetCityId: payload.targetCityId ?? null, targetPoiId: payload.targetPoiId ?? null });
  return { march };
}

export async function createRally(
  userId: string,
  payload:
    | { objective?: "CITY_ATTACK"; targetCityId: string; commanderId: string; troops: TroopStock }
    | { objective: "BARBARIAN_ATTACK"; targetPoiId: string; commanderId: string; troops: TroopStock },
): Promise<RallyMutationResponse> {
  await reconcileWorld();
  const now = new Date();

  const result = await prisma.$transaction(async (tx) => {
    const membership = await getAllianceMembershipTx(tx, userId);
    if (!membership?.alliance) {
      throw new HttpError(409, "ALLIANCE_REQUIRED", "Only alliance members can open rallies.");
    }

    const { city } = await snapshotCityTx(tx, userId, now);
    const commander = city.owner.commanders.find((entry) => entry.id === payload.commanderId);
    if (!commander) {
      throw new HttpError(404, "COMMANDER_NOT_FOUND", "That commander is not owned by the current player.");
    }

    const currentTroops = getTroopLedger(
      city.troopGarrisons.map((troop) => ({
        troopType: troop.troopType as TroopType,
        quantity: troop.quantity,
      })),
    );
    if (!hasEnoughTroops(currentTroops, payload.troops)) {
      throw new HttpError(409, "INSUFFICIENT_TROOPS", "Not enough troops are available for that rally.");
    }

    const objective: MarchObjective = payload.objective ?? "CITY_ATTACK";
    let targetCityId: string | null = null;
    let targetPoiId: string | null = null;
    let targetCoordinates = { x: city.x, y: city.y };

    if (objective === "CITY_ATTACK" && "targetCityId" in payload) {
      const targetCity = await loadCityStateRecordOrThrow(tx, payload.targetCityId);
      if (targetCity.ownerId === userId) {
        throw new HttpError(409, "TARGET_CITY_INVALID", "A rally cannot target the current city.");
      }
      if (targetCity.peaceShieldUntil && targetCity.peaceShieldUntil > now) {
        throw new HttpError(409, "TARGET_SHIELDED", "That city is currently protected by a peace shield.");
      }
      targetCityId = targetCity.id;
      targetCoordinates = { x: targetCity.x, y: targetCity.y };
    } else if ("targetPoiId" in payload) {
      const targetPoi = await loadMapPoiRecordOrThrow(tx, payload.targetPoiId);
      if (targetPoi.kind !== "BARBARIAN_CAMP" || targetPoi.state !== "ACTIVE") {
        throw new HttpError(409, "RALLY_TARGET_INVALID", "Rallies currently support active barbarian camps only.");
      }
      targetPoiId = targetPoi.id;
      targetCoordinates = { x: targetPoi.x, y: targetPoi.y };
    } else {
      throw new HttpError(400, "RALLY_TARGET_REQUIRED", "A rally target is required.");
    }

    if (manhattanDistance({ x: city.x, y: city.y }, targetCoordinates) > MAX_MARCH_DISTANCE) {
      throw new HttpError(400, "TARGET_OUT_OF_RANGE", "That rally target is outside the current command range.");
    }

    const rally = await tx.rally.create({
      data: {
        allianceId: membership.alliance.id,
        leaderUserId: userId,
        leaderCityId: city.id,
        targetCityId,
        targetPoiId,
        commanderId: commander.id,
        objective,
        launchAt: new Date(now.getTime() + RALLY_PREP_DURATION_MS),
        members: {
          create: {
            userId,
            cityId: city.id,
            infantryCount: payload.troops.INFANTRY,
            archerCount: payload.troops.ARCHER,
            cavalryCount: payload.troops.CAVALRY,
          },
        },
      },
      include: rallyInclude,
    });

    await appendAllianceLogTx(tx, membership.alliance.id, "RALLY_CREATED", `${city.owner.username} opened a rally.`, userId);
    await addAllianceContributionTx(tx, membership.alliance.id, userId, 5);

    return {
      rally: mapRallyView(rally, now),
      memberIds: membership.alliance.members.map((member) => member.userId),
      allianceId: membership.alliance.id,
    };
  });

  writeAuditEntry("game.rally.create", {
    userId,
    objective: payload.objective ?? "CITY_ATTACK",
    targetCityId: "targetCityId" in payload ? payload.targetCityId : null,
    targetPoiId: "targetPoiId" in payload ? payload.targetPoiId : null,
  });
  emitRallyUpdated(result.memberIds, result.rally.id);
  emitAllianceUpdated(result.memberIds, result.allianceId);
  emitLeaderboardUpdated(result.memberIds);
  return { rally: result.rally };
}

export async function joinRally(
  userId: string,
  rallyId: string,
  payload: { troops: TroopStock },
): Promise<RallyMutationResponse> {
  await reconcileWorld();
  const now = new Date();

  const result = await prisma.$transaction(async (tx) => {
    const membership = await getAllianceMembershipTx(tx, userId);
    if (!membership?.alliance) {
      throw new HttpError(409, "ALLIANCE_REQUIRED", "Only alliance members can join rallies.");
    }

    const rally = await tx.rally.findFirst({
      where: {
        id: rallyId,
        allianceId: membership.alliance.id,
      },
      include: rallyInclude,
    });
    if (!rally) {
      throw new HttpError(404, "RALLY_NOT_FOUND", "That rally could not be found.");
    }
    if (rally.state !== "OPEN" || rally.launchAt <= now) {
      throw new HttpError(409, "RALLY_JOIN_BLOCKED", "That rally is no longer accepting members.");
    }

    const { city } = await snapshotCityTx(tx, userId, now);
    const currentTroops = getTroopLedger(
      city.troopGarrisons.map((troop) => ({
        troopType: troop.troopType as TroopType,
        quantity: troop.quantity,
      })),
    );
    if (!hasEnoughTroops(currentTroops, payload.troops)) {
      throw new HttpError(409, "INSUFFICIENT_TROOPS", "Not enough troops are available for that rally.");
    }

    const existingMember = rally.members.find((member) => member.userId === userId);
    if (!existingMember && rally.members.length >= RALLY_MAX_PARTICIPANTS) {
      throw new HttpError(409, "RALLY_FULL", "That rally already has the maximum number of participants.");
    }

    if (existingMember) {
      await tx.rallyMember.update({
        where: { id: existingMember.id },
        data: {
          infantryCount: payload.troops.INFANTRY,
          archerCount: payload.troops.ARCHER,
          cavalryCount: payload.troops.CAVALRY,
        },
      });
    } else {
      await tx.rallyMember.create({
        data: {
          rallyId,
          userId,
          cityId: city.id,
          infantryCount: payload.troops.INFANTRY,
          archerCount: payload.troops.ARCHER,
          cavalryCount: payload.troops.CAVALRY,
        },
      });
    }

    const refreshed = await tx.rally.findUniqueOrThrow({
      where: { id: rallyId },
      include: rallyInclude,
    });
    const supportTroops = mergeTroops(
      refreshed.members
        .filter((member) => member.userId !== refreshed.leaderUserId)
        .map((member) => ({
          INFANTRY: member.infantryCount,
          ARCHER: member.archerCount,
          CAVALRY: member.cavalryCount,
        })),
    );
    const updated = await tx.rally.update({
      where: { id: rallyId },
      data: {
        supportBonusPct: buildRallySupportBonus(supportTroops),
      },
      include: rallyInclude,
    });

    await appendAllianceLogTx(tx, membership.alliance.id, "RALLY_JOINED", `${city.owner.username} joined a rally.`, userId);
    await addAllianceContributionTx(tx, membership.alliance.id, userId, 3);

    return {
      rally: mapRallyView(updated, now),
      memberIds: membership.alliance.members.map((member) => member.userId),
      allianceId: membership.alliance.id,
    };
  });

  writeAuditEntry("game.rally.join", { userId, rallyId });
  emitRallyUpdated(result.memberIds, result.rally.id);
  emitAllianceUpdated(result.memberIds, result.allianceId);
  emitLeaderboardUpdated(result.memberIds);
  return { rally: result.rally };
}

export async function launchRally(userId: string, rallyId: string): Promise<RallyMutationResponse> {
  await reconcileWorld();
  const now = new Date();

  const result = await prisma.$transaction(async (tx) => {
    const membership = await getAllianceMembershipTx(tx, userId);
    if (!membership?.alliance) {
      throw new HttpError(409, "ALLIANCE_REQUIRED", "Only alliance members can launch rallies.");
    }

    const rally = await tx.rally.findFirst({
      where: {
        id: rallyId,
        allianceId: membership.alliance.id,
      },
      include: rallyInclude,
    });
    if (!rally) {
      throw new HttpError(404, "RALLY_NOT_FOUND", "That rally could not be found.");
    }
    if (rally.leaderUserId !== userId) {
      throw new HttpError(403, "RALLY_FORBIDDEN", "Only the rally leader can launch this rally.");
    }
    if (rally.state !== "OPEN") {
      throw new HttpError(409, "RALLY_LAUNCH_BLOCKED", "That rally has already launched.");
    }

    const leaderCity = await loadCityStateRecordOrThrow(tx, rally.leaderCityId);
    const commander = leaderCity.owner.commanders.find((entry) => entry.id === rally.commanderId);
    if (!commander) {
      throw new HttpError(404, "COMMANDER_NOT_FOUND", "The rally commander is no longer available.");
    }

    let targetCoordinates = { x: leaderCity.x, y: leaderCity.y };
    let defenderPowerSnapshot: number | null = null;

    if (rally.objective === "CITY_ATTACK") {
      if (!rally.targetCityId) {
        throw new HttpError(409, "RALLY_TARGET_INVALID", "This rally is missing a city target.");
      }
      const targetCity = await loadCityStateRecordOrThrow(tx, rally.targetCityId);
      if (targetCity.peaceShieldUntil && targetCity.peaceShieldUntil > now) {
        throw new HttpError(409, "TARGET_SHIELDED", "That city is currently protected by a peace shield.");
      }
      targetCoordinates = { x: targetCity.x, y: targetCity.y };
      const defenderResearch = getResearchLevels(
        targetCity.researchLevels.map((research) => ({
          researchType: research.researchType as ResearchType,
          level: research.level,
        })),
      );
      const defenderBuildings = getBuildingLevels(
        targetCity.buildings.map((building) => ({
          buildingType: building.buildingType as BuildingType,
          level: building.level,
        })),
      );
      defenderPowerSnapshot = getDefensePower(
        getTroopLedger(
          targetCity.troopGarrisons.map((troop) => ({
            troopType: troop.troopType as TroopType,
            quantity: troop.quantity,
          })),
        ),
        defenderBuildings,
        toCommanderBonuses(getPrimaryCommander(targetCity)),
        defenderResearch,
      );
    } else {
      if (!rally.targetPoiId) {
        throw new HttpError(409, "RALLY_TARGET_INVALID", "This rally is missing a POI target.");
      }
      const targetPoi = await loadMapPoiRecordOrThrow(tx, rally.targetPoiId);
      if (targetPoi.kind !== "BARBARIAN_CAMP" || targetPoi.state !== "ACTIVE") {
        throw new HttpError(409, "RALLY_TARGET_INVALID", "That barbarian camp is no longer available.");
      }
      targetCoordinates = { x: targetPoi.x, y: targetPoi.y };
      defenderPowerSnapshot = getTroopDefensePower(getBarbarianCampTroops(targetPoi.level));
      await tx.mapPoi.update({
        where: { id: targetPoi.id },
        data: {
          state: "OCCUPIED",
        },
      });
    }

    const memberTroops: TroopStock[] = [];
    for (const member of rally.members) {
      const memberCity = await loadCityStateRecordOrThrow(tx, member.cityId);
      const available = getTroopLedger(
        memberCity.troopGarrisons.map((troop) => ({
          troopType: troop.troopType as TroopType,
          quantity: troop.quantity,
        })),
      );
      const pledged = {
        INFANTRY: member.infantryCount,
        ARCHER: member.archerCount,
        CAVALRY: member.cavalryCount,
      };
      if (!hasEnoughTroops(available, pledged)) {
        throw new HttpError(409, "RALLY_MEMBER_TROOPS_UNAVAILABLE", "A rally member no longer has the pledged troops available.");
      }
      await updateTroopGarrisonTx(tx, member.cityId, spendTroops(available, pledged));
      memberTroops.push(pledged);
    }

    const totalTroops = mergeTroops(memberTroops);
    if (sumTroops(totalTroops) <= 0) {
      throw new HttpError(409, "RALLY_EMPTY", "A rally requires troops before it can launch.");
    }

    const leaderResearch = getResearchLevels(
      leaderCity.researchLevels.map((research) => ({
        researchType: research.researchType as ResearchType,
        level: research.level,
      })),
    );
    const durationMs = getMarchDurationMs(
      manhattanDistance({ x: leaderCity.x, y: leaderCity.y }, targetCoordinates),
      totalTroops,
      toCommanderBonuses(commander),
      leaderResearch,
    );

    const attackPowerSnapshot = getAttackPower(totalTroops, toCommanderBonuses(commander), leaderResearch);
    const launchedMarch = await tx.march.create({
      data: {
        ownerUserId: rally.leaderUserId,
        ownerCityId: rally.leaderCityId,
        originX: leaderCity.x,
        originY: leaderCity.y,
        targetCityId: rally.targetCityId,
        targetPoiId: rally.targetPoiId,
        commanderId: rally.commanderId,
        objective: rally.objective,
        state: "ENROUTE",
        supportBonusPct: rally.supportBonusPct,
        infantryCount: totalTroops.INFANTRY,
        archerCount: totalTroops.ARCHER,
        cavalryCount: totalTroops.CAVALRY,
        attackerPowerSnapshot: attackPowerSnapshot,
        defenderPowerSnapshot,
        startsAt: now,
        etaAt: new Date(now.getTime() + durationMs),
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
    });

    const updated = await tx.rally.update({
      where: { id: rally.id },
      data: {
        state: "LAUNCHED",
        launchAt: now,
        launchedMarchId: launchedMarch.id,
      },
      include: rallyInclude,
    });

    await appendAllianceLogTx(tx, membership.alliance.id, "RALLY_LAUNCHED", `${leaderCity.owner.username} launched a rally.`, userId);
    await addAllianceContributionTx(tx, membership.alliance.id, userId, 8);

    return {
      rally: mapRallyView(updated, now),
      march: mapMarchView(launchedMarch, { x: leaderCity.x, y: leaderCity.y }, now),
      cityId: leaderCity.id,
      memberIds: membership.alliance.members.map((member) => member.userId),
      allianceId: membership.alliance.id,
    };
  });

  writeAuditEntry("game.rally.launch", { userId, rallyId });
  emitRallyUpdated(result.memberIds, result.rally.id);
  emitAllianceUpdated(result.memberIds, result.allianceId);
  emitMarchCreated(result.memberIds, result.cityId, result.march.id);
  emitMapUpdated(result.cityId);
  emitCityUpdated(result.memberIds, result.cityId);
  emitLeaderboardUpdated(result.memberIds);
  return { rally: result.rally };
}

export async function updateAllianceAnnouncement(userId: string, content: string): Promise<AllianceView> {
  await reconcileWorld();
  const now = new Date();

  const result = await prisma.$transaction(async (tx) => {
    const membership = await getAllianceMembershipTx(tx, userId);
    if (!membership?.alliance) {
      throw new HttpError(409, "ALLIANCE_REQUIRED", "Only alliance members can post announcements.");
    }
    if (!isAllianceOfficerRole(membership.role)) {
      throw new HttpError(403, "ALLIANCE_FORBIDDEN", "Only officers can update alliance announcements.");
    }

    await tx.allianceAnnouncement.upsert({
      where: { allianceId: membership.alliance.id },
      create: {
        allianceId: membership.alliance.id,
        content,
        updatedByUserId: userId,
        updatedAt: now,
      },
      update: {
        content,
        updatedByUserId: userId,
        updatedAt: now,
      },
    });
    await appendAllianceLogTx(tx, membership.alliance.id, "ANNOUNCEMENT_UPDATED", "Alliance announcement updated.", userId);

    const refreshed = await getAllianceMembershipTx(tx, userId);
    return {
      alliance: mapAllianceView(refreshed!.alliance, userId),
      memberIds: refreshed!.alliance.members.map((member) => member.userId),
    };
  });

  writeAuditEntry("alliance.announcement.update", { userId });
  emitAllianceUpdated(result.memberIds, result.alliance.id);
  return result.alliance;
}

export async function createAllianceMarker(userId: string, payload: { label: string; x: number; y: number }): Promise<AllianceView> {
  await reconcileWorld();
  const now = new Date();

  const result = await prisma.$transaction(async (tx) => {
    const membership = await getAllianceMembershipTx(tx, userId);
    if (!membership?.alliance) {
      throw new HttpError(409, "ALLIANCE_REQUIRED", "Only alliance members can place markers.");
    }

    const user = await tx.user.findUniqueOrThrow({
      where: { id: userId },
      select: { username: true },
    });

    await tx.allianceMarker.create({
      data: {
        allianceId: membership.alliance.id,
        userId,
        label: payload.label,
        x: payload.x,
        y: payload.y,
        expiresAt: new Date(now.getTime() + ALLIANCE_MARKER_DURATION_MS),
      },
    });
    await appendAllianceLogTx(tx, membership.alliance.id, "MARKER_CREATED", `${user.username} placed a frontier marker.`, userId);
    await addAllianceContributionTx(tx, membership.alliance.id, userId, 1);

    const refreshed = await getAllianceMembershipTx(tx, userId);
    return {
      alliance: mapAllianceView(refreshed!.alliance, userId),
      memberIds: refreshed!.alliance.members.map((member) => member.userId),
    };
  });

  writeAuditEntry("alliance.marker.create", { userId, ...payload });
  emitAllianceUpdated(result.memberIds, result.alliance.id);
  emitLeaderboardUpdated(result.memberIds);
  return result.alliance;
}

export async function deleteAllianceMarker(userId: string, markerId: string): Promise<AllianceView> {
  await reconcileWorld();

  const result = await prisma.$transaction(async (tx) => {
    const membership = await getAllianceMembershipTx(tx, userId);
    if (!membership?.alliance) {
      throw new HttpError(409, "ALLIANCE_REQUIRED", "Only alliance members can remove markers.");
    }

    const marker = await tx.allianceMarker.findFirst({
      where: {
        id: markerId,
        allianceId: membership.alliance.id,
      },
      select: {
        id: true,
        userId: true,
      },
    });

    if (!marker) {
      throw new HttpError(404, "MARKER_NOT_FOUND", "That alliance marker could not be found.");
    }

    if (marker.userId !== userId && !isAllianceOfficerRole(membership.role)) {
      throw new HttpError(403, "ALLIANCE_FORBIDDEN", "Only officers can remove another member's marker.");
    }

    const user = await tx.user.findUniqueOrThrow({
      where: { id: userId },
      select: { username: true },
    });

    await tx.allianceMarker.delete({
      where: { id: marker.id },
    });
    await appendAllianceLogTx(tx, membership.alliance.id, "MARKER_REMOVED", `${user.username} removed a frontier marker.`, userId);

    const refreshed = await getAllianceMembershipTx(tx, userId);
    return {
      alliance: mapAllianceView(refreshed!.alliance, userId),
      memberIds: refreshed!.alliance.members.map((member) => member.userId),
    };
  });

  writeAuditEntry("alliance.marker.delete", { userId, markerId });
  emitAllianceUpdated(result.memberIds, result.alliance.id);
  return result.alliance;
}

export async function claimMailboxReward(userId: string, mailboxId: string) {
  await reconcileWorld();
  const now = new Date();
  await prisma.$transaction((tx) => claimMailboxEntryTx(tx, userId, mailboxId, now));
  writeAuditEntry("game.mailbox.claim", { userId, mailboxId });
  emitMailboxUpdated([userId], mailboxId);
  emitInventoryUpdated([userId]);
  emitCityUpdated([userId], (await getSessionUser(userId)).cityId);
}

export async function verifyStorePurchase(
  userId: string,
  payload: { platform: "APPLE_APP_STORE" | "GOOGLE_PLAY"; productId: string; purchaseToken: string },
): Promise<PurchaseVerifyResponse> {
  await reconcileWorld();
  const now = new Date();

  const result = await prisma.$transaction(async (tx) => {
    const validated =
      payload.purchaseToken.startsWith(`sandbox:${payload.productId}:`)
        ? await verifySandboxPurchaseToken(tx, userId, payload.productId, payload.purchaseToken, payload.platform, now)
        : await storeValidationPort.validatePurchase({
            ...payload,
            userId,
          }).then((response) => (response.ok ? "VALIDATED" : "REJECTED"));

    if (validated === "REJECTED") {
      throw new HttpError(400, "PURCHASE_INVALID", "The purchase receipt could not be validated.");
    }

    const entitlements = await getEntitlementsViewTx(tx, userId);
    return {
      status: validated,
      entitlements,
    };
  });

  writeAuditEntry("store.purchase.verify", { userId, productId: payload.productId, platform: payload.platform, status: result.status });
  emitStoreUpdated([userId]);
  emitMailboxUpdated([userId]);
  emitInventoryUpdated([userId]);
  emitEventUpdated([userId]);
  emitCityUpdated([userId], (await getSessionUser(userId)).cityId);
  return result;
}

export async function getSessionUser(userId: string): Promise<AuthUser> {
  const user = await prisma.$transaction(async (tx) => {
    await ensureWorldPoisTx(tx);
    const found = await getUserWithCityOrThrow(tx, userId);
    await ensureCityInfrastructureTx(tx, {
      cityId: found.city!.id,
      userId: found.id,
      username: found.username,
    });
    return found;
  });

  return toAuthUser(user);
}

export async function seedDemoPlayer(input: {
  username: string;
  password: string;
  cityName: string;
  coordinate: { x: number; y: number };
}): Promise<void> {
  const existing = await prisma.user.findUnique({
    where: { username: input.username },
    select: { id: true },
  });

  if (existing) {
    await prisma.$transaction(async (tx) => {
      const user = await getUserWithCityOrThrow(tx, existing.id);
      await ensureCityInfrastructureTx(tx, {
        cityId: user.city!.id,
        userId: user.id,
        username: user.username,
      });
      await ensureWorldPoisTx(tx);
    });
    return;
  }

  const passwordHash = await hashPassword(input.password);

  await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        username: input.username,
        passwordHash,
      },
    });

    await createStarterCityTx(tx, {
      userId: user.id,
      username: user.username,
      cityName: input.cityName,
      coordinate: input.coordinate,
    });
    await ensureWorldPoisTx(tx);
  });
}
