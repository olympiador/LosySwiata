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
  return countries.map((country) => ({
    components: {
      economy: 20 + ((country.id * 137.508) % 40),
      population: 20 + ((country.id * 251.17) % 35),
      technology: 18 + ((country.id * 89.33) % 30),
      logistics: 16 + ((country.id * 191.7) % 28),
      military: 18 + ((country.id * 311.4) % 34),
      stability: 22 + ((country.id * 73.9) % 30),
    },
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
    regimeType: initialRegimeType(country.id),
    informationEnvironment: initialInformationEnvironment(country.id),
    combatExperience: Math.round(((country.id * 17.7) % 20)),
    manpower: initialManpower(country.id),
  }));
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
    policyEffects?: {
      mediaControlChange?: number;
      servicesStrengthChange?: number;
      combatExperienceChange?: number;
    };
  },
  turn: number,
  seed: number,
) {
  if (state.lastEvaluatedTurn === turn) return state;
  const mix = 0.25 * turn + (seed % 97) / 97;
  const pressure = context.hasIncoming ? 0.12 : context.hasOutgoing ? -0.05 : 0;
  const occupationLoad = Math.min(0.18, context.activeOccupations * 0.04);
  const change: StrategicComponents = {
    economy: clamp((baseline.economy - state.components.economy) * 0.06 + pressure * 0.8 - occupationLoad * 1.2 + (mix - 0.5) * 0.6),
    population: clamp((baseline.population - state.components.population) * 0.03 + (context.hasOutgoing ? -0.15 : 0.04) + (mix - 0.5) * 0.35),
    technology: clamp((baseline.technology - state.components.technology) * 0.04 + (context.hasOutgoing ? -0.1 : 0.05) + (mix - 0.5) * 0.4),
    logistics: clamp((baseline.logistics - state.components.logistics) * 0.05 + pressure * 1.3 - occupationLoad * 1.6 + (mix - 0.5) * 0.7),
    military: clamp((baseline.military - state.components.military) * 0.07 + (context.hasOutgoing ? 0.35 : -0.08) + (mix - 0.5) * 0.9),
    stability: clamp((baseline.stability - state.components.stability) * 0.04 + (context.hasIncoming ? -0.25 : 0.06) + occupationLoad * 0.9 + (mix - 0.5) * 0.45),
  };
  const regimeType = context.regimeOverride ?? state.regimeType;
  const regimeMod = regimeModifier(regimeType);
  const foreignBasePenalty = clamp((context.foreignBasePressure ?? 0) * 5, 0, 10);
  const infoEnv = state.informationEnvironment;
  const infoEffect = informationEnvironmentEffect(regimeType, infoEnv.score);
  const stabilityComposite = state.components.stability + change.stability;
  const stabilityFinal = clamp((stabilityComposite + infoEffect + foreignBasePenalty) * regimeMod);
  const policy = context.policyEffects ?? {};
  const informationEnvironment = {
    score: clamp(infoEnv.score + (policy.mediaControlChange ?? 0) + (policy.servicesStrengthChange ?? 0) * 0.3),
    techComponent: infoEnv.techComponent,
    mediaControl: clamp(infoEnv.mediaControl + (policy.mediaControlChange ?? 0)),
    servicesStrength: clamp(infoEnv.servicesStrength + (policy.servicesStrengthChange ?? 0)),
  };
  const population = state.components.population + change.population;
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
      population: clamp(population),
      technology: clamp(state.components.technology + change.technology),
      logistics: clamp(state.components.logistics + change.logistics),
      military: clamp(military),
      stability: stabilityFinal,
    },
    uncertainty: clamp(state.uncertainty * 0.985 + 0.002 + (context.areaShare > 1.2 ? 0.015 : 0)),
    lastEvaluatedTurn: turn,
    change: {
      ...change,
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
