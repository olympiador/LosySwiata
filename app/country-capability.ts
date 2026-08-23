import type { Country, StrategicComponents } from "./game-engine";

export type RegimeType = "democracy" | "authoritarian" | "totalitarian";
export type AgeGroup = "children" | "youth" | "primeAge" | "middleAge" | "elderly" | "veryOld";
export type DemographicPyramid = Partial<Record<AgeGroup, number>>;
export type DemographicType = "healthy" | "chimney" | "inverted";
export type BorderPolicy = "closed" | "selective" | "open" | "mass";

export type CountryCapabilityState = {
  components: StrategicComponents;
  uncertainty: number;
  lastEvaluatedTurn: number;
  change: StrategicComponents;
  regimeType: RegimeType;
  informationEnvironment: {
    score: number;
    techComponent: number;
    mediaControl: number;
    servicesStrength: number;
  };
  combatExperience: number;
  manpower: {
    available: number;
    active: number;
    reserves: number;
    mobilization: "hidden" | "open" | "full";
    maintenanceCost: number;
  };
  demographics: DemographicPyramid;
  demographicType: DemographicType;
  borderPolicy: BorderPolicy;
  culturalProximity: Record<number, number>;
  assimilationProgress: number;
  refugeesHosted: number;
  populationAbsolute: number;
};

export type PolicyDecisionId = "media-oversight" | "research-program" | "full-mobilization" | "open-borders" | "close-borders" | "propaganda-offensive" | "diplomatic-pressure" | "selective-immigration" | "mass-immigration-former-colonies";

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
  };
  costs: Partial<StrategicComponents> & { stabilityDelta?: number | ((state: CountryCapabilityState) => number); economyDelta?: number | ((state: CountryCapabilityState) => number) };
  duration?: number;
  cooldown: number;
  lastUsedTurn: number;
  condition?: (state: CountryCapabilityState) => boolean;
};

export type PlayerPolicyState = {
  decisions: Record<PolicyDecisionId, PlayerPolicyDecision>;
  activePolicies: PlayerPolicyDecision[];
  decisionPoints: number;
  lastDecisionTurn: number;
};

export const COMPONENT_KEYS = ["economy", "population", "technology", "logistics", "military", "stability"] as const;
type ComponentKey = (typeof COMPONENT_KEYS)[number];

function clamp(value: number, minimum = 0, maximum = 100) {
  return Math.max(minimum, Math.min(maximum, value));
}

function signed(delta: number) {
  return delta > 0.05 ? "+" : "";
}

export function componentLabel(key: ComponentKey): string {
  return {
    economy: "Gospodarka",
    population: "Ludność",
    technology: "Technologia",
    logistics: "Logistyka",
    military: "Wojsko",
    stability: "Instytucje",
  }[key];
}

function regimeModifier(regimeType: RegimeType) {
  if (regimeType === "totalitarian") return 1.15;
  if (regimeType === "authoritarian") return 1.0;
  return 0.85;
}

function informationEnvironmentEffect(regimeType: RegimeType, score: number) {
  if (regimeType === "democracy" && score > 60) return -10;
  if (regimeType === "authoritarian" && score > 70) return 5;
  if (regimeType === "totalitarian" && score > 75) return 8;
  return 0;
}

function defaultPyramid(): DemographicPyramid {
  return { children: 0.18, youth: 0.12, primeAge: 0.34, middleAge: 0.22, elderly: 0.11, veryOld: 0.03 };
}

function defaultProximity(): Record<number, number> {
  return {};
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
    culturalProximity: defaultProximity(),
    assimilationProgress: 0,
    refugeesHosted: 0,
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
  };
}

function initialManpower(countryId: number) {
  const base = 18 + ((countryId * 311.4) % 34);
  return {
    available: Math.round(20 + ((countryId * 89.33) % 35)),
    active: Math.round(base * 0.6),
    reserves: Math.round(base * 0.4),
    mobilization: "hidden" as const,
    maintenanceCost: Math.round(base * 0.08),
  };
}

function initialInformationEnvironment(countryId: number): CountryCapabilityState["informationEnvironment"] {
  const tech = 40 + ((countryId * 137.508) % 50);
  const mediaControl = 20 + ((countryId * 73.9) % 60);
  const servicesStrength = 15 + ((countryId * 191.7) % 55);
  const score = clamp(tech * 0.4 + mediaControl * 0.3 + servicesStrength * 0.3);
  return { score, techComponent: tech, mediaControl, servicesStrength };
}

export function initialRegimeType(countryId: number): RegimeType {
  const hash = countryId * 41 % 100;
  if (hash < 15) return "totalitarian";
  if (hash < 40) return "authoritarian";
  return "democracy";
}

export function demographicType(state: Pick<CountryCapabilityState, "demographics">): DemographicType {
  const youthBase = (state.demographics.children ?? 0) + (state.demographics.youth ?? 0);
  if (youthBase > 0.35) return "healthy";
  if (youthBase < 0.25) return "inverted";
  return "chimney";
}

export function consumptionDrive(state: Pick<CountryCapabilityState, "demographics">): number {
  return (
    (state.demographics.primeAge ?? 0) * 0.6 +
    (state.demographics.youth ?? 0) * 0.4 -
    (state.demographics.elderly ?? 0) * 0.3 -
    (state.demographics.veryOld ?? 0) * 0.5
  );
}

export function demographicCliff(demographics: DemographicPyramid): { economyPenalty: number; populationPenalty: number; stabilityPenalty: number; manpowerPenalty: number } {
  const elderly = demographics.elderly ?? 0;
  const veryOld = demographics.veryOld ?? 0;
  const children = demographics.children ?? 0;
  if (elderly + veryOld > 0.35 && children < 0.15) {
    return { economyPenalty: -0.06, populationPenalty: -0.03, stabilityPenalty: -0.02, manpowerPenalty: -0.03 };
  }
  return { economyPenalty: 0, populationPenalty: 0, stabilityPenalty: 0, manpowerPenalty: 0 };
}

export function availableWorkingAgeShare(state: Pick<CountryCapabilityState, "demographics">): number {
  return (
    (state.demographics.youth ?? 0) * 0.5 +
    (state.demographics.primeAge ?? 0) * 0.9 +
    (state.demographics.middleAge ?? 0) * 0.6
  );
}

export function culturalProximityBetween(ownerId: number, regionId: number, proximityMap: Record<number, number>): number {
  return proximityMap[regionId] ?? 0.15;
}

export function assimilationRate(proximity: number, regimeType: RegimeType): number {
  const base = 0.015;
  const culturalBonus = proximity * 0.03;
  const regimeBonus = regimeType === "totalitarian" ? 0.01 : 0;
  return base + culturalBonus + regimeBonus;
}

export function refugeeFlowFrom(warIntensity: number, borderPolicy: BorderPolicy): number {
  if (warIntensity <= 0) return 0;
  const maxRefugees = 0.3;
  const openness = borderPolicy === "closed" ? 0.1 : borderPolicy === "selective" ? 0.4 : borderPolicy === "open" ? 0.8 : 1.0;
  return maxRefugees * warIntensity * openness;
}

export function refugeeEconomyEffect(refugeeShare: number): number {
  if (refugeeShare <= 0) return 0;
  return Math.min(0.06, 0.02 + refugeeShare * 0.08);
}

export function refugeeStabilityEffect(refugeeShare: number): number {
  if (refugeeShare <= 0) return 0;
  return Math.min(0.08, 0.02 + refugeeShare * 0.12);
}

function updateDemographics(state: CountryCapabilityState, context: { hasIncoming: boolean; hasOutgoing: boolean; warIntensity: number; technology: number; immigrationPolicy: BorderPolicy }): DemographicPyramid {
  const pyramid = { ...state.demographics };
  const birthRate = 0.005 - (context.technology / 100) * 0.003 + (context.immigrationPolicy === "mass" ? 0.001 : 0);
  const deathRate = 0.004 + (context.technology < 40 ? 0.001 : 0);
  const agingFactor = 0.001;
  const warPrimeLoss = context.warIntensity * 0.012;

  pyramid.children = clamp((pyramid.children ?? 0) * (1 + birthRate - deathRate * 0.3), 0.05, 0.5);
  pyramid.youth = clamp((pyramid.youth ?? 0) * (1 - agingFactor * 0.5), 0.05, 0.3);
  pyramid.primeAge = clamp((pyramid.primeAge ?? 0) * (1 - agingFactor - warPrimeLoss), 0.1, 0.6);
  pyramid.middleAge = clamp((pyramid.middleAge ?? 0) * (1 - agingFactor * 0.8), 0.05, 0.4);
  pyramid.elderly = clamp((pyramid.elderly ?? 0) * (1 + agingFactor * 1.2), 0.05, 0.5);
  pyramid.veryOld = clamp((pyramid.veryOld ?? 0) * (1 + agingFactor * 1.5), 0.01, 0.4);

  const total = Object.values(pyramid).reduce((a, b) => a + (b ?? 0), 0);
  if (total > 0) {
    for (const key of Object.keys(pyramid) as AgeGroup[]) {
      pyramid[key] = (pyramid[key] ?? 0) / total;
    }
  }
  return pyramid;
}

function applyRefugeeFlow(state: CountryCapabilityState, flow: number): { state: CountryCapabilityState; refugeesIn: number } {
  if (flow <= 0) return { state, refugeesIn: 0 };
  const workingAge = availableWorkingAgeShare(state);
  const refugeesIn = Math.max(0, state.populationAbsolute * flow * workingAge);
  const split = {
    workingAge: refugeesIn * 0.7,
    children: refugeesIn * 0.2,
    elderly: refugeesIn * 0.1,
  };
  const totalNew = split.workingAge + split.children + split.elderly;
  const updated = cloneCapabilityState(state);
  updated.populationAbsolute += totalNew;
  updated.refugeesHosted += totalNew;
  const demo = { ...updated.demographics };
  const total = Object.values(demo).reduce((a, b) => a + (b ?? 0), 0);
  if (total > 0) {
    demo.primeAge = clamp(((demo.primeAge ?? 0) * total + split.workingAge) / (total + totalNew), 0.05, 0.6);
    demo.children = clamp(((demo.children ?? 0) * total + split.children) / (total + totalNew), 0.05, 0.5);
    demo.elderly = clamp(((demo.elderly ?? 0) * total + split.elderly) / (total + totalNew), 0.05, 0.5);
    demo.youth = clamp(((demo.youth ?? 0) * total) / (total + totalNew), 0.05, 0.3);
    demo.middleAge = clamp(((demo.middleAge ?? 0) * total) / (total + totalNew), 0.05, 0.4);
    demo.veryOld = clamp(((demo.veryOld ?? 0) * total) / (total + totalNew), 0.01, 0.4);
    const newTotal = Object.values(demo).reduce((a, b) => a + (b ?? 0), 0);
    if (newTotal > 0) {
      for (const key of Object.keys(demo) as AgeGroup[]) {
        demo[key] = (demo[key] ?? 0) / newTotal;
      }
    }
    updated.demographics = demo;
  }
  return { state: updated, refugeesIn };
}

function applyAssimilation(state: CountryCapabilityState, rate: number): CountryCapabilityState {
  const updated = cloneCapabilityState(state);
  updated.assimilationProgress = clamp(updated.assimilationProgress + rate * 100, 0, 100);
  return updated;
}

function computeImmigrationEffects(policy: BorderPolicy, components: StrategicComponents, regimeType: RegimeType) {
  const pop = components.population;
  switch (policy) {
    case "closed":
      return { populationDelta: 0, stabilityDelta: regimeType === "democracy" ? -2 : 2, infoEnvDelta: 0, mediaControlDelta: 0, economyDelta: 0, logisticsDelta: 0 };
    case "selective":
      return { populationDelta: pop * 0.0005, stabilityDelta: -1, infoEnvDelta: 0, mediaControlDelta: 0, economyDelta: 0, logisticsDelta: 0 };
    case "open":
      return { populationDelta: pop * 0.0015, stabilityDelta: -3, infoEnvDelta: 0, mediaControlDelta: 0, economyDelta: -0.01, logisticsDelta: -0.01 };
    case "mass":
      return { populationDelta: pop * 0.003, stabilityDelta: -6, infoEnvDelta: 0, mediaControlDelta: 0, economyDelta: -0.03, logisticsDelta: -0.02 };
  }
}

const MANUAL_BASELINES: Record<string, {
  economy?: number;
  population?: number;
  technology?: number;
  logistics?: number;
  military?: number;
  stability?: number;
  regimeType?: RegimeType;
  informationEnvironment?: { score: number; techComponent: number; mediaControl: number; servicesStrength: number };
  combatExperience?: number;
}> = {
  POL: { economy: 58, population: 65, technology: 68, logistics: 72, military: 45, stability: 53, regimeType: "democracy", informationEnvironment: { score: 48, techComponent: 68, mediaControl: 25, servicesStrength: 40 }, combatExperience: 5 },
  ROU: { economy: 45, population: 48, technology: 55, logistics: 62, military: 24, stability: 55, regimeType: "democracy", informationEnvironment: { score: 42, techComponent: 55, mediaControl: 30, servicesStrength: 35 }, combatExperience: 4 },
  UKR: { economy: 38, population: 60, technology: 48, logistics: 50, military: 32, stability: 38, regimeType: "democracy", informationEnvironment: { score: 38, techComponent: 48, mediaControl: 35, servicesStrength: 30 }, combatExperience: 12 },
  BLR: { economy: 16, population: 28, technology: 38, logistics: 40, military: 13, stability: 42, regimeType: "authoritarian", informationEnvironment: { score: 66, techComponent: 38, mediaControl: 80, servicesStrength: 75 }, combatExperience: 0 },
  RUS: { economy: 72, population: 85, technology: 65, logistics: 55, military: 85, stability: 48, regimeType: "authoritarian", informationEnvironment: { score: 76, techComponent: 65, mediaControl: 85, servicesStrength: 80 }, combatExperience: 18 },
  DEU: { economy: 85, population: 83, technology: 90, logistics: 88, military: 50, stability: 74, regimeType: "democracy", informationEnvironment: { score: 45, techComponent: 90, mediaControl: 20, servicesStrength: 35 }, combatExperience: 2 },
  FRA: { economy: 78, population: 67, technology: 82, logistics: 80, military: 55, stability: 65, regimeType: "democracy", informationEnvironment: { score: 47, techComponent: 82, mediaControl: 22, servicesStrength: 38 }, combatExperience: 3 },
  GBR: { economy: 75, population: 67, technology: 80, logistics: 78, military: 58, stability: 70, regimeType: "democracy", informationEnvironment: { score: 46, techComponent: 80, mediaControl: 21, servicesStrength: 37 }, combatExperience: 3 },
  USA: { economy: 95, population: 82, technology: 95, logistics: 85, military: 95, stability: 68, regimeType: "democracy", informationEnvironment: { score: 50, techComponent: 95, mediaControl: 18, servicesStrength: 32 }, combatExperience: 8 },
  TUR: { economy: 52, population: 84, technology: 55, logistics: 58, military: 40, stability: 50, regimeType: "authoritarian", informationEnvironment: { score: 58, techComponent: 55, mediaControl: 55, servicesStrength: 52 }, combatExperience: 6 },
  PRK: { economy: 10, population: 25, technology: 25, logistics: 20, military: 35, stability: 88, regimeType: "totalitarian", informationEnvironment: { score: 82, techComponent: 25, mediaControl: 95, servicesStrength: 90 }, combatExperience: 5 },
};

export function initialCapabilityStates(countries: Country[]): CountryCapabilityState[] {
  return countries.map((country) => {
    const calibrated = MANUAL_BASELINES[country.iso3 as keyof typeof MANUAL_BASELINES];
    const fallback = {
      economy: 20 + ((country.id * 137.508) % 40),
      population: 20 + ((country.id * 251.17) % 35),
      technology: 18 + ((country.id * 89.33) % 30),
      logistics: 16 + ((country.id * 191.7) % 28),
      military: 18 + ((country.id * 311.4) % 34),
      stability: 22 + ((country.id * 73.9) % 30),
    };
    const components = calibrated
      ? {
          economy: clamp(calibrated.economy ?? fallback.economy),
          population: clamp(calibrated.population ?? fallback.population),
          technology: clamp(calibrated.technology ?? fallback.technology),
          logistics: clamp(calibrated.logistics ?? fallback.logistics),
          military: clamp(calibrated.military ?? fallback.military),
          stability: clamp(calibrated.stability ?? fallback.stability),
        }
      : { ...fallback, stability: clamp(fallback.stability) };
    const regimeType = calibrated?.regimeType ?? initialRegimeType(country.id);
    const informationEnvironment = calibrated?.informationEnvironment ?? initialInformationEnvironment(country.id);
    const populationAbsolute = components.population * 12_000_000;
    const demographics = defaultPyramid();
    const culturalProximity = defaultProximity();
    return {
      components,
      uncertainty: 0.18 + ((country.id * 41.3) % 25) / 100,
      lastEvaluatedTurn: 0,
      change: {
        economy: 0,
        population: 0,
        technology: 0,
        logistics: 0,
        military: 0,
        stability: 0,
      },
      regimeType,
      informationEnvironment,
      combatExperience: calibrated?.combatExperience ?? Math.round(((country.id * 17.7) % 20)),
      manpower: initialManpower(country.id),
      populationAbsolute,
      demographics,
      demographicType: demographicType({ demographics }),
      borderPolicy: "selective",
      culturalProximity,
      assimilationProgress: 0,
      refugeesHosted: 0,
    };
  });
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
  const type = demographicType({ demographics });
  const consumption = consumptionDrive({ demographics });
  const cliff = demographicCliff(demographics);
  const change: StrategicComponents = {
    economy: clamp((baseline.economy - state.components.economy) * 0.05 + pressure * 0.8 - occupationLoad * 1.2 + (context.hasOutgoing ? -0.02 : 0) + consumption * 0.03 + cliff.economyPenalty),
    population: clamp(state.components.population * (populationGrowth / 4) + (context.hasIncoming ? -0.12 : 0.02) - context.activeOccupations * 0.03 + cliff.populationPenalty),
    technology: clamp((baseline.technology - state.components.technology) * 0.03 + (context.hasOutgoing ? -0.08 : 0.03) - sanctionsPenalty * 0.05),
    logistics: clamp((baseline.logistics - state.components.logistics) * 0.04 + recovery * (1 + postWarRecovery) - warDamage - occupationPenalty + pressure * 1.3 + (state.assimilationProgress < 30 ? -0.02 : 0)),
    military: clamp((baseline.military - state.components.military) * 0.06 + (context.hasOutgoing ? 0.3 : -0.05) + (context.hasIncoming ? 0.1 : 0) + cliff.manpowerPenalty * 0.5),
    stability: clamp((baseline.stability - state.components.stability) * 0.03 + (context.hasIncoming ? -0.3 : 0.05) + occupationLoad * 0.5 + warIntensity * -0.05 + cliff.stabilityPenalty + (state.assimilationProgress < 30 ? -0.01 : 0)),
  };
  const regimeType = context.regimeOverride ?? state.regimeType;
  const regimeMod = regimeModifier(regimeType);
  const foreignBasePenalty = clamp((context.foreignBasePressure ?? 0) * 5, 0, 10);
  const infoEnv = state.informationEnvironment;
  const infoEffect = informationEnvironmentEffect(regimeType, infoEnv.score);
  const stabilityComposite = state.components.stability + change.stability;
  const stabilityFinal = clamp((stabilityComposite + infoEffect + foreignBasePenalty) * regimeMod, 0, 100);
  const policy = context.policyEffects ?? {};
  const immigrationPolicy = policy.borderPolicy ?? state.borderPolicy;
  const immigrationEffects = computeImmigrationEffects(immigrationPolicy, state.components, regimeType);
  const informationEnvironment = {
    score: clamp(infoEnv.score + (policy.informationEnvironment?.techComponent ?? 0) * 0.1 + (policy.informationEnvironment?.servicesStrength ?? 0) * 0.3),
    techComponent: infoEnv.techComponent,
    mediaControl: clamp(infoEnv.mediaControl + (policy.informationEnvironment?.mediaControl ?? 0) + (immigrationEffects.mediaControlDelta ?? 0)),
    servicesStrength: clamp(infoEnv.servicesStrength + (policy.informationEnvironment?.servicesStrength ?? 0)),
  };
  const population = state.components.population + change.population + immigrationEffects.populationDelta;
  const military = state.components.military + change.military;
  const activeManpower = Math.max(0, Math.round(military * 0.55));
  const reserves = Math.max(0, Math.round(population * 0.12 - activeManpower));
  const mobilization = policy.manpower?.mobilization ?? state.manpower.mobilization;
  const mobilizationMultiplier = mobilization === "full" ? 1.35 : mobilization === "open" ? 1.18 : 1;
  const frontCount = context.hasOutgoing ? 1 : 0;
  const maintenanceCost = Math.round((military * 0.08 + frontCount * 6 + (mobilization === "full" ? 14 : mobilization === "open" ? 7 : 0)) * 10) / 10;
  const refugeeFlow = refugeeFlowFrom(warIntensity, immigrationPolicy);
  const populationScale = state.populationAbsolute > 0 ? state.populationAbsolute : (state.components.population * 12_000_000);
  const { state: postRefugeeState, refugeesIn } = applyRefugeeFlow(state, populationScale > 0 ? refugeeFlow : 0);
  const assimilationRateValue = assimilationRate(state.culturalProximity[context.activeOccupations] ?? 0.15, regimeType);
  const postAssimilationState = applyAssimilation(postRefugeeState, context.activeOccupations > 0 ? assimilationRateValue : 0);
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
    change: {
      ...change,
      population: change.population + immigrationEffects.populationDelta,
      stability: stabilityFinal - state.components.stability,
    },
    regimeType,
    informationEnvironment,
    combatExperience: clamp(state.combatExperience + (policy.combatExperienceChange ?? 0)),
    manpower: {
      available: Math.max(0, Math.round((populationScale / 12_000_000) * 0.22 * mobilizationMultiplier)),
      active: Math.min(activeManpower, Math.max(0, Math.round((populationScale / 12_000_000) * 0.22 * mobilizationMultiplier))),
      reserves: Math.max(0, Math.round((populationScale / 12_000_000) * 0.12 - activeManpower)),
      mobilization,
      maintenanceCost,
    },
    demographics: postAssimilationState.demographics,
    demographicType: demographicType({ demographics: postAssimilationState.demographics }),
    borderPolicy: immigrationPolicy,
    culturalProximity: state.culturalProximity,
    assimilationProgress: postAssimilationState.assimilationProgress,
    refugeesHosted: postRefugeeState.refugeesHosted + (populationScale > 0 ? populationScale * refugeeFlow * 0.3 : 0),
    populationAbsolute: postRefugeeState.populationAbsolute + (immigrationEffects.populationDelta * 12_000_000),
  };
  return updated;
}

export function createPlayerPolicyDecisionDefaults(): Record<PolicyDecisionId, PlayerPolicyDecision> {
  const now = 0;
  return {
    "media-oversight": {
      id: "media-oversight",
      name: "Nadzór nad mediami",
      description: "Wzmocnienie kontroli nad platformami i nadawcami.",
      cost: 1,
      effects: { informationEnvironment: { mediaControl: 15 } },
      costs: { stabilityDelta: -8 },
      duration: 8,
      cooldown: 12,
      lastUsedTurn: -20,
      condition: (state) => state.informationEnvironment.mediaControl < 60,
    },
    "research-program": {
      id: "research-program",
      name: "Program badawczy",
      description: "Więcej dotacji na R&D, ale obciążenie budżetu.",
      cost: 2,
      effects: { technology: 3 },
      costs: { economyDelta: -4 },
      duration: 6,
      cooldown: 10,
      lastUsedTurn: -20,
      condition: (state) => state.components.economy > 50,
    },
    "full-mobilization": {
      id: "full-mobilization",
      name: "Pełna mobilizacja",
      description: "Ogólna mobilizacja zwiększa siłę roboczą, ale wyczerpuje społeczeństwo.",
      cost: 1,
      effects: { manpower: { mobilization: "full" as const } },
      costs: { stabilityDelta: -10, economyDelta: -3 },
      duration: 12,
      cooldown: 20,
      lastUsedTurn: -20,
      condition: (state) => false,
    },
    "open-borders": {
      id: "open-borders",
      name: "Otwarte granice",
      description: "Luźna polityka imigracyjna. Przyciąga siłę roboczą, ale powoduje napięcia społeczne.",
      cost: 1,
      effects: { immigrationPolicy: "open" },
      costs: { stabilityDelta: -3 },
      duration: 10,
      cooldown: 14,
      lastUsedTurn: -20,
      condition: (state) => state.components.technology > 40,
    },
    "close-borders": {
      id: "close-borders",
      name: "Zamknięcie granic",
      description: "Zamknięcie granic. Zwiększa kontrolę, ale ogranicza dostęp do pracy.",
      cost: 1,
      effects: { immigrationPolicy: "closed" },
      costs: { stabilityDelta: -2 },
      duration: 8,
      cooldown: 10,
      lastUsedTurn: -20,
      condition: (state) => false,
    },
    "propaganda-offensive": {
      id: "propaganda-offensive",
      name: "Ofensywa propagandowa",
      description: "Kampania propagandowa. Wzmacnia kontrolę informacyjną, ale kosztuje.",
      cost: 2,
      effects: { informationEnvironment: { mediaControl: 8, servicesStrength: 5 } },
      costs: { economyDelta: -5, stabilityDelta: -2 },
      duration: 5,
      cooldown: 16,
      lastUsedTurn: -20,
      condition: (state) => (state.informationEnvironment.mediaControl > 30 || state.informationEnvironment.servicesStrength > 30),
    },
    "diplomatic-pressure": {
      id: "diplomatic-pressure",
      name: "Presja dyplomatyczna na NATO",
      description: "Presja dyplomatyczna. Zmniejsza obecność baz obcych przy granicy.",
      cost: 2,
      effects: {},
      costs: { economyDelta: -3 },
      duration: 6,
      cooldown: 20,
      lastUsedTurn: -20,
      condition: (state) => false,
    },
    "selective-immigration": {
      id: "selective-immigration",
      name: "Imigracja selektywna",
      description: "Selektywna polityka imigracyjna. Przyciąka wykwalifikowanych pracowników.",
      cost: 1,
      effects: { immigrationPolicy: "selective" },
      costs: { stabilityDelta: -1 },
      duration: 10,
      cooldown: 14,
      lastUsedTurn: -20,
      condition: (state) => state.components.technology > 40,
    },
    "mass-immigration-former-colonies": {
      id: "mass-immigration-former-colonies",
      name: "Imigracja masowa z byłych kolonii",
      description: "Masowy napływ z byłych kolonii i sąsiedztwa. Wzrost populacji, ale koszty społeczne.",
      cost: 2,
      effects: { immigrationPolicy: "mass" },
      costs: { stabilityDelta: -6, economyDelta: -2 },
      duration: 12,
      cooldown: 20,
      lastUsedTurn: -20,
      condition: (state) => false,
    },
  };
}

export function capabilityStateToSnapshotArray(state: CountryCapabilityState): number[] {
  return [
    state.components.economy,
    state.components.population,
    state.components.technology,
    state.components.logistics,
    state.components.military,
    state.components.stability,
    state.informationEnvironment.score,
    state.combatExperience,
    state.manpower.available,
    state.manpower.active,
    state.manpower.reserves,
    state.populationAbsolute,
    state.assimilationProgress,
    state.refugeesHosted,
  ];
}

export function loadCapabilityStatesFromSnapshot(countries: Country[], entries: number[][] | undefined): CountryCapabilityState[] {
  const defaults = initialCapabilityStates(countries);
  if (!entries?.length) return defaults;
  return entries.map((entry, index) => {
    const country = countries[index];
    if (!entry || entry.length < 8 || !country) return defaults[index] ?? defaultInitialCountryCapabilityState();
    return {
      components: {
        economy: clamp(entry[0] ?? 0),
        population: clamp(entry[1] ?? 0),
        technology: clamp(entry[2] ?? 0),
        logistics: clamp(entry[3] ?? 0),
        military: clamp(entry[4] ?? 0),
        stability: clamp(entry[5] ?? 0),
      },
      uncertainty: 0.18,
      lastEvaluatedTurn: 0,
      change: { economy: 0, population: 0, technology: 0, logistics: 0, military: 0, stability: 0 },
      regimeType: "democracy",
      informationEnvironment: { score: clamp(entry[6] ?? 45), techComponent: 50, mediaControl: 30, servicesStrength: 35 },
      combatExperience: clamp(entry[7] ?? 0, 0, 25),
      manpower: { available: clamp(entry[8] ?? 0, 0, 200), active: clamp(entry[9] ?? 0, 0, 100), reserves: clamp(entry[10] ?? 0, 0, 200), mobilization: "hidden", maintenanceCost: 0 },
      demographics: defaultPyramid(),
      demographicType: "chimney",
      borderPolicy: "selective",
      culturalProximity: defaultProximity(),
      assimilationProgress: clamp(entry[12] ?? 0, 0, 100),
      refugeesHosted: clamp(entry[13] ?? 0, 0, 500_000_000),
      populationAbsolute: clamp(entry[11] ?? 0, 0, 2_000_000_000),
    };
  });
}

export type CapabilityDelta = {
  key: ComponentKey;
  label: string;
  value: number;
  delta: string;
  trend: "up" | "down" | "flat";
};

export function renderCapabilityDelta(state: CountryCapabilityState): CapabilityDelta[] {
  return COMPONENT_KEYS.map((key) => {
    const value = state.components[key];
    const delta = state.change[key];
    const visible = Math.abs(delta) > 0.02;
    return {
      key,
      label: componentLabel(key),
      value: Math.round(value),
      delta: visible ? `${signed(delta)}${delta.toFixed(1)}` : "≈ 0",
      trend: delta > 0.02 ? "up" : delta < -0.02 ? "down" : "flat",
    };
  });
}

export function regimeLabel(regimeType: RegimeType): string {
  return {
    democracy: "Demokracja",
    authoritarian: "Autorytaryzm",
    totalitarian: "Totalitaryzm",
  }[regimeType];
}

export function demographicLabel(type: DemographicType): string {
  return {
    healthy: "Zdrowa piramida",
    chimney: "Kominek",
    inverted: "Odwrócona piramida",
  }[type];
}

export function getActivePlayerPolicyEffects(state: PlayerPolicyState): any {
  const effects: any = {};
  for (const policy of state.activePolicies) {
    if (policy.effects.informationEnvironment?.mediaControl) effects.mediaControlChange = (effects.mediaControlChange ?? 0) + policy.effects.informationEnvironment.mediaControl;
    if (policy.effects.informationEnvironment?.servicesStrength) effects.servicesStrengthChange = (effects.servicesStrengthChange ?? 0) + policy.effects.informationEnvironment.servicesStrength;
    if (policy.effects.technologyBurst) effects.technologyBurst = (effects.technologyBurst ?? 0) + policy.effects.technologyBurst;
    if (policy.effects.stabilityDelta) effects.stabilityDelta = (effects.stabilityDelta ?? 0) + policy.effects.stabilityDelta;
    if (policy.effects.combatExperienceChange) effects.combatExperienceChange = (effects.combatExperienceChange ?? 0) + policy.effects.combatExperienceChange;
    if (policy.effects.immigrationPolicy) effects.immigrationPolicy = policy.effects.immigrationPolicy;
    if (policy.effects.manpower?.mobilization) effects.manpowerMobilization = policy.effects.manpower.mobilization;
  }
  return effects;
}
