import { TroopType as PrismaTroopType, type Prisma } from "@prisma/client";
import type {
  AllianceHelpKind,
  AllianceRole,
  AllianceView,
  AuthUser,
  BuildingType,
  CityState,
  MarchCommandResponse,
  MarchObjective,
  RallyMutationResponse,
  ScoutMutationResponse,
  PoiKind,
  ResearchType,
  TroopType,
  TroopStock,
} from "@frontier/shared";
import { BUILDING_TYPES, RESEARCH_TYPES, TROOP_TYPES } from "@frontier/shared";

import { hashPassword, verifyPassword } from "../lib/auth";
import { writeAuditEntry } from "../lib/audit";
import { HttpError } from "../lib/http";
import { prisma } from "../lib/prisma";
import {
  emitAllianceUpdated,
  emitCityUpdated,
  emitFogUpdated,
  emitMapUpdated,
  emitMarchCreated,
  emitMarchUpdated,
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
} from "./engine";
import {
  ALLIANCE_CHAT_HISTORY_LIMIT,
  ALLIANCE_HELP_MAX_RESPONSES,
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
  getTasksViewTx,
  grantRewardBundleTx,
  progressGameTriggerTx,
  upgradeCommanderTx,
  useInventoryItemTx,
} from "./progression";
import {
  allianceStateInclude,
  buildCityName,
  ensureCityInfrastructureTx,
  getAllianceMembershipTx,
  getBarbarianCampTroops,
  getPrimaryCommander,
  getPoiResourceKey,
  getResourceLedger,
  getTroopLedger,
  getUserWithCityOrThrow,
  loadCityStateRecordOrThrow,
  loadMapPoiRecordOrThrow,
  mapAllianceView,
  mapMarchView,
  mapCityState,
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
    if (targetPoi.targetMarches.length > 0 || targetPoi.state !== "ACTIVE") {
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
    await tx.mapPoi.update({
      where: { id: targetPoi.id },
      data: {
        state: "OCCUPIED",
      },
    });
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

    if (march.targetPoiId && march.state !== "RETURNING" && march.targetPoi) {
      await tx.mapPoi.update({
        where: { id: march.targetPoiId },
        data: {
          state: "ACTIVE",
        },
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
        role: "MEMBER",
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
    if (actorMembership.role !== "LEADER") {
      throw new HttpError(403, "ALLIANCE_FORBIDDEN", "Only alliance leaders can change member roles.");
    }

    const targetMembership = actorMembership.alliance.members.find((member) => member.userId === targetUserId);
    if (!targetMembership) {
      throw new HttpError(404, "ALLIANCE_MEMBER_NOT_FOUND", "That alliance member could not be found.");
    }

    if (targetUserId === userId && role !== "LEADER") {
      throw new HttpError(409, "ALLIANCE_SELF_ROLE_BLOCKED", "The leader cannot demote themselves directly.");
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
