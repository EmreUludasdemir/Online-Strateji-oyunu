import {
  BuildingType as PrismaBuildingType,
  ResearchType as PrismaResearchType,
  TroopType as PrismaTroopType,
  type Prisma,
} from "@prisma/client";

import { prisma } from "../lib/prisma";
import {
  emitBattleResolved,
  emitCityUpdated,
  emitFogUpdated,
  emitMapUpdated,
  emitMarchUpdated,
  emitReportCreated,
  emitResearchCompleted,
  emitTrainingCompleted,
  emitUpgradeCompleted,
} from "./events";
import {
  addResources,
  addTroops,
  applyProduction,
  getBuildingLevels,
  getMarchPosition,
  getResearchLevels,
  getVisionRadius,
  resolveBattle,
  spendResources,
  spendTroops,
} from "./engine";
import {
  getPrimaryCommander,
  getResourceLedger,
  getTroopLedger,
  loadCityStateRecordOrThrow,
  resourceLedgerToCityUpdate,
  toCommanderBonuses,
} from "./shared";
import { MARCH_VISION_RADIUS } from "./constants";

interface WorldEvents {
  upgradeCompletions: Array<{ userId: string; cityId: string }>;
  trainingCompletions: Array<{ userId: string; cityId: string }>;
  researchCompletions: Array<{ userId: string; cityId: string }>;
  resolvedMarches: Array<{
    userIds: string[];
    cityIds: string[];
    marchId: string;
    reportId: string;
  }>;
}

function pushUniqueCity(events: Array<{ userId: string; cityId: string }>, item: { userId: string; cityId: string }) {
  if (!events.some((entry) => entry.userId === item.userId && entry.cityId === item.cityId)) {
    events.push(item);
  }
}

async function upsertTroopLedgerTx(
  tx: Prisma.TransactionClient,
  cityId: string,
  troops: ReturnType<typeof getTroopLedger>,
) {
  for (const [troopType, quantity] of Object.entries(troops)) {
    await tx.troopGarrison.upsert({
      where: {
        cityId_troopType: {
          cityId,
          troopType: troopType as PrismaTroopType,
        },
      },
      create: {
        cityId,
        troopType: troopType as PrismaTroopType,
        quantity,
      },
      update: {
        quantity,
      },
    });
  }
}

function buildTimeline(
  city: Awaited<ReturnType<typeof loadCityStateRecordOrThrow>>,
  now: Date,
): Array<
  | { kind: "upgrade"; completesAt: Date; buildingType: PrismaBuildingType; toLevel: number; id: string }
  | { kind: "research"; completesAt: Date; researchType: PrismaResearchType; toLevel: number; id: string }
> {
  const events: Array<
    | { kind: "upgrade"; completesAt: Date; buildingType: PrismaBuildingType; toLevel: number; id: string }
    | { kind: "research"; completesAt: Date; researchType: PrismaResearchType; toLevel: number; id: string }
  > = [];

  for (const upgrade of city.upgrades) {
    if (upgrade.completesAt <= now) {
      events.push({
        kind: "upgrade",
        completesAt: upgrade.completesAt,
        buildingType: upgrade.buildingType,
        toLevel: upgrade.toLevel,
        id: upgrade.id,
      });
    }
  }

  for (const research of city.researchQueues) {
    if (research.completesAt <= now) {
      events.push({
        kind: "research",
        completesAt: research.completesAt,
        researchType: research.researchType,
        toLevel: research.toLevel,
        id: research.id,
      });
    }
  }

  events.sort((left, right) => left.completesAt.getTime() - right.completesAt.getTime());
  return events;
}

export async function syncCityStateTx(
  tx: Prisma.TransactionClient,
  cityId: string,
  now: Date = new Date(),
): Promise<{
  city: Awaited<ReturnType<typeof loadCityStateRecordOrThrow>>;
  completedUpgrades: number;
  completedTraining: number;
  completedResearch: number;
}> {
  const city = await loadCityStateRecordOrThrow(tx, cityId);
  let resources = getResourceLedger(city);
  const buildingLevels = getBuildingLevels(
    city.buildings.map((building) => ({
      buildingType: building.buildingType,
      level: building.level,
    })),
  );
  const researchLevels = getResearchLevels(
    city.researchLevels.map((research) => ({
      researchType: research.researchType,
      level: research.level,
    })),
  );
  let cursor = city.resourceUpdatedAt;
  const timeline = buildTimeline(city, now);
  const completedUpgradeIds: string[] = [];
  const completedResearchIds: string[] = [];

  for (const event of timeline) {
    resources = applyProduction(resources, buildingLevels, researchLevels, event.completesAt.getTime() - cursor.getTime());
    cursor = event.completesAt;

    if (event.kind === "upgrade") {
      buildingLevels[event.buildingType] = event.toLevel;
      completedUpgradeIds.push(event.id);
      await tx.building.update({
        where: {
          cityId_buildingType: {
            cityId,
            buildingType: event.buildingType,
          },
        },
        data: {
          level: event.toLevel,
        },
      });
    } else {
      researchLevels[event.researchType] = event.toLevel;
      completedResearchIds.push(event.id);
      await tx.researchLevel.upsert({
        where: {
          cityId_researchType: {
            cityId,
            researchType: event.researchType,
          },
        },
        create: {
          cityId,
          researchType: event.researchType,
          level: event.toLevel,
        },
        update: {
          level: event.toLevel,
        },
      });
    }
  }

  resources = applyProduction(resources, buildingLevels, researchLevels, now.getTime() - cursor.getTime());

  if (completedUpgradeIds.length > 0) {
    await tx.buildingUpgrade.updateMany({
      where: {
        id: {
          in: completedUpgradeIds,
        },
      },
      data: {
        status: "COMPLETED",
      },
    });
    await tx.allianceHelpRequest.updateMany({
      where: {
        kind: "BUILDING_UPGRADE",
        targetId: {
          in: completedUpgradeIds,
        },
        isOpen: true,
      },
      data: {
        isOpen: false,
        fulfilledAt: now,
      },
    });
  }

  if (completedResearchIds.length > 0) {
    await tx.researchQueue.updateMany({
      where: {
        id: {
          in: completedResearchIds,
        },
      },
      data: {
        status: "COMPLETED",
      },
    });
    await tx.allianceHelpRequest.updateMany({
      where: {
        kind: "RESEARCH",
        targetId: {
          in: completedResearchIds,
        },
        isOpen: true,
      },
      data: {
        isOpen: false,
        fulfilledAt: now,
      },
    });
  }

  const completedTraining = city.trainingQueues.filter((queue) => queue.completesAt <= now);
  if (completedTraining.length > 0) {
    const currentTroops = getTroopLedger(
      city.troopGarrisons.map((troop) => ({
        troopType: troop.troopType,
        quantity: troop.quantity,
      })),
    );
    const gained = getTroopLedger(
      completedTraining.map((queue) => ({
        troopType: queue.troopType,
        quantity: queue.quantity,
      })),
    );
    await upsertTroopLedgerTx(tx, cityId, addTroops(currentTroops, gained));
    await tx.troopTrainingQueue.updateMany({
      where: {
        id: {
          in: completedTraining.map((queue) => queue.id),
        },
      },
      data: {
        status: "COMPLETED",
      },
    });
    await tx.allianceHelpRequest.updateMany({
      where: {
        kind: "TRAINING",
        targetId: {
          in: completedTraining.map((queue) => queue.id),
        },
        isOpen: true,
      },
      data: {
        isOpen: false,
        fulfilledAt: now,
      },
    });
  }

  await tx.city.update({
    where: { id: cityId },
    data: resourceLedgerToCityUpdate(resources, now),
  });

  return {
    city: await loadCityStateRecordOrThrow(tx, cityId),
    completedUpgrades: completedUpgradeIds.length,
    completedTraining: completedTraining.length,
    completedResearch: completedResearchIds.length,
  };
}

async function reconcileMarchesTx(
  tx: Prisma.TransactionClient,
  now: Date,
  worldEvents: WorldEvents,
) {
  const dueMarches = await tx.march.findMany({
    where: {
      state: "ENROUTE",
      etaAt: {
        lte: now,
      },
    },
    orderBy: {
      etaAt: "asc",
    },
  });

  const syncedCities = new Set<string>();

  async function ensureSynced(cityId: string) {
    if (syncedCities.has(cityId)) {
      return;
    }

    const synced = await syncCityStateTx(tx, cityId, now);
    if (synced.completedUpgrades > 0) {
      pushUniqueCity(worldEvents.upgradeCompletions, {
        userId: synced.city.ownerId,
        cityId: synced.city.id,
      });
    }
    if (synced.completedTraining > 0) {
      pushUniqueCity(worldEvents.trainingCompletions, {
        userId: synced.city.ownerId,
        cityId: synced.city.id,
      });
    }
    if (synced.completedResearch > 0) {
      pushUniqueCity(worldEvents.researchCompletions, {
        userId: synced.city.ownerId,
        cityId: synced.city.id,
      });
    }
    syncedCities.add(cityId);
  }

  for (const march of dueMarches) {
    await ensureSynced(march.ownerCityId);
    await ensureSynced(march.targetCityId);

    const attackerCity = await loadCityStateRecordOrThrow(tx, march.ownerCityId);
    const defenderCity = await loadCityStateRecordOrThrow(tx, march.targetCityId);
    const attackerResearch = getResearchLevels(
      attackerCity.researchLevels.map((research) => ({
        researchType: research.researchType,
        level: research.level,
      })),
    );
    const defenderResearch = getResearchLevels(
      defenderCity.researchLevels.map((research) => ({
        researchType: research.researchType,
        level: research.level,
      })),
    );
    const defenderBuildings = getBuildingLevels(
      defenderCity.buildings.map((building) => ({
        buildingType: building.buildingType,
        level: building.level,
      })),
    );
    const attackerCommander = attackerCity.owner.commanders.find((entry) => entry.id === march.commanderId);
    const defenderCommander = getPrimaryCommander(defenderCity);
    const attackerTroops = {
      INFANTRY: march.infantryCount,
      ARCHER: march.archerCount,
      CAVALRY: march.cavalryCount,
    };
    const defenderTroops = getTroopLedger(
      defenderCity.troopGarrisons.map((troop) => ({
        troopType: troop.troopType,
        quantity: troop.quantity,
      })),
    );
    const defenderResources = getResourceLedger(defenderCity);
    const battle = resolveBattle(
      attackerTroops,
      defenderTroops,
      toCommanderBonuses(attackerCommander),
      toCommanderBonuses(defenderCommander),
      attackerResearch,
      defenderResearch,
      defenderBuildings,
      defenderResources,
    );

    const attackerGarrison = getTroopLedger(
      attackerCity.troopGarrisons.map((troop) => ({
        troopType: troop.troopType,
        quantity: troop.quantity,
      })),
    );
    const nextAttackerGarrison = addTroops(attackerGarrison, battle.attackerSurvivors);
    const nextDefenderGarrison = spendTroops(defenderTroops, battle.defenderLosses);

    await upsertTroopLedgerTx(tx, attackerCity.id, nextAttackerGarrison);
    await upsertTroopLedgerTx(tx, defenderCity.id, nextDefenderGarrison);

    await tx.city.update({
      where: { id: attackerCity.id },
      data: resourceLedgerToCityUpdate(addResources(getResourceLedger(attackerCity), battle.loot), now),
    });
    await tx.city.update({
      where: { id: defenderCity.id },
      data: resourceLedgerToCityUpdate(spendResources(defenderResources, battle.loot), now),
    });

    const report = await tx.battleReport.create({
      data: {
        attackerUserId: attackerCity.ownerId,
        defenderUserId: defenderCity.ownerId,
        attackerCityId: attackerCity.id,
        defenderCityId: defenderCity.id,
        result: battle.result,
        attackerPower: battle.attackerPower,
        defenderPower: battle.defenderPower,
        lootWood: battle.loot.wood,
        lootStone: battle.loot.stone,
        lootFood: battle.loot.food,
        lootGold: battle.loot.gold,
        attackerLossInfantry: battle.attackerLosses.INFANTRY,
        attackerLossArcher: battle.attackerLosses.ARCHER,
        attackerLossCavalry: battle.attackerLosses.CAVALRY,
        defenderLossInfantry: battle.defenderLosses.INFANTRY,
        defenderLossArcher: battle.defenderLosses.ARCHER,
        defenderLossCavalry: battle.defenderLosses.CAVALRY,
        fromX: attackerCity.x,
        fromY: attackerCity.y,
        toX: defenderCity.x,
        toY: defenderCity.y,
        distance: Math.abs(attackerCity.x - defenderCity.x) + Math.abs(attackerCity.y - defenderCity.y),
      },
    });

    await tx.march.update({
      where: { id: march.id },
      data: {
        state: "RESOLVED",
        resolvedAt: now,
        defenderPowerSnapshot: battle.defenderPower,
        battleResult: battle.result,
      },
    });

    worldEvents.resolvedMarches.push({
      userIds: [attackerCity.ownerId, defenderCity.ownerId],
      cityIds: [attackerCity.id, defenderCity.id],
      marchId: march.id,
      reportId: report.id,
    });
  }
}

export async function reconcileWorld(now: Date = new Date()): Promise<void> {
  const worldEvents = await prisma.$transaction(async (tx) => {
    const events: WorldEvents = {
      upgradeCompletions: [],
      trainingCompletions: [],
      researchCompletions: [],
      resolvedMarches: [],
    };

    const dueCityIds = new Set<string>();
    const [dueUpgrades, dueTraining, dueResearch] = await Promise.all([
      tx.buildingUpgrade.findMany({
        where: {
          status: "ACTIVE",
          completesAt: { lte: now },
        },
        select: { cityId: true },
      }),
      tx.troopTrainingQueue.findMany({
        where: {
          status: "ACTIVE",
          completesAt: { lte: now },
        },
        select: { cityId: true },
      }),
      tx.researchQueue.findMany({
        where: {
          status: "ACTIVE",
          completesAt: { lte: now },
        },
        select: { cityId: true },
      }),
    ]);

    for (const row of dueUpgrades) dueCityIds.add(row.cityId);
    for (const row of dueTraining) dueCityIds.add(row.cityId);
    for (const row of dueResearch) dueCityIds.add(row.cityId);

    for (const cityId of dueCityIds) {
      const synced = await syncCityStateTx(tx, cityId, now);
      if (synced.completedUpgrades > 0) {
        pushUniqueCity(events.upgradeCompletions, {
          userId: synced.city.ownerId,
          cityId: synced.city.id,
        });
      }
      if (synced.completedTraining > 0) {
        pushUniqueCity(events.trainingCompletions, {
          userId: synced.city.ownerId,
          cityId: synced.city.id,
        });
      }
      if (synced.completedResearch > 0) {
        pushUniqueCity(events.researchCompletions, {
          userId: synced.city.ownerId,
          cityId: synced.city.id,
        });
      }
    }

    await reconcileMarchesTx(tx, now, events);
    return events;
  });

  for (const item of worldEvents.upgradeCompletions) {
    emitUpgradeCompleted(item.userId, item.cityId);
    emitCityUpdated([item.userId], item.cityId);
    emitMapUpdated(item.cityId);
  }

  for (const item of worldEvents.trainingCompletions) {
    emitTrainingCompleted(item.userId, item.cityId);
    emitCityUpdated([item.userId], item.cityId);
  }

  for (const item of worldEvents.researchCompletions) {
    emitResearchCompleted(item.userId, item.cityId);
    emitCityUpdated([item.userId], item.cityId);
    emitFogUpdated(item.userId, item.cityId);
  }

  for (const item of worldEvents.resolvedMarches) {
    emitBattleResolved(item.userIds, item.cityIds[0], item.marchId);
    emitMarchUpdated(item.userIds, item.cityIds[0], item.marchId);
    emitReportCreated(item.userIds, item.reportId);
    for (const cityId of item.cityIds) {
      emitMapUpdated(cityId);
    }
    emitCityUpdated(item.userIds, item.cityIds[0]);
    emitCityUpdated(item.userIds, item.cityIds[1]);
  }
}

function visibleCoordinatesForRadius(center: { x: number; y: number }, radius: number) {
  const coordinates: Array<{ x: number; y: number }> = [];

  for (let y = center.y - radius; y <= center.y + radius; y += 1) {
    for (let x = center.x - radius; x <= center.x + radius; x += 1) {
      if (Math.abs(center.x - x) + Math.abs(center.y - y) <= radius && x >= 0 && y >= 0) {
        coordinates.push({ x, y });
      }
    }
  }

  return coordinates;
}

export async function refreshFogOfWar(
  tx: Prisma.TransactionClient,
  city: Awaited<ReturnType<typeof loadCityStateRecordOrThrow>>,
  now: Date,
): Promise<void> {
  const buildingLevels = getBuildingLevels(
    city.buildings.map((building) => ({
      buildingType: building.buildingType,
      level: building.level,
    })),
  );
  const researchLevels = getResearchLevels(
    city.researchLevels.map((research) => ({
      researchType: research.researchType,
      level: research.level,
    })),
  );
  const coordinates = new Map<string, { x: number; y: number }>();

  for (const coordinate of visibleCoordinatesForRadius(
    { x: city.x, y: city.y },
    getVisionRadius(buildingLevels.WATCHTOWER, researchLevels),
  )) {
    coordinates.set(`${coordinate.x}:${coordinate.y}`, coordinate);
  }

  for (const march of city.outgoingMarches) {
    const position = getMarchPosition(
      { x: city.x, y: city.y },
      { x: march.targetCity.x, y: march.targetCity.y },
      march.startsAt,
      march.etaAt,
      now,
    );

    for (const coordinate of visibleCoordinatesForRadius(position, MARCH_VISION_RADIUS)) {
      coordinates.set(`${coordinate.x}:${coordinate.y}`, coordinate);
    }
  }

  for (const coordinate of coordinates.values()) {
    await tx.fogTile.upsert({
      where: {
        userId_x_y: {
          userId: city.ownerId,
          x: coordinate.x,
          y: coordinate.y,
        },
      },
      create: {
        userId: city.ownerId,
        x: coordinate.x,
        y: coordinate.y,
        discoveredAt: now,
        lastSeenAt: now,
      },
      update: {
        lastSeenAt: now,
      },
    });
  }
}
