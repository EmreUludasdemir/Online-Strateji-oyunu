import { Prisma, type BuildingUpgrade as PrismaBuildingUpgrade } from "@prisma/client";
import {
  BUILDING_DESCRIPTIONS,
  BUILDING_LABELS,
  BUILDING_TYPES,
  type AuthUser,
  type BattleReportView,
  type BuildingType,
  type BuildingView,
  type CityState,
  type GameStateResponse,
  type MapCity,
  type ResourceStock,
  type WorldMapResponse,
} from "@frontier/shared";

import { hashPassword, verifyPassword } from "../lib/auth";
import { HttpError } from "../lib/http";
import { notificationHub } from "../lib/notifications";
import { prisma } from "../lib/prisma";
import { ATTACK_RANGE, GAME_MAP_SIZE, STARTING_RESOURCES } from "./constants";
import {
  addResources,
  applyProduction,
  createResourceLedger,
  getAttackCost,
  getAttackPower,
  getBattleLoot,
  getBuildingLevels,
  getDefensePower,
  getUpgradeCost,
  getUpgradeDurationMs,
  hasEnoughResources,
  manhattanDistance,
  resolveBattle,
  spendResources,
  toDisplayResources,
} from "./engine";
import { findOpenCoordinate } from "./world";

const cityStateInclude = Prisma.validator<Prisma.CityInclude>()({
  owner: true,
  buildings: true,
  upgrades: {
    where: {
      status: "ACTIVE",
    },
    orderBy: {
      completesAt: "asc",
    },
  },
});

const mapCityInclude = Prisma.validator<Prisma.CityInclude>()({
  owner: true,
  buildings: true,
});

const battleReportInclude = Prisma.validator<Prisma.BattleReportInclude>()({
  attackerUser: true,
  defenderUser: true,
  attackerCity: true,
  defenderCity: true,
});

type CityStateRecord = Prisma.CityGetPayload<{ include: typeof cityStateInclude }>;
type MapCityRecord = Prisma.CityGetPayload<{ include: typeof mapCityInclude }>;
type BattleReportRecord = Prisma.BattleReportGetPayload<{ include: typeof battleReportInclude }>;

function getResourceLedger(city: {
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

function resourceLedgerToCityUpdate(resources: ResourceStock, resourceUpdatedAt: Date) {
  return {
    wood: resources.wood,
    stone: resources.stone,
    food: resources.food,
    gold: resources.gold,
    resourceUpdatedAt,
  };
}

function buildCityName(username: string): string {
  return `${username} Hold`;
}

function toAuthUser(user: {
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

function mapBuildingViews(city: CityStateRecord): BuildingView[] {
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

function mapCityState(city: CityStateRecord, now: Date = new Date()): CityState {
  const buildingLevels = getBuildingLevels(
    city.buildings.map((building) => ({
      buildingType: building.buildingType as BuildingType,
      level: building.level,
    })),
  );

  const activeUpgrade = city.upgrades[0] ?? null;

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
          remainingSeconds: Math.max(
            0,
            Math.ceil((activeUpgrade.completesAt.getTime() - now.getTime()) / 1000),
          ),
        }
      : null,
    attackPower: getAttackPower(buildingLevels),
    defensePower: getDefensePower(buildingLevels),
  };
}

function mapBattleReport(report: BattleReportRecord): BattleReportView {
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

function emitCompletedUpgradeEvents(userId: string, cityId: string, upgrades: PrismaBuildingUpgrade[]): void {
  if (upgrades.length === 0) {
    return;
  }

  notificationHub.notifyUsers([userId], {
    type: "upgrade.completed",
    payload: { cityId },
  });
  notificationHub.notifyUsers([userId], {
    type: "city.updated",
    payload: { cityId },
  });
  notificationHub.broadcast({
    type: "map.updated",
    payload: { cityId },
  });
}

async function getUserWithCityOrThrow(
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

async function loadCityStateRecordOrThrow(
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

export async function syncCityStateTx(
  tx: Prisma.TransactionClient,
  cityId: string,
  now: Date = new Date(),
): Promise<{ city: CityStateRecord; completedUpgrades: PrismaBuildingUpgrade[] }> {
  const city = await loadCityStateRecordOrThrow(tx, cityId);

  let resources = getResourceLedger(city);
  const levels = getBuildingLevels(
    city.buildings.map((building) => ({
      buildingType: building.buildingType as BuildingType,
      level: building.level,
    })),
  );

  let cursor = city.resourceUpdatedAt;
  const completedUpgrades = city.upgrades.filter((upgrade) => upgrade.completesAt <= now);

  for (const upgrade of completedUpgrades) {
    const elapsedMs = upgrade.completesAt.getTime() - cursor.getTime();

    resources = applyProduction(resources, levels, elapsedMs);
    levels[upgrade.buildingType as BuildingType] = upgrade.toLevel;
    cursor = upgrade.completesAt;
  }

  resources = applyProduction(resources, levels, now.getTime() - cursor.getTime());

  await tx.city.update({
    where: { id: cityId },
    data: resourceLedgerToCityUpdate(resources, now),
  });

  for (const upgrade of completedUpgrades) {
    await tx.building.update({
      where: {
        cityId_buildingType: {
          cityId,
          buildingType: upgrade.buildingType,
        },
      },
      data: {
        level: upgrade.toLevel,
      },
    });
  }

  if (completedUpgrades.length > 0) {
    await tx.buildingUpgrade.updateMany({
      where: {
        id: {
          in: completedUpgrades.map((upgrade) => upgrade.id),
        },
      },
      data: {
        status: "COMPLETED",
      },
    });
  }

  return {
    city: await loadCityStateRecordOrThrow(tx, cityId),
    completedUpgrades,
  };
}

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
    const takenCoordinates = await tx.city.findMany({
      select: {
        x: true,
        y: true,
      },
    });

    coordinate = findOpenCoordinate(takenCoordinates);
  } else {
    const occupied = await tx.city.findUnique({
      where: {
        x_y: {
          x: coordinate.x,
          y: coordinate.y,
        },
      },
      select: {
        id: true,
      },
    });

    if (occupied) {
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
      level: 1,
    })),
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

    return getUserWithCityOrThrow(tx, createdUser.id);
  });

  notificationHub.broadcast({
    type: "map.updated",
    payload: { cityId: user.city?.id },
  });

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

  return toAuthUser(user);
}

export async function getSessionUser(userId: string): Promise<AuthUser> {
  const user = await prisma.user.findUnique({
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

  return toAuthUser(user);
}

export async function getGameState(userId: string): Promise<GameStateResponse> {
  const now = new Date();
  const result = await prisma.$transaction(async (tx) => {
    const user = await getUserWithCityOrThrow(tx, userId);
    const synced = await syncCityStateTx(tx, user.city!.id, now);

    return {
      player: toAuthUser(user),
      city: mapCityState(synced.city, now),
      completedUpgrades: synced.completedUpgrades,
    };
  });

  emitCompletedUpgradeEvents(userId, result.city.cityId, result.completedUpgrades);

  return {
    player: result.player,
    city: result.city,
  };
}

export async function startBuildingUpgrade(
  userId: string,
  buildingType: BuildingType,
): Promise<GameStateResponse> {
  const now = new Date();
  const result = await prisma.$transaction(async (tx) => {
    const user = await getUserWithCityOrThrow(tx, userId);
    const synced = await syncCityStateTx(tx, user.city!.id, now);

    if (synced.city.upgrades.length > 0) {
      throw new HttpError(
        409,
        "UPGRADE_ALREADY_ACTIVE",
        "Only one upgrade can run at a time in this MVP.",
      );
    }

    const building = synced.city.buildings.find((entry) => entry.buildingType === buildingType);
    if (!building) {
      throw new HttpError(404, "BUILDING_NOT_FOUND", "That building type does not exist.");
    }

    const targetLevel = building.level + 1;
    const upgradeCost = getUpgradeCost(buildingType, targetLevel);
    const currentResources = getResourceLedger(synced.city);

    if (!hasEnoughResources(currentResources, upgradeCost)) {
      throw new HttpError(400, "INSUFFICIENT_RESOURCES", "Not enough resources for that upgrade.");
    }

    const nextResources = spendResources(currentResources, upgradeCost);

    await tx.city.update({
      where: { id: synced.city.id },
      data: resourceLedgerToCityUpdate(nextResources, now),
    });

    await tx.buildingUpgrade.create({
      data: {
        cityId: synced.city.id,
        buildingType,
        fromLevel: building.level,
        toLevel: targetLevel,
        startedAt: now,
        completesAt: new Date(now.getTime() + getUpgradeDurationMs(buildingType, targetLevel)),
        status: "ACTIVE",
      },
    });

    const updatedCity = await loadCityStateRecordOrThrow(tx, synced.city.id);

    return {
      player: toAuthUser(user),
      city: mapCityState(updatedCity, now),
      completedUpgrades: synced.completedUpgrades,
    };
  });

  emitCompletedUpgradeEvents(userId, result.city.cityId, result.completedUpgrades);
  notificationHub.notifyUsers([userId], {
    type: "city.updated",
    payload: { cityId: result.city.cityId },
  });

  return {
    player: result.player,
    city: result.city,
  };
}

export async function getWorldMap(userId: string): Promise<WorldMapResponse> {
  const now = new Date();
  const result = await prisma.$transaction(async (tx) => {
    const user = await getUserWithCityOrThrow(tx, userId);
    const synced = await syncCityStateTx(tx, user.city!.id, now);
    const cities = await tx.city.findMany({
      include: mapCityInclude,
      orderBy: [{ y: "asc" }, { x: "asc" }],
    });

    const currentCity = synced.city;
    const currentCityLevels = getBuildingLevels(
      currentCity.buildings.map((building) => ({
        buildingType: building.buildingType as BuildingType,
        level: building.level,
      })),
    );
    const currentAttackPower = getAttackPower(currentCityLevels);

    return {
      size: GAME_MAP_SIZE,
      cities: cities.map((city): MapCity => {
        const townHall = city.buildings.find((building) => building.buildingType === "TOWN_HALL");
        const cityLevels = getBuildingLevels(
          city.buildings.map((building) => ({
            buildingType: building.buildingType as BuildingType,
            level: building.level,
          })),
        );
        const attackPower = getAttackPower(cityLevels);
        const defensePower = getDefensePower(cityLevels);
        const isCurrentPlayer = city.id === currentCity.id;
        const distance = isCurrentPlayer
          ? null
          : manhattanDistance(
              { x: currentCity.x, y: currentCity.y },
              { x: city.x, y: city.y },
            );

        return {
          cityId: city.id,
          cityName: city.name,
          ownerName: city.owner.username,
          x: city.x,
          y: city.y,
          isCurrentPlayer,
          canAttack: !isCurrentPlayer && distance !== null && distance <= ATTACK_RANGE,
          distance,
          townHallLevel: townHall?.level ?? 1,
          attackPower,
          defensePower,
          projectedOutcome: isCurrentPlayer ? null : resolveBattle(currentAttackPower, defensePower),
        };
      }),
      completedUpgrades: synced.completedUpgrades,
      cityId: currentCity.id,
    };
  });

  emitCompletedUpgradeEvents(userId, result.cityId, result.completedUpgrades);

  return {
    size: result.size,
    cities: result.cities,
  };
}

export async function attackCity(userId: string, targetCityId: string): Promise<BattleReportView> {
  const now = new Date();
  const result = await prisma.$transaction(async (tx) => {
    const user = await getUserWithCityOrThrow(tx, userId);
    const syncedAttacker = await syncCityStateTx(tx, user.city!.id, now);

    const targetCity = await tx.city.findUnique({
      where: { id: targetCityId },
      include: {
        owner: true,
        buildings: true,
        upgrades: {
          where: { status: "ACTIVE" },
          orderBy: { completesAt: "asc" },
        },
      },
    });

    if (!targetCity) {
      throw new HttpError(404, "TARGET_CITY_NOT_FOUND", "The target city was not found.");
    }

    if (targetCity.ownerId === userId) {
      throw new HttpError(400, "INVALID_TARGET", "You cannot attack your own city.");
    }

    const syncedDefender = await syncCityStateTx(tx, targetCity.id, now);
    const distance = manhattanDistance(
      { x: syncedAttacker.city.x, y: syncedAttacker.city.y },
      { x: syncedDefender.city.x, y: syncedDefender.city.y },
    );

    if (distance > ATTACK_RANGE) {
      throw new HttpError(400, "TARGET_OUT_OF_RANGE", "That target city is too far away.");
    }

    const attackCost = getAttackCost();
    const attackerResources = getResourceLedger(syncedAttacker.city);

    if (!hasEnoughResources(attackerResources, attackCost)) {
      throw new HttpError(400, "INSUFFICIENT_RESOURCES", "Not enough resources to launch an attack.");
    }

    const defenderResources = getResourceLedger(syncedDefender.city);
    const attackerLevels = getBuildingLevels(
      syncedAttacker.city.buildings.map((building) => ({
        buildingType: building.buildingType as BuildingType,
        level: building.level,
      })),
    );
    const defenderLevels = getBuildingLevels(
      syncedDefender.city.buildings.map((building) => ({
        buildingType: building.buildingType as BuildingType,
        level: building.level,
      })),
    );

    const attackerPower = getAttackPower(attackerLevels);
    const defenderPower = getDefensePower(defenderLevels);
    const resultType = resolveBattle(attackerPower, defenderPower);
    const loot = resultType === "ATTACKER_WIN" ? getBattleLoot(defenderResources) : createResourceLedger();

    const nextAttackerResources = addResources(spendResources(attackerResources, attackCost), loot);
    const nextDefenderResources =
      resultType === "ATTACKER_WIN" ? spendResources(defenderResources, loot) : defenderResources;

    await tx.city.update({
      where: { id: syncedAttacker.city.id },
      data: resourceLedgerToCityUpdate(nextAttackerResources, now),
    });
    await tx.city.update({
      where: { id: syncedDefender.city.id },
      data: resourceLedgerToCityUpdate(nextDefenderResources, now),
    });

    const report = await tx.battleReport.create({
      data: {
        attackerUserId: userId,
        defenderUserId: syncedDefender.city.ownerId,
        attackerCityId: syncedAttacker.city.id,
        defenderCityId: syncedDefender.city.id,
        result: resultType,
        attackerPower,
        defenderPower,
        lootWood: loot.wood,
        lootStone: loot.stone,
        lootFood: loot.food,
        lootGold: loot.gold,
        fromX: syncedAttacker.city.x,
        fromY: syncedAttacker.city.y,
        toX: syncedDefender.city.x,
        toY: syncedDefender.city.y,
        distance,
      },
      include: battleReportInclude,
    });

    return {
      report: mapBattleReport(report),
      attackerCityId: syncedAttacker.city.id,
      defenderCityId: syncedDefender.city.id,
      defenderUserId: syncedDefender.city.ownerId,
      attackerCompletedUpgrades: syncedAttacker.completedUpgrades,
      defenderCompletedUpgrades: syncedDefender.completedUpgrades,
    };
  });

  emitCompletedUpgradeEvents(userId, result.attackerCityId, result.attackerCompletedUpgrades);
  emitCompletedUpgradeEvents(
    result.defenderUserId,
    result.defenderCityId,
    result.defenderCompletedUpgrades,
  );

  notificationHub.notifyUsers([userId, result.defenderUserId], {
    type: "city.updated",
    payload: { cityId: result.attackerCityId },
  });
  notificationHub.notifyUsers([userId, result.defenderUserId], {
    type: "city.updated",
    payload: { cityId: result.defenderCityId },
  });
  notificationHub.notifyUsers([userId, result.defenderUserId], {
    type: "report.created",
    payload: { reportId: result.report.id },
  });

  return result.report;
}

export async function getBattleReports(userId: string): Promise<BattleReportView[]> {
  const now = new Date();
  const result = await prisma.$transaction(async (tx) => {
    const user = await getUserWithCityOrThrow(tx, userId);
    const synced = await syncCityStateTx(tx, user.city!.id, now);
    const reports = await tx.battleReport.findMany({
      where: {
        OR: [{ attackerUserId: userId }, { defenderUserId: userId }],
      },
      include: battleReportInclude,
      orderBy: {
        createdAt: "desc",
      },
      take: 20,
    });

    return {
      reports: reports.map(mapBattleReport),
      cityId: synced.city.id,
      completedUpgrades: synced.completedUpgrades,
    };
  });

  emitCompletedUpgradeEvents(userId, result.cityId, result.completedUpgrades);

  return result.reports;
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
  });
}
