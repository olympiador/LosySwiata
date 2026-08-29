import { evaluateCapabilityChange } from './app/country-capability';

const state = {
  components: { economy: 50, population: 20, technology: 50, logistics: 50, military: 50, stability: 50 },
  populationAbsolute: 0,
  demographics: { children: 0.18, youth: 0.12, primeAge: 0.34, middleAge: 0.22, elderly: 0.11, veryOld: 0.03 },
  informationEnvironment: { score: 45, techComponent: 50, mediaControl: 30, servicesStrength: 35 },
  combatExperience: 0,
  manpower: { available: 0, active: 0, reserves: 0, mobilization: 'hidden' as const, maintenanceCost: 0 },
  regimeType: 'democracy' as const,
  borderPolicy: 'selective' as const,
  logisticsInvestments: [],
  uncertainty: 0.2,
  change: { economy: 0, population: 0, technology: 0, logistics: 0, military: 0, stability: 0 },
  culturalProximity: {},
  assimilationProgress: 0,
  refugeesHosted: 0,
};

for (let id = 1; id <= 15; id++) {
  const result = evaluateCapabilityChange(state, state, { policyEffects: {}, hasOutgoing: false, hasIncoming: false, warIntensity: 0, activeOccupations: 0, turn: 1, seed: 12345 }, 1, 12345);
  console.log(`id=${id} pop=${Math.round(result.populationAbsolute).toLocaleString()} man=${Math.round(result.manpower.available)}`);
}
