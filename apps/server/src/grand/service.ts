import { HttpError } from "../lib/http";
import { prisma } from "../lib/prisma";
import {
  getCountryIncome,
  getCountryManpowerGrowth,
  getNextGameDate,
  getProvinceIncome,
  validateWarDeclaration,
} from "./engine";

export interface GrandCountryState {
  id: string;
  key: string;
  name: string;
  tag: string;
  color: string;
  treasury: number;
  manpower: number;
  manpowerCap: number;
  stability: number;
  isPlayer: boolean;
  provinceCount: number;
  dailyIncome: number;
  armyCount: number;
}

export interface GrandProvinceState {
  id: string;
  key: string;
  name: string;
  x: number;
  y: number;
  terrain: string;
  baseTax: number;
  baseManpower: number;
  development: number;
  income: number;
  ownerCountryId: string | null;
  ownerTag: string | null;
}

export interface GrandWarState {
  id: string;
  attackerId: string;
  defenderId: string;
  status: string;
  warScore: number;
  startedAt: string;
  endedAt: string | null;
}

export interface GrandStateResponse {
  countries: GrandCountryState[];
  provinces: GrandProvinceState[];
  wars: GrandWarState[];
  relations: Array<{ fromCountryId: string; toCountryId: string; kind: string; opinion: number }>;
  lastTick: { tickNumber: number; gameDate: string; processedAt: string } | null;
}

export async function getGrandState(): Promise<GrandStateResponse> {
  const [countries, provinces, wars, relations, lastTick] = await Promise.all([
    prisma.country.findMany({
      orderBy: { key: "asc" },
      include: {
        ownerships: { include: { province: true } },
        _count: { select: { armies: true } },
      },
    }),
    prisma.province.findMany({
      orderBy: { key: "asc" },
      include: { ownership: { include: { country: true } } },
    }),
    prisma.war.findMany({ orderBy: { startedAt: "desc" } }),
    prisma.countryRelation.findMany(),
    prisma.worldTick.findFirst({ orderBy: { tickNumber: "desc" } }),
  ]);

  return {
    countries: countries.map((country) => ({
      id: country.id,
      key: country.key,
      name: country.name,
      tag: country.tag,
      color: country.color,
      treasury: Math.round(country.treasury * 100) / 100,
      manpower: country.manpower,
      manpowerCap: country.manpowerCap,
      stability: country.stability,
      isPlayer: country.isPlayer,
      provinceCount: country.ownerships.length,
      dailyIncome: getCountryIncome(
        country.ownerships.map((ownership) => ({
          baseTax: ownership.province.baseTax,
          development: ownership.province.development,
        })),
      ),
      armyCount: country._count.armies,
    })),
    provinces: provinces.map((province) => ({
      id: province.id,
      key: province.key,
      name: province.name,
      x: province.x,
      y: province.y,
      terrain: province.terrain,
      baseTax: province.baseTax,
      baseManpower: province.baseManpower,
      development: province.development,
      income: getProvinceIncome(province),
      ownerCountryId: province.ownership?.countryId ?? null,
      ownerTag: province.ownership?.country.tag ?? null,
    })),
    wars: wars.map((war) => ({
      id: war.id,
      attackerId: war.attackerId,
      defenderId: war.defenderId,
      status: war.status,
      warScore: war.warScore,
      startedAt: war.startedAt.toISOString(),
      endedAt: war.endedAt ? war.endedAt.toISOString() : null,
    })),
    relations: relations.map((relation) => ({
      fromCountryId: relation.fromCountryId,
      toCountryId: relation.toCountryId,
      kind: relation.kind,
      opinion: relation.opinion,
    })),
    lastTick: lastTick
      ? {
          tickNumber: lastTick.tickNumber,
          gameDate: lastTick.gameDate.toISOString(),
          processedAt: lastTick.processedAt.toISOString(),
        }
      : null,
  };
}

export interface WorldTickResult {
  tickNumber: number;
  gameDate: string;
  countries: Array<{ id: string; tag: string; incomeGained: number; manpowerGained: number }>;
}

export async function runWorldTick(): Promise<WorldTickResult> {
  return prisma.$transaction(async (tx) => {
    const [countries, latestTick] = await Promise.all([
      tx.country.findMany({
        include: { ownerships: { include: { province: true } } },
      }),
      tx.worldTick.findFirst({ orderBy: { tickNumber: "desc" } }),
    ]);

    const perCountry: WorldTickResult["countries"] = [];

    for (const country of countries) {
      const provinces = country.ownerships.map((ownership) => ({
        baseTax: ownership.province.baseTax,
        baseManpower: ownership.province.baseManpower,
        development: ownership.province.development,
      }));
      const incomeGained = getCountryIncome(provinces);
      const manpowerGained = getCountryManpowerGrowth(
        provinces,
        country.manpower,
        country.manpowerCap,
      );

      await tx.country.update({
        where: { id: country.id },
        data: {
          treasury: Math.round((country.treasury + incomeGained) * 100) / 100,
          manpower: country.manpower + manpowerGained,
        },
      });

      perCountry.push({ id: country.id, tag: country.tag, incomeGained, manpowerGained });
    }

    const tickNumber = (latestTick?.tickNumber ?? 0) + 1;
    const gameDate = getNextGameDate(latestTick?.gameDate ?? null);

    await tx.worldTick.create({
      data: {
        tickNumber,
        gameDate,
        summary: { countries: perCountry },
      },
    });

    return {
      tickNumber,
      gameDate: gameDate.toISOString(),
      countries: perCountry,
    };
  });
}

export async function claimProvince(countryId: string, provinceId: string) {
  const [country, province] = await Promise.all([
    prisma.country.findUnique({ where: { id: countryId } }),
    prisma.province.findUnique({ where: { id: provinceId } }),
  ]);

  if (!country) {
    throw new HttpError(404, "COUNTRY_NOT_FOUND", "The country does not exist.");
  }
  if (!province) {
    throw new HttpError(404, "PROVINCE_NOT_FOUND", "The province does not exist.");
  }

  const ownership = await prisma.provinceOwnership.upsert({
    where: { provinceId },
    update: { countryId, isCore: false, claimedAt: new Date() },
    create: { provinceId, countryId, isCore: false, claimedAt: new Date() },
  });

  return {
    provinceId: ownership.provinceId,
    countryId: ownership.countryId,
    isCore: ownership.isCore,
  };
}

export async function declareWar(attackerId: string, defenderId: string) {
  const [attacker, defender, activeWars] = await Promise.all([
    prisma.country.findUnique({ where: { id: attackerId } }),
    prisma.country.findUnique({ where: { id: defenderId } }),
    prisma.war.findMany({ where: { status: "ACTIVE" }, select: { attackerId: true, defenderId: true } }),
  ]);

  if (!attacker) {
    throw new HttpError(404, "COUNTRY_NOT_FOUND", "The attacking country does not exist.");
  }
  if (!defender) {
    throw new HttpError(404, "COUNTRY_NOT_FOUND", "The defending country does not exist.");
  }

  const validation = validateWarDeclaration({ attackerId, defenderId, activeWarPairs: activeWars });
  if (!validation.ok) {
    throw new HttpError(409, validation.code, validation.message);
  }

  const war = await prisma.$transaction(async (tx) => {
    const created = await tx.war.create({
      data: { attackerId, defenderId, status: "ACTIVE", warScore: 0 },
    });

    for (const [fromId, toId] of [
      [attackerId, defenderId],
      [defenderId, attackerId],
    ] as const) {
      await tx.countryRelation.upsert({
        where: { fromCountryId_toCountryId: { fromCountryId: fromId, toCountryId: toId } },
        update: { kind: "WAR" },
        create: { fromCountryId: fromId, toCountryId: toId, kind: "WAR", opinion: -100 },
      });
    }

    return created;
  });

  return {
    id: war.id,
    attackerId: war.attackerId,
    defenderId: war.defenderId,
    status: war.status,
    startedAt: war.startedAt.toISOString(),
  };
}
