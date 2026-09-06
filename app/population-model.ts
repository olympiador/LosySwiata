import type { CountryCapabilityState, DemographicPyramid } from "./country-capability";

export const AGE_GROUPS = ["children", "youth", "primeAge", "middleAge", "elderly", "veryOld"] as const;
export type AgeCounts = DemographicPyramid;
export type PopulationAccounting = {
  naturalChange: number;
  combatDeaths: number;
  refugeesIn: number;
  refugeesOut: number;
  territoryIn: number;
  territoryOut: number;
};
export type PopulationCensus = {
  population: number;
  demographics: DemographicPyramid;
  accounting: PopulationAccounting;
};
export const emptyAccounting = (): PopulationAccounting => ({ naturalChange: 0, combatDeaths: 0, refugeesIn: 0, refugeesOut: 0, territoryIn: 0, territoryOut: 0 });
export const emptyAgeCounts = (): AgeCounts => ({ children: 0, youth: 0, primeAge: 0, middleAge: 0, elderly: 0, veryOld: 0 });
export const populationTotal = (counts: AgeCounts) => AGE_GROUPS.reduce((sum, key) => sum + counts[key], 0);

/** Największe reszty: dokładna suma osób, także dla małych regionów. */
export function allocatePeople(total: number, weights: number[]): number[] {
  total = Math.max(0, Math.round(total));
  const clean = weights.map((w) => Math.max(0, Number.isFinite(w) ? w : 0));
  const sum = clean.reduce((a, b) => a + b, 0);
  const raw = clean.map((w) => total * (sum ? w / sum : 1 / clean.length));
  const result = raw.map(Math.floor);
  const missing = total - result.reduce((a, b) => a + b, 0);
  const order = raw.map((n, id) => ({ id, fraction: n - result[id] })).sort((a, b) => b.fraction - a.fraction || a.id - b.id);
  for (let i = 0; i < missing && order.length; i++) result[order[i % order.length].id]++;
  return result;
}

export function ageCounts(population: number, pyramid: DemographicPyramid): AgeCounts {
  const allocated = allocatePeople(population, AGE_GROUPS.map((key) => pyramid[key]));
  return Object.fromEntries(AGE_GROUPS.map((key, i) => [key, allocated[i]])) as AgeCounts;
}

export function pyramidFromCounts(counts: AgeCounts, fallback: DemographicPyramid): DemographicPyramid {
  const total = populationTotal(counts);
  return total ? Object.fromEntries(AGE_GROUPS.map((key) => [key, counts[key] / total])) as DemographicPyramid : { ...fallback };
}

/** Odejmuje rzeczywiste osoby, nigdy więcej niż istnieje w danej grupie. */
export function removePeople(counts: AgeCounts, requested: number, profile: DemographicPyramid): AgeCounts {
  const removed = emptyAgeCounts();
  let remaining = Math.min(Math.max(0, Math.round(requested)), populationTotal(counts));
  while (remaining > 0) {
    const available = AGE_GROUPS.filter((key) => counts[key] > removed[key]);
    const shares = allocatePeople(remaining, available.map((key) => profile[key]));
    let moved = 0;
    available.forEach((key, i) => { const n = Math.min(shares[i], counts[key] - removed[key]); removed[key] += n; moved += n; });
    if (!moved) break;
    remaining -= moved;
  }
  return removed;
}

export function recordPopulationChange(state: CountryCapabilityState, field: keyof PopulationAccounting, amount: number) {
  state.populationAccounting ??= emptyAccounting();
  state.populationAccounting[field] += amount;
}

export function census(state: CountryCapabilityState): PopulationCensus {
  return { population: Math.round(state.populationAbsolute), demographics: { ...state.demographics }, accounting: { ...(state.populationAccounting ?? emptyAccounting()) } };
}

/** Uproszczony kwartał demograficzny; straty wojenne rozlicza osobno silnik. */
export function advancePopulationQuarter(state: CountryCapabilityState) {
  const before = Math.max(0, Math.round(state.populationAbsolute));
  const counts = ageCounts(before, state.demographics);
  const next = { ...counts };
  const widths = [15, 10, 20, 20, 15];
  const mortality = [.00005, .0001, .0002, .0008, .006, .025];
  AGE_GROUPS.forEach((key, i) => {
    const deaths = Math.min(counts[key], Math.round(counts[key] * mortality[i]));
    next[key] -= deaths;
    if (i < widths.length) {
      const aging = Math.round((counts[key] - deaths) / (widths[i] * 4));
      next[key] -= aging;
      next[AGE_GROUPS[i + 1]] += aging;
    }
  });
  next.children += Math.round(before * (.005 - Math.min(100, Math.max(0, state.components.technology)) * .00003));
  const population = populationTotal(next);
  return { population, demographics: pyramidFromCounts(next, state.demographics), net: population - before };
}
