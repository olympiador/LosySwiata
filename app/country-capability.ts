import type { Country, StrategicComponents } from "./game-engine";

export type RegimeType = "democracy" | "authoritarian" | "totalitarian";

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
    immigrationPolicy?: "closed" | "selective" | "open" | "mass";
    technologyBurst?: number;
    stabilityDelta?: number;
  };
  costs: Partial<StrategicComponents> & { stabilityDelta?: number; economyDelta?: number };
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
          economy: calibrated.economy ?? fallback.economy,
          population: calibrated.population ?? fallback.population,
          technology: calibrated.technology ?? fallback.technology,
          logistics: calibrated.logistics ?? fallback.logistics,
          military: calibrated.military ?? fallback.military,
          stability: calibrated.stability ?? fallback.stability,
        }
      : fallback;
    const regimeType = calibrated?.regimeType ?? initialRegimeType(country.id);
    const informationEnvironment = calibrated?.informationEnvironment ?? initialInformationEnvironment(country.id);
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
    policyEffects?: {
      mediaControlChange?: number;
      servicesStrengthChange?: number;
      technologyBurst?: number;
      immigrationPolicy?: "closed" | "selective" | "open" | "mass";
      combatExperienceChange?: number;
    };
  },
  turn: number,
  seed: number,
) {
  if (state.lastEvaluatedTurn === turn) return state;
  const pressure = context.hasIncoming ? 0.12 : context.hasOutgoing ? -0.05 : 0;
  const occupationLoad = Math.min(0.18, context.activeOccupations * 0.04);
  const warIntensity = context.warIntensity ?? (context.hasIncoming ? 0.6 : context.hasOutgoing ? 0.3 : 0);
  const sanctionsPenalty = context.sanctionsPenalty ?? 0;
  const immigrationDelta = context.immigrationDelta ?? 0;
  const technologyImpact = clamp(state.components.technology / 100 * 0.012, 0, 0.01);
  const baseGrowth = 0.005;
  const populationGrowth = baseGrowth - technologyImpact + immigrationDelta;
  const warDamage = warIntensity * (1 + state.components.technology / 100 * 0.3);
  const recovery = state.components.economy * 0.03 + state.components.logistics * 0.05;
  const occupationPenalty = context.activeOccupations * 0.1;
  const postWarRecovery = (!context.hasIncoming && !context.hasOutgoing && context.activeOccupations === 0) ? 1 : 0;
  const change: StrategicComponents = {
    economy: clamp((baseline.economy - state.components.economy) * 0.05 + pressure * 0.8 - occupationLoad * 1.2 + (context.hasOutgoing ? -0.02 : 0)),
    population: clamp(state.components.population * (populationGrowth / 4) + (context.hasIncoming ? -0.12 : 0.02) - context.activeOccupations * 0.03),
    technology: clamp((baseline.technology - state.components.technology) * 0.03 + (context.hasOutgoing ? -0.08 : 0.03) - sanctionsPenalty * 0.05),
    logistics: clamp((baseline.logistics - state.components.logistics) * 0.04 + recovery * (1 + postWarRecovery) - warDamage - occupationPenalty + pressure * 1.3),
    military: clamp((baseline.military - state.components.military) * 0.06 + (context.hasOutgoing ? 0.3 : -0.05) + (context.hasIncoming ? 0.1 : 0)),
    stability: clamp((baseline.stability - state.components.stability) * 0.03 + (context.hasIncoming ? -0.3 : 0.05) + occupationLoad * 0.5 + warIntensity * -0.05),
  };
  const regimeType = context.regimeOverride ?? state.regimeType;
  const regimeMod = regimeModifier(regimeType);
  const foreignBasePenalty = clamp((context.foreignBasePressure ?? 0) * 5, 0, 10);
  const infoEnv = state.informationEnvironment;
  const infoEffect = informationEnvironmentEffect(regimeType, infoEnv.score);
  const stabilityComposite = state.components.stability + change.stability;
  const stabilityFinal = clamp((stabilityComposite + infoEffect + foreignBasePenalty) * regimeMod);
  const policy = context.policyEffects ?? {};
  const immigrationPolicy = policy.immigrationPolicy ?? "closed";
  const immigrationEffects = computeImmigrationEffects(immigrationPolicy, state.components, regimeType);
  const informationEnvironment = {
    score: clamp(infoEnv.score + (policy.mediaControlChange ?? 0) + (policy.servicesStrengthChange ?? 0) * 0.3 + immigrationEffects.infoEnvDelta),
    techComponent: infoEnv.techComponent,
    mediaControl: clamp(infoEnv.mediaControl + (policy.mediaControlChange ?? 0) + immigrationEffects.mediaControlDelta),
    servicesStrength: clamp(infoEnv.servicesStrength + (policy.servicesStrengthChange ?? 0)),
  };
  const population = state.components.population + change.population + immigrationEffects.populationDelta;
  const military = state.components.military + change.military;
  const activeManpower = Math.max(0, Math.round(military * 0.55));
  const reserves = Math.max(0, Math.round(population * 0.12 - activeManpower));
  const mobilization = state.manpower.mobilization;
  const mobilizationMultiplier = mobilization === "full" ? 1.35 : mobilization === "open" ? 1.18 : 1;
  const frontCount = context.hasOutgoing ? 1 : 0;
  const maintenanceCost = Math.round((military * 0.08 + frontCount * 6 + (mobilization === "full" ? 14 : mobilization === "open" ? 7 : 0)) * 10) / 10;
  return {
    components: {
      economy: clamp(state.components.economy + change.economy),
      population: clamp(population, 0, 400),
      technology: clamp(state.components.technology + change.technology + (policy.technologyBurst ?? 0)),
      logistics: clamp(state.components.logistics + change.logistics),
      military: clamp(military),
      stability: stabilityFinal,
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
      available: Math.max(0, Math.round(population * 0.22 * mobilizationMultiplier)),
      active: Math.min(activeManpower, Math.max(0, Math.round(population * 0.22 * mobilizationMultiplier))),
      reserves: Math.max(0, reserves),
      mobilization: state.manpower.mobilization,
      maintenanceCost,
    },
  };
}

function computeImmigrationEffects(policy: "closed" | "selective" | "open" | "mass", components: StrategicComponents, regimeType: RegimeType) {
  const pop = components.population;
  switch (policy) {
    case "closed":
      return { populationDelta: 0, stabilityDelta: regimeType === "democracy" ? -2 : 2, infoEnvDelta: 0, mediaControlDelta: 0 };
    case "selective":
      return { populationDelta: pop * 0.0005, stabilityDelta: -1, infoEnvDelta: 0, mediaControlDelta: 0 };
    case "open":
      return { populationDelta: pop * 0.0015, stabilityDelta: -3, infoEnvDelta: 0, mediaControlDelta: 0 };
    case "mass":
      return { populationDelta: pop * 0.003, stabilityDelta: -6, infoEnvDelta: 0, mediaControlDelta: 0 };
  }
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
      condition: (state) => true,
    },
    "open-borders": {
      id: "open-borders",
      name: "Otwarte granice",
      description: "Luźna polityka imigracyjna. Przyciąka pracowników, ale wzrastają napięcia społeczne.",
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
      description: "Zamknięcie granic zwiększa kontrolę, ale ogranicza dostęp do pracy.",
      cost: 1,
      effects: { immigrationPolicy: "closed" },
      costs: {},
      duration: 8,
      cooldown: 10,
      lastUsedTurn: -20,
      condition: (state) => true,
    },
    "propaganda-offensive": {
      id: "propaganda-offensive",
      name: "Ofensywa propagandowa",
      description: "Wzmocnienie kontroli informacyjnej za pomocą kampanii państwowej.",
      cost: 2,
      effects: { informationEnvironment: { score: 8 } },
      costs: { economyDelta: -5, stabilityDelta: -2 },
      duration: 5,
      cooldown: 16,
      lastUsedTurn: -20,
      condition: (state) => state.informationEnvironment.mediaControl > 30 || state.informationEnvironment.servicesStrength > 30,
    },
    "diplomatic-pressure": {
      id: "diplomatic-pressure",
      name: "Presja dyplomatyczna",
      description: "Presja na sąsiadów, żeby wycofali bazy i wojska przy granicy.",
      cost: 2,
      effects: {},
      costs: { economyDelta: -3 },
      duration: 6,
      cooldown: 20,
      lastUsedTurn: -20,
      condition: (state) => true,
    },
    "selective-immigration": {
      id: "selective-immigration",
      name: "Selektywna imigracja",
      description: "Polityka selektywna: przyciąka wykwalifikowanych migrantów z sąsiedztwa.",
      cost: 1,
      effects: { immigrationPolicy: "selective" },
      costs: { stabilityDelta: -1 },
      duration: 10,
      cooldown: 12,
      lastUsedTurn: -20,
      condition: (state) => state.components.technology > 30,
    },
    "mass-immigration-former-colonies": {
      id: "mass-immigration-former-colonies",
      name: "Imigracja z byłych kolonii",
      description: "Program imigracyjny skierowany na byłe kolonie. Duży wzrost populacji, duże koszty społeczne.",
      cost: 2,
      effects: { immigrationPolicy: "mass" },
      costs: { stabilityDelta: -6 },
      duration: 12,
      cooldown: 24,
      lastUsedTurn: -20,
      condition: (state) => state.components.technology > 50 && state.components.economy > 55,
    },
  };
}

export function getActivePlayerPolicyEffects(state: PlayerPolicyState, activeTurn: number) {
  const active = state.activePolicies.filter((policy) => {
    if (!policy.duration) return true;
    const usedAt = policy.lastUsedTurn;
    const remaining = usedAt + policy.duration - activeTurn;
    return remaining > 0;
  });
  return active.reduce<{
    mediaControlChange?: number;
    servicesStrengthChange?: number;
    technologyBurst?: number;
    immigrationPolicy?: "closed" | "selective" | "open" | "mass";
    stabilityDelta?: number;
    economyDelta?: number;
  }>((acc, policy) => {
    const effects = policy.effects;
    if (effects.informationEnvironment?.mediaControl) acc.mediaControlChange = (acc.mediaControlChange ?? 0) + effects.informationEnvironment.mediaControl;
    if (effects.informationEnvironment?.servicesStrength) acc.servicesStrengthChange = (acc.servicesStrengthChange ?? 0) + effects.informationEnvironment.servicesStrength;
    if (effects.technologyBurst) acc.technologyBurst = (acc.technologyBurst ?? 0) + effects.technologyBurst;
    if (effects.immigrationPolicy) acc.immigrationPolicy = effects.immigrationPolicy;
    if (effects.stabilityDelta) acc.stabilityDelta = (acc.stabilityDelta ?? 0) + effects.stabilityDelta;
    if (policy.costs.stabilityDelta) acc.stabilityDelta = (acc.stabilityDelta ?? 0) + policy.costs.stabilityDelta;
    if (policy.costs.economyDelta) acc.economyDelta = (acc.economyDelta ?? 0) + policy.costs.economyDelta;
    return acc;
  }, {});
}

export function capabilityStateToSnapshotArray(states: CountryCapabilityState[]) {
  return states.map(({ components, uncertainty, lastEvaluatedTurn, change, regimeType, informationEnvironment, combatExperience, manpower }) => ({
    components,
    uncertainty: Math.round(uncertainty * 1000) / 1000,
    lastEvaluatedTurn,
    change,
    regimeType,
    informationEnvironment: {
      score: Math.round(informationEnvironment.score * 1000) / 1000,
      techComponent: Math.round(informationEnvironment.techComponent * 1000) / 1000,
      mediaControl: Math.round(informationEnvironment.mediaControl * 1000) / 1000,
      servicesStrength: Math.round(informationEnvironment.servicesStrength * 1000) / 1000,
    },
    combatExperience: Math.round(combatExperience * 100) / 100,
    manpower,
  }));
}

export function loadCapabilityStatesFromSnapshot(
  countries: Country[],
  entries?: Array<{
    components: StrategicComponents;
    uncertainty: number;
    lastEvaluatedTurn?: number;
    change: StrategicComponents;
    regimeType?: RegimeType;
    informationEnvironment?: { score: number; techComponent: number; mediaControl: number; servicesStrength: number };
    combatExperience?: number;
    manpower?: CountryCapabilityState["manpower"];
  }>,
) {
  const defaults = initialCapabilityStates(countries);
  if (!entries?.length) return defaults;
  return countries.map((country, index) => {
    const entry = entries[index];
    if (!entry) return defaults[index];
    return {
      components: {
        economy: clamp(entry.components.economy),
        population: clamp(entry.components.population),
        technology: clamp(entry.components.technology),
        logistics: clamp(entry.components.logistics),
        military: clamp(entry.components.military),
        stability: clamp(entry.components.stability),
      },
      uncertainty: clamp(entry.uncertainty, 0.05, 1),
      lastEvaluatedTurn: entry.lastEvaluatedTurn ?? 0,
      change: entry.change,
      regimeType: entry.regimeType ?? initialRegimeType(country.id),
      informationEnvironment: entry.informationEnvironment
        ? {
            score: clamp(entry.informationEnvironment.score),
            techComponent: clamp(entry.informationEnvironment.techComponent),
            mediaControl: clamp(entry.informationEnvironment.mediaControl),
            servicesStrength: clamp(entry.informationEnvironment.servicesStrength),
          }
        : initialInformationEnvironment(country.id),
      combatExperience: entry.combatExperience ?? 0,
      manpower: entry.manpower ?? initialManpower(country.id),
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

export function informationEnvironmentLabel(score: number): string {
  if (score >= 80) return "Pełna kontrola";
  if (score >= 65) return "Silna kontrola";
  if (score >= 50) return "Częściowa kontrola";
  if (score >= 35) return "Ograniczona kontrola";
  return "Wolne media";
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
  POL: { economy: 58, population: 65, technology: 68, logistics: 72, military: 45, stability: 62, regimeType: "democracy", informationEnvironment: { score: 48, techComponent: 68, mediaControl: 25, servicesStrength: 40 }, combatExperience: 5 },
  ROU: { economy: 45, population: 48, technology: 55, logistics: 62, military: 24, stability: 55, regimeType: "democracy", informationEnvironment: { score: 42, techComponent: 55, mediaControl: 30, servicesStrength: 35 }, combatExperience: 4 },
  UKR: { economy: 38, population: 60, technology: 48, logistics: 50, military: 32, stability: 38, regimeType: "democracy", informationEnvironment: { score: 38, techComponent: 48, mediaControl: 35, servicesStrength: 30 }, combatExperience: 12 },
  BLR: { economy: 16, population: 28, technology: 38, logistics: 40, military: 13, stability: 42, regimeType: "authoritarian", informationEnvironment: { score: 66, techComponent: 38, mediaControl: 80, servicesStrength: 75 }, combatExperience: 0 },
  RUS: { economy: 72, population: 142, technology: 65, logistics: 55, military: 85, stability: 48, regimeType: "authoritarian", informationEnvironment: { score: 76, techComponent: 65, mediaControl: 85, servicesStrength: 80 }, combatExperience: 18 },
  DEU: { economy: 85, population: 83, technology: 90, logistics: 88, military: 50, stability: 74, regimeType: "democracy", informationEnvironment: { score: 45, techComponent: 90, mediaControl: 20, servicesStrength: 35 }, combatExperience: 2 },
  FRA: { economy: 78, population: 67, technology: 82, logistics: 80, military: 55, stability: 65, regimeType: "democracy", informationEnvironment: { score: 47, techComponent: 82, mediaControl: 22, servicesStrength: 38 }, combatExperience: 3 },
  GBR: { economy: 75, population: 67, technology: 80, logistics: 78, military: 58, stability: 70, regimeType: "democracy", informationEnvironment: { score: 46, techComponent: 80, mediaControl: 21, servicesStrength: 37 }, combatExperience: 3 },
  USA: { economy: 95, population: 331, technology: 95, logistics: 85, military: 95, stability: 68, regimeType: "democracy", informationEnvironment: { score: 50, techComponent: 95, mediaControl: 18, servicesStrength: 32 }, combatExperience: 8 },
  TUR: { economy: 52, population: 84, technology: 55, logistics: 58, military: 40, stability: 50, regimeType: "authoritarian", informationEnvironment: { score: 58, techComponent: 55, mediaControl: 55, servicesStrength: 52 }, combatExperience: 6 },
  PRK: { economy: 10, population: 25, technology: 25, logistics: 20, military: 35, stability: 88, regimeType: "totalitarian", informationEnvironment: { score: 82, techComponent: 25, mediaControl: 95, servicesStrength: 90 }, combatExperience: 5 },
};
