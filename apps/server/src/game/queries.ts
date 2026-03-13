import type {
  AllianceStateResponse,
  BattleReportsResponse,
  CommanderView,
  EntitlementsResponse,
  GameEventsResponse,
  GameStateResponse,
  InventoryResponse,
  LeaderboardResponse,
  MailboxResponse,
  RalliesResponse,
  StoreCatalogResponse,
  TasksResponse,
  TroopView,
  WorldChunkResponse,
} from "@frontier/shared";

import { prisma } from "../lib/prisma";
import { DEFAULT_WORLD_RADIUS, GAME_MAP_SIZE, MAX_MARCH_DISTANCE } from "./constants";
import { getVisionRadius } from "./engine";
import {
  getCommanderProgressViewTx,
  getEntitlementsViewTx,
  getEventsViewTx,
  getInventoryViewTx,
  getLeaderboardTx,
  getMailboxViewTx,
  getStoreCatalogViewTx,
  getStoreOffersViewTx,
  getTasksViewTx,
} from "./progression";
import { reconcileWorld, refreshFogOfWar, syncCityStateTx } from "./reconcile";
import {
  battleReportInclude,
  cityStateInclude,
  ensureCityInfrastructureTx,
  getAllianceMembershipTx,
  getUserWithCityOrThrow,
  loadCityStateRecordOrThrow,
  mapAllianceListItem,
  mapAllianceSummary,
  mapAllianceView,
  mapBattleReport,
  mapCityInclude,
  mapCityState,
  mapMapCity,
  mapMarchReport,
  mapMarchView,
  mapPoiInclude,
  mapPoiView,
  mapRallyView,
  rallyInclude,
} from "./shared";
import { ensureWorldPoisTx } from "./world";

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
      if (
        x >= 0 &&
        y >= 0 &&
        x < GAME_MAP_SIZE &&
        y < GAME_MAP_SIZE &&
        Math.abs(city.x - x) + Math.abs(city.y - y) <= radius
      ) {
        visible.add(`${x}:${y}`);
      }
    }
  }

  for (const march of city.outgoingMarches) {
    const position = mapMarchView(march, { x: city.x, y: city.y }, now).target;

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
    await ensureWorldPoisTx(tx);
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
    await ensureWorldPoisTx(tx);
    const user = await getUserWithCityOrThrow(tx, userId);
    await ensureCityInfrastructureTx(tx, {
      cityId: user.city!.id,
      userId: user.id,
      username: user.username,
    });
    const synced = await syncCityStateTx(tx, user.city!.id, now);
    await refreshFogOfWar(tx, synced.city, now);
    const currentCity = await loadCityStateRecordOrThrow(tx, synced.city.id);
    const membership = await getAllianceMembershipTx(tx, userId);
    const memberUserIds = membership
      ? membership.alliance.members.map((member) => member.userId)
      : [userId];
    const allianceCities = membership
      ? await tx.city.findMany({
          where: {
            ownerId: {
              in: memberUserIds,
            },
          },
          include: cityStateInclude,
        })
      : [currentCity];

    const visible = new Set<string>();
    for (const city of allianceCities) {
      for (const coordinate of buildVisibleSet(city, now)) {
        visible.add(coordinate);
      }
    }

    const radius = query.radius ?? DEFAULT_WORLD_RADIUS;
    const centerX = query.centerX ?? currentCity.x;
    const centerY = query.centerY ?? currentCity.y;
    const minX = Math.max(0, centerX - radius);
    const maxX = Math.min(GAME_MAP_SIZE - 1, centerX + radius);
    const minY = Math.max(0, centerY - radius);
    const maxY = Math.min(GAME_MAP_SIZE - 1, centerY + radius);

    const [fogTiles, cities, pois] = await Promise.all([
      tx.fogTile.findMany({
        where: {
          userId: {
            in: memberUserIds,
          },
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
      tx.mapPoi.findMany({
        where: {
          x: { gte: minX, lte: maxX },
          y: { gte: minY, lte: maxY },
        },
        include: mapPoiInclude,
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

    const visiblePois = pois
      .map((poi) => {
        const key = `${poi.x}:${poi.y}`;
        const fogState = visible.has(key) ? "VISIBLE" : discovered.has(key) ? "DISCOVERED" : "HIDDEN";
        return mapPoiView(poi, currentCity, fogState);
      })
      .filter((poi) => poi.fogState !== "HIDDEN");

    const marches = currentCity.outgoingMarches
      .map((march) => mapMarchView(march, { x: currentCity.x, y: currentCity.y }, now))
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
      pois: visiblePois,
      marches,
    };
  }, {
    maxWait: 10_000,
    timeout: 15_000,
  });
}

export async function getBattleReports(userId: string): Promise<BattleReportsResponse["reports"]> {
  await reconcileWorld();
  const now = new Date();

  return prisma.$transaction(async (tx) => {
    await ensureWorldPoisTx(tx);
    const user = await getUserWithCityOrThrow(tx, userId);
    await ensureCityInfrastructureTx(tx, {
      cityId: user.city!.id,
      userId: user.id,
      username: user.username,
    });
    const synced = await syncCityStateTx(tx, user.city!.id, now);
    await refreshFogOfWar(tx, synced.city, now);

    const [battleReports, marchReports] = await Promise.all([
      tx.battleReport.findMany({
        where: {
          OR: [{ attackerUserId: userId }, { defenderUserId: userId }],
        },
        include: battleReportInclude,
        orderBy: {
          createdAt: "desc",
        },
        take: 20,
      }),
      tx.marchReport.findMany({
        where: {
          ownerUserId: userId,
        },
        include: {
          ownerUser: true,
          ownerCity: true,
          poi: true,
        },
        orderBy: {
          createdAt: "desc",
        },
        take: 20,
      }),
    ]);

    return [...battleReports.map(mapBattleReport), ...marchReports.map(mapMarchReport)]
      .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime())
      .slice(0, 20);
  });
}

export async function getTroops(userId: string): Promise<TroopView[]> {
  const state = await getGameState(userId);
  return state.city.troops;
}

export async function getCommanders(userId: string): Promise<CommanderView[]> {
  await reconcileWorld();
  const now = new Date();

  return prisma.$transaction(async (tx) => {
    await ensureWorldPoisTx(tx);
    const user = await getUserWithCityOrThrow(tx, userId);
    await ensureCityInfrastructureTx(tx, {
      cityId: user.city!.id,
      userId: user.id,
      username: user.username,
    });
    const synced = await syncCityStateTx(tx, user.city!.id, now);
    await refreshFogOfWar(tx, synced.city, now);
    return getCommanderProgressViewTx(tx, userId);
  });
}

export async function getAllianceState(userId: string): Promise<AllianceStateResponse> {
  await reconcileWorld();
  const now = new Date();

  return prisma.$transaction(async (tx) => {
    await ensureWorldPoisTx(tx);
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

export async function getTasks(userId: string): Promise<TasksResponse> {
  await reconcileWorld();
  return prisma.$transaction((tx) => getTasksViewTx(tx, userId));
}

export async function getInventory(userId: string): Promise<InventoryResponse> {
  await reconcileWorld();
  return prisma.$transaction(async (tx) => ({
    items: await getInventoryViewTx(tx, userId),
  }));
}

export async function getMailbox(userId: string): Promise<MailboxResponse> {
  await reconcileWorld();
  return prisma.$transaction((tx) => getMailboxViewTx(tx, userId));
}

export async function getEvents(userId: string): Promise<GameEventsResponse> {
  await reconcileWorld();
  return prisma.$transaction((tx) => getEventsViewTx(tx, userId));
}

export async function getLeaderboard(userId: string, leaderboardId: string): Promise<LeaderboardResponse> {
  await reconcileWorld();
  return prisma.$transaction(async (tx) => ({
    leaderboardId,
    entries: await getLeaderboardTx(tx, leaderboardId),
  }));
}

export async function getStoreCatalog(userId: string): Promise<StoreCatalogResponse> {
  await reconcileWorld();
  return prisma.$transaction(async (tx) => ({
    catalog: {
      ...(await getStoreCatalogViewTx(tx)),
      offers: await getStoreOffersViewTx(tx, userId),
    },
  }));
}

export async function getEntitlements(userId: string): Promise<EntitlementsResponse> {
  await reconcileWorld();
  return prisma.$transaction(async (tx) => ({
    entitlements: await getEntitlementsViewTx(tx, userId),
  }));
}

export async function getRallies(userId: string): Promise<RalliesResponse> {
  await reconcileWorld();
  const now = new Date();

  return prisma.$transaction(async (tx) => {
    const membership = await getAllianceMembershipTx(tx, userId);
    if (!membership) {
      return { rallies: [] };
    }

    const rallies = await tx.rally.findMany({
      where: {
        allianceId: membership.alliance.id,
        state: {
          in: ["OPEN", "LAUNCHED"],
        },
      },
      include: rallyInclude,
      orderBy: {
        launchAt: "asc",
      },
      take: 12,
    });

    return {
      rallies: rallies.map((rally) => mapRallyView(rally, now)),
    };
  });
}
