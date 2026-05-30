// Pure grand-strategy domain math. No Prisma imports here so these functions
// stay trivially unit-testable and deterministic.

export const GRAND_DEV_TAX_FACTOR = 0.25;
export const GRAND_MANPOWER_GROWTH_RATE = 0.05;
export const GRAND_MANPOWER_DEV_FACTOR = 0.1;
export const GRAND_START_DATE = new Date("1444-11-11T00:00:00.000Z");

export interface ProvinceIncomeInput {
  baseTax: number;
  development: number;
}

export interface ProvinceManpowerInput {
  baseManpower: number;
  development: number;
}

/** Gold produced by a single province in one daily tick. */
export function getProvinceIncome(province: ProvinceIncomeInput): number {
  const raw = province.baseTax * (1 + province.development * GRAND_DEV_TAX_FACTOR);
  return Math.round(raw * 100) / 100;
}

/** Manpower regained by a single province in one daily tick. */
export function getProvinceManpowerGrowth(province: ProvinceManpowerInput): number {
  const raw =
    province.baseManpower *
    GRAND_MANPOWER_GROWTH_RATE *
    (1 + province.development * GRAND_MANPOWER_DEV_FACTOR);
  return Math.round(raw);
}

/** Total daily gold income for a country given its owned provinces. */
export function getCountryIncome(provinces: ProvinceIncomeInput[]): number {
  const total = provinces.reduce((sum, province) => sum + getProvinceIncome(province), 0);
  return Math.round(total * 100) / 100;
}

/** Total daily manpower growth for a country, never exceeding the country cap. */
export function getCountryManpowerGrowth(
  provinces: ProvinceManpowerInput[],
  currentManpower: number,
  manpowerCap: number,
): number {
  const growth = provinces.reduce(
    (sum, province) => sum + getProvinceManpowerGrowth(province),
    0,
  );
  const headroom = Math.max(0, manpowerCap - currentManpower);
  return Math.min(growth, headroom);
}

export interface WarValidationInput {
  attackerId: string;
  defenderId: string;
  activeWarPairs: ReadonlyArray<{ attackerId: string; defenderId: string }>;
}

export type WarValidation = { ok: true } | { ok: false; code: string; message: string };

/** Validate a war declaration without touching the database. */
export function validateWarDeclaration(input: WarValidationInput): WarValidation {
  if (input.attackerId === input.defenderId) {
    return { ok: false, code: "WAR_SELF", message: "A country cannot declare war on itself." };
  }

  const alreadyAtWar = input.activeWarPairs.some(
    (pair) =>
      (pair.attackerId === input.attackerId && pair.defenderId === input.defenderId) ||
      (pair.attackerId === input.defenderId && pair.defenderId === input.attackerId),
  );

  if (alreadyAtWar) {
    return { ok: false, code: "WAR_EXISTS", message: "These countries are already at war." };
  }

  return { ok: true };
}

/** Advance the in-game calendar by one day from the latest tick. */
export function getNextGameDate(latestGameDate: Date | null): Date {
  const base = latestGameDate ?? new Date(GRAND_START_DATE.getTime() - 24 * 60 * 60 * 1000);
  return new Date(base.getTime() + 24 * 60 * 60 * 1000);
}
