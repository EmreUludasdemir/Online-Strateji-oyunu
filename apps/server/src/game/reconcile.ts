import {
  BuildingType as PrismaBuildingType,
  ResearchType as PrismaResearchType,
  TroopType as PrismaTroopType,
  type Prisma,
} from "@prisma/client";

import { prisma } from "../lib/prisma";
import { incrementCounter, observeDuration } from "../lib/metrics";
import {
  emitBattleResolved,
  emitCityUpdated,
  emitFogUpdated,
  emitMapUpdated,
  emitMarchUpdated,
  emitPoiUpdated,
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
  getCarryCapacity,
  getMarchPosition,
  getResearchLevels,
  getTroopDefensePower,
  getVisionRadius,
  resolveBattle,
  spendResources,
  spendTroops,
} from "./engine";
import {
  BATTLE_WINDOW_DURATION_MS,
  BARBARIAN_CAMP_RESPAWN_MS,
  MARCH_VISION_RADIUS,
  RESOURCE_GATHER_DURATION_MS,
  RESOURCE_NODE_RESPAWN_MS,
} from "./constants";
import {
  getBarbarianCampReward,
  getBarbarianCampTroops,
  getMarchTargetCoordinates,
  getPoiResourceKey,
  getPrimaryCommander,
  getResourceLedger,
  getTroopLedger,
  loadCityStateRecordOrThrow,
  loadMapPoiRecordOrThrow,
  resourceLedgerToCityUpdate,
  toCommanderBonuses,
} from "./shared";

interface WorldEvents {
  upgradeCompletions: Array<{ userId: string; cityId: string }>;
  trainingCompletions: Array<{ userId: string; cityId: string }>;
  researchCompletions: Array<{ userId: string; cityId: string }>;
  marchTransitions: Array<{
    userIds: string[];
    cityIds: string[];
    marchId: string;
    poiId: string | null;
  }>;
  resolvedMarches: Array<{
    userIds: string[];
    cityIds: string[];
    marchId: string;
    reportId: string;
    poiId: string | null;
    notifyBattleResolved: boolean;
  }>;
  poiUpdates: string[];
}

function createEmptyResearchLevels() {
  return {
    MILITARY_DRILL: 0,
    LOGISTICS: 0,
    AGRONOMY: 0,
    STONEWORK: 0,
    GOLD_TRADE: 0,
    SCOUTING: 0,
  };
}

function createEmptyBuildingLevels() {
  return {
    TOWN_HALL: 0,
    FARM: 0,
    LUMBER_MILL: 0,
    QUARRY: 0,
    GOLD_MINE: 0,
    BARRACKS: 0,
    ACADEMY: 0,
    WATCHTOWER: 0,
  };
}

function createEmptyResources() {
  return {
    wood: 0,
    stone: 0,
    food: 0,
    gold: 0,
  };
}

function pushUniqueCity(events: Array<{ userId: string; cityId: string }>, item: { userId: string; cityId: string }) {
  if (!events.some((entry) => entry.userId === item.userId && entry.cityId === item.cityId)) {
    events.push(item);
  }
}

function pushUniquePoi(events: string[], poiId: string | null) {
  if (poiId && !events.includes(poiId)) {
    events.push(poiId);
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

async function reconcilePoiRespawnsTx(
  tx: Prisma.TransactionClient,
  now: Date,
  worldEvents: WorldEvents,
) {
  const duePois = await tx.mapPoi.findMany({
    where: {
      state: {
        in: ["DEPLETED", "RESPAWNING"],
      },
      respawnsAt: {
        lte: now,
      },
    },
  });

  for (const poi of duePois) {
    await tx.mapPoi.update({
      where: { id: poi.id },
      data: {
        state: "ACTIVE",
        respawnsAt: null,
        remainingAmount: poi.kind === "RESOURCE_NODE" ? poi.maxAmount : poi.remainingAmount,
      },
    });
    pushUniquePoi(worldEvents.poiUpdates, poi.id);
  }
}

async function reconcileCityBattleTx(
  tx: Prisma.TransactionClient,
  march: Awaited<ReturnType<typeof loadCityStateRecordOrThrow>>["outgoingMarches"][number],
  attackerCity: Awaited<ReturnType<typeof loadCityStateRecordOrThrow>>,
  defenderCity: Awaited<ReturnType<typeof loadCityStateRecordOrThrow>>,
  now: Date,
  worldEvents: WorldEvents,
) {
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
      battleWindowId: null,
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
    poiId: null,
    notifyBattleResolved: true,
  });
}

async function stageCityBattleMarchTx(
  tx: Prisma.TransactionClient,
  march: Awaited<ReturnType<typeof loadCityStateRecordOrThrow>>["outgoingMarches"][number],
  attackerCity: Awaited<ReturnType<typeof loadCityStateRecordOrThrow>>,
  defenderCity: Awaited<ReturnType<typeof loadCityStateRecordOrThrow>>,
  now: Date,
  worldEvents: WorldEvents,
) {
  const existingWindow = await tx.battleWindow.findFirst({
    where: {
      targetCityId: defenderCity.id,
      resolvedAt: null,
      closesAt: {
        gt: now,
      },
    },
    orderBy: {
      openedAt: "asc",
    },
  });

  const battleWindow =
    existingWindow ??
    (await tx.battleWindow.create({
      data: {
        targetCityId: defenderCity.id,
        closesAt: new Date(now.getTime() + BATTLE_WINDOW_DURATION_MS),
      },
    }));

  await tx.march.update({
    where: { id: march.id },
    data: {
      state: "STAGING",
      battleWindowId: battleWindow.id,
    },
  });

  worldEvents.marchTransitions.push({
    userIds: [attackerCity.ownerId, defenderCity.ownerId],
    cityIds: [attackerCity.id, defenderCity.id],
    marchId: march.id,
    poiId: null,
  });
}

async function reconcileBarbarianBattleTx(
  tx: Prisma.TransactionClient,
  march: Awaited<ReturnType<typeof loadCityStateRecordOrThrow>>["outgoingMarches"][number],
  attackerCity: Awaited<ReturnType<typeof loadCityStateRecordOrThrow>>,
  now: Date,
  worldEvents: WorldEvents,
) {
  const poi = await loadMapPoiRecordOrThrow(tx, march.targetPoiId!);
  const attackerResearch = getResearchLevels(
    attackerCity.researchLevels.map((research) => ({
      researchType: research.researchType,
      level: research.level,
    })),
  );
  const attackerCommander = attackerCity.owner.commanders.find((entry) => entry.id === march.commanderId);
  const attackerTroops = {
    INFANTRY: march.infantryCount,
    ARCHER: march.archerCount,
    CAVALRY: march.cavalryCount,
  };
  const defenderTroops = getBarbarianCampTroops(poi.level);
  const baseBattle = resolveBattle(
    attackerTroops,
    defenderTroops,
    toCommanderBonuses(attackerCommander),
    toCommanderBonuses(null),
    attackerResearch,
    createEmptyResearchLevels(),
    createEmptyBuildingLevels(),
    createEmptyResources(),
  );
  const loot = baseBattle.result === "ATTACKER_WIN" ? getBarbarianCampReward(poi.level) : createEmptyResources();
  const attackerGarrison = getTroopLedger(
    attackerCity.troopGarrisons.map((troop) => ({
      troopType: troop.troopType,
      quantity: troop.quantity,
    })),
  );
  const nextAttackerGarrison = addTroops(attackerGarrison, baseBattle.attackerSurvivors);

  await upsertTroopLedgerTx(tx, attackerCity.id, nextAttackerGarrison);
  await tx.city.update({
    where: { id: attackerCity.id },
    data: resourceLedgerToCityUpdate(addResources(getResourceLedger(attackerCity), loot), now),
  });
  await tx.mapPoi.update({
    where: { id: poi.id },
    data: {
      state: baseBattle.result === "ATTACKER_WIN" ? "RESPAWNING" : "ACTIVE",
      respawnsAt: baseBattle.result === "ATTACKER_WIN" ? new Date(now.getTime() + BARBARIAN_CAMP_RESPAWN_MS) : null,
    },
  });

  const report = await tx.marchReport.create({
    data: {
      marchId: march.id,
      kind: "BARBARIAN_BATTLE",
      ownerUserId: attackerCity.ownerId,
      ownerCityId: attackerCity.id,
      poiId: poi.id,
      poiKind: poi.kind,
      poiName: poi.label,
      poiLevel: poi.level,
      result: baseBattle.result,
      attackerPower: baseBattle.attackerPower,
      defenderPower: getTroopDefensePower(defenderTroops),
      infantryCount: march.infantryCount,
      archerCount: march.archerCount,
      cavalryCount: march.cavalryCount,
      lootWood: loot.wood,
      lootStone: loot.stone,
      lootFood: loot.food,
      lootGold: loot.gold,
      attackerLossInfantry: baseBattle.attackerLosses.INFANTRY,
      attackerLossArcher: baseBattle.attackerLosses.ARCHER,
      attackerLossCavalry: baseBattle.attackerLosses.CAVALRY,
      defenderLossInfantry: baseBattle.defenderLosses.INFANTRY,
      defenderLossArcher: baseBattle.defenderLosses.ARCHER,
      defenderLossCavalry: baseBattle.defenderLosses.CAVALRY,
      fromX: attackerCity.x,
      fromY: attackerCity.y,
      toX: poi.x,
      toY: poi.y,
      distance: Math.abs(attackerCity.x - poi.x) + Math.abs(attackerCity.y - poi.y),
    },
  });

  await tx.march.update({
    where: { id: march.id },
    data: {
      state: "RESOLVED",
      resolvedAt: now,
      defenderPowerSnapshot: getTroopDefensePower(defenderTroops),
      battleResult: baseBattle.result,
    },
  });

  worldEvents.resolvedMarches.push({
    userIds: [attackerCity.ownerId],
    cityIds: [attackerCity.id],
    marchId: march.id,
    reportId: report.id,
    poiId: poi.id,
    notifyBattleResolved: true,
  });
}

async function reconcileGatherArrivalTx(
  tx: Prisma.TransactionClient,
  march: Awaited<ReturnType<typeof loadCityStateRecordOrThrow>>["outgoingMarches"][number],
  attackerCity: Awaited<ReturnType<typeof loadCityStateRecordOrThrow>>,
  now: Date,
  worldEvents: WorldEvents,
) {
  const poi = await loadMapPoiRecordOrThrow(tx, march.targetPoiId!);
  const outboundDurationMs = march.etaAt.getTime() - march.startsAt.getTime();
  const gatherCompleteAt = new Date(now.getTime() + RESOURCE_GATHER_DURATION_MS);
  const returnEtaAt = new Date(gatherCompleteAt.getTime() + outboundDurationMs);

  await tx.march.update({
    where: { id: march.id },
    data: {
      state: "GATHERING",
      gatherStartedAt: now,
      etaAt: gatherCompleteAt,
      returnEtaAt,
    },
  });

  worldEvents.marchTransitions.push({
    userIds: [attackerCity.ownerId],
    cityIds: [attackerCity.id],
    marchId: march.id,
    poiId: poi.id,
  });
}

async function reconcileGatherCompletionTx(
  tx: Prisma.TransactionClient,
  march: Awaited<ReturnType<typeof loadCityStateRecordOrThrow>>["outgoingMarches"][number],
  attackerCity: Awaited<ReturnType<typeof loadCityStateRecordOrThrow>>,
  now: Date,
  worldEvents: WorldEvents,
) {
  const poi = await loadMapPoiRecordOrThrow(tx, march.targetPoiId!);
  const commander = attackerCity.owner.commanders.find((entry) => entry.id === march.commanderId);
  const troops = {
    INFANTRY: march.infantryCount,
    ARCHER: march.archerCount,
    CAVALRY: march.cavalryCount,
  };
  const cargoAmount = Math.min(
    poi.remainingAmount ?? 0,
    getCarryCapacity(troops, toCommanderBonuses(commander)),
  );
  const remainingAmount = Math.max(0, (poi.remainingAmount ?? 0) - cargoAmount);
  const nextPoiState = remainingAmount <= 0 ? "DEPLETED" : "ACTIVE";

  await tx.mapPoi.update({
    where: { id: poi.id },
    data: {
      state: nextPoiState,
      remainingAmount,
      respawnsAt: nextPoiState === "DEPLETED" ? new Date(now.getTime() + RESOURCE_NODE_RESPAWN_MS) : null,
    },
  });
  await tx.march.update({
    where: { id: march.id },
    data: {
      state: "RETURNING",
      cargoAmount,
      cargoResourceType: poi.resourceType,
    },
  });

  worldEvents.marchTransitions.push({
    userIds: [attackerCity.ownerId],
    cityIds: [attackerCity.id],
    marchId: march.id,
    poiId: poi.id,
  });
  pushUniquePoi(worldEvents.poiUpdates, poi.id);
}

async function reconcileGatherReturnTx(
  tx: Prisma.TransactionClient,
  march: Awaited<ReturnType<typeof loadCityStateRecordOrThrow>>["outgoingMarches"][number],
  attackerCity: Awaited<ReturnType<typeof loadCityStateRecordOrThrow>>,
  now: Date,
  worldEvents: WorldEvents,
) {
  const poi = await loadMapPoiRecordOrThrow(tx, march.targetPoiId!);
  const attackerGarrison = getTroopLedger(
    attackerCity.troopGarrisons.map((troop) => ({
      troopType: troop.troopType,
      quantity: troop.quantity,
    })),
  );
  await upsertTroopLedgerTx(tx, attackerCity.id, addTroops(attackerGarrison, {
    INFANTRY: march.infantryCount,
    ARCHER: march.archerCount,
    CAVALRY: march.cavalryCount,
  }));

  const resourceKey = march.cargoResourceType ? getPoiResourceKey(march.cargoResourceType) : null;
  const gainedResources = {
    wood: resourceKey === "wood" ? march.cargoAmount : 0,
    stone: resourceKey === "stone" ? march.cargoAmount : 0,
    food: resourceKey === "food" ? march.cargoAmount : 0,
    gold: resourceKey === "gold" ? march.cargoAmount : 0,
  };
  await tx.city.update({
    where: { id: attackerCity.id },
    data: resourceLedgerToCityUpdate(addResources(getResourceLedger(attackerCity), gainedResources), now),
  });

  const report = await tx.marchReport.create({
    data: {
      marchId: march.id,
      kind: "RESOURCE_GATHER",
      ownerUserId: attackerCity.ownerId,
      ownerCityId: attackerCity.id,
      poiId: poi.id,
      poiKind: poi.kind,
      poiName: poi.label,
      poiLevel: poi.level,
      resourceType: march.cargoResourceType,
      resourceAmount: march.cargoAmount,
      infantryCount: march.infantryCount,
      archerCount: march.archerCount,
      cavalryCount: march.cavalryCount,
      fromX: attackerCity.x,
      fromY: attackerCity.y,
      toX: poi.x,
      toY: poi.y,
      distance: Math.abs(attackerCity.x - poi.x) + Math.abs(attackerCity.y - poi.y),
    },
  });

  await tx.march.update({
    where: { id: march.id },
    data: {
      state: "RESOLVED",
      resolvedAt: now,
    },
  });

  worldEvents.resolvedMarches.push({
    userIds: [attackerCity.ownerId],
    cityIds: [attackerCity.id],
    marchId: march.id,
    reportId: report.id,
    poiId: poi.id,
    notifyBattleResolved: false,
  });
}

async function reconcileBattleWindowsTx(
  tx: Prisma.TransactionClient,
  now: Date,
  worldEvents: WorldEvents,
) {
  const startedAt = Date.now();
  const dueWindows = await tx.battleWindow.findMany({
    where: {
      resolvedAt: null,
      closesAt: {
        lte: now,
      },
    },
    orderBy: {
      closesAt: "asc",
    },
  });

  for (const window of dueWindows) {
    const windowStartedAt = Date.now();
    const stagedMarches = await tx.march.findMany({
      where: {
        battleWindowId: window.id,
        state: "STAGING",
      },
      include: {
        commander: true,
        targetCity: {
          include: {
            owner: true,
          },
        },
        targetPoi: true,
        battleWindow: true,
      },
      orderBy: [{ etaAt: "asc" }, { startsAt: "asc" }],
    });

    for (const march of stagedMarches) {
      if (!march.targetCityId) {
        continue;
      }

      const attackerCity = await loadCityStateRecordOrThrow(tx, march.ownerCityId);
      const defenderCity = await loadCityStateRecordOrThrow(tx, march.targetCityId);
      const battleStartedAt = Date.now();
      await reconcileCityBattleTx(tx, march, attackerCity, defenderCity, now, worldEvents);
      observeDuration("game_battle_resolve_duration_ms", Date.now() - battleStartedAt, {
        objective: "CITY_ATTACK",
      });
      incrementCounter("game_battle_resolve_total", {
        objective: "CITY_ATTACK",
      });
    }

    await tx.battleWindow.update({
      where: { id: window.id },
      data: {
        resolvedAt: now,
      },
    });

    observeDuration("game_battle_window_duration_ms", Date.now() - windowStartedAt, {
      windowState: "closed",
    });
    incrementCounter("game_battle_window_resolved_total");
  }

  observeDuration("game_reconcile_battle_windows_duration_ms", Date.now() - startedAt);
}

async function reconcileMarchesTx(
  tx: Prisma.TransactionClient,
  now: Date,
  worldEvents: WorldEvents,
) {
  const dueMarches = await tx.march.findMany({
    where: {
      OR: [
        {
          state: "ENROUTE",
          etaAt: { lte: now },
        },
        {
          state: "GATHERING",
          etaAt: { lte: now },
        },
        {
          state: "RETURNING",
          returnEtaAt: { lte: now },
        },
      ],
    },
    include: {
      commander: true,
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
  });

  const syncedCities = new Set<string>();

  async function ensureSynced(cityId: string | null) {
    if (!cityId || syncedCities.has(cityId)) {
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

    if (march.state === "ENROUTE" && march.objective === "CITY_ATTACK" && march.targetCityId) {
      const defenderCity = await loadCityStateRecordOrThrow(tx, march.targetCityId);
      await stageCityBattleMarchTx(tx, march, attackerCity, defenderCity, now, worldEvents);
      continue;
    }

    if (march.state === "ENROUTE" && march.objective === "BARBARIAN_ATTACK" && march.targetPoiId) {
      const battleStartedAt = Date.now();
      await reconcileBarbarianBattleTx(tx, march, attackerCity, now, worldEvents);
      observeDuration("game_battle_resolve_duration_ms", Date.now() - battleStartedAt, {
        objective: "BARBARIAN_ATTACK",
      });
      incrementCounter("game_battle_resolve_total", {
        objective: "BARBARIAN_ATTACK",
      });
      continue;
    }

    if (march.state === "ENROUTE" && march.objective === "RESOURCE_GATHER" && march.targetPoiId) {
      await reconcileGatherArrivalTx(tx, march, attackerCity, now, worldEvents);
      continue;
    }

    if (march.state === "GATHERING" && march.objective === "RESOURCE_GATHER" && march.targetPoiId) {
      await reconcileGatherCompletionTx(tx, march, attackerCity, now, worldEvents);
      continue;
    }

    if (march.state === "RETURNING" && march.objective === "RESOURCE_GATHER" && march.targetPoiId) {
      await reconcileGatherReturnTx(tx, march, attackerCity, now, worldEvents);
    }
  }

  await reconcileBattleWindowsTx(tx, now, worldEvents);
}

export async function reconcileWorld(now: Date = new Date()): Promise<void> {
  const startedAt = Date.now();
  const worldEvents = await prisma.$transaction(async (tx) => {
    const events: WorldEvents = {
      upgradeCompletions: [],
      trainingCompletions: [],
      researchCompletions: [],
      marchTransitions: [],
      resolvedMarches: [],
      poiUpdates: [],
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

    await reconcilePoiRespawnsTx(tx, now, events);
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

  for (const poiId of worldEvents.poiUpdates) {
    emitPoiUpdated(poiId);
  }

  for (const item of worldEvents.marchTransitions) {
    emitMarchUpdated(item.userIds, item.cityIds[0], item.marchId);
    for (const cityId of item.cityIds) {
      emitCityUpdated(item.userIds, cityId);
      emitMapUpdated(cityId);
    }
    if (item.poiId) {
      emitPoiUpdated(item.poiId);
    }
  }

  for (const item of worldEvents.resolvedMarches) {
    if (item.notifyBattleResolved) {
      emitBattleResolved(item.userIds, item.cityIds[0], item.marchId);
    }
    emitMarchUpdated(item.userIds, item.cityIds[0], item.marchId);
    emitReportCreated(item.userIds, item.reportId);
    for (const cityId of item.cityIds) {
      emitMapUpdated(cityId);
      emitCityUpdated(item.userIds, cityId);
    }
    if (item.poiId) {
      emitPoiUpdated(item.poiId);
    }
  }

  observeDuration("game_reconcile_world_duration_ms", Date.now() - startedAt);
  incrementCounter("game_reconcile_world_total");
}

function visibleCoordinatesForRadius(center: { x: number; y: number }, radius: number) {
  const coordinates: Array<{ x: number; y: number }> = [];

  for (let y = center.y - radius; y <= center.y + radius; y += 1) {
    for (let x = center.x - radius; x <= center.x + radius; x += 1) {
      if (
        Math.abs(center.x - x) + Math.abs(center.y - y) <= radius &&
        x >= 0 &&
        y >= 0
      ) {
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
    const target = getMarchTargetCoordinates(march);
    const position =
      march.state === "STAGING" || march.state === "GATHERING"
        ? target
        : march.state === "RETURNING" && march.returnEtaAt
          ? getMarchPosition(target, { x: city.x, y: city.y }, march.etaAt, march.returnEtaAt, now)
          : getMarchPosition({ x: city.x, y: city.y }, target, march.startsAt, march.etaAt, now);

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
