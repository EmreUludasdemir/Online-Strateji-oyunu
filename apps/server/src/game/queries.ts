import type {
  AllianceStateResponse,
  BattleReportView,
  CommanderView,
  GameStateResponse,
  MarchView,
  TroopView,
  WorldChunkResponse,
} from "@frontier/shared";

import { prisma } from "../lib/prisma";
import { DEFAULT_WORLD_RADIUS, GAME_MAP_SIZE, MAX_MARCH_DISTANCE } from "./constants";
import { getMarchPosition, getVisionRadius, manhattanDistance } from "./engine";
import { reconcileWorld, refreshFogOfWar, syncCityStateTx } from "./reconcile";
import {
  battleReportInclude,
  ensureCityInfrastructureTx,
  getAllianceMembershipTx,
  getUserWithCityOrThrow,
  loadCityStateRecordOrThrow,
  mapAllianceListItem,
  mapAllianceSummary,
  mapAllianceView,
  mapCityInclude,
  mapBattleReport,
  mapCityState,
  mapMapCity,
} from "./shared";

function buildVisibleSet(city: Awaited<ReturnType<typeof loadCityStateRecordOrThrow>>, now: Date) {
  const visible = new Set<string>();
  const buildingLevels = city.buildings.reduce<Record<string, number>>((levels, building) => {
    levels[building.buildingType] = building.level;
    return levels;
  }, {});
  const researchLevels = city.researchLevels.reduce<Record<string, number>>((levels, research) => {
    levels[research.researchType] = research.level;
    return levels;
  }, {});
  const radius = getVisionRadius(
    buildingLevels.WATCHTOWER ?? 1,
    {
      MILITARY_DRILL: researchLevels.MILITARY_DRILL ?? 0,
      LOGISTICS: researchLevels.LOGISTICS ?? 0,
      AGRONOMY: researchLevels.AGRONOMY ?? 0,
      STONEWORK: researchLevels.STONEWORK ?? 0,
      GOLD_TRADE: researchLevels.GOLD_TRADE ?? 0,
      SCOUTING: researchLevels.SCOUTING ?? 0,
    },
  );

  for (let y = city.y - radius; y <= city.y + radius; y += 1) {
    for (let x = city.x - radius; x <= city.x + radius; x += 1) {
      if (x >= 0 && y >= 0 && x < GAME_MAP_SIZE && y < GAME_MAP_SIZE && Math.abs(city.x - x) + Math.abs(city.y - y) <= radius) {
        visible.add(`${x}:${y}`);
      }
    }
  }

  for (const march of city.outgoingMarches) {
    const position = getMarchPosition(
      { x: city.x, y: city.y },
      { x: march.targetCity.x, y: march.targetCity.y },
      march.startsAt,
      march.etaAt,
      now,
    );

    for (let y = position.y - 2; y <= position.y + 2; y += 1) {
      for (let x = position.x - 2; x <= position.x + 2; x += 1) {
        if (
          x >= 0 &&
          y >= 0 &&
          x < GAME_MAP_SIZE &&
          y < GAME_MAP_SIZE &&
          Math.abs(position.x - x) + Math.abs(position.y - y) <= 2
        ) {
          visible.add(`${x}:${y}`);
        }
      }
    }
  }

  return visible;
}

export async function getGameState(userId: string): Promise<GameStateResponse> {
  await reconcileWorld();
  const now = new Date();

  return prisma.$transaction(async (tx) => {
    const user = await getUserWithCityOrThrow(tx, userId);
    await ensureCityInfrastructureTx(tx, {
      cityId: user.city!.id,
      userId: user.id,
      username: user.username,
    });
    const synced = await syncCityStateTx(tx, user.city!.id, now);
    await refreshFogOfWar(tx, synced.city, now);

    return {
      player: {
        id: user.id,
        username: user.username,
        cityId: user.city!.id,
        cityName: user.city!.name,
      },
      city: mapCityState(await loadCityStateRecordOrThrow(tx, synced.city.id), now),
      alliance: (() => {
        const allianceMembership = synced.city.owner.allianceMembership;
        return allianceMembership?.alliance
          ? mapAllianceSummary(allianceMembership.alliance, user.id)
          : null;
      })(),
    };
  });
}

export async function getWorldChunk(
  userId: string,
  query: { centerX?: number; centerY?: number; radius?: number },
): Promise<WorldChunkResponse> {
  await reconcileWorld();
  const now = new Date();

  return prisma.$transaction(async (tx) => {
    const user = await getUserWithCityOrThrow(tx, userId);
    await ensureCityInfrastructureTx(tx, {
      cityId: user.city!.id,
      userId: user.id,
      username: user.username,
    });
    const synced = await syncCityStateTx(tx, user.city!.id, now);
    await refreshFogOfWar(tx, synced.city, now);
    const currentCity = await loadCityStateRecordOrThrow(tx, synced.city.id);
    const visible = buildVisibleSet(currentCity, now);
    const radius = query.radius ?? DEFAULT_WORLD_RADIUS;
    const centerX = query.centerX ?? currentCity.x;
    const centerY = query.centerY ?? currentCity.y;
    const minX = Math.max(0, centerX - radius);
    const maxX = Math.min(GAME_MAP_SIZE - 1, centerX + radius);
    const minY = Math.max(0, centerY - radius);
    const maxY = Math.min(GAME_MAP_SIZE - 1, centerY + radius);

    const [fogTiles, cities] = await Promise.all([
      tx.fogTile.findMany({
        where: {
          userId,
          x: { gte: minX, lte: maxX },
          y: { gte: minY, lte: maxY },
        },
      }),
      tx.city.findMany({
        where: {
          x: { gte: minX, lte: maxX },
          y: { gte: minY, lte: maxY },
        },
        include: mapCityInclude,
        orderBy: [{ y: "asc" }, { x: "asc" }],
      }),
    ]);

    const discovered = new Set(fogTiles.map((tile) => `${tile.x}:${tile.y}`));
    const tiles: WorldChunkResponse["tiles"] = [];
    for (let y = minY; y <= maxY; y += 1) {
      for (let x = minX; x <= maxX; x += 1) {
        const key = `${x}:${y}`;
        tiles.push({
          x,
          y,
          state: visible.has(key) ? "VISIBLE" : discovered.has(key) ? "DISCOVERED" : "HIDDEN",
        });
      }
    }

    const visibleCities = cities
      .map((city) => {
        const key = `${city.x}:${city.y}`;
        const fogState = visible.has(key) ? "VISIBLE" : discovered.has(key) ? "DISCOVERED" : "HIDDEN";
        return mapMapCity(city, currentCity, now, fogState, MAX_MARCH_DISTANCE);
      })
      .filter((city) => city.fogState !== "HIDDEN" || city.isCurrentPlayer);

    const marches: MarchView[] = currentCity.outgoingMarches
      .map((march) => {
        const position = getMarchPosition(
          { x: currentCity.x, y: currentCity.y },
          { x: march.targetCity.x, y: march.targetCity.y },
          march.startsAt,
          march.etaAt,
          now,
        );
        const distance = manhattanDistance({ x: currentCity.x, y: currentCity.y }, { x: march.targetCity.x, y: march.targetCity.y });

        return {
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
          distance,
          origin: { x: currentCity.x, y: currentCity.y },
          target: position,
          projectedOutcome:
            march.defenderPowerSnapshot == null
              ? null
              : march.attackerPowerSnapshot > march.defenderPowerSnapshot
                ? ("ATTACKER_WIN" as const)
                : ("DEFENDER_HOLD" as const),
        };
      })
      .filter((march) => {
        return (
          march.target.x >= minX &&
          march.target.x <= maxX &&
          march.target.y >= minY &&
          march.target.y <= maxY
        );
      });

    return {
      size: GAME_MAP_SIZE,
      center: { x: centerX, y: centerY },
      radius,
      tiles,
      cities: visibleCities,
      marches,
    };
  });
}

export async function getBattleReports(userId: string): Promise<BattleReportView[]> {
  await reconcileWorld();
  const now = new Date();

  return prisma.$transaction(async (tx) => {
    const user = await getUserWithCityOrThrow(tx, userId);
    await ensureCityInfrastructureTx(tx, {
      cityId: user.city!.id,
      userId: user.id,
      username: user.username,
    });
    const synced = await syncCityStateTx(tx, user.city!.id, now);
    await refreshFogOfWar(tx, synced.city, now);

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

    return reports.map(mapBattleReport);
  });
}

export async function getTroops(userId: string): Promise<TroopView[]> {
  const state = await getGameState(userId);
  return state.city.troops;
}

export async function getCommanders(userId: string): Promise<CommanderView[]> {
  const state = await getGameState(userId);
  return state.city.commanders;
}

export async function getAllianceState(userId: string): Promise<AllianceStateResponse> {
  await reconcileWorld();
  const now = new Date();

  return prisma.$transaction(async (tx) => {
    const user = await getUserWithCityOrThrow(tx, userId);
    await ensureCityInfrastructureTx(tx, {
      cityId: user.city!.id,
      userId: user.id,
      username: user.username,
    });
    const synced = await syncCityStateTx(tx, user.city!.id, now);
    await refreshFogOfWar(tx, synced.city, now);

    const [membership, alliances] = await Promise.all([
      getAllianceMembershipTx(tx, userId),
      tx.alliance.findMany({
        include: {
          members: {
            select: {
              userId: true,
            },
          },
        },
        orderBy: [{ createdAt: "asc" }],
        take: 12,
      }),
    ]);

    return {
      alliance: membership?.alliance ? mapAllianceView(membership.alliance, userId) : null,
      alliances: alliances.map((alliance) => mapAllianceListItem(alliance, userId)),
    };
  });
}
