import type { Country, StrategicRegion } from "./game-engine";
import { STRATEGIC_BASELINES } from "./strategic-baselines";

export type StrategicComponents = { economy: number; population: number; technology: number; logistics: number; military: number; stability: number };

export type RegimeType = "democracy" | "authoritarian" | "totalitarian";

export type DemographicPyramid = { children: number; youth: number; primeAge: number; middleAge: number; elderly: number; veryOld: number };
export type DemographicType = "healthy" | "chimney" | "inverted";
export type BorderPolicy = "closed" | "selective" | "open" | "mass";
export type CulturalProximity = Record<number, number>;
export type RefugeeComposition = { women: number; men: number; children: number };

export type RegionLogistics = {
  regionId: number;
  logisticsIndex: number;
  maritimeAccess: number;
  railDensity: number;
  roadDensity: number;
  airportCount: number;
  portCount: number;
  riverAccess: number;
};

export type LogisticsInvestment = {
  id: string;
  regionId: number;
  type: "port" | "road" | "airport" | "rail";
  bonus: number;
  remainingTurns: number;
};

export type CountryCapabilityState = {
  components: StrategicComponents;
  uncertainty: number;
  lastEvaluatedTurn: number;
  change: StrategicComponents;
  regimeType: RegimeType;
  informationEnvironment: { score: number; techComponent: number; mediaControl: number; servicesStrength: number };
  combatExperience: number;
  manpower: { available: number; active: number; reserves: number; mobilization: "hidden" | "open" | "full"; maintenanceCost: number };
  demographics: DemographicPyramid;
  demographicType: DemographicType;
  borderPolicy: BorderPolicy;
  culturalProximity: CulturalProximity;
  assimilationProgress: number;
  refugeesHosted: number;
  refugeeComposition: RefugeeComposition;
  populationAbsolute: number;
  logisticsInvestments: LogisticsInvestment[];
};

export type PolicyDecisionId =
  | "media-oversight"
  | "research-program"
  | "full-mobilization"
  | "open-borders"
  | "close-borders"
  | "propaganda-offensive"
  | "diplomatic-pressure"
  | "selective-immigration"
  | "mass-immigration-former-colonies"
  | "build-port"
  | "modernize-roads"
  | "expand-airport"
  | "rail-upgrade"
  | "fortify-sector";

export type PlayerPolicyDecision = {
  id: PolicyDecisionId;
  name: string;
  description: string;
  cost: number;
  effects: Partial<StrategicComponents> & {
    informationEnvironment?: Partial<CountryCapabilityState["informationEnvironment"]>;
    manpower?: Partial<CountryCapabilityState["manpower"]>;
    immigrationPolicy?: BorderPolicy;
    technologyBurst?: number;
    stabilityDelta?: number;
    combatExperienceChange?: number;
    logisticsInvestment?: { regionId: number; type: "port" | "road" | "airport" | "rail"; bonus: number };
  };
  costs: Partial<StrategicComponents> & { stabilityDelta?: number | ((state: CountryCapabilityState) => number); economyDelta?: number | ((state: CountryCapabilityState) => number) };
  duration: number;
  cooldown: number;
  lastUsedTurn: number;
  condition?: (state: CountryCapabilityState, regions?: StrategicRegion[]) => boolean;
  availableRegions?: { id: number; name: string; valid: boolean }[];
};

export type PlayerPolicyState = {
  decisions: Record<PolicyDecisionId, PlayerPolicyDecision>;
  activePolicies: PlayerPolicyDecision[];
  decisionPoints: number;
  lastDecisionTurn: number;
};

export type CapabilityDelta = { key: string; label: string; value: number; delta: string; trend: "up" | "down" | "flat" };

function clamp(value: number, minimum = 0, maximum = 100) { return Math.max(minimum, Math.min(maximum, value)); }

function signed(delta: number) { return delta > 0.05 ? "+" : ""; }

const MANUAL_BASELINES: Record<string, {
  economy?: number;
  populationAbsolute?: number;
  technology?: number;
  logistics?: number;
  military?: number;
  stability?: number;
  regimeType?: RegimeType;
  informationEnvironment?: { score: number; techComponent: number; mediaControl: number; servicesStrength: number };
  combatExperience?: number;
}> = {
  POL: { economy: 65, populationAbsolute: 38_000_000, technology: 68, logistics: 72, military: 55, stability: 53, regimeType: "democracy", informationEnvironment: { score: 48, techComponent: 68, mediaControl: 28, servicesStrength: 35 }, combatExperience: 3 },
  ROU: { economy: 58, populationAbsolute: 19_000_000, technology: 52, logistics: 62, military: 38, stability: 47, regimeType: "democracy", informationEnvironment: { score: 42, techComponent: 52, mediaControl: 32, servicesStrength: 40 }, combatExperience: 2 },
  UKR: { economy: 38, populationAbsolute: 44_000_000, technology: 48, logistics: 50, military: 48, stability: 32, regimeType: "democracy", informationEnvironment: { score: 38, techComponent: 48, mediaControl: 35, servicesStrength: 38 }, combatExperience: 8 },
  BLR: { economy: 35, populationAbsolute: 9_000_000, technology: 45, logistics: 55, military: 42, stability: 42, regimeType: "authoritarian", informationEnvironment: { score: 66, techComponent: 45, mediaControl: 72, servicesStrength: 65 }, combatExperience: 1 },
  RUS: { economy: 65, populationAbsolute: 144_000_000, technology: 62, logistics: 58, military: 88, stability: 65, regimeType: "authoritarian", informationEnvironment: { score: 76, techComponent: 62, mediaControl: 78, servicesStrength: 72 }, combatExperience: 10 },
  DEU: { economy: 82, populationAbsolute: 83_000_000, technology: 88, logistics: 85, military: 65, stability: 64, regimeType: "democracy", informationEnvironment: { score: 44, techComponent: 88, mediaControl: 20, servicesStrength: 32 }, combatExperience: 3 },
  FRA: { economy: 78, populationAbsolute: 67_000_000, technology: 82, logistics: 80, military: 55, stability: 55, regimeType: "democracy", informationEnvironment: { score: 47, techComponent: 82, mediaControl: 22, servicesStrength: 38 }, combatExperience: 3 },
  GBR: { economy: 75, populationAbsolute: 67_000_000, technology: 80, logistics: 78, military: 58, stability: 70, regimeType: "democracy", informationEnvironment: { score: 46, techComponent: 80, mediaControl: 21, servicesStrength: 37 }, combatExperience: 3 },
  USA: { economy: 95, populationAbsolute: 331_000_000, technology: 95, logistics: 85, military: 95, stability: 58, regimeType: "democracy", informationEnvironment: { score: 55, techComponent: 95, mediaControl: 18, servicesStrength: 32 }, combatExperience: 8 },
  TUR: { economy: 52, populationAbsolute: 84_000_000, technology: 55, logistics: 58, military: 40, stability: 50, regimeType: "authoritarian", informationEnvironment: { score: 58, techComponent: 55, mediaControl: 55, servicesStrength: 52 }, combatExperience: 6 },
  PRK: { economy: 10, populationAbsolute: 25_000_000, technology: 25, logistics: 20, military: 35, stability: 88, regimeType: "totalitarian", informationEnvironment: { score: 82, techComponent: 25, mediaControl: 95, servicesStrength: 90 }, combatExperience: 5 },
};

function defaultPyramid(): DemographicPyramid {
  return { children: 0.18, youth: 0.12, primeAge: 0.34, middleAge: 0.22, elderly: 0.11, veryOld: 0.03 };
}

function demographicSignal(iso3: string) {
  return [...iso3].reduce((value, letter, index) => (value * 31 + letter.charCodeAt(0) * (index + 3)) % 10_007, 17) / 10_007;
}

// The game has country population totals, but not a licensed worldwide age
// table. Start from a demographic estimate that reflects development and
// differs by country, then let policies, migration and war change it in play.
function initialDemographics(country: Country, components: StrategicComponents): DemographicPyramid {
  const signal = demographicSignal(country.iso3 ?? country.iso) - .5;
  const development = (components.economy * .45 + components.technology * .55) / 100;
  const children = clamp(.30 - development * .16 + signal * .045, .11, .32);
  const youth = clamp(.145 - development * .025 - signal * .018, .085, .16);
  const elderly = clamp(.045 + development * .105 - signal * .025, .035, .16);
  const veryOld = clamp(.009 + development * .038 + signal * .009, .008, .06);
  const middleAge = clamp(.185 + development * .055 - signal * .012, .16, .26);
  const primeAge = Math.max(.12, 1 - children - youth - middleAge - elderly - veryOld);
  const total = children + youth + primeAge + middleAge + elderly + veryOld;
  return { children: children / total, youth: youth / total, primeAge: primeAge / total, middleAge: middleAge / total, elderly: elderly / total, veryOld: veryOld / total };
}

function defaultProximity(): CulturalProximity { return {}; }

function initialRegimeType(countryId: number): RegimeType {
  if ([4, 70, 71, 89, 115, 151, 152, 180, 181, 183, 187, 231, 255, 256, 257, 258, 259, 260].includes(countryId)) return "authoritarian";
  if ([72, 73, 98, 99, 103, 162, 254, 255, 256, 257, 258, 259, 260].includes(countryId)) return "totalitarian";
  return "democracy";
}

function initialInformationEnvironment(countryId: number) {
  const base = 35 + ((countryId * 41.3) % 30);
  return { score: base, techComponent: clamp(25 + ((countryId * 89.33) % 50)), mediaControl: clamp(15 + ((countryId * 61.1) % 55)), servicesStrength: clamp(20 + ((countryId * 53.7) % 45)) };
}

function initialManpower(countryId: number) {
  const base = 18 + ((countryId * 311.4) % 34);
  return { available: Math.round(20 + ((countryId * 89.33) % 35)), active: Math.round(base * 0.6), reserves: Math.round(base * 0.4), mobilization: "hidden" as const, maintenanceCost: 0 };
}

function defaultInitialCountryCapabilityState(): CountryCapabilityState {
  return {
    components: { economy: 0, population: 0, technology: 0, logistics: 0, military: 0, stability: 0 },
    uncertainty: 0.18,
    lastEvaluatedTurn: 0,
    change: { economy: 0, population: 0, technology: 0, logistics: 0, military: 0, stability: 0 },
    regimeType: "democracy",
    informationEnvironment: { score: 45, techComponent: 50, mediaControl: 30, servicesStrength: 35 },
    combatExperience: 0,
    manpower: { available: 0, active: 0, reserves: 0, mobilization: "hidden", maintenanceCost: 0 },
    demographics: defaultPyramid(),
    demographicType: "chimney",
    borderPolicy: "selective",
    logisticsInvestments: [],
    culturalProximity: defaultProximity(),
    assimilationProgress: 0,
    refugeesHosted: 0,
    refugeeComposition: { women: 0, men: 0, children: 0 },
    populationAbsolute: 0,
  };
}

function cloneCapabilityState(state: CountryCapabilityState): CountryCapabilityState {
  return {
    ...state,
    components: { ...state.components },
    change: { ...state.change },
    informationEnvironment: { ...state.informationEnvironment },
    manpower: { ...state.manpower },
    demographics: { ...state.demographics },
    culturalProximity: { ...state.culturalProximity },
    logisticsInvestments: [...state.logisticsInvestments],
  };
}

export function initialCapabilityStates(countries: Country[]): CountryCapabilityState[] {
  return countries.map((country) => {
    const calibrated = MANUAL_BASELINES[country.iso3 as keyof typeof MANUAL_BASELINES];
    const reportedPopulation = STRATEGIC_BASELINES[country.iso3 ?? ""]?.population;
    // Czasem źródłowy rekord jest agregatem regionalnym. Dla państwa bierzemy
    // tylko wiarygodną, pojedynczą populację. Wzór awaryjny zostaje wyłącznie
    // dla terytoriów, których nie ma w bazie.
    const baselinePopulation = Number.isFinite(reportedPopulation) && reportedPopulation! >= 10_000 && reportedPopulation! <= 1_500_000_000
      ? reportedPopulation!
      : undefined;
    const fallback = {
      economy: 20 + ((country.id * 137.508) % 40),
      population: 20 + ((country.id * 251.17) % 35),
      technology: 18 + ((country.id * 89.33) % 30),
      logistics: 16 + ((country.id * 191.7) % 28),
      military: 18 + ((country.id * 311.4) % 34),
      stability: 22 + ((country.id * 73.9) % 30),
    };
    const components = { ...(calibrated
      ? { economy: clamp(calibrated.economy ?? fallback.economy), population: clamp((calibrated.populationAbsolute ?? 0) / 1_000_000), technology: clamp(calibrated.technology ?? fallback.technology), logistics: clamp(calibrated.logistics ?? fallback.logistics), military: clamp(calibrated.military ?? fallback.military), stability: clamp(calibrated.stability ?? fallback.stability) }
      : { ...fallback, stability: clamp(fallback.stability) }) };
    const regimeType = calibrated?.regimeType ?? initialRegimeType(country.id);
    const informationEnvironment = calibrated?.informationEnvironment ?? initialInformationEnvironment(country.id);
    let populationAbsolute = calibrated?.populationAbsolute ?? baselinePopulation ?? components.population * 1_000_000;
    if (!calibrated && components.population > 45) {
      const fallbackPop = 1_000_000 + ((country.id * 251.17) % 35) * 1_000_000;
      components.population = clamp(fallbackPop / 1_000_000, 0, 45);
      populationAbsolute = components.population * 1_000_000;
    }
    const demographics = initialDemographics(country, components);
    const culturalProximity = defaultProximity();
    return {
      components,
      uncertainty: 0.18 + ((country.id * 41.3) % 25) / 100,
      lastEvaluatedTurn: 0,
      change: { economy: 0, population: 0, technology: 0, logistics: 0, military: 0, stability: 0 },
      regimeType,
      informationEnvironment,
      combatExperience: calibrated?.combatExperience ?? Math.round(((country.id * 17.7) % 20)),
      manpower: initialManpower(country.id),
      populationAbsolute,
      demographics,
      demographicType: demographicType(demographics),
      borderPolicy: "selective",
      logisticsInvestments: [],
      culturalProximity,
      assimilationProgress: 0,
      refugeesHosted: 0,
      refugeeComposition: { women: 0, men: 0, children: 0 },
    };
  });
}

function updateDemographics(state: CountryCapabilityState, context: { hasIncoming: boolean; hasOutgoing: boolean; warIntensity: number; technology: number; immigrationPolicy: BorderPolicy }): DemographicPyramid {
  const pyramid = { ...state.demographics };
  const birthRate = 0.005 - (context.technology / 100) * 0.003 + (context.immigrationPolicy === "mass" ? 0.001 : 0);
  const deathRate = 0.004 + (context.technology < 40 ? 0.001 : 0);
  const agingFactor = 0.001;
  const warDeathRate = context.hasIncoming ? 0.0008 : context.hasOutgoing ? 0.0004 : 0;
  const children = clamp(pyramid.children + birthRate - deathRate * 0.6 - warDeathRate * 0.5 - agingFactor * 0.1, 0.05, 0.4);
  const youth = clamp(pyramid.youth + agingFactor * (pyramid.children - children) - warDeathRate * 0.3, 0.05, 0.3);
  const primeAge = clamp(pyramid.primeAge + agingFactor * (pyramid.youth - youth) - warDeathRate * 0.5, 0.1, 0.5);
  const middleAge = clamp(pyramid.middleAge + agingFactor * (pyramid.primeAge - primeAge), 0.05, 0.35);
  const elderly = clamp(pyramid.elderly + agingFactor * (pyramid.middleAge - middleAge) - deathRate * 0.4, 0.02, 0.3);
  const veryOld = clamp(pyramid.veryOld + agingFactor * (pyramid.elderly - elderly) - deathRate * 0.6, 0.01, 0.2);
  const sum = children + youth + primeAge + middleAge + elderly + veryOld;
  return { children: children / sum, youth: youth / sum, primeAge: primeAge / sum, middleAge: middleAge / sum, elderly: elderly / sum, veryOld: veryOld / sum };
}

export function demographicType(demographics: DemographicPyramid): DemographicType {
  const young = demographics.children + demographics.youth;
  if (young > 0.35) return "healthy";
  if (young >= 0.25) return "chimney";
  return "inverted";
}

export function consumptionDrive(demographics: DemographicPyramid): number {
  return clamp(demographics.primeAge * 0.6 + demographics.youth * 0.4 - demographics.elderly * 0.3 - demographics.veryOld * 0.5, -0.5, 0.8);
}

export function demographicCliff(demographics: DemographicPyramid): { economyPenalty: number; populationPenalty: number; stabilityPenalty: number; manpowerPenalty: number } {
  const elderly = demographics.elderly + demographics.veryOld;
  const children = demographics.children;
  if (elderly > 0.35 && children < 0.15) {
    return { economyPenalty: -0.06, populationPenalty: -0.03, stabilityPenalty: -0.02, manpowerPenalty: -0.03 };
  }
  return { economyPenalty: 0, populationPenalty: 0, stabilityPenalty: 0, manpowerPenalty: 0 };
}

/** Skład uciekinierów zależy od tego, ilu dorosłych mężczyzn zatrzymuje mobilizacja. */
export function refugeeArrivalProfile(mobilization: CountryCapabilityState["manpower"]["mobilization"]): RefugeeComposition {
  if (mobilization === "full") return { women: .57, men: .06, children: .37 };
  if (mobilization === "open") return { women: .51, men: .12, children: .37 };
  return { women: .42, men: .25, children: .33 };
}

/** Zapisuje faktyczne przekazanie ludzi między dwoma państwami. */
export function applyRefugeeMovement(state: CountryCapabilityState, incoming: number, outgoing: number, arrivalProfile = refugeeArrivalProfile("hidden")): CountryCapabilityState {
  const population = Math.max(1, state.populationAbsolute || state.components.population * 1_000_000);
  const arrivals = Math.max(0, Math.round(incoming));
  const departures = Math.min(Math.max(0, Math.round(outgoing)), Math.round(population * 0.03));
  if (!arrivals && !departures) return state;

  // Uchodźcy częściej są dziećmi oraz ludźmi w wieku produkcyjnym. Wyjazdy
  // odbierają całemu społeczeństwu proporcjonalną część każdej grupy.
  const groups: Array<keyof DemographicPyramid> = ["children", "youth", "primeAge", "middleAge", "elderly", "veryOld"];
  const adultShare = 1 - arrivalProfile.children;
  const arrivalShare: DemographicPyramid = { children: arrivalProfile.children, youth: adultShare * .15, primeAge: adultShare * .54, middleAge: adultShare * .20, elderly: adultShare * .08, veryOld: adultShare * .03 };
  const masses = Object.fromEntries(groups.map((group) => [group, Math.max(0, population * state.demographics[group] - departures * state.demographics[group] + arrivals * arrivalShare[group])])) as Record<keyof DemographicPyramid, number>;
  const nextPopulation = Math.max(1, population - departures + arrivals);
  const demographics = Object.fromEntries(groups.map((group) => [group, masses[group] / nextPopulation])) as DemographicPyramid;
  const netPopulation = arrivals - departures;
  const manpowerDelta = Math.round(netPopulation / 1_000_000 * .22);
  const women = Math.round(arrivals * arrivalProfile.women);
  const men = Math.round(arrivals * arrivalProfile.men);
  const children = arrivals - women - men;
  return {
    ...state,
    components: { ...state.components, population: clamp(state.components.population + netPopulation / 1_000_000) },
    demographics,
    demographicType: demographicType(demographics),
    manpower: { ...state.manpower, available: Math.max(0, state.manpower.available + manpowerDelta), reserves: Math.max(0, state.manpower.reserves + manpowerDelta) },
    populationAbsolute: nextPopulation,
    refugeesHosted: state.refugeesHosted + arrivals,
    refugeeComposition: { women: state.refugeeComposition.women + women, men: state.refugeeComposition.men + men, children: state.refugeeComposition.children + children },
  };
}

function applyAssimilation(state: CountryCapabilityState, rate: number): CountryCapabilityState {
  if (rate <= 0) return state;
  return { ...state, assimilationProgress: clamp(state.assimilationProgress + rate * 100, 0, 100) };
}

export function assimilationRate(culturalProximity: number, regimeType: RegimeType): number {
  const regimeBonus = regimeType === "totalitarian" ? 0.01 : 0;
  return clamp(0.015 + culturalProximity * 0.03 + regimeBonus, 0, 0.08);
}

export function computeImmigrationEffects(policy: BorderPolicy, components: StrategicComponents, regimeType: RegimeType) {
  const pop = components.population;
  switch (policy) {
    case "closed": return { populationDelta: 0, stabilityDelta: regimeType === "democracy" ? -2 : -0.5, economyDelta: 0, logisticsDelta: 0, mediaControlDelta: 0 };
    case "selective": return { populationDelta: 0.00125, stabilityDelta: -1, economyDelta: 0.01, logisticsDelta: -0.01, mediaControlDelta: 0 };
    case "open": return { populationDelta: 0.00375, stabilityDelta: -3, economyDelta: -0.02, logisticsDelta: -0.02, mediaControlDelta: 0 };
    case "mass": return { populationDelta: 0.0075, stabilityDelta: -6, economyDelta: -0.04, logisticsDelta: -0.04, mediaControlDelta: 0 };
  }
}

export function evaluateRegionLogistics(region: StrategicRegion): RegionLogistics {
  const maritime = region.maritimeAccess;
  const rail = region.railDensity * 100;
  const road = region.roadDensity * 100;
  const airport = Math.min(100, region.airportCount * 25);
  const river = region.riverAccess * 100;
  const logisticsIndex = clamp(maritime * 0.30 + rail * 0.25 + road * 0.25 + airport * 0.15 + river * 0.05, 0, 100);
  return { regionId: region.id, logisticsIndex, maritimeAccess: maritime, railDensity: rail, roadDensity: road, airportCount: region.airportCount, portCount: region.portCount, riverAccess: river };
}

export function getCountryLogisticsFromRegions(regions: StrategicRegion[], countryId: number): number {
  const countryRegions = regions.filter((r) => r.ownerId === countryId);
  if (!countryRegions.length) return 0;
  const total = countryRegions.reduce((sum, r) => sum + evaluateRegionLogistics(r).logisticsIndex, 0);
  return clamp(total / countryRegions.length, 0, 100);
}

export function evaluateCapabilityChange(
  state: CountryCapabilityState,
  baseline: StrategicComponents,
  context: {
    hasIncoming: boolean;
    hasOutgoing: boolean;
    activeOccupations: number;
    areaShare: number;
    foreignBasePressure?: number;
    regimeOverride?: RegimeType;
    sanctionsPenalty?: number;
    immigrationDelta?: number;
    warIntensity?: number;
    policyEffects?: any;
    regions?: StrategicRegion[];
    countryId?: number;
    maritimeBlockade?: number;
  },
  turn: number,
  seed: number,
) {
  if (state.lastEvaluatedTurn === turn) return state;
  const warIntensity = context.warIntensity ?? (context.hasIncoming ? 0.6 : context.hasOutgoing ? 0.3 : 0);
  const pressure = context.hasIncoming ? 0.12 : context.hasOutgoing ? -0.05 : 0;
  const occupationLoad = Math.min(0.18, context.activeOccupations * 0.04);
  const sanctionsPenalty = context.sanctionsPenalty ?? 0;
  const immigrationDelta = context.immigrationDelta ?? 0;
  const technologyImpact = clamp(state.components.technology / 100 * 0.012, 0, 0.01);
  const baseGrowth = 0.005;
  const populationGrowth = baseGrowth - technologyImpact + immigrationDelta;
  const warDamage = warIntensity * (1 + state.components.technology / 100 * 0.3);
  const recovery = state.components.economy * 0.03 + state.components.logistics * 0.05;
  const occupationPenalty = context.activeOccupations * 0.1;
  const postWarRecovery = (!context.hasIncoming && !context.hasOutgoing && context.activeOccupations === 0) ? 1 : 0;
  const demographics = updateDemographics(state, { hasIncoming: context.hasIncoming, hasOutgoing: context.hasOutgoing, warIntensity, technology: state.components.technology, immigrationPolicy: state.borderPolicy });
  const type = demographicType(demographics);
  const consumption = consumptionDrive(demographics);
  const cliff = demographicCliff(demographics);
  const countryLogisticsBase = context.countryId !== undefined && context.regions ? getCountryLogisticsFromRegions(context.regions, context.countryId) : baseline.logistics;
  const logisticsInvestmentBonus = state.logisticsInvestments.reduce((sum, inv) => sum + inv.bonus, 0);
  const maritimeBlockade = context.maritimeBlockade ?? 0;
  const countryLogistics = clamp(countryLogisticsBase + logisticsInvestmentBonus - maritimeBlockade * 18, 0, 100);

  const policy = context.policyEffects ?? {};
  const change: StrategicComponents = {
    economy: clamp((baseline.economy - state.components.economy) * 0.05 + pressure * 0.8 - occupationLoad * 1.2 + (context.hasOutgoing ? -0.02 : 0) + consumption * 0.03 + cliff.economyPenalty - maritimeBlockade * 0.12 + (policy.economyDelta ?? 0)),
    population: clamp(state.components.population * (populationGrowth / 4) + (context.hasIncoming ? -0.12 : 0.02) - context.activeOccupations * 0.03 + cliff.populationPenalty),
    technology: clamp((baseline.technology - state.components.technology) * 0.03 + (context.hasOutgoing ? -0.08 : 0.03) - sanctionsPenalty * 0.05),
    logistics: clamp((countryLogistics - state.components.logistics) * 0.04 + recovery * (1 + postWarRecovery) - warDamage - occupationPenalty + pressure * 1.3 + (state.assimilationProgress < 30 ? -0.02 : 0)),
    military: clamp((baseline.military - state.components.military) * 0.06 + (context.hasOutgoing ? 0.3 : -0.05) + (context.hasIncoming ? 0.1 : 0) + cliff.manpowerPenalty * 0.5),
    stability: clamp((baseline.stability - state.components.stability) * 0.03 + (context.hasIncoming ? -0.3 : 0.05) + occupationLoad * 0.5 + warIntensity * -0.05 + cliff.stabilityPenalty + (state.assimilationProgress < 30 ? -0.01 : 0)),
  };

  const regimeType = context.regimeOverride ?? state.regimeType;
  const regimeMod = regimeType === "democracy" ? 0.85 : regimeType === "totalitarian" ? 1.1 : 1.0;
  const foreignBasePenalty = clamp((context.foreignBasePressure ?? 0) * 5, 0, 10);
  const infoEnv = state.informationEnvironment;
  const infoEffect = infoEnv.score > 60 && regimeType === "democracy" ? -10 : infoEnv.score > 70 && regimeType !== "democracy" ? 5 : infoEnv.score > 75 && regimeType === "totalitarian" ? 8 : 0;
  const stabilityComposite = state.components.stability + change.stability + (policy.stabilityDelta ?? 0);
  const stabilityFinal = clamp((stabilityComposite + infoEffect + foreignBasePenalty) * regimeMod, 0, 100);

  const immigrationPolicy = policy.borderPolicy ?? state.borderPolicy;
  const immigrationEffects = computeImmigrationEffects(immigrationPolicy, state.components, regimeType);
  const informationEnvironment = {
    score: clamp(infoEnv.score + (policy.informationEnvironment?.techComponent ?? 0) * 0.1 + (policy.informationEnvironment?.servicesStrength ?? 0) * 0.3),
    techComponent: infoEnv.techComponent,
    mediaControl: clamp(infoEnv.mediaControl + (policy.informationEnvironment?.mediaControl ?? 0) + (immigrationEffects.mediaControlDelta ?? 0)),
    servicesStrength: clamp(infoEnv.servicesStrength + (policy.informationEnvironment?.servicesStrength ?? 0)),
  };

  const population = state.components.population + change.population + immigrationEffects.populationDelta;
  const military = state.components.military + change.military + (policy.combatExperienceChange ?? 0);
  const activeManpower = Math.max(0, Math.round(military * 0.55));
  const reserves = Math.max(0, Math.round(population * 0.12 - activeManpower));
  const mobilization = policy.manpower?.mobilization ?? state.manpower.mobilization;
  const mobilizationMultiplier = mobilization === "full" ? 1.35 : mobilization === "open" ? 1.18 : 1;
  const frontCount = context.hasOutgoing ? 1 : 0;
  const maintenanceCost = Math.round((military * 0.08 + frontCount * 6 + (mobilization === "full" ? 14 : mobilization === "open" ? 7 : 0)) * 10) / 10;
  const populationScale = state.populationAbsolute > 0 ? state.populationAbsolute : state.components.population * 1_000_000;
  const assimilationRateValue = assimilationRate(0.15, regimeType);
  const postAssimilationState = applyAssimilation(state, context.activeOccupations > 0 ? assimilationRateValue : 0);
  const assimilationBonus = postAssimilationState.assimilationProgress >= 100 ? { economyBonus: 5, logisticsBonus: 3, stabilityBonus: 2 } : { economyBonus: 0, logisticsBonus: 0, stabilityBonus: 0 };
  const updated = {
    components: {
      economy: clamp(state.components.economy + change.economy + (immigrationEffects.economyDelta ?? 0) + (postAssimilationState.assimilationProgress < 30 ? -0.02 : 0) + assimilationBonus.economyBonus),
      population: clamp(population, 0, 100),
      technology: clamp(state.components.technology + change.technology + (policy.technologyBurst ?? 0)),
      logistics: clamp(state.components.logistics + change.logistics + (immigrationEffects.logisticsDelta ?? 0) + (postAssimilationState.assimilationProgress < 30 ? -0.02 : 0) + assimilationBonus.logisticsBonus),
      military: clamp(military),
      stability: stabilityFinal + (postAssimilationState.assimilationProgress < 30 ? -0.02 : 0) + assimilationBonus.stabilityBonus,
    },
    uncertainty: clamp(state.uncertainty * 0.985 + 0.002 + (context.areaShare > 1.2 ? 0.015 : 0)),
    lastEvaluatedTurn: turn,
    change: { ...change, population: change.population + immigrationEffects.populationDelta, stability: stabilityFinal - state.components.stability },
    regimeType,
    informationEnvironment,
    combatExperience: clamp(state.combatExperience + (policy.combatExperienceChange ?? 0)),
    manpower: { available: Math.max(0, Math.round((populationScale / 1_000_000) * 0.22 * mobilizationMultiplier)), active: Math.min(activeManpower, Math.max(0, Math.round((populationScale / 1_000_000) * 0.22 * mobilizationMultiplier))), reserves: Math.max(0, Math.round((populationScale / 1_000_000) * 0.22 * mobilizationMultiplier - activeManpower)), mobilization, maintenanceCost },
    demographics: postAssimilationState.demographics,
    demographicType: demographicType(postAssimilationState.demographics),
    borderPolicy: immigrationPolicy,
    // Czas trwania inwestycji odlicza silnik w advancePlayerPolicies().
    // Nie robimy tego tutaj drugi raz, bo aktualizacja zdolności państwa
    // następuje w tej samej turze.
    logisticsInvestments: state.logisticsInvestments.map((inv) => ({ ...inv })),
    culturalProximity: state.culturalProximity,
    assimilationProgress: postAssimilationState.assimilationProgress,
    refugeesHosted: state.refugeesHosted,
    refugeeComposition: state.refugeeComposition,
    populationAbsolute: state.populationAbsolute,
  };
  return updated;
}

export function createPlayerPolicyDecisionDefaults(): Record<PolicyDecisionId, PlayerPolicyDecision> {
  const now = 0;
  return {
    "media-oversight": { id: "media-oversight", name: "Nadzór nad mediami", description: "Wzmocnienie kontroli nad platformami i nadawcami.", cost: 1, effects: { informationEnvironment: { mediaControl: 15 } }, costs: { stabilityDelta: -8 }, duration: 8, cooldown: 12, lastUsedTurn: -20, condition: (state) => state.informationEnvironment.mediaControl < 60 },
    "research-program": { id: "research-program", name: "Program badawczy", description: "Więcej dotacji na R&D, ale obciążenie budżetu.", cost: 2, effects: { technology: 3 }, costs: { economyDelta: -4 }, duration: 6, cooldown: 10, lastUsedTurn: -20, condition: (state) => state.components.economy > 50 },
    "full-mobilization": { id: "full-mobilization", name: "Pełna mobilizacja", description: "Ogólna mobilizacja zwiększa gotowość obronną, ale obciąża gospodarkę i społeczeństwo.", cost: 1, effects: { manpower: { mobilization: "full" as const } }, costs: { stabilityDelta: -10, economyDelta: -3 }, duration: 12, cooldown: 20, lastUsedTurn: -20, condition: (state) => state.manpower.mobilization !== "full" },
    "open-borders": { id: "open-borders", name: "Otwarte granice", description: "Luźna polityka imigracyjna. Przyciąga siłę roboczą, ale powoduje napięcia społeczne.", cost: 1, effects: { immigrationPolicy: "open" }, costs: { stabilityDelta: -3 }, duration: 10, cooldown: 14, lastUsedTurn: -20, condition: (state) => state.components.technology > 40 },
    "close-borders": { id: "close-borders", name: "Zamknięcie granic", description: "Zwiększa kontrolę nad przepływem ludzi, ale ogranicza dopływ rąk do pracy.", cost: 1, effects: { immigrationPolicy: "closed" }, costs: { stabilityDelta: -2 }, duration: 8, cooldown: 10, lastUsedTurn: -20, condition: (state) => state.borderPolicy !== "closed" },
    "propaganda-offensive": { id: "propaganda-offensive", name: "Ofensywa propagandowa", description: "Kampania propagandowa. Wzmacnia kontrolę informacyjną, ale kosztuje.", cost: 2, effects: { informationEnvironment: { mediaControl: 8, servicesStrength: 5 } }, costs: { economyDelta: -5, stabilityDelta: -2 }, duration: 5, cooldown: 16, lastUsedTurn: -20, condition: (state) => (state.informationEnvironment.mediaControl > 30 || state.informationEnvironment.servicesStrength > 30) },
    "diplomatic-pressure": { id: "diplomatic-pressure", name: "Presja dyplomatyczna", description: "Kosztowna kampania nacisku na sąsiadów. Wzmacnia odporność państwa na presję zewnętrzną.", cost: 2, effects: { stabilityDelta: 3 }, costs: { economyDelta: -3 }, duration: 6, cooldown: 20, lastUsedTurn: -20, condition: (state) => state.components.stability < 70 },
    "selective-immigration": { id: "selective-immigration", name: "Imigracja selektywna", description: "Selektywna polityka imigracyjna. Przyciąka wykwalifikowanych pracowników.", cost: 1, effects: { immigrationPolicy: "selective" }, costs: { stabilityDelta: -1 }, duration: 10, cooldown: 14, lastUsedTurn: -20, condition: (state) => state.components.technology > 40 },
    "mass-immigration-former-colonies": { id: "mass-immigration-former-colonies", name: "Program masowej migracji", description: "Przyspiesza napływ ludności kosztem spójności społecznej i budżetu.", cost: 2, effects: { immigrationPolicy: "mass" }, costs: { stabilityDelta: -6, economyDelta: -2 }, duration: 12, cooldown: 20, lastUsedTurn: -20, condition: (state) => state.components.technology > 35 && state.borderPolicy !== "mass" },
    "build-port": { id: "build-port", name: "Budowa portu", description: "Nowy port w regionie przybrzeżnym. Podnosi logistykę o +20.", cost: 2, effects: {}, costs: { economyDelta: -5 }, duration: 8, cooldown: 20, lastUsedTurn: -20, condition: (_state, regions) => regions?.some((r) => r.maritimeAccess > 0) ?? false },
    "modernize-roads": { id: "modernize-roads", name: "Modernizacja dróg", description: "Ulepszenie sieci drogowej. Podnosi logistykę o +10.", cost: 1, effects: {}, costs: { economyDelta: -3 }, duration: 4, cooldown: 12, lastUsedTurn: -20, condition: () => true },
    "expand-airport": { id: "expand-airport", name: "Rozbudowa lotniska", description: "Nowe lotnisko w regionie. Podnosi logistykę o +12.", cost: 1, effects: {}, costs: { economyDelta: -4 }, duration: 6, cooldown: 14, lastUsedTurn: -20, condition: (state) => state.components.economy > 30 },
    "rail-upgrade": { id: "rail-upgrade", name: "Modernizacja kolei", description: "Ulepszenie infrastruktury kolejowej. Podnosi logistykę o +15.", cost: 1, effects: {}, costs: { economyDelta: -4 }, duration: 6, cooldown: 14, lastUsedTurn: -20, condition: (state) => state.components.technology > 25 },
    "fortify-sector": { id: "fortify-sector", name: "Przygotuj umocnienia", description: "Budowa trwałych umocnień w wybranym sektorze. Każda decyzja zwiększa jego obronę o 25 pkt.", cost: 2, effects: {}, costs: { economyDelta: -5 }, duration: 1, cooldown: 12, lastUsedTurn: -20, condition: () => true },
  };
}

export function capabilityStateToSnapshotArray(state: CountryCapabilityState): number[] {
  const regimeIndex = state.regimeType === "democracy" ? 0 : state.regimeType === "authoritarian" ? 1 : 2;
  return [
    state.components.economy, state.components.population, state.components.technology, state.components.logistics, state.components.military, state.components.stability,
    state.informationEnvironment.score, state.combatExperience,
    state.manpower.available, state.manpower.active, state.manpower.reserves,
    state.populationAbsolute, state.assimilationProgress, state.refugeesHosted,
    regimeIndex,
    state.refugeeComposition.women, state.refugeeComposition.men, state.refugeeComposition.children,
  ];
}

export function loadCapabilityStatesFromSnapshot(countries: Country[], entries: number[][] | undefined): CountryCapabilityState[] {
  const defaults = initialCapabilityStates(countries);
  if (!entries?.length) return defaults;
  return entries.map((entry, index) => {
    const country = countries[index];
    const fallback = defaults[index] ?? defaultInitialCountryCapabilityState();
    // Zapisy sprzed dodania ustroju mają 14 pól. Zachowują wszystkie
    // istniejące wartości, a brakujący ustrój odziedziczają z bazowego kraju.
    if (!entry || entry.length < 8 || !country) return fallback;
    const savedPopulation = clamp(entry[11] ?? 0, 0, 2_000_000_000);
    // Wersje sprzed tej poprawki wpisywały dla części państw pseudolosową
    // populację zależną od ich id. Naprawiamy tylko ewidentnie nierealny
    // odczyt, aby nie skasować rzeczywistych skutków wojny w zapisanej grze.
    const populationAbsolute = fallback.populationAbsolute > 0
      && (savedPopulation > fallback.populationAbsolute * 4 || savedPopulation < fallback.populationAbsolute * .25)
      ? fallback.populationAbsolute
      : savedPopulation;
    return {
      components: { economy: clamp(entry[0] ?? 0), population: clamp(entry[1] ?? 0), technology: clamp(entry[2] ?? 0), logistics: clamp(entry[3] ?? 0), military: clamp(entry[4] ?? 0), stability: clamp(entry[5] ?? 0) },
      uncertainty: 0.18,
      lastEvaluatedTurn: 0,
      change: { economy: 0, population: 0, technology: 0, logistics: 0, military: 0, stability: 0 },
      regimeType: entry.length >= 15
        ? (["democracy", "authoritarian", "totalitarian"] as RegimeType[])[entry[14] ?? 0] ?? fallback.regimeType
        : fallback.regimeType,
      informationEnvironment: { score: clamp(entry[6] ?? 45), techComponent: 50, mediaControl: 30, servicesStrength: 35 },
      combatExperience: clamp(entry[7] ?? 0, 0, 25),
      manpower: { available: clamp(entry[8] ?? 0, 0, 200), active: clamp(entry[9] ?? 0, 0, 100), reserves: clamp(entry[10] ?? 0, 0, 200), mobilization: "hidden", maintenanceCost: 0 },
      logisticsInvestments: [],
      demographics: defaultPyramid(),
      demographicType: "chimney",
      borderPolicy: "selective",
      culturalProximity: defaultProximity(),
      assimilationProgress: clamp(entry[12] ?? 0, 0, 100),
      refugeesHosted: clamp(entry[13] ?? 0, 0, 500_000_000),
      refugeeComposition: { women: clamp(entry[15] ?? 0, 0, 500_000_000), men: clamp(entry[16] ?? 0, 0, 500_000_000), children: clamp(entry[17] ?? 0, 0, 500_000_000) },
      populationAbsolute,
    };
  });
}

export function renderCapabilityDelta(state: CountryCapabilityState): CapabilityDelta[] {
  return COMPONENT_KEYS.map((key) => {
    const value = state.components[key];
    const delta = state.change[key];
    const visible = Math.abs(delta) > 0.02;
    return { key, label: componentLabel(key), value: Math.round(value), delta: visible ? `${signed(delta)}${delta.toFixed(1)}` : "≈ 0", trend: delta > 0.02 ? "up" : delta < -0.02 ? "down" : "flat" };
  });
}

export function regimeLabel(regimeType: RegimeType): string {
  return { democracy: "Demokracja", authoritarian: "Autorytaryzm", totalitarian: "Totalitaryzm" }[regimeType];
}

export function demographicLabel(type: DemographicType): string {
  return { healthy: "Zdrowa piramida", chimney: "Kominek", inverted: "Odwrócona piramida" }[type];
}

export function getActivePlayerPolicyEffects(state: PlayerPolicyState): any {
  const effects: any = {};
  for (const policy of state.activePolicies) {
    const perQuarter = Math.max(1, policy.duration);
    if (policy.effects.informationEnvironment?.mediaControl) effects.informationEnvironment = { ...effects.informationEnvironment, mediaControl: (effects.informationEnvironment?.mediaControl ?? 0) + policy.effects.informationEnvironment.mediaControl / perQuarter };
    if (policy.effects.informationEnvironment?.servicesStrength) effects.informationEnvironment = { ...effects.informationEnvironment, servicesStrength: (effects.informationEnvironment?.servicesStrength ?? 0) + policy.effects.informationEnvironment.servicesStrength / perQuarter };
    if (policy.effects.technology) effects.technologyBurst = (effects.technologyBurst ?? 0) + policy.effects.technology / perQuarter;
    if (policy.effects.stabilityDelta) effects.stabilityDelta = (effects.stabilityDelta ?? 0) + policy.effects.stabilityDelta;
    if (policy.effects.combatExperienceChange) effects.combatExperienceChange = (effects.combatExperienceChange ?? 0) + policy.effects.combatExperienceChange;
    if (policy.effects.immigrationPolicy) effects.borderPolicy = policy.effects.immigrationPolicy;
    if (policy.effects.manpower?.mobilization) effects.manpower = { ...effects.manpower, mobilization: policy.effects.manpower.mobilization };
    if (policy.effects.logisticsInvestment) effects.logisticsInvestment = policy.effects.logisticsInvestment;
    const economyCost = policy.costs.economyDelta;
    const stabilityCost = policy.costs.stabilityDelta;
    if (typeof economyCost === "number") effects.economyDelta = (effects.economyDelta ?? 0) + economyCost / perQuarter;
    if (typeof stabilityCost === "number") effects.stabilityDelta = (effects.stabilityDelta ?? 0) + stabilityCost / perQuarter;
  }
  return effects;
}

export function regimeModifier(regimeType: RegimeType): number {
  return regimeType === "democracy" ? 0.85 : regimeType === "totalitarian" ? 1.1 : 1.0;
}

export function informationEnvironmentEffect(regimeType: RegimeType, score: number): number {
  if (score > 60 && regimeType === "democracy") return -10;
  if (score > 70 && regimeType !== "democracy") return 5;
  if (score > 75 && regimeType === "totalitarian") return 8;
  return 0;
}

export function componentLabel(key: string): string {
  return { economy: "Gospodarka", population: "Populacja", technology: "Technologia", logistics: "Logistyka", military: "Wojsko", stability: "Stabilność" }[key] ?? key;
}

export const COMPONENT_KEYS = ["economy", "population", "technology", "logistics", "military", "stability"] as const;

export function availableWorkingAgeShare(state: Pick<CountryCapabilityState, "demographics">): number {
  const d = state.demographics;
  return d.primeAge + d.youth;
}

export function refugeeEconomyEffect(refugeeShare: number): number {
  if (refugeeShare <= 0) return 0;
  return Math.min(0.06, 0.02 + refugeeShare * 0.08);
}

export function refugeeStabilityEffect(refugeeShare: number): number {
  if (refugeeShare <= 0) return 0;
  return Math.min(0.08, 0.02 + refugeeShare * 0.12);
}
