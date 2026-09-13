export type StrategicCasusBelliId = "security-threat" | "territorial-claim" | "protect-population" | "opportunistic";

export type StrategicCasusBelli = {
  id: StrategicCasusBelliId;
  name: string;
  description: string;
  legitimacyDelta: number;
  reputationDelta: number;
  warSupportDelta: number;
  trustDelta: number;
  tensionDelta: number;
  memoryDelta: number;
  occupationFactor: number;
};

export const STRATEGIC_CASUS_BELLI: Record<StrategicCasusBelliId, StrategicCasusBelli> = {
  "security-threat": {
    id: "security-threat", name: "Zagrożenie bezpieczeństwa",
    description: "Uzasadnienie defensywne. Ogranicza koszt polityczny, lecz go nie usuwa.",
    legitimacyDelta: -3, reputationDelta: -5, warSupportDelta: 4, trustDelta: -16, tensionDelta: 28, memoryDelta: 14, occupationFactor: 1.08,
  },
  "territorial-claim": {
    id: "territorial-claim", name: "Roszczenie terytorialne",
    description: "Czytelny cel wojny, ale sąsiedzi pamiętają rewizję granic.",
    legitimacyDelta: -5, reputationDelta: -8, warSupportDelta: 5, trustDelta: -20, tensionDelta: 34, memoryDelta: 20, occupationFactor: 1,
  },
  "protect-population": {
    id: "protect-population", name: "Ochrona ludności",
    description: "Najłatwiejsze do obrony publicznie uzasadnienie, nadal obciążone ryzykiem eskalacji.",
    legitimacyDelta: -2, reputationDelta: -3, warSupportDelta: 6, trustDelta: -13, tensionDelta: 24, memoryDelta: 11, occupationFactor: 1.15,
  },
  opportunistic: {
    id: "opportunistic", name: "Wojna bez przekonującego powodu",
    description: "Szybka decyzja bez osłony dyplomatycznej. Najwyższy koszt zaufania, reputacji i poparcia.",
    legitimacyDelta: -14, reputationDelta: -18, warSupportDelta: -4, trustDelta: -32, tensionDelta: 46, memoryDelta: 30, occupationFactor: .72,
  },
};

export type StrategicPoliticalState = { countryId: number; legitimacy: number; reputation: number; warSupport: number };
export type StrategicRelation = { firstId: number; secondId: number; trust: number; tension: number; warMemory: number; lastChangedTurn: number };

export function clampStrategic(value: number, minimum = 0, maximum = 100) {
  return Math.max(minimum, Math.min(maximum, value));
}

export function strategicRelationKey(firstId: number, secondId: number) {
  return firstId < secondId ? `${firstId}:${secondId}` : `${secondId}:${firstId}`;
}

export function defaultStrategicRelation(firstId: number, secondId: number): StrategicRelation {
  return { firstId: Math.min(firstId, secondId), secondId: Math.max(firstId, secondId), trust: 55, tension: 12, warMemory: 0, lastChangedTurn: 0 };
}

export function applyWarDeclarationToRelation(relation: StrategicRelation, casus: StrategicCasusBelli, turn: number): StrategicRelation {
  return {
    ...relation,
    trust: clampStrategic(relation.trust + casus.trustDelta),
    tension: clampStrategic(relation.tension + casus.tensionDelta),
    warMemory: clampStrategic(relation.warMemory + casus.memoryDelta),
    lastChangedTurn: turn,
  };
}

export function advanceStrategicRelation(relation: StrategicRelation, atWar: boolean): StrategicRelation {
  return {
    ...relation,
    trust: clampStrategic(relation.trust + (atWar ? -.5 : .35)),
    tension: clampStrategic(relation.tension + (atWar ? 1.4 : -1.8)),
    warMemory: clampStrategic(relation.warMemory - (atWar ? 0 : .35)),
  };
}

export type StrategicResourceSecurity = {
  energy: number;
  industry: number;
  food: number;
  technology: number;
  logistics: number;
  readiness: number;
  bottleneck: "energy" | "industry" | "food" | "technology" | "logistics";
};

export type StrategicComponentInput = { economy: number; population: number; technology: number; logistics: number; military: number; stability: number };

export function deriveStrategicResourceSecurity(components: StrategicComponentInput, pressure: { outgoing: number; incoming: number; occupations: number }, bonuses: Partial<Record<keyof Omit<StrategicResourceSecurity, "readiness" | "bottleneck">, number>> = {}): StrategicResourceSecurity {
  const warPenalty = pressure.outgoing * 4 + pressure.incoming * 6;
  const occupationPenalty = pressure.occupations * 2.5;
  const values = {
    energy: clampStrategic(components.economy * .42 + components.technology * .23 + components.logistics * .2 + components.stability * .15 - warPenalty + (bonuses.energy ?? 0)),
    industry: clampStrategic(components.economy * .46 + components.military * .27 + components.technology * .27 - warPenalty * .7 - occupationPenalty + (bonuses.industry ?? 0)),
    food: clampStrategic(42 + components.stability * .25 + components.logistics * .24 - components.population * .12 - pressure.incoming * 5 + (bonuses.food ?? 0)),
    technology: clampStrategic(components.technology - pressure.incoming * 2 + (bonuses.technology ?? 0)),
    logistics: clampStrategic(components.logistics - warPenalty * .8 - occupationPenalty + (bonuses.logistics ?? 0)),
  };
  const entries = Object.entries(values) as Array<[keyof typeof values, number]>;
  const [bottleneck] = entries.reduce((lowest, entry) => entry[1] < lowest[1] ? entry : lowest);
  const sorted = entries.map(([, value]) => value).sort((a, b) => a - b);
  const readiness = clampStrategic(sorted[0] * .55 + sorted[1] * .25 + sorted.slice(2).reduce((sum, value) => sum + value, 0) / 3 * .2);
  return { ...values, readiness, bottleneck };
}

export type StrategicOccupationPolicy = "annexation" | "autonomy" | "protectorate";
export type StrategicOccupationPolicyChoice = StrategicOccupationPolicy | "withdrawal";

export const STRATEGIC_OCCUPATION_POLICIES: Record<StrategicOccupationPolicy, { name: string; description: string; integrationRate: number; resourceCeiling: number; reputationPerTurn: number }> = {
  annexation: { name: "Aneksja", description: "Największy dostęp do zasobów, najwolniejsza integracja i stały koszt reputacji.", integrationRate: .82, resourceCeiling: 1, reputationPerTurn: -.45 },
  autonomy: { name: "Autonomia", description: "Szybsze uspokojenie regionu i niższy koszt polityczny, lecz tylko 82% zasobów.", integrationRate: 1.18, resourceCeiling: .82, reputationPerTurn: -.12 },
  protectorate: { name: "Protektorat", description: "Najmniejsze obciążenie administracji, ale tylko 62% zasobów regionu.", integrationRate: 1.42, resourceCeiling: .62, reputationPerTurn: -.03 },
};

export type StrategicObjective = { id: string; name: string; description: string; progress: number; completed: boolean; points: number };

export function strategicObjectives(turn: number, rank: number, activeCountries: number, components: StrategicComponentInput, resources: StrategicResourceSecurity, incomingWars: number): StrategicObjective[] {
  const targets = [
    { id: "survival", name: "Przetrwanie państwa", description: "Utrzymaj państwo przez 20 kwartałów.", value: turn, target: 20, points: 25 },
    { id: "security", name: "Bezpieczne zaplecze", description: "Osiągnij gotowość zasobową 55 i nie odpieraj obecnie inwazji.", value: incomingWars ? 0 : resources.readiness, target: 55, points: 25 },
    { id: "modernization", name: "Modernizacja", description: "Podnieś gospodarkę i technologię do średniej 55.", value: (components.economy + components.technology) / 2, target: 55, points: 25 },
    { id: "regional-rank", name: "Znaczenie regionalne", description: "Wejdź do górnej jednej trzeciej rankingu potencjału.", value: rank > 0 ? activeCountries - rank + 1 : 0, target: Math.max(1, activeCountries - Math.ceil(activeCountries / 3) + 1), points: 25 },
  ];
  return targets.map(({ value, target, ...item }) => ({ ...item, progress: clampStrategic(value / Math.max(1, target) * 100), completed: value >= target }));
}
