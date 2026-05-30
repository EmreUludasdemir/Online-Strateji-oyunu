import type { ProvinceTerrain } from "@prisma/client";

import { prisma } from "../lib/prisma";

interface GrandCountrySeed {
  key: string;
  name: string;
  tag: string;
  color: string;
  treasury: number;
  manpower: number;
  manpowerCap: number;
  stability: number;
}

const COUNTRIES: GrandCountrySeed[] = [
  { key: "boz", name: "Bozkır Kağanlığı", tag: "BOZ", color: "#e2c275", treasury: 200, manpower: 12000, manpowerCap: 60000, stability: 1 },
  { key: "dem", name: "Demir Hanlığı", tag: "DEM", color: "#8a9097", treasury: 180, manpower: 14000, manpowerCap: 65000, stability: 0 },
  { key: "tun", name: "Tuna Beyliği", tag: "TUN", color: "#51a3a1", treasury: 220, manpower: 10000, manpowerCap: 55000, stability: 2 },
];

const TERRAINS: ProvinceTerrain[] = ["PLAINS", "STEPPE", "FOREST", "HILLS", "MOUNTAIN", "COAST"];

const PROVINCE_NAMES = [
  "Altay Yaylası", "Orhun Vadisi", "Talas Ovası", "Yedisu", "Sarıkamış",
  "Ötüken", "İdil Boyu", "Yayık Geçidi", "Kıpçak Bozkırı", "Türgeş Otağı",
  "Demirkapı", "Karatağ", "Çelikova", "Madenli", "Cevheryurt",
  "Köprübaşı", "Örsdağ", "Çekiçtepe", "Kor Vadisi", "Pasköy",
  "Tuna Ağzı", "Yeşilova", "Liman Beldesi", "Sazlıdere", "Akdeniz Kıyısı",
  "Bağyaka", "Söğütlük", "Gemiyolu", "Mavi Koy", "Çınarlı",
];

function provinceKey(index: number): string {
  return `prov-${String(index + 1).padStart(2, "0")}`;
}

/**
 * Deterministically seeds the grand-strategy world: 3 countries, 30 provinces
 * (10 owned per country), neutral relations, and one capital army each.
 * Idempotent — safe to run repeatedly and from tests after a table wipe.
 */
export async function seedGrandStrategy(): Promise<void> {
  const countryIdByKey = new Map<string, string>();

  for (const country of COUNTRIES) {
    const record = await prisma.country.upsert({
      where: { key: country.key },
      update: {
        name: country.name,
        tag: country.tag,
        color: country.color,
        treasury: country.treasury,
        manpower: country.manpower,
        manpowerCap: country.manpowerCap,
        stability: country.stability,
      },
      create: {
        key: country.key,
        name: country.name,
        tag: country.tag,
        color: country.color,
        treasury: country.treasury,
        manpower: country.manpower,
        manpowerCap: country.manpowerCap,
        stability: country.stability,
      },
    });
    countryIdByKey.set(country.key, record.id);
  }

  for (let index = 0; index < 30; index += 1) {
    const key = provinceKey(index);
    const name = PROVINCE_NAMES[index];
    const x = 4 + (index % 6) * 4;
    const y = 4 + Math.floor(index / 6) * 4;
    const terrain = TERRAINS[index % TERRAINS.length];
    const baseTax = 2 + (index % 5);
    const baseManpower = 300 + (index % 5) * 150;
    const development = 1 + (index % 4);
    const ownerKey = COUNTRIES[Math.floor(index / 10)].key;
    const ownerCountryId = countryIdByKey.get(ownerKey)!;
    const isCapital = index % 10 === 0;

    const province = await prisma.province.upsert({
      where: { key },
      update: { name, x, y, terrain, baseTax, baseManpower, development },
      create: { key, name, x, y, terrain, baseTax, baseManpower, development },
    });

    await prisma.provinceOwnership.upsert({
      where: { provinceId: province.id },
      update: { countryId: ownerCountryId, isCore: true },
      create: { provinceId: province.id, countryId: ownerCountryId, isCore: true, claimedAt: new Date() },
    });
  }

  // Neutral starting relations between every ordered country pair.
  const countryIds = COUNTRIES.map((country) => countryIdByKey.get(country.key)!);
  for (const fromId of countryIds) {
    for (const toId of countryIds) {
      if (fromId === toId) {
        continue;
      }
      await prisma.countryRelation.upsert({
        where: { fromCountryId_toCountryId: { fromCountryId: fromId, toCountryId: toId } },
        update: {},
        create: { fromCountryId: fromId, toCountryId: toId, kind: "NEUTRAL", opinion: 0 },
      });
    }
  }

  // One capital army per country (rebuilt each run for idempotency).
  await prisma.army.deleteMany({ where: { countryId: { in: countryIds } } });
  for (const country of COUNTRIES) {
    const countryId = countryIdByKey.get(country.key)!;
    const capital = await prisma.province.findUnique({ where: { key: provinceKey(COUNTRIES.indexOf(country) * 10) } });
    await prisma.army.create({
      data: {
        name: `${country.tag} Merkez Ordusu`,
        countryId,
        provinceId: capital?.id ?? null,
        manpower: 5000,
        morale: 1,
      },
    });
  }
}
