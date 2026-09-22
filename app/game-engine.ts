import { geoArea, geoEquirectangular, geoPath } from "d3-geo";
import { feature } from "topojson-client";
import detailedAtlas from "world-atlas/countries-50m.json";
import vectorAtlas from "world-atlas/countries-10m.json";
import legacyAtlas from "world-atlas/countries-110m.json";
import worldCountries from "world-countries";
import type { Feature, FeatureCollection, Geometry } from "geojson";
import { ADMIN1_DEFLATE_BASE64, ADMIN1_HEIGHT, ADMIN1_ISO, ADMIN1_NAMES, ADMIN1_WIDTH } from "./admin1-data";
import { ELEVATION_HEIGHT, ELEVATION_RANKS_DEFLATE_BASE64, ELEVATION_WIDTH } from "./elevation-data";
import { REAL_AIRPORTS_DEFLATE_BASE64 } from "./airport-data";
import { REAL_PORTS_DEFLATE_BASE64 } from "./port-data";
import { STRATEGIC_BASELINES, type StrategicBaseline } from "./strategic-baselines";
import { CAPITALS } from "./capital-data";
import { initialCapabilityStates, demographicType } from "./country-capability";
import { AGE_GROUPS, ageCounts, allocatePeople, census, emptyAgeCounts, populationTotal, pyramidFromCounts, recordPopulationChange, removePeople, type AgeCounts, type PopulationCensus } from "./population-model";
import { loadPopulationGrid } from "./population-grid";
import { capabilityStateToSnapshotArray, loadCapabilityStatesFromSnapshot, evaluateCapabilityChange, applyRefugeeMovement, refugeeArrivalProfile, createPlayerPolicyDecisionDefaults, getActivePlayerPolicyEffects, getCountryLogisticsFromRegions, evaluateRegionLogistics, type CountryCapabilityState, type CapabilityDelta, type RegimeType, type PolicyDecisionId, type PlayerPolicyDecision, type PlayerPolicyState, type BorderPolicy, type RegionLogistics } from "./country-capability";
import { STRATEGIC_CASUS_BELLI, STRATEGIC_OCCUPATION_POLICIES, advanceStrategicRelation, applyWarDeclarationToRelation, clampStrategic, defaultStrategicRelation, deriveStrategicResourceSecurity, strategicObjectives, strategicRelationKey, type StrategicCasusBelliId, type StrategicObjective, type StrategicOccupationPolicy, type StrategicOccupationPolicyChoice, type StrategicPoliticalState, type StrategicRelation, type StrategicResourceSecurity } from "./strategic-systems";
export type { PolicyDecisionId, PlayerPolicyDecision, PlayerPolicyState, BorderPolicy, RegionLogistics };
export { STRATEGIC_CASUS_BELLI, STRATEGIC_OCCUPATION_POLICIES } from "./strategic-systems";
export type { StrategicCasusBelliId, StrategicObjective, StrategicOccupationPolicy, StrategicOccupationPolicyChoice, StrategicPoliticalState, StrategicRelation, StrategicResourceSecurity } from "./strategic-systems";

export const MAP_W = 4320;
export const MAP_H = 2160;
const PREVIOUS_MAP_W = 2160;
const PREVIOUS_MAP_H = 1080;
const OLDER_MAP_W = 1440;
const OLDER_MAP_H = 720;
const LEGACY_MAP_W = 720;
const LEGACY_MAP_H = 360;
const VECTOR_MASK_W = MAP_W;
const VECTOR_MASK_H = MAP_H;
const CURRENT_MAP_REVISION = 7;
const FLAG_TEXTURE_W = 192;
const FLAG_TEXTURE_H = 128;
const LAND_KM2 = 148_940_000;
const MAX_WAR_GAP_KM = 1_200;
export const CATACLYSM_EVERY_TURNS = 40;
const CATACLYSM_FRACTION = .03;
// A cell that was dry land on the starting map keeps its coastline memory:
// new land reclaims it before it spreads into never-drowned open sea.
const DROWNED_LAND_BONUS = 6;
const WAR_THEATER_GAP_KM = 350;
const WAR_EXHAUSTION_GAIN = 3.2;
const WAR_EXHAUSTION_DECAY = 2.5;
const WAR_EXHAUSTION_LIMIT = 9;
const WAR_LEADER_TARGET_CHANCE = 1 / 3;
const WAR_CAPITAL_RELOCATION_TURNS = 2;
const WAR_VETO_LIMIT = 3;
const WAR_UNDO_LIMIT = 3;
const WAR_GUARANTEE_TURNS = 10;
const WAR_GUARANTEE_MULTIPLIER = .5;
const WAR_TITLE_STEADFAST_SHARE = .5;
const WAR_TITLE_FORTRESS_TURN = 30;
const STRATEGIC_NAVAL_RANGE_KM = 500;

export type ActionKey = "war" | "land" | "erosion";
export type GameMode = "full" | "war" | "strategy";
export type GameRegion = "world" | "europe" | "asia_oceania" | "africa" | "north_america" | "central_america_caribbean" | "south_america";
export type MicrostateRule = "all" | "exclude";
type RegionalGameRegion = Exclude<GameRegion, "world">;
export type SizeKey = "all" | "large" | "big" | "medium" | "small" | "tiny";
export type MapStyle = "colors" | "labels" | "flags" | "hybrid" | "relief";
export type CountryLabelPlacement = { owner: number; name: string; x: number; y: number; fontSize: number; lines: string[] };
export type VectorMapCountry = { countryId: number; path: string; fill: string };
export type VectorMapChangeLayer = { ownerId: number; path: string; fill: string };
export type CapitalPlacement = { countryId: number; countryName: string; name: string; x: number; y: number; controlled: boolean; regionId: number | null; relocated: boolean };
export type StrategicCityPlacement = { id: number; countryId: number; regionId: number; name: string; x: number; y: number; controlled: boolean };
export type StrategicCapitalRelocationOption = { regionId: number; name: string; score: number; reason: string };

export type StrategicRegion = {
  id: number;
  name: string;
  originalOwnerId: number;
  ownerId: number;
  cells: number;
  areaKm2: number;
  cx: number;
  cy: number;
  neighbours: number[];
  provinceCount: number;
  provinceNames: string[];
  logisticsIndex: number;
  maritimeAccess: number;
  railDensity: number;
  roadDensity: number;
  airportCount: number;
  portCount: number;
  riverAccess: number;
  fortification: number;
};

type CuratedFortificationZone = { countries: string[]; south: number; north: number; west: number; east: number; score: number; source: string };
const CURATED_FORTIFICATION_ZONES: CuratedFortificationZone[] = [
  { countries: ["KP", "KR"], south: 35.5, north: 39.2, west: 124.5, east: 131.5, score: 45, source: "DMZ i przygotowania obronne Półwyspu Koreańskiego" },
  { countries: ["IN", "PK"], south: 31.0, north: 37.5, west: 71.0, east: 81.5, score: 32, source: "Linia Kontroli w Kaszmirze" },
  { countries: ["IN", "CN"], south: 26.0, north: 37.5, west: 76.0, east: 100.0, score: 22, source: "Sporna granica indyjsko-chińska" },
  { countries: ["AM", "AZ"], south: 38.0, north: 41.8, west: 43.0, east: 48.5, score: 25, source: "Ufortyfikowane kierunki Kaukazu Południowego" },
  { countries: ["IL", "PS", "LB", "SY"], south: 29.0, north: 34.8, west: 34.0, east: 37.5, score: 25, source: "Przygotowane kierunki Lewantu" },
  { countries: ["CY"], south: 34.3, north: 35.8, west: 32.0, east: 34.9, score: 28, source: "Strefa buforowa i obrona Cypru" },
  { countries: ["MA", "EH"], south: 20.0, north: 28.8, west: -18.0, east: -10.0, score: 35, source: "Wał obronny Sahary Zachodniej" },
  { countries: ["MD"], south: 46.0, north: 48.7, west: 27.0, east: 30.2, score: 15, source: "Strefa bezpieczeństwa Naddniestrza" },
  { countries: ["RS", "XK"], south: 42.0, north: 43.8, west: 20.0, east: 22.2, score: 14, source: "Wrażliwe kierunki Serbii i Kosowa" },
];

/** Kuratorowana baza opisuje przygotowanie całego sektora, nie liczbę bunkrów. */
export function curatedFortificationBaseline(countryIso: string, regionName: string, cx?: number, cy?: number) {
  const normalized = regionName.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/ł/g, "l").toLowerCase();
  if (countryIso === "UA" && (normalized.includes("doniecki") || normalized.includes("luganski"))) {
    return { score: 40, source: "Rozpoznane pozycje obronne Donbasu" };
  }
  if (Number.isFinite(cx) && Number.isFinite(cy)) {
    const longitude = (cx! / MAP_W) * 360 - 180;
    const latitude = 90 - (cy! / MAP_H) * 180;
    const zone = CURATED_FORTIFICATION_ZONES.filter((candidate) => candidate.countries.includes(countryIso) && latitude >= candidate.south && latitude <= candidate.north && longitude >= candidate.west && longitude <= candidate.east).sort((a, b) => b.score - a.score)[0];
    if (zone) return { score: zone.score, source: zone.source };
  }
  return { score: 0, source: "Brak kuratorowanych danych o umocnieniach" };
}

export type LogisticsInvestment = {
  id: string;
  regionId: number;
  type: "port" | "road" | "rail" | "airport";
  bonus: number;
  remainingTurns: number;
};

export type StrategicCampaign = {
  id: number;
  attackerId: number;
  defenderId: number;
  regionId: number;
  progress: number;
  turns: number;
  stallTurns?: number;
  attackerCasualties?: number;
  defenderCasualties?: number;
  battles?: number;
  refugeesFled?: number;
  refugeesFledWomen?: number;
  refugeesFledMen?: number;
  refugeesFledChildren?: number;
  refugeeDestinations?: StrategicRefugeeDestination[];
  lastMomentum?: number;
  lastRandomFactor?: number;
  populationBefore?: { attacker: PopulationCensus; defender: PopulationCensus };
  populationBaselineTurn?: number;
  territoryPopulation?: number;
  casusBelli?: StrategicCasusBelliId;
};

export type StrategicRefugeeDestination = {
  countryId: number;
  people: number;
};

export type StrategicOccupation = {
  regionId: number;
  ownerId: number;
  previousOwnerId: number;
  progress: number;
  startedTurn: number;
  lastGain: number;
  policy?: StrategicOccupationPolicy;
  casusBelli?: StrategicCasusBelliId;
};

export type StrategicBattleArtifact = {
  id: number;
  regionId: number;
  turn: number;
  attackerId: number;
  defenderId: number;
  x: number;
  y: number;
  intensity: number;
  kind: "battle" | "burned";
};

export type StrategicWarHistoryEntry = {
  id: number;
  attackerId: number;
  defenderId: number;
  regionId: number;
  startedTurn: number;
  endedTurn: number;
  outcome: "captured" | "repelled" | "withdrawn" | "stalemate";
  attackerCasualties: number;
  defenderCasualties: number;
  battles: number;
  refugeesFled: number;
  refugeesFledWomen: number;
  refugeesFledMen: number;
  refugeesFledChildren: number;
  refugeeDestinations: StrategicRefugeeDestination[];
  populationBefore?: { attacker: PopulationCensus; defender: PopulationCensus };
  populationAfter?: { attacker: PopulationCensus; defender: PopulationCensus };
  populationBaselineTurn?: number;
  territoryPopulation?: number;
};

type StrategicCapitalLocation = { regionId: number; x: number; y: number; name: string; relocated: boolean };

export type StrategicTerritoryEvent = {
  turn: number;
  sectorId: number;
  sectorName: string;
  provinceNames: string[];
  fromOwnerId: number;
  fromOwnerName: string;
  toOwnerId: number;
  toOwnerName: string;
  areaKm2: number;
};

export type StrategicRoundResult = { records: TurnRecord[]; changedIndices: number[]; completedWars: StrategicWarHistoryEntry[] };
export type StrategicDefensePosture = "continue" | "general" | "sector";
export type StrategicDefenseState = { posture: StrategicDefensePosture; focusRegionId: number | null; mobilizedUntil: number; mobilizationCooldownUntil: number };
export type StrategicComponents = { economy: number; population: number; technology: number; logistics: number; military: number; stability: number };
export type StrategicStrength = { power: number; rating: number; rank: number; activeCountries: number; tier: "Potęga" | "Silne" | "Średnie" | "Słabe"; components: StrategicComponents; exhaustion: number; integration: number };
export type StrategicStrengthEntry = StrategicStrength & { countryId: number };
export type StrategicCampaignConflict = { campaign: StrategicCampaign; currentDefenderId: number };
export type StrategicFrontStrength = { attack: number; defense: number; ratio: number; attackExhaustion: number; defenseExhaustion: number; attackerFronts: number; defenderFronts: number; homeDefense: number; logistics: number; resourceReadiness: number };
export type StrategicWarAssessment = { chance: number; ratio: number; level: "advantage" | "favorable" | "even" | "risky" | "danger"; label: string; front: StrategicFrontStrength };
export type StrategicWarPreview = StrategicWarAssessment & { casusBelli: StrategicCasusBelliId; politicalBefore: StrategicPoliticalState; politicalAfter: StrategicPoliticalState; relationBefore: StrategicRelation; relationAfter: StrategicRelation; resourceReadiness: number; consequences: string[] };

export type Direction = {
  key: string;
  label: string;
  short: string;
  dx: number;
  dy: number;
};

export type Country = {
  id: number;
  iso: string;
  iso3?: string;
  name: string;
  flag: string;
  color: [number, number, number];
  initialWeight: number;
  landlocked?: boolean;
  region?: RegionalGameRegion;
  capital?: { name: string; latitude: number; longitude: number };
};

type Stats = { cells: number; weight: number; cx: number; cy: number; anchor: number };
type DirectionHit = { countryId: number; index: number; distance: number; offset: number };
type VisualComponent = {
  owner: number;
  cells: number;
  startX: number;
  spanX: number;
  minY: number;
  maxY: number;
  anchorX: number;
  anchorY: number;
};

export type TurnPlan = {
  rngBefore: number;
  countryId: number;
  action: ActionKey;
  direction: Direction;
  directionAttempts: Direction[];
  actionWasRerolled: boolean;
  size: SizeKey;
  fraction: number;
  targetId: number | null;
};

export type TurnRecord = {
  turn: number;
  countryId: number;
  countryName: string;
  countryFlag: string;
  action: ActionKey;
  direction: string;
  directionShort: string;
  size: SizeKey;
  fraction: number;
  targetId: number | null;
  targetName: string | null;
  targetFlag: string | null;
  changedKm2: number;
  actualFraction?: number;
  partial?: boolean;
  eliminated: string | null;
  capitalLost?: string;
  capitalRelocated?: string;
  cataclysm?: true;
  bridgeTo?: string;
  text: string;
};

type WarCapitalState = { index: number | null; lostTurn: number | null; relocated: boolean };
type WarGuarantee = { countryId: number; untilTurn: number };
type Undo = { rngBefore: number; changed: Array<[number, number]>; historyEntries?: number; color: [number, number, number]; countryId: number; defeatedId: number | null; warExhaustion?: number[]; capitalStates?: Array<WarCapitalState | null>; warMinShare?: number[] };

export type CountryRanking = {
  rank: number;
  countryId: number;
  areaKm2: number;
  changePercent: number;
  defeats: number;
  active: boolean;
};

export type GameSnapshot = {
  version: 1;
  mode?: GameMode;
  region?: GameRegion;
  microstates?: MicrostateRule;
  playerCountryId?: number | null;
  strategicRegionSchema?: 1 | 2 | 3 | 4 | 5;
  strategicRegionOwners?: number[];
  strategicCampaigns?: StrategicCampaign[];
  strategicTerritoryLog?: StrategicTerritoryEvent[];
  strategicOccupations?: StrategicOccupation[];
  strategicBattleArtifacts?: StrategicBattleArtifact[];
  strategicWarHistory?: StrategicWarHistoryEntry[];
  strategicExhaustion?: number[];
  strategicFortifications?: number[];
  strategicDefenseState?: StrategicDefenseState;
  strategicCapitals?: Array<StrategicCapitalLocation | null>;
  warExhaustion?: number[];
  capitalStates?: Array<WarCapitalState | null>;
  warVetoesLeft?: number;
  warUndosLeft?: number;
  warGuarantee?: WarGuarantee | null;
  warGuaranteeUsed?: boolean;
  warMinShare?: number[];
  cataclysmEnabled?: boolean;
  colors?: Array<[number, number, number]>;
  mapRevision?: number;
  width: number;
  height: number;
  seed: number;
  rngState: number;
  turn: number;
  runs: Array<[number, number]>;
  history: TurnRecord[];
  defeats?: number[];
  countryCapabilityStates?: number[][];
  capabilityStatesV2?: CountryCapabilityState[];
  policyStateV2?: { decisionPoints: number; lastDecisionTurn: number; used: Array<{ id: PolicyDecisionId; turn: number }>; active: PolicyDecisionId[] };
  infrastructureV2?: Array<{ roadDensity: number; railDensity: number; airportCount: number; portCount: number; maritimeAccess: number }>;
  regionalPopulationV1?: AgeCounts[];
  populationDistributionV1?: "ghsl-2020" | "area";
  strategicQuarterStartV1?: StrategicComponents[];
  strategicPoliticsV1?: StrategicPoliticalState[];
  strategicRelationsV1?: StrategicRelation[];
};

type CountryRow = {
  ccn3?: string;
  cca2: string;
  cca3?: string;
  independent?: boolean;
  unMember?: boolean;
  landlocked?: boolean;
  latlng?: number[];
  name: { common: string };
  translations?: Record<string, { common?: string }>;
  flag?: string;
  region?: string;
  subregion?: string;
};

export const ACTIONS: Array<{ key: ActionKey; label: string; icon: string }> = [
  { key: "war", label: "Wojna", icon: "⚔" },
  { key: "land", label: "Nowy ląd", icon: "◆" },
  { key: "erosion", label: "Erozja", icon: "≈" },
];

export const DIRECTIONS: Direction[] = [
  { key: "n", label: "Północ", short: "N", dx: 0, dy: -1 },
  { key: "ne", label: "Północny wschód", short: "NE", dx: 0.707, dy: -0.707 },
  { key: "e", label: "Wschód", short: "E", dx: 1, dy: 0 },
  { key: "se", label: "Południowy wschód", short: "SE", dx: 0.707, dy: 0.707 },
  { key: "s", label: "Południe", short: "S", dx: 0, dy: 1 },
  { key: "sw", label: "Południowy zachód", short: "SW", dx: -0.707, dy: 0.707 },
  { key: "w", label: "Zachód", short: "W", dx: -1, dy: 0 },
  { key: "nw", label: "Północny zachód", short: "NW", dx: -0.707, dy: -0.707 },
];

export const SIZE_BANDS: Record<Exclude<SizeKey, "all">, [number, number]> = {
  tiny: [0.01, 0.05],
  small: [0.05, 0.15],
  medium: [0.15, 0.3],
  big: [0.3, 0.5],
  large: [0.5, 0.75],
};

export const SIZE_LABELS: Record<SizeKey, string> = {
  all: "ALL",
  large: "LARGE",
  big: "BIG",
  medium: "MEDIUM",
  small: "SMALL",
  tiny: "TINY",
};

const WAR_SIZES: SizeKey[] = ["all", "large", "big", "medium", "small"];
const OTHER_SIZES: SizeKey[] = ["large", "big", "medium", "small", "tiny"];
const POLISH_NAME_OVERRIDES: Record<string, string> = {
  CI: "Wybrzeże Kości Słoniowej",
  GF: "Gujana Francuska",
};
const POLISH_CAPITAL_OVERRIDES: Record<string, string> = {
  AE: "Abu Zabi", AM: "Erywań", AT: "Wiedeń", BE: "Bruksela", BG: "Sofia", BY: "Mińsk",
  CH: "Berno", CN: "Pekin", CY: "Nikozja", CZ: "Praga", DK: "Kopenhaga", EE: "Tallin",
  EG: "Kair", ES: "Madryt", FR: "Paryż", GB: "Londyn", GR: "Ateny", HR: "Zagrzeb",
  HU: "Budapeszt", IT: "Rzym", JP: "Tokio", KG: "Biszkek", KP: "Pjongjang", KR: "Seul",
  LT: "Wilno", LU: "Luksemburg", LV: "Ryga", MD: "Kiszyniów", MN: "Ułan Bator",
  PL: "Warszawa", PT: "Lizbona", RO: "Bukareszt", RS: "Belgrad", RU: "Moskwa",
  SE: "Sztokholm", SI: "Lublana", SK: "Bratysława", UA: "Kijów", US: "Waszyngton", VA: "Watykan",
};

// The source atlas renders occupied Crimea as part of Russia. The game uses
// internationally recognized borders, so Crimea and Sevastopol are restored
// to Ukraine after rasterization.
const CRIMEA_POLYGON: Array<[number, number]> = [
  [33.52, 46.25], [34.15, 46.16], [35.08, 46.08], [35.58, 45.72],
  [36.68, 45.48], [36.48, 45.12], [35.55, 45.12], [34.62, 44.55],
  [33.52, 44.35], [32.58, 44.52], [32.42, 45.35], [33.08, 45.78],
];

export function isCrimeaCoordinate(longitude: number, latitude: number) {
  let inside = false;
  for (let current = 0, previous = CRIMEA_POLYGON.length - 1; current < CRIMEA_POLYGON.length; previous = current++) {
    const [x1, y1] = CRIMEA_POLYGON[current], [x2, y2] = CRIMEA_POLYGON[previous];
    if ((y1 > latitude) !== (y2 > latitude)
      && longitude < (x2 - x1) * (latitude - y1) / (y2 - y1) + x1) inside = !inside;
  }
  return inside;
}

export function isKaliningradCoordinate(longitude: number, latitude: number) {
  return longitude >= 19.0 && longitude <= 23.15 && latitude >= 54.25 && latitude <= 55.35;
}

function isKaliningradIndex(index: number) {
  const x = index % MAP_W, y = Math.floor(index / MAP_W);
  return isKaliningradCoordinate((x + .5) / MAP_W * 360 - 180, 90 - (y + .5) / MAP_H * 180);
}

export function assignCrimeaToUkraine(owners: Int16Array, countries: Country[]) {
  const russia = countries.find((country) => country.iso === "RU")?.id;
  const ukraine = countries.find((country) => country.iso === "UA")?.id;
  if (russia === undefined || ukraine === undefined) return;
  const x0 = Math.floor((32.3 + 180) / 360 * MAP_W), x1 = Math.ceil((36.8 + 180) / 360 * MAP_W);
  const y0 = Math.floor((90 - 46.35) / 180 * MAP_H), y1 = Math.ceil((90 - 44.25) / 180 * MAP_H);
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const index = y * MAP_W + x;
    if (owners[index] !== russia) continue;
    const longitude = (x + 0.5) / MAP_W * 360 - 180;
    const latitude = 90 - (y + 0.5) / MAP_H * 180;
    if (isCrimeaCoordinate(longitude, latitude)) owners[index] = ukraine;
  }
}

export function classifyGameRegion(iso: string, region?: string, subregion?: string): RegionalGameRegion {
  if (iso === "RU") return "asia_oceania";
  if (region === "Europe") return "europe";
  if (region === "Africa") return "africa";
  if (region === "Asia" || region === "Oceania") return "asia_oceania";
  if (subregion === "South America") return "south_america";
  if (iso === "MX" || subregion === "North America" || subregion === "Northern America") return "north_america";
  return "central_america_caribbean";
}
const MAP_PALETTE: Array<[number, number, number]> = [
  [227, 79, 95],
  [57, 183, 201],
  [216, 180, 60],
  [147, 87, 199],
  [84, 181, 106],
  [223, 123, 56],
  [77, 117, 216],
  [216, 77, 154],
  [65, 154, 139],
  [194, 102, 68],
  [111, 143, 55],
  [63, 139, 190],
  [204, 137, 54],
  [177, 82, 116],
  [106, 171, 198],
  [185, 157, 80],
];
const MAP_ROOM_SATURATION = 0.45;
const MAP_ROOM_BRIGHTNESS = 0.72;
const MAP_ROOM_LIFT = 10;

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  s /= 100;
  l /= 100;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let r = 0, g = 0, b = 0;
  if (h < 60) [r, g] = [c, x];
  else if (h < 120) [r, g] = [x, c];
  else if (h < 180) [g, b] = [c, x];
  else if (h < 240) [g, b] = [x, c];
  else if (h < 300) [r, b] = [x, c];
  else [r, b] = [c, x];
  return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)];
}

function colorDistanceSquared(first: [number, number, number], second: [number, number, number]) {
  return (first[0] - second[0]) ** 2 + (first[1] - second[1]) ** 2 + (first[2] - second[2]) ** 2;
}

function separateCountriesByWater(owners: Int16Array, countries: Country[], firstIso: string, secondIso: string) {
  const first = countries.find((country) => country.iso === firstIso)?.id;
  const second = countries.find((country) => country.iso === secondIso)?.id;
  if (first === undefined || second === undefined) return;
  const carve: number[] = [];
  for (let index = 0; index < owners.length; index++) {
    if (owners[index] !== second) continue;
    const x = index % MAP_W, y = Math.floor(index / MAP_W);
    let touches = false;
    for (let oy = -1; oy <= 1 && !touches; oy++) for (let ox = -1; ox <= 1; ox++) {
      if (!ox && !oy) continue;
      const ny = y + oy;
      if (ny >= 0 && ny < MAP_H && owners[ny * MAP_W + ((x + ox + MAP_W) % MAP_W)] === first) { touches = true; break; }
    }
    if (touches) carve.push(index);
  }
  carve.forEach((index) => { owners[index] = -1; });
}

// Alternate-history rule of this game: French Guiana is a sovereign country.
// Admin-1 cells give it a precise outline without inventing a rectangular map
// shape or changing France's European territory.
export function assignFrenchGuianaOwner(owners: Int16Array, administrative: Int16Array, franceId: number, frenchGuianaId: number) {
  if (owners.length !== administrative.length || franceId < 0 || frenchGuianaId < 0) return 0;
  let assigned = 0;
  for (let index = 0; index < owners.length; index++) {
    if (owners[index] !== franceId || ADMIN1_NAMES[administrative[index]] !== "Gujana Francuska") continue;
    owners[index] = frenchGuianaId;
    assigned++;
  }
  return assigned;
}

function administrativeOwnerIso(adminId: number) {
  return ADMIN1_NAMES[adminId] === "Gujana Francuska" ? "GF" : ADMIN1_ISO[adminId];
}

function assignMapColors(countries: Country[], owners: Int16Array) {
  const directNeighbours = countries.map(() => new Set<number>());
  const connect = (first: number, second: number) => {
    if (first < 0 || second < 0 || first === second) return;
    directNeighbours[first].add(second);
    directNeighbours[second].add(first);
  };
  const proximity: Array<[number, number]> = [];
  for (let oy = -2; oy <= 2; oy++) for (let ox = -2; ox <= 2; ox++) {
    if ((!oy && ox <= 0) || oy < 0 || (!ox && !oy)) continue;
    proximity.push([ox, oy]);
  }
  for (let y = 0; y < MAP_H; y++) for (let x = 0; x < MAP_W; x++) {
    const owner = owners[y * MAP_W + x];
    if (owner < 0) continue;
    for (const [ox, oy] of proximity) {
      const ny = y + oy;
      if (ny >= 0 && ny < MAP_H) connect(owner, owners[ny * MAP_W + ((x + ox + MAP_W) % MAP_W)]);
    }
  }
  const neighbours = directNeighbours.map((items) => new Set(items));
  for (let id = 0; id < countries.length; id++) for (const neighbour of directNeighbours[id]) {
    for (const nearby of directNeighbours[neighbour]) {
      if (nearby !== id) { neighbours[id].add(nearby); neighbours[nearby].add(id); }
    }
  }
  const assigned = new Int16Array(countries.length);
  assigned.fill(-1);
  const order = countries.map(({ id }) => id).sort((a, b) => neighbours[b].size - neighbours[a].size || a - b);
  for (const id of order) {
    const used = new Set([...neighbours[id]].map((neighbour) => assigned[neighbour]).filter((color) => color >= 0));
    const preferred = (id * 5 + 3) % MAP_PALETTE.length;
    let choice = preferred, bestScore = -Infinity;
    for (let step = 0; step < MAP_PALETTE.length; step++) {
      const candidate = (preferred + step) % MAP_PALETTE.length;
      const [r, g, b] = MAP_PALETTE[candidate];
      let distance = Infinity;
      for (const neighbour of neighbours[id]) {
        const neighbourColor = assigned[neighbour];
        if (neighbourColor < 0) continue;
        const [nr, ng, nb] = MAP_PALETTE[neighbourColor];
        distance = Math.min(distance, (r - nr) ** 2 + (g - ng) ** 2 + (b - nb) ** 2);
      }
      const score = (used.has(candidate) ? -1_000_000 : 0) + (Number.isFinite(distance) ? distance : 0) - step * 0.001;
      if (score > bestScore) { bestScore = score; choice = candidate; }
    }
    assigned[id] = choice;
    countries[id].color = [...MAP_PALETTE[choice]];
  }
}

function wrapX(x: number) {
  return (x + MAP_W) % MAP_W;
}

function deltaX(x: number, origin: number) {
  let value = x - origin;
  if (value > MAP_W / 2) value -= MAP_W;
  if (value < -MAP_W / 2) value += MAP_W;
  return value;
}

export function circularColumnSpan(sourceColumns: number[], totalWidth: number) {
  if (!sourceColumns.length || totalWidth < 1) return { startX: 0, spanX: 1 };
  const columns = [...sourceColumns].sort((first, second) => first - second);
  let largestGap = -1, startX = columns[0];
  for (let column = 0; column < columns.length; column++) {
    const current = columns[column], next = columns[(column + 1) % columns.length];
    const gap = (next - current - 1 + totalWidth) % totalWidth;
    if (gap > largestGap) { largestGap = gap; startX = next; }
  }
  return { startX, spanX: Math.max(1, totalWidth - Math.max(0, largestGap)) };
}

function gridDistanceKm(x1: number, y1: number, x2: number, y2: number) {
  const latitude1 = (90 - ((y1 + 0.5) / MAP_H) * 180) * Math.PI / 180;
  const latitude2 = (90 - ((y2 + 0.5) / MAP_H) * 180) * Math.PI / 180;
  const longitudeDelta = deltaX(x2, x1) / MAP_W * Math.PI * 2;
  const latitudeDelta = latitude2 - latitude1;
  const haversine = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(latitude1) * Math.cos(latitude2) * Math.sin(longitudeDelta / 2) ** 2;
  return 12_742 * Math.asin(Math.min(1, Math.sqrt(haversine)));
}

function freshSeed() {
  return typeof crypto !== "undefined"
    ? crypto.getRandomValues(new Uint32Array(1))[0] || 1
    : (Date.now() >>> 0) || 1;
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("pl-PL", { maximumFractionDigits: 0 }).format(Math.round(value));
}

type PriorityItem = { index: number; priority: number };

function heapPush<T extends PriorityItem>(heap: T[], item: T) {
  heap.push(item);
  let child = heap.length - 1;
  while (child > 0) {
    const parent = Math.floor((child - 1) / 2);
    if (heap[parent].priority <= item.priority) break;
    heap[child] = heap[parent];
    child = parent;
  }
  heap[child] = item;
}

function heapPop<T extends PriorityItem>(heap: T[]) {
  const first = heap[0], last = heap.pop();
  if (heap.length && last) {
    let parent = 0;
    while (true) {
      const left = parent * 2 + 1, right = left + 1;
      if (left >= heap.length) break;
      const child = right < heap.length && heap[right].priority < heap[left].priority ? right : left;
      if (heap[child].priority >= last.priority) break;
      heap[parent] = heap[child];
      parent = child;
    }
    heap[parent] = last;
  }
  return first;
}

let elevationPromise: Promise<Uint16Array> | null = null;
let airportPromise: Promise<Uint16Array> | null = null;
let portPromise: Promise<Uint16Array> | null = null;
let admin1Promise: Promise<Int16Array> | null = null;

function loadAdmin1() {
  if (admin1Promise) return admin1Promise;
  admin1Promise = (async () => {
    try {
      const binary = atob(ADMIN1_DEFLATE_BASE64);
      const compressed = new Uint8Array(binary.length);
      for (let index = 0; index < binary.length; index++) compressed[index] = binary.charCodeAt(index);
      const stream = new Blob([compressed.buffer]).stream().pipeThrough(new DecompressionStream("deflate"));
      const source = new Uint8Array(await new Response(stream).arrayBuffer());
      if (ADMIN1_WIDTH !== MAP_W || ADMIN1_HEIGHT !== MAP_H || source.length !== MAP_W * MAP_H * 2) throw new Error("Niepełna mapa prowincji.");
      return new Int16Array(source.buffer);
    } catch {
      // Procedural fallback remains available in older browsers.
      return new Int16Array(0);
    }
  })();
  return admin1Promise;
}

function loadElevation() {
  if (elevationPromise) return elevationPromise;
  elevationPromise = (async () => {
    try {
      const binary = atob(ELEVATION_RANKS_DEFLATE_BASE64);
      const compressed = new Uint8Array(binary.length);
      for (let index = 0; index < binary.length; index++) compressed[index] = binary.charCodeAt(index);
      const stream = new Blob([compressed.buffer]).stream().pipeThrough(new DecompressionStream("deflate"));
      const source = new Uint8Array(await new Response(stream).arrayBuffer());
      if (source.length !== ELEVATION_WIDTH * ELEVATION_HEIGHT) throw new Error("Niepełna mapa wysokości.");

      const result = new Uint16Array(MAP_W * MAP_H);
      for (let y = 0; y < MAP_H; y++) {
        const sourceY = (y + 0.5) * ELEVATION_HEIGHT / MAP_H - 0.5;
        const y0 = Math.max(0, Math.floor(sourceY)), y1 = Math.min(ELEVATION_HEIGHT - 1, y0 + 1), fy = sourceY - y0;
        for (let x = 0; x < MAP_W; x++) {
          const sourceX = (x + 0.5) * ELEVATION_WIDTH / MAP_W - 0.5;
          const floorX = Math.floor(sourceX), x0 = (floorX + ELEVATION_WIDTH) % ELEVATION_WIDTH;
          const x1 = (x0 + 1) % ELEVATION_WIDTH, fx = sourceX - floorX;
          const top = source[y0 * ELEVATION_WIDTH + x0] * (1 - fx) + source[y0 * ELEVATION_WIDTH + x1] * fx;
          const bottom = source[y1 * ELEVATION_WIDTH + x0] * (1 - fx) + source[y1 * ELEVATION_WIDTH + x1] * fx;
          let hash = Math.imul(x + 17, 374761393) ^ Math.imul(y + 43, 668265263);
          hash = Math.imul(hash ^ (hash >>> 13), 1274126177);
          result[y * MAP_W + x] = Math.round((top * (1 - fy) + bottom * fy) * 32) + ((hash ^ (hash >>> 16)) & 15);
        }
      }
      return result;
    } catch {
      // The game remains playable even in an older browser without stream decompression.
      return new Uint16Array(MAP_W * MAP_H);
    }
  })();
  return elevationPromise;
}

function loadAirports() {
  if (airportPromise) return airportPromise;
  airportPromise = (async () => {
    try {
      const binary = atob(REAL_AIRPORTS_DEFLATE_BASE64);
      const compressed = new Uint8Array(binary.length);
      for (let index = 0; index < binary.length; index++) compressed[index] = binary.charCodeAt(index);
      const stream = new Blob([compressed.buffer]).stream().pipeThrough(new DecompressionStream("deflate"));
      const source = await new Response(stream).arrayBuffer();
      return new Uint16Array(source);
    } catch { return new Uint16Array(0); }
  })();
  return airportPromise;
}

function loadPorts() {
  if (portPromise) return portPromise;
  portPromise = (async () => {
    try {
      const binary = atob(REAL_PORTS_DEFLATE_BASE64);
      const compressed = new Uint8Array(binary.length);
      for (let index = 0; index < binary.length; index++) compressed[index] = binary.charCodeAt(index);
      const stream = new Blob([compressed.buffer]).stream().pipeThrough(new DecompressionStream("deflate"));
      return new Uint16Array(await new Response(stream).arrayBuffer());
    } catch { return new Uint16Array(0); }
  })();
  return portPromise;
}

export class WorldEngine {
  readonly width = MAP_W;
  readonly height = MAP_H;
  readonly countries: Country[];
  readonly initialOwners: Int16Array;
  private readonly initialColors: Array<[number, number, number]>;
  private readonly legacyInitialOwners: Int16Array;
  owners: Int16Array;
  seed: number;
  rngState: number;
  gameMode: GameMode = "full";
  gameRegion: GameRegion = "world";
  microstateRule: MicrostateRule = "all";
  playerCountryId: number | null = null;
  turn = 0;
  history: TurnRecord[] = [];
  private defeats: number[];
  private undoStack: Undo[] = [];
  private cataclysmEnabled = false;
  private rowWeight = new Float32Array(MAP_H);
  private readonly elevation: Uint16Array<ArrayBufferLike>;
  private readonly admin1At: Int16Array<ArrayBufferLike>;
  private km2PerWeight = 1;
  private buffer: HTMLCanvasElement;
  private bufferContext: CanvasRenderingContext2D;
  private visualRevision = 0;
  private statsRevision = -1;
  private statsCache: Stats[] = [];
  private statsSin = new Float64Array(0);
  private statsCos = new Float64Array(0);
  private statsY = new Float64Array(0);
  private boundaryRevision = -1;
  private boundaryCache: number[][] = [];
  private landAnchorRevision = -1;
  private landAnchorCache = new Map<number, Set<number>>();
  private runsRevision = -1;
  private runsCache: Array<[number, number]> = [];
  private renderOwnersRevision = -1;
  private renderOwnersWidth = 0;
  private renderOwnersHeight = 0;
  private renderOwners = new Int16Array(0);
  private renderSourceIndices = new Int32Array(0);
  private renderOwnersKey = "";
  private componentRevision = -1;
  private componentOwnersKey = "";
  private componentWidth = 0;
  private componentHeight = 0;
  private componentAt = new Int32Array(0);
  private visualComponents: VisualComponent[] = [];
  private labelComponentsKey = "";
  private labelComponents: VisualComponent[] = [];
  private flagTextures = new Map<number, Uint8ClampedArray>();
  private fillCacheKey = "";
  private borderCacheRevision = -1;
  private borderCacheWidth = 0;
  private borderCacheHeight = 0;
  private countryBorders: Path2D | null = null;
  private coastlines: Path2D | null = null;
  private outlineCacheKey = "";
  private outlinePath: Path2D | null = null;
  private readonly SANCTIONED_ISO3 = new Set(["RUS", "BLR"]);
  private directionTargetCache = new Map<string, DirectionHit | null>();
  private strategicProvinceAt = new Int32Array(0);
  private strategicAdministrativeAt = new Int32Array(0);
  private strategicRegions: StrategicRegion[] = [];
  private strategicRegionRuns: Array<Array<[number, number]>> = [];
  private strategicCampaigns: StrategicCampaign[] = [];
  private strategicTerritoryLog: StrategicTerritoryEvent[] = [];
  private strategicOccupations: StrategicOccupation[] = [];
  private strategicBattleArtifacts: StrategicBattleArtifact[] = [];
  private strategicWarHistory: StrategicWarHistoryEntry[] = [];
  private strategicPendingCasualties: number[] = [];
  private strategicLogisticsInvestments: LogisticsInvestment[] = [];
  private strategicExhaustion: number[] = [];
  private strategicPolitics: StrategicPoliticalState[] = [];
  private strategicRelations = new Map<string, StrategicRelation>();
  private strategicDefenseState: StrategicDefenseState = { posture: "continue", focusRegionId: null, mobilizedUntil: 0, mobilizationCooldownUntil: 0 };
  private strategicCapitals: Array<StrategicCapitalLocation | null> = [];
  private warExhaustion: number[] = [];
  private capitalStates: Array<WarCapitalState | null> = [];
  private warVetoesLeft = 0;
  private warUndosLeft = 0;
  private warGuarantee: WarGuarantee | null = null;
  private warGuaranteeUsed = false;
  private warMinShare: number[] = [];
  private pendingCapitalRelocations = new Set<number>();
  private nextCampaignId = 1;
  private strategicBorderKey = "";
  private strategicBorders: Path2D | null = null;
  private strategicAdministrativeBorders: Path2D | null = null;
  private strategicBaselineCache = new Map<number, StrategicComponents>();
  private strategicComponentCache = new Map<number, StrategicComponents>();
  private strategicPowerCache = new Map<number, number>();
  private countryCapabilityStates: CountryCapabilityState[] = [];
  private regionalPopulation: AgeCounts[] = [];
  private initialPopulationWeights = new Float64Array(0);
  private populationDistribution: "ghsl-2020" | "area" = "area";
  private strategicQuarterStart: StrategicComponents[] = [];
  private capabilityChangedThisTurn = false;
  private highlightOutlineKey = "";
  private highlightOutline: Path2D | null = null;
  private vectorChangeLayerRevision = -1;
  private vectorChangeLayers: VectorMapChangeLayer[] = [];
  private vectorHasChanges = false;
  private readonly vectorChangedPixels = new Uint8Array(VECTOR_MASK_W * VECTOR_MASK_H);
  private readonly vectorChangedRows = new Uint8Array(VECTOR_MASK_H);
  private readonly playerPolicyState: PlayerPolicyState = { decisions: createPlayerPolicyDecisionDefaults(), activePolicies: [], decisionPoints: 1, lastDecisionTurn: 0 };

  private constructor(countries: Country[], owners: Int16Array, legacyInitialOwners: Int16Array, seed: number, elevation: Uint16Array<ArrayBufferLike> = new Uint16Array(MAP_W * MAP_H), admin1At: Int16Array<ArrayBufferLike> = new Int16Array(0), private readonly airports: Uint16Array<ArrayBufferLike> = new Uint16Array(0), private readonly ports: Uint16Array<ArrayBufferLike> = new Uint16Array(0), private readonly populationGrid: Float32Array<ArrayBufferLike> = new Float32Array(0), private readonly vectorPaths: Array<{ countryId: number; path: string }> = []) {
    this.countries = countries;
    this.owners = owners;
    this.initialOwners = owners.slice();
    this.initialColors = countries.map(({ color }) => [color[0], color[1], color[2]]);
    this.legacyInitialOwners = legacyInitialOwners;
    this.defeats = countries.map(() => 0);
    this.seed = seed || 1;
    this.rngState = this.seed;
    this.elevation = elevation;
    this.admin1At = admin1At;
    this.countryCapabilityStates = loadCapabilityStatesFromSnapshot(this.countries, undefined);
    this.warExhaustion = countries.map(() => 0);
    this.capitalStates = this.initialWarCapitalStates();
    this.warMinShare = countries.map(() => 1);
    for (let y = 0; y < MAP_H; y++) {
      const latitude = 90 - ((y + 0.5) / MAP_H) * 180;
      this.rowWeight[y] = Math.max(0.02, Math.cos(latitude * Math.PI / 180));
    }
    let total = 0;
    for (let i = 0; i < owners.length; i++) if (owners[i] >= 0) total += this.rowWeight[Math.floor(i / MAP_W)];
    this.km2PerWeight = LAND_KM2 / Math.max(total, 1);
    const stats = this.stats();
    countries.forEach((country) => { country.initialWeight = stats[country.id]?.weight ?? 0; });
    this.buffer = document.createElement("canvas");
    this.buffer.width = 2;
    this.buffer.height = 1;
    const context = this.buffer.getContext("2d", { alpha: false });
    if (!context) throw new Error("Przeglądarka nie obsługuje mapy.");
    this.bufferContext = context;
  }

  static async create(seed = freshSeed()) {
    const terrain = loadElevation();
    const admin1 = loadAdmin1();
    const population = loadPopulationGrid();
    const rows = worldCountries as CountryRow[];
    const byNumeric = new Map(rows.filter((row) => row.ccn3).map((row) => [row.ccn3 as string, row]));
    const collectionFrom = (source: unknown) => {
      const topology = source as { objects: { countries: unknown } };
      return feature(source as never, topology.objects.countries as never) as unknown as FeatureCollection<Geometry, { name?: string }>;
    };
    const legacyCollection = collectionFrom(legacyAtlas);
    const detailedCollection = collectionFrom(detailedAtlas);
    const vectorCollection = collectionFrom(vectorAtlas);
    type AtlasFeature = (typeof detailedCollection.features)[number];
    type MappedCountry = { geometry: AtlasFeature; numeric: string; row: CountryRow };
    const displayNames = typeof Intl.DisplayNames === "undefined" ? null : new Intl.DisplayNames(["pl"], { type: "region" });
    const legacyUsable = legacyCollection.features
      .map((geometry) => {
        const numeric = String(geometry.id ?? "").padStart(3, "0");
        return { geometry, numeric, row: byNumeric.get(numeric) };
      })
      .filter((item): item is MappedCountry => Boolean(item.row && item.row.cca2 !== "AQ"))
      .sort((a, b) => a.numeric.localeCompare(b.numeric));
    const detailedByNumeric = new Map<string, AtlasFeature>();
    detailedCollection.features.forEach((geometry) => {
      const numeric = String(geometry.id ?? "").padStart(3, "0");
      const current = detailedByNumeric.get(numeric);
      if (!current || geoArea(geometry) > geoArea(current)) detailedByNumeric.set(numeric, geometry);
    });
    const baseUsable: MappedCountry[] = legacyUsable.map((item) => ({ ...item, geometry: detailedByNumeric.get(item.numeric) ?? item.geometry }));
    const existingIso = new Set(baseUsable.map(({ row }) => row.cca2));
    const detailedByName = new Map(detailedCollection.features.map((geometry) => [geometry.properties?.name?.toLowerCase() ?? "", geometry]));
    const additionalUsable = rows
      .filter((row) => row.cca2 !== "AQ" && !existingIso.has(row.cca2) && Boolean(row.independent || row.unMember || ["PS", "TW", "XK"].includes(row.cca2)))
      .map((row) => {
        let geometry = row.ccn3 ? detailedByNumeric.get(row.ccn3) : undefined;
        if (!geometry && row.cca2 === "XK") geometry = detailedByName.get("kosovo");
        if (!geometry && row.cca2 === "TV") {
          const [latitude = -8.5, longitude = 179.2] = row.latlng ?? [];
          geometry = {
            type: "Feature",
            id: row.cca2,
            properties: { name: row.name.common },
            geometry: { type: "Point", coordinates: [longitude, latitude] },
          } as Feature<Geometry, { name?: string }>;
        }
        return geometry ? { geometry, numeric: row.ccn3 || row.cca2, row } : null;
      })
      .filter((item): item is MappedCountry => item !== null)
      .sort((a, b) => a.numeric.localeCompare(b.numeric));
    const usable: MappedCountry[] = [...baseUsable, ...additionalUsable];

    const countries: Country[] = usable.map(({ row }, id) => {
      const capital = CAPITALS[row.cca2];
      return {
        id,
        iso: row.cca2,
        iso3: row.cca3,
        name: POLISH_NAME_OVERRIDES[row.cca2] ?? displayNames?.of(row.cca2) ?? row.translations?.pol?.common ?? row.name.common,
        flag: row.flag ?? "◈",
        color: hslToRgb((id * 137.508 + 17) % 360, 60 + (id % 3) * 3, 47 + (id % 4) * 2),
        initialWeight: 0,
        landlocked: row.landlocked,
        region: classifyGameRegion(row.cca2, row.region, row.subregion),
        capital: capital ? { name: POLISH_CAPITAL_OVERRIDES[row.cca2] ?? capital[0], latitude: capital[1], longitude: capital[2] } : undefined,
      };
    });
    const frenchGuianaRow = rows.find((row) => row.cca2 === "GF");
    if (frenchGuianaRow) {
      const id = countries.length, capital = CAPITALS.GF;
      countries.push({
        id,
        iso: "GF",
        iso3: "GUF",
        name: POLISH_NAME_OVERRIDES.GF,
        flag: frenchGuianaRow.flag ?? "🇬🇫",
        color: hslToRgb((id * 137.508 + 17) % 360, 60 + (id % 3) * 3, 47 + (id % 4) * 2),
        initialWeight: 0,
        landlocked: frenchGuianaRow.landlocked,
        region: classifyGameRegion("GF", frenchGuianaRow.region, frenchGuianaRow.subregion),
        capital: capital ? { name: POLISH_CAPITAL_OVERRIDES.GF ?? capital[0], latitude: capital[1], longitude: capital[2] } : undefined,
      });
    }

    const rasterize = (entries: MappedCountry[], width: number, height: number) => {
      const projection = geoEquirectangular().translate([width / 2, height / 2]).scale(width / (2 * Math.PI)).precision(Math.max(0.08, 144 / width));
      const pointRadius = Math.max(.75, width / MAP_W * .75);
      const measure = geoPath(projection).pointRadius(pointRadius);
      const result = new Int16Array(width * height);
      const anchorCandidates: Array<Array<{ index: number; alpha: number }>> = entries.map(() => []);
      const anchorMinimum = new Uint8Array(entries.length);
      result.fill(-1);
      entries.forEach(({ geometry, row }, id) => {
        const [[minX, minY], [maxX, maxY]] = measure.bounds(geometry);
        const padding = Math.max(2, Math.ceil(width / MAP_W));
        const x0 = Math.max(0, Math.floor(minX) - padding), y0 = Math.max(0, Math.floor(minY) - padding);
        const x1 = Math.min(width, Math.ceil(maxX) + padding), y1 = Math.min(height, Math.ceil(maxY) + padding);
        if (x1 <= x0 || y1 <= y0) return;
        const regionWidth = x1 - x0, regionHeight = y1 - y0;
        const mask = document.createElement("canvas");
        mask.width = regionWidth;
        mask.height = regionHeight;
        const context = mask.getContext("2d", { willReadFrequently: true });
        if (!context) throw new Error("Nie udało się przygotować mapy świata.");
        context.setTransform(1, 0, 0, 1, -x0, -y0);
        const path = geoPath(projection, context).pointRadius(pointRadius);
        context.beginPath();
        path(geometry);
        context.fillStyle = "#fff";
        context.fill();
        const data = context.getImageData(0, 0, regionWidth, regionHeight).data;
        for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
          const local = ((y - y0) * regionWidth + x - x0) * 4;
          const alpha = data[local + 3], index = y * width + x;
          const candidates = anchorCandidates[id];
          if (alpha > 0 && candidates.length < 24) {
            candidates.push({ index, alpha });
            anchorMinimum[id] = candidates.length === 1 ? alpha : Math.min(anchorMinimum[id], alpha);
          } else if (alpha > anchorMinimum[id]) {
            let weakest = 0;
            for (let candidate = 1; candidate < candidates.length; candidate++) if (candidates[candidate].alpha < candidates[weakest].alpha) weakest = candidate;
            candidates[weakest] = { index, alpha };
            anchorMinimum[id] = candidates.reduce((minimum, item) => Math.min(minimum, item.alpha), 255);
          }
          if (alpha >= 128) result[index] = id;
        }
        if (!anchorCandidates[id].length && row.latlng) {
          const [latitude, longitude] = row.latlng;
          const point = projection([longitude, latitude]);
          if (point) {
            const x = Math.max(0, Math.min(width - 1, Math.round(point[0]))), y = Math.max(0, Math.min(height - 1, Math.round(point[1])));
            anchorCandidates[id].push({ index: y * width + x, alpha: 255 });
          }
        }
        mask.width = 1;
        mask.height = 1;
      });
      const counts = new Int32Array(entries.length);
      for (let i = 0; i < result.length; i++) if (result[i] >= 0) counts[result[i]]++;
      const anchors = anchorCandidates.map((candidates) => candidates.sort((a, b) => b.alpha - a.alpha).map(({ index }) => index));
      for (let pass = 0; pass < 3; pass++) for (let id = 0; id < entries.length; id++) {
        if (counts[id] >= 3 || !anchors[id].length) continue;
        const claim = (index: number) => {
          const previous = result[index];
          if (previous === id || (previous >= 0 && counts[previous] <= 3)) return false;
          if (previous >= 0) counts[previous]--;
          result[index] = id;
          counts[id]++;
          return true;
        };
        for (const index of anchors[id]) {
          claim(index);
          if (counts[id] >= 3) break;
        }
        const centre = anchors[id][0], centreX = centre % width, centreY = Math.floor(centre / width);
        for (let radius = 1; counts[id] < 3 && radius <= 5; radius++) {
          for (let oy = -radius; oy <= radius && counts[id] < 3; oy++) for (let ox = -radius; ox <= radius && counts[id] < 3; ox++) {
            if (Math.max(Math.abs(ox), Math.abs(oy)) !== radius) continue;
            const x = centreX + ox, y = centreY + oy;
            if (x >= 0 && x < width && y >= 0 && y < height) claim(y * width + x);
          }
        }
      }
      return result;
    };

    const rasterizePrevious = (entries: MappedCountry[], width: number, height: number) => {
      const mask = document.createElement("canvas");
      mask.width = width;
      mask.height = height;
      const context = mask.getContext("2d", { willReadFrequently: true });
      if (!context) throw new Error("Nie udało się przygotować mapy świata.");
      const projection = geoEquirectangular().translate([width / 2, height / 2]).scale(width / (2 * Math.PI)).precision(Math.max(0.08, 144 / width));
      const path = geoPath(projection, context);
      const exact = new Map<number, number>();
      entries.forEach(({ geometry }, id) => {
        const r = 40 + (id * 73) % 200, g = 40 + (id * 151) % 200, b = 40 + (id * 199) % 200;
        const css = `rgb(${r},${g},${b})`;
        exact.set(r | (g << 8) | (b << 16), id);
        context.beginPath();
        path(geometry);
        context.fillStyle = css;
        context.strokeStyle = css;
        context.lineWidth = 2.2 * width / LEGACY_MAP_W;
        context.fill();
        context.stroke();
      });
      const data = context.getImageData(0, 0, width, height).data;
      const result = new Int16Array(width * height);
      result.fill(-1);
      for (let i = 0; i < result.length; i++) {
        const p = i * 4;
        result[i] = exact.get(data[p] | (data[p + 1] << 8) | (data[p + 2] << 16)) ?? -1;
      }
      return result;
    };

    const owners = rasterize(usable, MAP_W, MAP_H);
    assignCrimeaToUkraine(owners, countries);
    separateCountriesByWater(owners, countries, "DK", "SE");
    const legacyOwners = rasterizePrevious(legacyUsable, LEGACY_MAP_W, LEGACY_MAP_H);
    const [elevation, administrative, airports, ports, populationGrid] = await Promise.all([terrain, admin1, loadAirports(), loadPorts(), population]);
    assignFrenchGuianaOwner(owners, administrative, countries.find((country) => country.iso === "FR")?.id ?? -1, countries.find((country) => country.iso === "GF")?.id ?? -1);
    assignMapColors(countries, owners);
    const vectorByNumeric = new Map(vectorCollection.features.map((geometry) => [String(geometry.id ?? "").padStart(3, "0"), geometry]));
    const vectorProjection = geoEquirectangular().translate([1, .5]).scale(1 / Math.PI).precision(.000015);
    // geoPath defaults to three decimal places, which becomes a visible
    // ~50-pixel coordinate grid at maximum zoom. Preserve enough atlas
    // precision for the SVG layer to stay genuinely vector-sharp.
    const vectorPath = geoPath(vectorProjection).pointRadius(.0014).digits(7);
    const vectorPaths = usable.flatMap(({ geometry, numeric, row }, countryId) => {
      const source = vectorByNumeric.get(numeric) ?? geometry;
      const [[minX, minY], [maxX, maxY]] = vectorPath.bounds(source);
      let path: string | null = null;
      // A handful of tiny archipelagos are encoded with the outside of the
      // polygon as their interior. d3 then returns an almost world-sized
      // complement which would paint over every country drawn before it.
      // Keep those states visible as a precise capital-sized vector marker.
      if (maxX - minX > 1.5 || maxY - minY > .9) {
        const [latitude, longitude] = row.latlng ?? [];
        const point = Number.isFinite(latitude) && Number.isFinite(longitude)
          ? vectorProjection([longitude, latitude])
          : null;
        if (point) {
          const radius = .0014, x = point[0], y = point[1];
          path = `M${(x - radius).toFixed(7)},${y.toFixed(7)}a${radius.toFixed(7)},${radius.toFixed(7)} 0 1,0 ${(radius * 2).toFixed(7)},0a${radius.toFixed(7)},${radius.toFixed(7)} 0 1,0 -${(radius * 2).toFixed(7)},0`;
        }
      } else {
        path = vectorPath(source);
      }
      return path ? [{ countryId, path }] : [];
    });
    return new WorldEngine(countries, owners, legacyOwners, seed, elevation, administrative, airports, ports, populationGrid, vectorPaths);
  }

  private random() {
    let t = (this.rngState += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    this.rngState >>>= 0;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  private pick<T>(items: T[]) {
    return items[Math.floor(this.random() * items.length) % items.length];
  }

  private availableActions() {
    return this.gameMode === "war" || this.gameMode === "strategy" ? ACTIONS.filter(({ key }) => key === "war") : ACTIONS;
  }

  private ecologicalLandRatio(stats: Stats[]) {
    let initial = 0, current = 0;
    for (const country of this.countries) if (this.isCountryPlayable(country.id)) {
      initial += country.initialWeight;
      current += stats[country.id]?.weight ?? 0;
    }
    return initial > 0 ? current / initial : 1;
  }

  private pickAction(stats: Stats[]) {
    const actions = this.availableActions();
    if (this.gameMode === "war") return actions[0].key;
    // Equal counts of +f and -f still shrink the world because (1+f)(1-f)<1.
    // The size roll below corrects that asymmetry; this gentle feedback also
    // compensates for partially failed land growth near crowded coastlines.
    const correction = Math.max(-.72, Math.min(.72, (1 - this.ecologicalLandRatio(stats)) * 2.4));
    const weights = actions.map(({ key }) => key === "land" ? 1 + correction : key === "erosion" ? 1 - correction : 1);
    let roll = this.random() * weights.reduce((sum, weight) => sum + weight, 0);
    for (let index = 0; index < actions.length; index++) {
      roll -= weights[index];
      if (roll <= 0) return actions[index].key;
    }
    return actions.at(-1)!.key;
  }

  setGameMode(mode: GameMode) {
    this.gameMode = mode;
    this.resetWarResources();
  }

  private resetWarResources() {
    this.warVetoesLeft = this.gameMode === "war" ? WAR_VETO_LIMIT : 0;
    this.warUndosLeft = this.gameMode === "war" ? WAR_UNDO_LIMIT : 0;
    this.warGuarantee = null;
    this.warGuaranteeUsed = false;
    this.warMinShare = this.countries.map(({ id }) => this.getCountryShare(id));
  }

  setGameRegion(region: GameRegion) {
    this.gameRegion = region;
    this.directionTargetCache.clear();
  }

  setMicrostateRule(rule: MicrostateRule) { this.microstateRule = rule; }
  setPlayerCountry(id: number | null) {
    this.playerCountryId = id;
    this.strategicDefenseState = { posture: "continue", focusRegionId: null, mobilizedUntil: 0, mobilizationCooldownUntil: 0 };
  }

  isCountryPlayable(id: number) {
    const country = this.countries[id];
    return Boolean(country && (this.gameRegion === "world" || country.region === this.gameRegion));
  }

  canCountryAct(id: number) {
    const country = this.countries[id];
    if (!country || !this.isCountryPlayable(id)) return false;
    return this.microstateRule === "all" || country.initialWeight * this.km2PerWeight >= 10_000;
  }

  getActiveCountryCount() {
    const stats = this.stats();
    return this.countries.filter(({ id }) => stats[id].cells > 0 && this.canCountryAct(id)).length;
  }

  private buildStrategicRegions() {
    let provinceAt = new Int32Array(this.initialOwners.length);
    provinceAt.fill(-1);
    let regions: StrategicRegion[] = [];
    let runs: Array<Array<[number, number]>> = [];
    let neighbourSets: Array<Set<number>> = [];
    let sumsX: number[] = [], sumsY: number[] = [], weights: number[] = [];
    const byKey = new Map<string, number>();
    const ownersWithSubdivision = new Set<number>();
    const createRegion = (key: string, originalOwnerId: number, name: string) => {
      const known = byKey.get(key);
      if (known !== undefined) return known;
      const id = regions.length;
      byKey.set(key, id);
      regions.push({ id, name, originalOwnerId, ownerId: originalOwnerId, cells: 0, areaKm2: 0, cx: 0, cy: 0, neighbours: [], provinceCount: 1, provinceNames: name ? [name] : [], logisticsIndex: 50, maritimeAccess: 0, railDensity: 0.5, roadDensity: 0.5, airportCount: 0, portCount: 0, riverAccess: 0, fortification: 0 });
      runs.push([]); neighbourSets.push(new Set()); sumsX.push(0); sumsY.push(0); weights.push(0);
      return id;
    };

    const hasRealAdministrativeMap = this.admin1At.length === this.initialOwners.length;
    if (hasRealAdministrativeMap) {
      // Some states have one enormous first-level unit beside a handful of
      // tiny coastal ones, for example Sipaliwini in Suriname. Split only an
      // extreme outlier along its real Admin-1 shape before balancing sectors.
      // This keeps every generated sector inside the geographic boundary.
      const administrativeCounts = new Uint32Array(ADMIN1_ISO.length);
      const administrativeMinY = new Int32Array(ADMIN1_ISO.length), administrativeMaxY = new Int32Array(ADMIN1_ISO.length);
      administrativeMinY.fill(MAP_H); administrativeMaxY.fill(-1);
      const administrativeByOwner = new Map<number, number[]>();
      const listedAdministrative = new Uint8Array(ADMIN1_ISO.length);
      for (let index = 0; index < this.initialOwners.length; index++) {
        const ownerId = this.initialOwners[index], adminId = this.admin1At[index];
        if (ownerId < 0 || adminId < 0 || administrativeOwnerIso(adminId) !== this.countries[ownerId]?.iso) continue;
        administrativeCounts[adminId]++;
        const y = Math.floor(index / MAP_W);
        administrativeMinY[adminId] = Math.min(administrativeMinY[adminId], y);
        administrativeMaxY[adminId] = Math.max(administrativeMaxY[adminId], y);
        const list = administrativeByOwner.get(ownerId) ?? [];
        if (!listedAdministrative[adminId]) { listedAdministrative[adminId] = 1; list.push(adminId); administrativeByOwner.set(ownerId, list); }
      }
      const administrativeSlices = new Uint8Array(ADMIN1_ISO.length);
      administrativeSlices.fill(1);
      for (const [ownerId, adminIds] of administrativeByOwner) {
        // Countries with a rich, credible first-level division such as Brazil
        // retain it. This correction is for smaller sets distorted by one
        // administrative outlier, not a replacement for national geography.
        const countryCells = adminIds.reduce((sum, id) => sum + administrativeCounts[id], 0);
        // Large countries must keep their real province boundaries. In
        // particular, slicing Karakalpakstan created artificial horizontal
        // stripes across Uzbekistan. The balancing correction is reserved for
        // compact states whose atlas has a single extreme outlier.
        if (adminIds.length < 4 || adminIds.length > 15 || countryCells > 2_700 || this.countries[ownerId]?.iso === "UZ") continue;
        const ordered = adminIds.map((id) => administrativeCounts[id]).sort((a, b) => a - b);
        const median = ordered[Math.floor(ordered.length / 2)];
        const outlierThreshold = Math.max(140, median * 3);
        for (const adminId of adminIds) {
          if (administrativeCounts[adminId] < outlierThreshold * 2) continue;
          const verticalCells = administrativeMaxY[adminId] - administrativeMinY[adminId] + 1;
          administrativeSlices[adminId] = Math.max(1, Math.min(5, verticalCells, Math.ceil(administrativeCounts[adminId] / outlierThreshold)));
          if (administrativeSlices[adminId] > 1) ownersWithSubdivision.add(ownerId);
        }
      }
      const ownerHasAdmin = new Uint8Array(this.countries.length);
      for (let index = 0; index < this.initialOwners.length; index++) {
        const originalOwnerId = this.initialOwners[index], adminId = this.admin1At[index];
        if (originalOwnerId < 0 || adminId < 0 || administrativeOwnerIso(adminId) !== this.countries[originalOwnerId]?.iso) continue;
        const slices = administrativeSlices[adminId];
        const slice = slices > 1 ? Math.min(slices - 1, Math.floor((Math.floor(index / MAP_W) - administrativeMinY[adminId]) * slices / Math.max(1, administrativeMaxY[adminId] - administrativeMinY[adminId] + 1))) : 0;
        const name = slices > 1 ? `${ADMIN1_NAMES[adminId]}, część ${slice + 1}` : ADMIN1_NAMES[adminId];
        provinceAt[index] = createRegion(`adm1:${adminId}:${slice}`, originalOwnerId, name);
        ownerHasAdmin[originalOwnerId] = 1;
      }

      // Natural Earth Admin-1 and the country atlas use slightly different
      // coastlines. Grow each real province only through cells of its original
      // country so every coastal pixel joins the nearest proper province.
      const queue: number[] = [];
      const queued = new Uint8Array(this.initialOwners.length);
      for (let index = 0; index < provinceAt.length; index++) {
        if (provinceAt[index] < 0) continue;
        const owner = this.initialOwners[index], x = index % MAP_W, y = Math.floor(index / MAP_W);
        const neighbours = [y > 0 ? index - MAP_W : -1, y + 1 < MAP_H ? index + MAP_W : -1, y * MAP_W + wrapX(x - 1), y * MAP_W + wrapX(x + 1)];
        if (neighbours.some((next) => next >= 0 && this.initialOwners[next] === owner && provinceAt[next] < 0)) {
          queued[index] = 1; queue.push(index);
        }
      }
      for (let head = 0; head < queue.length; head++) {
        const index = queue[head], owner = this.initialOwners[index], regionId = provinceAt[index];
        const x = index % MAP_W, y = Math.floor(index / MAP_W);
        const neighbours = [y > 0 ? index - MAP_W : -1, y + 1 < MAP_H ? index + MAP_W : -1, y * MAP_W + wrapX(x - 1), y * MAP_W + wrapX(x + 1)];
        for (const next of neighbours) if (next >= 0 && this.initialOwners[next] === owner && provinceAt[next] < 0) {
          provinceAt[next] = regionId;
          if (!queued[next]) { queued[next] = 1; queue.push(next); }
        }
      }

      // Detached coastal cells and tiny islands can be disconnected from the
      // mainland by a one-pixel atlas discrepancy. Attach them to the nearest
      // real province of the same country instead of creating a 17th Polish
      // "remainder" region or similar slivers elsewhere.
      const seedX = new Float64Array(regions.length), seedY = new Float64Array(regions.length), seedCount = new Uint32Array(regions.length);
      const realByOwner = new Map<number, number[]>();
      for (const region of regions) {
        const list = realByOwner.get(region.originalOwnerId) ?? [];
        list.push(region.id); realByOwner.set(region.originalOwnerId, list);
      }
      for (let index = 0; index < provinceAt.length; index++) if (provinceAt[index] >= 0) {
        const regionId = provinceAt[index];
        seedX[regionId] += index % MAP_W;
        seedY[regionId] += Math.floor(index / MAP_W);
        seedCount[regionId]++;
      }
      for (let index = 0; index < provinceAt.length; index++) {
        const originalOwnerId = this.initialOwners[index];
        if (originalOwnerId < 0 || provinceAt[index] >= 0 || !ownerHasAdmin[originalOwnerId]) continue;
        const x = index % MAP_W, y = Math.floor(index / MAP_W);
        let bestRegion = -1, bestDistance = Infinity;
        for (const regionId of realByOwner.get(originalOwnerId) ?? []) {
          const cx = seedX[regionId] / Math.max(1, seedCount[regionId]);
          const cy = seedY[regionId] / Math.max(1, seedCount[regionId]);
          const dx = deltaX(cx, x), dy = cy - y, distance = dx * dx + dy * dy;
          if (distance < bestDistance) { bestDistance = distance; bestRegion = regionId; }
        }
        if (bestRegion >= 0) provinceAt[index] = bestRegion;
      }

      const fallbackByOwner = new Map<number, number>();
      for (let index = 0; index < provinceAt.length; index++) {
        const originalOwnerId = this.initialOwners[index];
        if (originalOwnerId < 0 || provinceAt[index] >= 0) continue;
        let regionId = fallbackByOwner.get(originalOwnerId);
        if (regionId === undefined) {
          const countryName = this.countries[originalOwnerId].name;
          regionId = createRegion(`fallback:${originalOwnerId}`, originalOwnerId, ownerHasAdmin[originalOwnerId] ? `${countryName} — pozostałe terytoria` : countryName);
          fallbackByOwner.set(originalOwnerId, regionId);
        }
        provinceAt[index] = regionId;
      }
    } else {
      // Keep the atlas silhouettes intact if Admin-1 data cannot be unpacked.
      // The former compatibility path overlaid an artificial rectangular grid,
      // which made real countries look procedurally generated. Connected land
      // components retain their true coastlines and borders instead.
      const queue = new Int32Array(this.initialOwners.length);
      let component = 0;
      for (let start = 0; start < this.initialOwners.length; start++) {
        const originalOwnerId = this.initialOwners[start];
        if (originalOwnerId < 0 || provinceAt[start] >= 0) continue;
        const regionId = createRegion(`${originalOwnerId}:component:${component++}`, originalOwnerId, "");
        let head = 0, tail = 0;
        queue[tail++] = start;
        provinceAt[start] = regionId;
        while (head < tail) {
          const index = queue[head++], x = index % MAP_W, y = Math.floor(index / MAP_W);
          const neighbours = [
            y > 0 ? index - MAP_W : -1,
            y + 1 < MAP_H ? index + MAP_W : -1,
            y * MAP_W + wrapX(x - 1),
            y * MAP_W + wrapX(x + 1),
          ];
          for (const next of neighbours) if (next >= 0 && this.initialOwners[next] === originalOwnerId && provinceAt[next] < 0) {
            provinceAt[next] = regionId;
            queue[tail++] = next;
          }
        }
      }
    }

    for (let y = 0; y < MAP_H; y++) {
      let runRegion = -2, runStart = y * MAP_W;
      for (let x = 0; x < MAP_W; x++) {
        const index = y * MAP_W + x, regionId = provinceAt[index];
        if (regionId >= 0) {
          const rowWeight = this.rowWeight[y];
          regions[regionId].cells++;
          regions[regionId].areaKm2 += rowWeight * this.km2PerWeight;
          sumsX[regionId] += x * rowWeight; sumsY[regionId] += y * rowWeight; weights[regionId] += rowWeight;
        }
        if (regionId !== runRegion) {
          if (runRegion >= 0) runs[runRegion].push([runStart, index - runStart]);
          runRegion = regionId; runStart = index;
        }
      }
      const rowEnd = (y + 1) * MAP_W;
      if (runRegion >= 0) runs[runRegion].push([runStart, rowEnd - runStart]);
    }
    for (let y = 0; y < MAP_H; y++) for (let x = 0; x < MAP_W; x++) {
      const index = y * MAP_W + x, region = provinceAt[index];
      if (region < 0) continue;
      const right = provinceAt[y * MAP_W + wrapX(x + 1)];
      const below = y + 1 < MAP_H ? provinceAt[index + MAP_W] : -1;
      if (right >= 0 && right !== region) { neighbourSets[region].add(right); neighbourSets[right].add(region); }
      if (below >= 0 && below !== region) { neighbourSets[region].add(below); neighbourSets[below].add(region); }
    }

    // Natural Earth is inconsistent in gameplay scale: Germany has 16 lands,
    // while Latvia has 119 municipalities and France 101 departments. Keep
    // every real border for display, but merge adjacent small administrative
    // units into a balanced number of strategic sectors.
    const administrativeAt = provinceAt.slice();
    if (hasRealAdministrativeMap) {
      for (const region of regions) {
        region.cx = sumsX[region.id] / Math.max(.001, weights[region.id]);
        region.cy = sumsY[region.id] / Math.max(.001, weights[region.id]);
      }
      type Cluster = { members: number[]; area: number; cells: number; weightedX: number; weightedY: number; neighbours: Set<number> };
      const sectorOfAdministrative = new Int32Array(regions.length);
      sectorOfAdministrative.fill(-1);
      const completed: Cluster[] = [];
      const byOwner = new Map<number, number[]>();
      for (const region of regions) {
        const list = byOwner.get(region.originalOwnerId) ?? [];
        list.push(region.id); byOwner.set(region.originalOwnerId, list);
      }
      for (const ids of byOwner.values()) {
        const totalArea = ids.reduce((sum, id) => sum + regions[id].areaKm2, 0);
        const suggested = Math.max(1, Math.min(24, Math.round(Math.sqrt(totalArea / 1_300))));
        const areas = ids.map((id) => regions[id].areaKm2).sort((a, b) => a - b);
        const medianArea = areas[Math.floor(areas.length / 2)] ?? 0;
        const hasExtremeOutlier = ownersWithSubdivision.has(regions[ids[0]]?.originalOwnerId ?? -1) && ids.length >= 4 && (areas[areas.length - 1] ?? 0) > Math.max(1, medianArea) * 4;
        // Countries whose source already contains a credible first-level set
        // (Brazil 27, Poland/Germany 16, Lithuania 10) keep every real unit.
        // Only pathological municipality/department layers are consolidated.
        // An extreme area outlier is also consolidated after subdivision, so
        // it cannot leave a state with one giant sector and tiny fragments.
        const target = hasExtremeOutlier
          ? Math.min(ids.length, Math.max(4, Math.min(8, Math.round(Math.sqrt(totalArea / 5_000)))))
          : ids.length <= 32 ? ids.length : suggested;
        const clusters = new Map<number, Cluster>();
        const protectedIslandIds = new Set(ids.filter((id) => {
          const region = regions[id], iso = this.countries[region.originalOwnerId]?.iso;
          return (iso === "SE" && region.name === "Gotland")
            || (iso === "EE" && (region.name === "Saaremaa" || region.name === "Hiiumaa"));
        }));
        for (const id of ids) clusters.set(id, {
          members: [id], area: regions[id].areaKm2, cells: regions[id].cells,
          weightedX: regions[id].cx * Math.max(1, regions[id].areaKm2),
          weightedY: regions[id].cy * Math.max(1, regions[id].areaKm2),
          neighbours: new Set([...neighbourSets[id]].filter((other) => regions[other]?.originalOwnerId === regions[id].originalOwnerId)),
        });
        while (clusters.size > target) {
          const ordered = [...clusters.entries()].filter(([id]) => !protectedIslandIds.has(id)).sort((a, b) => a[1].area - b[1].area || a[0] - b[0]);
          let merge: { fromId: number; toId: number } | null = null;
          for (const [fromId, from] of ordered) {
            const adjacent = [...from.neighbours].filter((id) => id !== fromId && clusters.has(id) && !protectedIslandIds.has(id));
            let toId = adjacent.sort((a, b) => (clusters.get(a)?.area ?? Infinity) - (clusters.get(b)?.area ?? Infinity) || a - b)[0];
            if (toId === undefined) {
              const fromArea = Math.max(1, from.area), fromX = from.weightedX / fromArea, fromY = from.weightedY / fromArea;
              let nearestDistance = Infinity;
              for (const [candidateId, candidate] of clusters) {
                if (candidateId === fromId || protectedIslandIds.has(candidateId)) continue;
                const candidateArea = Math.max(1, candidate.area);
                const distance = gridDistanceKm(fromX, fromY, candidate.weightedX / candidateArea, candidate.weightedY / candidateArea);
                if (distance <= STRATEGIC_NAVAL_RANGE_KM && distance < nearestDistance) { nearestDistance = distance; toId = candidateId; }
              }
            }
            if (toId !== undefined) { merge = { fromId, toId }; break; }
          }
          if (!merge) break; // remote islands remain independent sectors
          const from = clusters.get(merge.fromId) as Cluster, to = clusters.get(merge.toId) as Cluster;
          to.members.push(...from.members); to.area += from.area; to.cells += from.cells;
          to.weightedX += from.weightedX; to.weightedY += from.weightedY;
          for (const neighbour of from.neighbours) if (neighbour !== merge.toId && clusters.has(neighbour)) {
            to.neighbours.add(neighbour);
            const other = clusters.get(neighbour);
            other?.neighbours.delete(merge.fromId); other?.neighbours.add(merge.toId);
          }
          to.neighbours.delete(merge.fromId); to.neighbours.delete(merge.toId);
          clusters.delete(merge.fromId);
        }
        completed.push(...[...clusters.values()].sort((a, b) => Math.min(...a.members) - Math.min(...b.members)));
      }

      const sectorRegions: StrategicRegion[] = completed.map((cluster, id) => {
        const members = [...cluster.members].sort((a, b) => regions[b].areaKm2 - regions[a].areaKm2 || a - b);
        const largest = regions[members[0]], names = [...new Set(members.map((member) => regions[member].name).filter(Boolean))];
        for (const member of members) sectorOfAdministrative[member] = id;
        return {
          id, name: members.length === 1 ? largest.name : `${largest.name} i okolice`, originalOwnerId: largest.originalOwnerId,
          ownerId: largest.originalOwnerId, cells: cluster.cells, areaKm2: cluster.area,
          cx: cluster.weightedX / Math.max(1, cluster.area), cy: cluster.weightedY / Math.max(1, cluster.area), neighbours: [],
          provinceCount: members.length, provinceNames: names,
          logisticsIndex: 50, maritimeAccess: 0, railDensity: 0.5, roadDensity: 0.5, airportCount: 0, portCount: 0, riverAccess: 0, fortification: 0,
        };
      });
      const sectorAt = new Int32Array(provinceAt.length); sectorAt.fill(-1);
      for (let index = 0; index < provinceAt.length; index++) if (provinceAt[index] >= 0) sectorAt[index] = sectorOfAdministrative[provinceAt[index]];
      const sectorRuns: Array<Array<[number, number]>> = sectorRegions.map(() => []);
      const sectorNeighbours: Array<Set<number>> = sectorRegions.map(() => new Set());
      const sectorSumsX = sectorRegions.map(() => 0), sectorSumsY = sectorRegions.map(() => 0), sectorWeights = sectorRegions.map(() => 0);
      for (let y = 0; y < MAP_H; y++) {
        let runRegion = -2, runStart = y * MAP_W;
        for (let x = 0; x < MAP_W; x++) {
          const index = y * MAP_W + x, regionId = sectorAt[index];
          if (regionId >= 0) {
            const rowWeight = this.rowWeight[y];
            sectorSumsX[regionId] += x * rowWeight; sectorSumsY[regionId] += y * rowWeight; sectorWeights[regionId] += rowWeight;
          }
          if (regionId !== runRegion) {
            if (runRegion >= 0) sectorRuns[runRegion].push([runStart, index - runStart]);
            runRegion = regionId; runStart = index;
          }
        }
        const rowEnd = (y + 1) * MAP_W;
        if (runRegion >= 0) sectorRuns[runRegion].push([runStart, rowEnd - runStart]);
      }
      for (let y = 0; y < MAP_H; y++) for (let x = 0; x < MAP_W; x++) {
        const index = y * MAP_W + x, region = sectorAt[index];
        if (region < 0) continue;
        const right = sectorAt[y * MAP_W + wrapX(x + 1)], below = y + 1 < MAP_H ? sectorAt[index + MAP_W] : -1;
        if (right >= 0 && right !== region) { sectorNeighbours[region].add(right); sectorNeighbours[right].add(region); }
        if (below >= 0 && below !== region) { sectorNeighbours[region].add(below); sectorNeighbours[below].add(region); }
      }
      provinceAt = sectorAt; regions = sectorRegions; runs = sectorRuns; neighbourSets = sectorNeighbours;
      sumsX = sectorSumsX; sumsY = sectorSumsY; weights = sectorWeights;
    }

    // Regions separated by a short, unobstructed stretch of water are also
    // strategic neighbours. This makes routes such as Poland -> Sweden legal,
    // while the 500 km cap keeps Norway and other more distant coasts out of
    // Poland's initial target list. Sampled sea pixels keep this global pass
    // fast, and the final segment check rejects routes crossing land.
    type CoastSample = { id: number; regionId: number; x: number; y: number };
    const coastSamples: CoastSample[] = [];
    const coastBucketSize = 56;
    const coastBucketColumns = Math.ceil(MAP_W / coastBucketSize);
    const coastBucketRows = Math.ceil(MAP_H / coastBucketSize);
    const coastBuckets = new Map<number, CoastSample[]>();
    const addCoastSample = (regionId: number, x: number, y: number) => {
      const sample: CoastSample = { id: coastSamples.length, regionId, x, y };
      coastSamples.push(sample);
      const bx = Math.floor(x / coastBucketSize), by = Math.floor(y / coastBucketSize);
      const key = by * coastBucketColumns + bx;
      const bucket = coastBuckets.get(key) ?? [];
      bucket.push(sample); coastBuckets.set(key, bucket);
    };
    for (let y = 0; y < MAP_H; y++) for (let x = 0; x < MAP_W; x++) {
      const regionId = provinceAt[y * MAP_W + x];
      // One in sixteen coastal cells is enough at this map resolution; denser
      // sampling made a full-world strategic reset unnecessarily expensive.
      if (regionId < 0 || ((x * 17 + y * 31) & 15) !== 0) continue;
      for (const [ox, oy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
        const ny = y + oy;
        if (ny < 0 || ny >= MAP_H) continue;
        const nx = wrapX(x + ox);
        if (provinceAt[ny * MAP_W + nx] < 0) { addCoastSample(regionId, nx, ny); break; }
      }
    }
    const closestSeaCrossings = new Map<string, { first: CoastSample; second: CoastSample; distance: number }>();
    for (const first of coastSamples) {
      const bx = Math.floor(first.x / coastBucketSize), by = Math.floor(first.y / coastBucketSize);
      for (let oby = -1; oby <= 1; oby++) for (let obx = -1; obx <= 1; obx++) {
        const nearbyY = by + oby;
        if (nearbyY < 0 || nearbyY >= coastBucketRows) continue;
        const nearbyX = (bx + obx + coastBucketColumns) % coastBucketColumns;
        for (const second of coastBuckets.get(nearbyY * coastBucketColumns + nearbyX) ?? []) {
          if (second.id <= first.id || first.regionId === second.regionId) continue;
          const firstRegion = regions[first.regionId], secondRegion = regions[second.regionId];
          if (firstRegion.originalOwnerId === secondRegion.originalOwnerId) continue;
          const distance = gridDistanceKm(first.x, first.y, second.x, second.y);
          if (distance > STRATEGIC_NAVAL_RANGE_KM) continue;
          const lower = Math.min(first.regionId, second.regionId), upper = Math.max(first.regionId, second.regionId);
          const key = `${lower}:${upper}`, known = closestSeaCrossings.get(key);
          if (!known || distance < known.distance) closestSeaCrossings.set(key, { first, second, distance });
        }
      }
    }
    const waterBetween = (first: CoastSample, second: CoastSample) => {
      const dx = deltaX(second.x, first.x), dy = second.y - first.y;
      const steps = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy))));
      for (let step = 0; step <= steps; step++) {
        const x = wrapX(Math.round(first.x + dx * step / steps));
        const y = Math.max(0, Math.min(MAP_H - 1, Math.round(first.y + dy * step / steps)));
        if (provinceAt[y * MAP_W + x] >= 0) return false;
      }
      return true;
    };
    for (const { first, second } of closestSeaCrossings.values()) if (waterBetween(first, second)) {
      neighbourSets[first.regionId].add(second.regionId);
      neighbourSets[second.regionId].add(first.regionId);
    }
    const ownerOrder = new Map<number, StrategicRegion[]>();
    for (const region of regions) {
      region.cx = sumsX[region.id] / Math.max(.001, weights[region.id]);
      region.cy = sumsY[region.id] / Math.max(.001, weights[region.id]);
      const list = ownerOrder.get(region.originalOwnerId) ?? [];
      list.push(region); ownerOrder.set(region.originalOwnerId, list);
    }
    const locallyPlayable = (region: StrategicRegion) => {
      if (this.gameRegion === "world" || this.countries[region.originalOwnerId]?.region === this.gameRegion) return true;
      return this.gameRegion === "europe" && this.countries[region.originalOwnerId]?.iso === "RU"
        && (runs[region.id]?.some(([start, count]) => {
          const stride = Math.max(1, Math.floor(count / 4));
          for (let index = start; index < start + count; index += stride) if (isKaliningradIndex(index)) return true;
          return false;
        }) ?? false);
    };
    // A country made entirely of islands would otherwise have no legal move.
    // Give only such isolated countries one short naval route to the nearest
    // foreign province; the 1,600 km cap still prevents ocean-crossing attacks.
    for (const [ownerId, owned] of ownerOrder) {
      const playableOwned = owned.filter(locallyPlayable);
      if (!playableOwned.length) continue;
      const hasForeignFront = playableOwned.some((region) => [...neighbourSets[region.id]].some((id) => regions[id].originalOwnerId !== ownerId && locallyPlayable(regions[id])));
      if (hasForeignFront) continue;
      let best: { from: StrategicRegion; to: StrategicRegion; distance: number } | null = null;
      for (const from of playableOwned) for (const to of regions) {
        if (to.originalOwnerId === ownerId || !locallyPlayable(to)) continue;
        const distance = gridDistanceKm(from.cx, from.cy, to.cx, to.cy);
        if (distance <= 1_600 && (!best || distance < best.distance)) best = { from, to, distance };
      }
      if (best) { neighbourSets[best.from.id].add(best.to.id); neighbourSets[best.to.id].add(best.from.id); }
    }
    for (const region of regions) region.neighbours = [...neighbourSets[region.id]];
    for (const [ownerId, list] of ownerOrder) if (!hasRealAdministrativeMap) {
      list.sort((a, b) => a.cy - b.cy || a.cx - b.cx);
      list.forEach((region, index) => { region.name = `${this.countries[ownerId].name} — region ${index + 1}`; });
    }
    this.strategicProvinceAt = provinceAt;
    this.strategicAdministrativeAt = administrativeAt;
    this.strategicRegions = regions;
    for (const region of this.strategicRegions) {
      region.fortification = curatedFortificationBaseline(this.countries[region.originalOwnerId]?.iso ?? "", region.name, region.cx, region.cy).score;
    }
    this.strategicRegionRuns = runs;
    this.initializeStrategicCapitals();
    this.strategicCampaigns = [];
    this.strategicTerritoryLog = [];
    this.strategicOccupations = [];
    this.strategicBattleArtifacts = [];
    this.strategicWarHistory = [];
    this.strategicPendingCasualties = this.countries.map(() => 0);
    this.strategicExhaustion = this.countries.map(() => 0);
    this.strategicDefenseState = { posture: "continue", focusRegionId: null, mobilizedUntil: 0, mobilizationCooldownUntil: 0 };
    this.pendingCapitalRelocations.clear();
    this.nextCampaignId = 1;
    this.strategicBorderKey = "";
    this.strategicBorders = null;
    this.strategicAdministrativeBorders = null;
    this.strategicComponentCache.clear();
    this.strategicPowerCache.clear();
    this.computeRegionLogisticsFromMap();
  }

  private computeRegionLogisticsFromMap() {
    if (!this.strategicRegions.length) return;
    const coast = new Set<number>();
    for (let y = 0; y < MAP_H; y++) {
      for (let x = 0; x < MAP_W; x++) {
        const index = y * MAP_W + x;
        if (this.initialOwners[index] < 0) continue;
        const neighbours = [
          y > 0 ? index - MAP_W : -1,
          y + 1 < MAP_H ? index + MAP_W : -1,
          y * MAP_W + wrapX(x - 1),
          y * MAP_W + wrapX(x + 1),
        ];
        if (neighbours.some((n) => n >= 0 && this.initialOwners[n] < 0)) coast.add(this.strategicProvinceAt[index]);
      }
    }
    const airportsByRegion = new Uint16Array(this.strategicRegions.length);
    for (let point = 0; point + 1 < this.airports.length; point += 2) {
      const x = wrapX(Math.round(this.airports[point] / 100 * MAP_W / 360));
      const y = Math.max(0, Math.min(MAP_H - 1, Math.round(this.airports[point + 1] / 100 * MAP_H / 180)));
      const regionId = this.strategicProvinceAt[y * MAP_W + x];
      if (regionId >= 0) airportsByRegion[regionId]++;
    }
    const portsByRegion = new Uint16Array(this.strategicRegions.length);
    for (let point = 0; point + 1 < this.ports.length; point += 2) {
      const x = wrapX(Math.round(this.ports[point] / 100 * MAP_W / 360));
      const y = Math.max(0, Math.min(MAP_H - 1, Math.round(this.ports[point + 1] / 100 * MAP_H / 180)));
      const regionId = this.strategicProvinceAt[y * MAP_W + x];
      if (regionId >= 0) portsByRegion[regionId]++;
    }
    for (const region of this.strategicRegions) {
      const isCoastal = coast.has(region.id);
      const isLarge = region.areaKm2 > 20_000;
      region.portCount = portsByRegion[region.id];
      region.maritimeAccess = isCoastal ? Math.max(12, Math.min(100, region.portCount * 25)) : 0;
      // Nie mamy globalnego, licencjonowanego wykazu dróg per prowincja.
      // Zamiast udawać realne kilometry, modelujemy dostępność regionalną
      // na bazie krajowego LPI Banku Światowego, rozmiaru sektora oraz
      // rzeczywistych portów i lotnisk przypisanych współrzędnymi.
      const countryLogistics = this.strategicBaseline(region.originalOwnerId).logistics;
      const baselineAccess = Math.max(15, Math.min(92, 20 + countryLogistics * .72));
      const areaPenalty = Math.min(16, Math.max(0, Math.log10(Math.max(1, region.areaKm2 / 1_000)) * 5));
      const transportNodes = Math.min(16, airportsByRegion[region.id] * 4 + portsByRegion[region.id] * 3 + (isCoastal ? 3 : 0));
      region.roadDensity = Math.max(.12, Math.min(.96, (baselineAccess + transportNodes - areaPenalty) / 100));
      region.railDensity = Math.max(.10, Math.min(.95, (baselineAccess * .92 + airportsByRegion[region.id] * 3 - areaPenalty * .7 + (isLarge ? 2 : -2)) / 100));
      region.airportCount = airportsByRegion[region.id];
      region.riverAccess = 0;
      region.logisticsIndex = Math.max(0, Math.min(100,
        region.maritimeAccess * 0.30 +
        region.railDensity * 100 * 0.25 +
        region.roadDensity * 100 * 0.25 +
        (region.airportCount * 25) * 0.15 +
        region.riverAccess * 100 * 0.05
      ));
    }
  }

  getStrategicRegions() { return this.strategicRegions.map((region) => ({ ...region, neighbours: [...region.neighbours] })); }
  getStrategicCampaigns() { return structuredClone(this.strategicCampaigns); }
  getStrategicTerritoryLog() { return this.strategicTerritoryLog.map((event) => ({ ...event, provinceNames: [...event.provinceNames] })); }
  getStrategicOccupations() { return this.strategicOccupations.map((occupation) => ({ ...occupation })); }
  getStrategicBattleArtifacts() { return this.strategicBattleArtifacts.map((artifact) => ({ ...artifact })); }
  getStrategicWarHistory(countryId?: number) {
    return structuredClone(this.strategicWarHistory.filter((war) => countryId === undefined || war.attackerId === countryId || war.defenderId === countryId));
  }
  getStrategicLogisticsInvestments() { return this.strategicLogisticsInvestments.map((item) => ({ ...item })); }
  getStrategicExhaustion(countryId: number) { return this.strategicExhaustion[countryId] ?? 0; }
  getPlayerDefenseState() {
    return {
      ...this.strategicDefenseState,
      mobilizationActive: this.turn < this.strategicDefenseState.mobilizedUntil - 1,
      mobilizationReady: this.turn >= this.strategicDefenseState.mobilizationCooldownUntil,
      mobilizationRoundsLeft: Math.max(0, this.strategicDefenseState.mobilizedUntil - this.turn - 1),
      mobilizationCooldownLeft: Math.max(0, this.strategicDefenseState.mobilizationCooldownUntil - this.turn),
    };
  }
  setPlayerDefensePosture(posture: StrategicDefensePosture, focusRegionId: number | null = null) {
    if (this.playerCountryId === null || this.gameMode !== "strategy") return false;
    const threatened = this.strategicCampaigns.some(({ defenderId, regionId }) => defenderId === this.playerCountryId && regionId === focusRegionId);
    this.strategicDefenseState.posture = posture;
    this.strategicDefenseState.focusRegionId = posture === "sector" && threatened ? focusRegionId : null;
    return posture !== "sector" || threatened;
  }
  activatePlayerMobilization() {
    if (this.playerCountryId === null || this.gameMode !== "strategy" || this.turn < this.strategicDefenseState.mobilizationCooldownUntil) return false;
    if (!this.strategicCampaigns.some(({ defenderId }) => defenderId === this.playerCountryId)) return false;
    this.strategicDefenseState.mobilizedUntil = this.turn + 3;
    this.strategicDefenseState.mobilizationCooldownUntil = this.turn + 8;
    this.strategicExhaustion[this.playerCountryId] = Math.min(100, (this.strategicExhaustion[this.playerCountryId] ?? 0) + 12);
    const state = this.countryCapabilityStates[this.playerCountryId];
    if (state) state.manpower.mobilization = "open";
    this.strategicPowerCache.clear();
    return true;
  }

  getMobilizationMultiplier(countryId: number) {
    if (this.gameMode !== "strategy") return 1;
    const state = this.countryCapabilityStates[countryId];
    if (!state) return 1;
    const mobilization = state.manpower.mobilization;
    if (mobilization === "full") return 1.35;
    if (mobilization === "open") {
      if (countryId === this.playerCountryId && this.turn < this.strategicDefenseState.mobilizedUntil - 1) return 1.25;
      return 1.1;
    }
    return 1;
  }

  getCountryRegimeType(countryId: number) {
    const state = this.countryCapabilityStates[countryId];
    return state?.regimeType ?? "democracy";
  }

  getCountryInformationEnvironment(countryId: number) {
    const state = this.countryCapabilityStates[countryId];
    return state?.informationEnvironment ?? { score: 45, techComponent: 50, mediaControl: 30, servicesStrength: 35 };
  }

  getCountryCombatExperience(countryId: number) {
    const state = this.countryCapabilityStates[countryId];
    return state?.combatExperience ?? 0;
  }

  getCountryDemographics(countryId: number) {
    const state = this.countryCapabilityStates[countryId];
    return state?.demographics ?? { children: 0.18, youth: 0.12, primeAge: 0.34, middleAge: 0.22, elderly: 0.11, veryOld: 0.03 };
  }

  getCountryDemographicType(countryId: number) {
    const state = this.countryCapabilityStates[countryId];
    return state?.demographicType ?? "chimney";
  }

  getCountryPopulationAbsolute(countryId: number) {
    const state = this.countryCapabilityStates[countryId];
    return state?.populationAbsolute ?? 0;
  }

  getRegionPopulation(regionId: number): number {
    return this.regionalPopulation[regionId] ? populationTotal(this.regionalPopulation[regionId]) : 0;
  }

  private initializePopulationWeights() {
    this.initialPopulationWeights = new Float64Array(this.strategicRegions.length);
    if (this.populationGrid.length !== MAP_W * MAP_H) return;
    for (const region of this.strategicRegions) {
      let sum = 0;
      for (const [start, count] of this.strategicRegionRuns[region.id]) for (let i = start; i < start + count; i++) sum += this.populationGrid[i];
      this.initialPopulationWeights[region.id] = sum;
    }
  }

  getPopulationDistribution(countryId: number): "ghsl-2020" | "area" {
    if (this.populationDistribution === "area") return "area";
    // Zapis z danymi GHSL pozostaje wiarygodny również podczas awarii pobierania.
    if (!this.populationGrid.length) return "ghsl-2020";
    return this.strategicRegions.some((r) => r.ownerId === countryId && this.initialPopulationWeights[r.id] > 0) ? "ghsl-2020" : "area";
  }

  /** GHS-POP określa udziały regionów, suma kraju pochodzi z roku startowego gry. */
  private synchronizeRegionalPopulation(countryId?: number) {
    if (this.gameMode !== "strategy") return;
    if (this.regionalPopulation.length !== this.strategicRegions.length) this.regionalPopulation = this.strategicRegions.map(() => emptyAgeCounts());
    for (const country of this.countries) {
      if (countryId !== undefined && country.id !== countryId) continue;
      const state = this.countryCapabilityStates[country.id];
      if (!state) continue;
      const regions = this.strategicRegions.filter((r) => r.ownerId === country.id);
      if (!regions.length) continue;
      const target = ageCounts(state.populationAbsolute, state.demographics);
      const spatialWeights = regions.map((r) => this.initialPopulationWeights[r.id] ?? 0);
      const initialWeights = spatialWeights.some((n) => n > 0) ? spatialWeights : regions.map((r) => r.areaKm2);
      for (const group of AGE_GROUPS) {
        const previous = regions.map((r) => this.regionalPopulation[r.id][group]);
        const weights = previous.some((count) => count > 0) ? previous : initialWeights;
        const counts = allocatePeople(target[group], weights);
        regions.forEach((r, index) => { this.regionalPopulation[r.id][group] = counts[index]; });
      }
    }
    this.strategicComponentCache.clear();
    this.strategicPowerCache.clear();
  }

  private transferRegionalPopulation(regionId: number, from: number, to: number) {
    this.synchronizeRegionalPopulation(from);
    this.synchronizeRegionalPopulation(to);
    const moved = this.regionalPopulation[regionId];
    const people = populationTotal(moved);
    const source = this.countryCapabilityStates[from], target = this.countryCapabilityStates[to];
    for (const [state, sign] of [[source, -1], [target, 1]] as const) {
      const counts = ageCounts(state.populationAbsolute, state.demographics);
      for (const group of AGE_GROUPS) counts[group] += sign * moved[group];
      state.populationAbsolute = populationTotal(counts);
      state.demographics = pyramidFromCounts(counts, state.demographics);
      state.demographicType = demographicType(state.demographics);
      state.components.population = Math.max(0, Math.min(100, state.components.population + sign * people / 1_000_000));
      recordPopulationChange(state, sign > 0 ? "territoryIn" : "territoryOut", people);
    }
    // Mieszkańcy przyjęci wcześniej jako uchodźcy pozostają na zdobytym terenie.
    const fraction = people / Math.max(1, source.populationAbsolute + people);
    for (const group of ["women", "men", "children"] as const) {
      const count = Math.round(source.refugeeComposition[group] * fraction);
      source.refugeeComposition[group] -= count;
      target.refugeeComposition[group] += count;
      source.refugeesHosted -= count;
      target.refugeesHosted += count;
    }
    return people;
  }

  getCountryRefugeesHosted(countryId: number) {
    const state = this.countryCapabilityStates[countryId];
    return state?.refugeesHosted ?? 0;
  }

  getCountryRefugeeComposition(countryId: number) {
    return this.countryCapabilityStates[countryId]?.refugeeComposition ?? { women: 0, men: 0, children: 0 };
  }

  getCountryBorderPolicy(countryId: number) {
    const state = this.countryCapabilityStates[countryId];
    return state?.borderPolicy ?? "selective";
  }

  getCountryCulturalProximity(countryId: number) {
    const state = this.countryCapabilityStates[countryId];
    return state?.culturalProximity ?? {};
  }

  getCountryAssimilationProgress(countryId: number) {
    const state = this.countryCapabilityStates[countryId];
    return state?.assimilationProgress ?? 0;
  }

  getCountryLogisticsFromRegions(countryId: number) {
    const trade = this.getCountryMaritimeTrade(countryId);
    return Math.max(0, getCountryLogisticsFromRegions(this.strategicRegions, countryId) - trade.blockade * 18);
  }
  getCountryMaritimeTrade(countryId: number) {
    const coastal = this.strategicRegions.filter((region) => region.ownerId === countryId && region.portCount > 0);
    const ports = coastal.reduce((sum, region) => sum + region.portCount, 0);
    const blockadedPorts = coastal.filter((region) => this.strategicCampaigns.some((campaign) => campaign.defenderId === countryId && campaign.regionId === region.id)).reduce((sum, region) => sum + region.portCount, 0);
    const blockade = ports ? blockadedPorts / ports : 0;
    return { ports, blockadedPorts, blockade, access: Math.max(0, Math.round((1 - blockade) * Math.min(100, ports * 12))), status: !ports ? "Brak portów handlowych" : blockadedPorts ? `Blokada obejmuje ${blockadedPorts} portów` : "Szlaki morskie otwarte" };
  }
  getCountryLogisticsInvestments(countryId: number) {
    const state = this.countryCapabilityStates[countryId];
    return state?.logisticsInvestments ?? [];
  }

  getRegionLogistics(regionId: number) {
    const region = this.strategicRegions[regionId];
    return region ? evaluateRegionLogistics(region) : null;
  }

  getRegimeLabel(regimeType: RegimeType) {
    return regimeType === "totalitarian" ? "Totalitaryzm" : regimeType === "authoritarian" ? "Autorytaryzm" : "Demokracja";
  }

  getInformationEnvironmentLabel(score: number) {
    if (score >= 80) return "Pełna kontrola";
    if (score >= 65) return "Silna kontrola";
    if (score >= 50) return "Częściowa kontrola";
    if (score >= 35) return "Ograniczona kontrola";
    return "Wolne media";
  }

  getDemographicLabel(type: "healthy" | "chimney" | "inverted") {
    return type === "healthy" ? "Zdrowa piramida" : type === "inverted" ? "Odwrócona piramida" : "Kominek";
  }
  getMapRevision() { return this.visualRevision; }

  private vectorFill(countryId: number) {
    if (countryId < 0) return "#09222e";
    const [r, g, b] = this.countries[countryId]?.color ?? [80, 96, 92];
    const luminance = r * .2126 + g * .7152 + b * .0722;
    const channel = (value: number) => Math.round(Math.max(0, Math.min(255,
      (luminance + (value - luminance) * MAP_ROOM_SATURATION) * .82 + 21,
    )));
    return `rgb(${channel(r)} ${channel(g)} ${channel(b)})`;
  }

  getVectorMapCountries(): VectorMapCountry[] {
    return this.vectorPaths.map(({ countryId, path }) => ({ countryId, path, fill: this.vectorFill(countryId) }));
  }

  private updateVectorChangedPixels(indices?: Iterable<number>, rebuild = false) {
    if (rebuild) {
      this.vectorChangedPixels.fill(0);
      this.vectorChangedRows.fill(0);
      this.vectorHasChanges = false;
      for (let source = 0; source < this.owners.length; source++) {
        if (this.owners[source] === this.initialOwners[source]) continue;
        this.vectorChangedPixels[source] = 1;
        this.vectorChangedRows[Math.floor(source / MAP_W)] = 1;
        this.vectorHasChanges = true;
      }
    } else if (indices) {
      for (const source of indices) {
        if (source < 0 || source >= this.owners.length) continue;
        const changed = this.owners[source] !== this.initialOwners[source];
        this.vectorChangedPixels[source] = changed ? 1 : 0;
        if (changed) { this.vectorHasChanges = true; this.vectorChangedRows[Math.floor(source / MAP_W)] = 1; }
      }
    }
    this.vectorChangeLayerRevision = -1;
    this.vectorChangeLayers = [];
  }

  /** Draw only territory changed by the simulation over the detailed atlas.
   * Keeping the base atlas intact avoids exposing the coarse interaction canvas. */
  getVectorChangeLayers(): VectorMapChangeLayer[] {
    if (this.vectorChangeLayerRevision === this.visualRevision) return this.vectorChangeLayers;
    this.vectorChangeLayerRevision = this.visualRevision;
    if (!this.vectorHasChanges) { this.vectorChangeLayers = []; return this.vectorChangeLayers; }
    const ownerRuns = new Map<number, string[]>();
    for (let y = 0; y < VECTOR_MASK_H; y++) {
      if (!this.vectorChangedRows[y]) continue;
      const row = y * VECTOR_MASK_W;
      for (let x = 0; x < VECTOR_MASK_W;) {
        while (x < VECTOR_MASK_W && !this.vectorChangedPixels[row + x]) x++;
        if (x >= VECTOR_MASK_W) break;
        const start = x;
        const ownerId = this.owners[row + x];
        while (x < VECTOR_MASK_W && this.vectorChangedPixels[row + x] && this.owners[row + x] === ownerId) x++;
        const runs = ownerRuns.get(ownerId) ?? [];
        runs.push(`M${start} ${y}h${x - start}v1h-${x - start}z`);
        ownerRuns.set(ownerId, runs);
      }
    }
    this.vectorChangeLayers = [...ownerRuns].map(([ownerId, runs]) => ({ ownerId, path: runs.join(""), fill: this.vectorFill(ownerId) }));
    if (!this.vectorChangeLayers.length) { this.vectorHasChanges = false; this.vectorChangedRows.fill(0); }
    return this.vectorChangeLayers;
  }
  getPlayerDefensePolicy() {
    if (this.playerCountryId === null || this.gameMode !== "strategy") return null;
    const playerPower = this.strategicPower(this.playerCountryId);
    const strongestPower = Math.max(playerPower, ...this.countries.map(({ id }) => this.strategicPower(id)));
    const maxIncoming = playerPower >= strongestPower * .55 ? 2 : 1;
    const activeIncoming = this.strategicCampaigns.filter(({ defenderId, regionId }) =>
      defenderId === this.playerCountryId && this.strategicRegions[regionId]?.ownerId === this.playerCountryId,
    ).length;
    return { maxIncoming, activeIncoming, protectedRounds: Math.max(0, 2 - this.turn) };
  }
  getStrategicRegionAt(nx: number, ny: number) {
    if (!this.strategicProvinceAt.length) return null;
    const x = wrapX(Math.floor(nx * MAP_W)), y = Math.max(0, Math.min(MAP_H - 1, Math.floor(ny * MAP_H)));
    const id = this.strategicProvinceAt[y * MAP_W + x];
    return id < 0 ? null : this.strategicRegions[id] ?? null;
  }
  getStrategicRegionIndices(regionId: number) {
    const result: number[] = [];
    for (const [start, count] of this.strategicRegionRuns[regionId] ?? []) for (let index = start; index < start + count; index++) result.push(index);
    return result;
  }
  getStrategicTargets(countryId: number) {
    const targetIds = new Set<number>();
    for (const region of this.strategicRegions) if (region.ownerId === countryId) for (const neighbourId of region.neighbours) {
      const target = this.strategicRegions[neighbourId];
      if (target && target.ownerId !== countryId && this.isStrategicRegionPlayable(target)) targetIds.add(target.id);
    }
    return [...targetIds].map((id) => this.strategicRegions[id]).sort((a, b) => a.areaKm2 - b.areaKm2 || a.name.localeCompare(b.name));
  }

  private isStrategicRegionPlayable(region: StrategicRegion) {
    if (this.isCountryPlayable(region.originalOwnerId)) return true;
    if (this.gameRegion !== "europe" || this.countries[region.originalOwnerId]?.iso !== "RU") return false;
    return this.strategicRegionRuns[region.id]?.some(([start, count]) => {
      const stride = Math.max(1, Math.floor(count / 4));
      for (let index = start; index < start + count; index += stride) if (isKaliningradIndex(index)) return true;
      return false;
    }) ?? false;
  }

  private baselineValue(countryId: number) {
    const country = this.countries[countryId];
    return country?.iso3 ? STRATEGIC_BASELINES[country.iso3] : undefined;
  }

  private percentileScore(field: keyof StrategicBaseline, value: number | undefined) {
    if (!Number.isFinite(value)) return null;
    const values = this.countries.map(({ id }) => this.baselineValue(id)?.[field]).filter((item): item is number => Number.isFinite(item) && item! > 0).sort((a, b) => a - b);
    if (!values.length) return null;
    let rank = 0;
    while (rank < values.length && values[rank] <= value!) rank++;
    return 8 + rank / values.length * 92;
  }

  private strategicBaseline(countryId: number): StrategicComponents {
    const cached = this.strategicBaselineCache.get(countryId);
    if (cached) return cached;
    const data = this.baselineValue(countryId);
    const maxInitial = Math.max(1, ...this.countries.map(({ initialWeight }) => initialWeight));
    const areaFallback = 8 + Math.sqrt(Math.max(0, this.countries[countryId]?.initialWeight ?? 0) / maxInitial) * 72;
    const economy = this.percentileScore("gdpPpp", data?.gdpPpp) ?? areaFallback;
    const population = this.percentileScore("population", data?.population) ?? areaFallback;
    const technology = Number.isFinite(data?.technology) ? Math.max(5, Math.min(100, data!.technology!)) : Math.max(12, Math.min(85, 18 + economy * .55));
    const suppliedStability = Number.isFinite(data?.stability) ? Math.max(5, Math.min(95, data!.stability!)) : null;
    const logistics = Number.isFinite(data?.logistics) ? Math.max(8, Math.min(100, (data!.logistics! - 1) * 25)) : Math.max(12, Math.min(88, 27 + technology * .55));
    // Where a comparable governance series is unavailable, institutional
    // capacity is a transparent proxy from digital and logistics capacity.
    const stability = suppliedStability ?? Math.max(12, Math.min(92, 18 + technology * .42 + logistics * .32));
    const military = this.percentileScore("military", data?.military) ?? Math.max(10, economy * .4 + population * .35);
    const result = { economy, population, technology, logistics, military, stability };
    this.strategicBaselineCache.set(countryId, result);
    return result;
  }

  private strategicComponents(countryId: number): StrategicComponents {
    const cached = this.strategicComponentCache.get(countryId);
    if (cached) return cached;
    const baseline = this.currentStrategicResources(countryId);
    const originalAreas = new Float64Array(this.countries.length);
    // Keep the whole real country as the denominator even in a regional game.
    // Otherwise Kaliningrad would inherit 100% of Russia's national resources.
    for (const region of this.strategicRegions) originalAreas[region.originalOwnerId] += region.areaKm2;
    let economy = 0, population = 0, military = 0;
    for (const region of this.strategicRegions) {
      if (region.ownerId !== countryId || !this.isStrategicRegionPlayable(region)) continue;
      const source = this.currentStrategicResources(region.originalOwnerId);
      const share = region.areaKm2 / Math.max(1, originalAreas[region.originalOwnerId]);
      const occupation = region.originalOwnerId === countryId ? null : this.strategicOccupations.find((item) => item.regionId === region.id && item.ownerId === countryId);
      const occupationPolicy = occupation?.policy ?? "annexation";
      const resourceCeiling = STRATEGIC_OCCUPATION_POLICIES[occupationPolicy].resourceCeiling;
      const integration = region.originalOwnerId === countryId ? 1 : (occupation?.progress ?? 25) / 100 * resourceCeiling;
      economy += source.economy * share * (.15 + .85 * integration);
      const originalPopulation = initialCapabilityStates([this.countries[region.originalOwnerId]])[0].populationAbsolute;
      const regionalShare = this.regionalPopulation[region.id] ? this.getRegionPopulation(region.id) / Math.max(1, originalPopulation) : share;
      population += this.strategicBaseline(region.originalOwnerId).population * regionalShare * (.12 + .88 * integration);
      military += source.military * share * (region.originalOwnerId === countryId ? 1 : .05 + .45 * integration);
    }
    const result = { economy, population, military, technology: baseline.technology, logistics: baseline.logistics, stability: baseline.stability };
    this.strategicComponentCache.set(countryId, result);
    return result;
  }

  private strategicPower(countryId: number) {
    const cached = this.strategicPowerCache.get(countryId);
    if (cached !== undefined) return cached;
    const component = this.strategicComponents(countryId);
    const resources = component.economy * .34 + component.population * .19 + component.military * .24;
    const institutions = component.technology * .08 + component.logistics * .10 + component.stability * .05;
    const exhaustionFactor = 1 - Math.min(80, this.strategicExhaustion[countryId] ?? 0) * .0035;
    const result = Math.max(0, (resources + institutions) * exhaustionFactor);
    this.strategicPowerCache.set(countryId, result);
    return result;
  }

  private initialStrategicPolitics(): StrategicPoliticalState[] {
    return this.countries.map(({ id }) => {
      const baseline = this.strategicBaseline(id);
      return {
        countryId: id,
        legitimacy: clampStrategic(48 + baseline.stability * .32),
        reputation: clampStrategic(45 + baseline.stability * .28),
        warSupport: clampStrategic(38 + baseline.stability * .22 + baseline.military * .08),
      };
    });
  }

  getStrategicPoliticalState(countryId: number): StrategicPoliticalState {
    const state = this.strategicPolitics[countryId] ?? this.initialStrategicPolitics()[countryId] ?? { countryId, legitimacy: 50, reputation: 50, warSupport: 50 };
    return { ...state };
  }

  getStrategicRelation(firstId: number, secondId: number): StrategicRelation {
    if (firstId === secondId) return { firstId, secondId, trust: 100, tension: 0, warMemory: 0, lastChangedTurn: this.turn };
    const relation = this.strategicRelations.get(strategicRelationKey(firstId, secondId)) ?? defaultStrategicRelation(firstId, secondId);
    return { ...relation };
  }

  getStrategicResourceSecurity(countryId: number): StrategicResourceSecurity {
    const outgoing = this.strategicCampaigns.filter((campaign) => campaign.attackerId === countryId).length;
    const incoming = this.strategicCampaigns.filter((campaign) => campaign.defenderId === countryId).length;
    const occupations = this.strategicOccupations.filter((occupation) => occupation.ownerId === countryId && occupation.progress < 100).length;
    const effects = countryId === this.playerCountryId ? getActivePlayerPolicyEffects(this.playerPolicyState) : {};
    return deriveStrategicResourceSecurity(this.strategicComponents(countryId), { outgoing, incoming, occupations }, effects.resourceSecurity ?? {});
  }

  getStrategicObjectives(countryId: number): StrategicObjective[] {
    const strength = this.getStrategicStrength(countryId);
    const incoming = this.strategicCampaigns.filter((campaign) => campaign.defenderId === countryId).length;
    return strategicObjectives(this.turn, strength.rank, strength.activeCountries, strength.components, this.getStrategicResourceSecurity(countryId), incoming);
  }

  getPlayerPolicyPreview(policyId: PolicyDecisionId) {
    const policy = this.playerPolicyState.decisions[policyId];
    if (!policy || this.playerCountryId === null) return null;
    const state = this.countryCapabilityStates[this.playerCountryId];
    const perQuarter = Math.max(1, policy.duration);
    const value = (candidate: number | ((state: CountryCapabilityState) => number) | undefined) => typeof candidate === "function" ? candidate(state) : candidate ?? 0;
    const effects: string[] = [];
    const economy = value(policy.costs.economyDelta) / perQuarter;
    const stability = value(policy.costs.stabilityDelta) / perQuarter + (policy.effects.stabilityDelta ?? 0);
    if (economy) effects.push(`gospodarka ${economy > 0 ? "+" : ""}${economy.toFixed(1)}/kw.`);
    if (stability) effects.push(`instytucje ${stability > 0 ? "+" : ""}${stability.toFixed(1)}/kw.`);
    if (policy.effects.technology) effects.push(`technologia +${(policy.effects.technology / perQuarter).toFixed(1)}/kw.`);
    if (policy.effects.informationEnvironment?.mediaControl) effects.push(`kontrola mediów +${(policy.effects.informationEnvironment.mediaControl / perQuarter).toFixed(1)}/kw.`);
    if (policy.effects.informationEnvironment?.servicesStrength) effects.push(`siła służb +${(policy.effects.informationEnvironment.servicesStrength / perQuarter).toFixed(1)}/kw.`);
    if (policy.effects.manpower?.mobilization) effects.push(`mobilizacja: ${policy.effects.manpower.mobilization === "full" ? "pełna" : policy.effects.manpower.mobilization}`);
    if (policy.effects.immigrationPolicy) effects.push(`granice: ${policy.effects.immigrationPolicy === "closed" ? "zamknięte" : policy.effects.immigrationPolicy === "selective" ? "selektywne" : policy.effects.immigrationPolicy === "open" ? "otwarte" : "masowa migracja"}`);
    for (const [key, bonus] of Object.entries(policy.effects.resourceSecurity ?? {})) effects.push(`${key === "energy" ? "energia" : key === "industry" ? "przemysł" : key === "food" ? "żywność" : key} +${bonus}`);
    if (policy.id === "fortify-sector") effects.push("umocnienia wybranego sektora +25 natychmiast");
    if (policy.id === "modernize-roads") effects.push("drogi wybranego sektora +10 po 4 kw.");
    if (policy.id === "rail-upgrade") effects.push("kolej wybranego sektora +15 po 6 kw.");
    if (policy.id === "expand-airport") effects.push("1 lotnisko po 6 kw.");
    if (policy.id === "build-port") effects.push("1 port i dostęp morski +20 po 8 kw.");
    return { cost: policy.cost, duration: policy.duration, effects, summary: effects.length ? effects.join(" · ") : "Skutek opisany w decyzji; brak ukrytej zmiany wskaźników." };
  }

  private currentStrategicResources(countryId: number): StrategicComponents {
    const baseline = this.strategicBaseline(countryId);
    const state = this.countryCapabilityStates[countryId];
    if (!state) return baseline;
    const initial = initialCapabilityStates([this.countries[countryId]])[0];
    const result = { ...baseline };
    for (const key of ["economy", "technology", "logistics", "military", "stability"] as const) {
      result[key] = Math.max(0, Math.min(100, baseline[key] + state.components[key] - initial.components[key]));
    }
    result.population = Math.max(0, baseline.population * state.populationAbsolute / Math.max(1, initial.populationAbsolute));
    return result;
  }

  private integrationScore(countryId: number) {
    const occupied = this.strategicOccupations.filter(({ ownerId, progress }) => ownerId === countryId && progress < 100);
    return occupied.length ? occupied.reduce((sum, item) => sum + item.progress, 0) / occupied.length : 100;
  }

  getStrategicStrengths(): StrategicStrengthEntry[] {
    const powers = this.countries
      .filter(({ id }) => this.strategicRegions.some((region) => region.ownerId === id && this.isStrategicRegionPlayable(region)))
      .map(({ id }) => ({ id, power: this.strategicPower(id) }))
      .sort((a, b) => b.power - a.power || a.id - b.id);
    return powers.map(({ id, power }, rankIndex) => {
      // Ocena ma być bezwzględną skalą możliwości państwa. Wcześniej była
      // wyłącznie procentem wyniku lidera, przez co średni kraj mógł wyglądać
      // jak potęga tylko dlatego, że najsilniejszy uczestnik był niewiele lepszy.
      const rating = Math.max(0, Math.min(100, Math.round(power)));
      return { countryId: id, power, rating, rank: rankIndex + 1, activeCountries: powers.length, tier: rating >= 85 ? "Potęga" : rating >= 65 ? "Silne" : rating >= 40 ? "Średnie" : "Słabe", components: this.strategicComponents(id), exhaustion: this.strategicExhaustion[id] ?? 0, integration: this.integrationScore(id) };
    });
  }

  getStrategicStrength(countryId: number): StrategicStrength {
    const strengths = this.getStrategicStrengths();
    return strengths.find((entry) => entry.countryId === countryId)
      ?? { power: 0, rating: 0, rank: 0, activeCountries: strengths.length, tier: "Słabe", components: { economy: 0, population: 0, technology: 0, logistics: 0, military: 0, stability: 0 }, exhaustion: this.strategicExhaustion[countryId] ?? 0, integration: 100 };
  }

  getCountryCapabilityState(countryId: number) {
    const state = this.countryCapabilityStates[countryId];
    if (!state) return null;
    return {
      ...state,
      strength: this.getStrategicStrength(countryId),
    };
  }

  getCountryCapabilityChanges(countryId: number) {
    const state = this.countryCapabilityStates[countryId];
    if (!state) return [];
    const effective = this.getStrategicStrength(countryId).components;
    const start = this.strategicQuarterStart[countryId] ?? effective;
    const displayed = (n: number) => Math.max(0, Math.min(100, n));
    const componentKeys: Array<"economy" | "population" | "technology" | "logistics" | "military" | "stability"> = ["economy", "population", "technology", "logistics", "military", "stability"];
    const labels = { economy: "Gospodarka", population: "Ludność", technology: "Technologia", logistics: "Logistyka", military: "Wojsko", stability: "Instytucje" } as const;
    return componentKeys.map((key) => {
      const value = displayed(effective[key]);
      const delta = Math.round((value - displayed(start[key])) * 10) / 10;
      const visible = delta !== 0;
      return {
        key,
        label: labels[key],
        value: Math.round(value),
        delta: visible ? `${delta > 0 ? "+" : ""}${delta.toFixed(1)}` : "≈ 0",
        trend: delta > 0.02 ? "up" : delta < -0.02 ? "down" : "flat",
      };
    });
  }

  getCountryManpower(countryId: number) {
    const state = this.countryCapabilityStates[countryId];
    if (!state) return null;
    return state.manpower;
  }

  setCountryMobilization(countryId: number, mobilization: "hidden" | "open" | "full") {
    const state = this.countryCapabilityStates[countryId];
    if (!state || this.gameMode !== "strategy") return false;
    state.manpower.mobilization = mobilization;
    return true;
  }

  getPlayerMobilization() {
    if (this.playerCountryId === null) return null;
    return this.countryCapabilityStates[this.playerCountryId]?.manpower.mobilization ?? null;
  }

  private frontStrength(attackerId: number, defenderId: number, regionId: number | null = null): StrategicFrontStrength {
    const attackPower = this.strategicPower(attackerId), defensePower = this.strategicPower(defenderId);
    const attackerFronts = Math.max(1, this.strategicCampaigns.filter(({ attackerId: id, defenderId: enemy }) => id === attackerId || enemy === attackerId).length);
    const defenderFronts = Math.max(1, this.strategicCampaigns.filter(({ attackerId: enemy, defenderId: id }) => id === defenderId || enemy === defenderId).length);
    const attacker = this.strategicComponents(attackerId);
    const logistics = .82 + attacker.logistics / 550;
    const resourceReadiness = this.getStrategicResourceSecurity(attackerId).readiness;
    // Normal readiness does not rewrite the established combat balance.
    // Only a genuine supply crisis becomes a front-line penalty.
    const resourceFactor = resourceReadiness >= 35 ? 1 : .82 + resourceReadiness / 195;
    const political = this.getStrategicPoliticalState(attackerId);
    const politicalReadiness = Math.min(political.legitimacy, political.warSupport);
    const politicalFactor = politicalReadiness >= 35 ? 1 : .82 + politicalReadiness / 195;
    let homeDefense = 1.15;
    if (defenderId === this.playerCountryId) {
      if (this.strategicDefenseState.posture === "general") homeDefense *= 1.30;
      else if (this.strategicDefenseState.posture === "sector") homeDefense *= this.strategicDefenseState.focusRegionId === regionId ? 1.50 : .90;
      if (this.turn < this.strategicDefenseState.mobilizedUntil) homeDefense *= 1.25;
    }
    const attack = attackPower * logistics * resourceFactor * politicalFactor / (1 + (attackerFronts - 1) * .3);
    const defense = defensePower * homeDefense / (1 + (defenderFronts - 1) * .18);
    return { attack, defense, ratio: defense > 0 ? attack / defense : 10, attackExhaustion: this.strategicExhaustion[attackerId] ?? 0, defenseExhaustion: this.strategicExhaustion[defenderId] ?? 0, attackerFronts, defenderFronts, homeDefense, logistics, resourceReadiness };
  }

  getStrategicRegionResistance(regionId: number) {
    const sector = this.strategicRegions[regionId];
    if (!sector) return { factor: 1, label: "Nieznany" };
    const terrain = this.getStrategicRegionTerrain(regionId);
    const factor = Math.max(.7, Math.min(2.8, Math.sqrt(Math.max(2_500, sector.areaKm2) / 20_000) * (1 + Math.log2(Math.max(1, sector.provinceCount)) * .08) * terrain.defenseFactor * (1 + sector.fortification / 200)));
    return { factor, label: factor >= 2.15 ? "Bardzo wysoki" : factor >= 1.5 ? "Wysoki" : factor >= .95 ? "Standardowy" : "Niski" };
  }

  getStrategicRegionDefenseProfile(regionId: number) {
    const sector = this.strategicRegions[regionId];
    const terrain = this.getStrategicRegionTerrain(regionId);
    if (!sector) return { fortification: 0, fortificationLabel: "Brak danych", naturalObstacle: "Brak danych", attackerBrief: "Brak danych o sektorze." };
    const fortification = Math.round(sector.fortification);
    const baseline = curatedFortificationBaseline(this.countries[sector.originalOwnerId]?.iso ?? "", sector.name, sector.cx, sector.cy);
    const fortificationLabel = fortification >= 70 ? "Rozbudowane" : fortification >= 35 ? "Przygotowane" : fortification > 0 ? "Początkowe" : "Brak";
    const naturalObstacle = terrain.label === "Górzysty" ? "Strome podejścia i ograniczone osie natarcia" : terrain.label === "Pofałdowany" ? "Nierówny teren spowalnia marsz i rozpoznanie" : "Otwarty teren, łatwiejsze manewrowanie";
    const attackerBrief = fortification > 0
      ? `Atakujący musi przełamać ${fortificationLabel.toLowerCase()} umocnienia, a następnie utrzymać zaopatrzenie na obszarze ${Math.round(sector.areaKm2).toLocaleString("pl-PL")} km².`
      : `Atakujący musi utrzymać zaopatrzenie na obszarze ${Math.round(sector.areaKm2).toLocaleString("pl-PL")} km². Stałe umocnienia nie zostały tu jeszcze przygotowane.`;
    return { fortification, fortificationLabel, naturalObstacle, attackerBrief, source: baseline.score > 0 ? `${baseline.source}, a potem decyzje gracza.` : "Poziom wynika wyłącznie z decyzji gracza." };
  }

  getStrategicRegionTerrain(regionId: number) {
    const sector = this.strategicRegions[regionId];
    if (!sector || !this.strategicProvinceAt.length) return { label: "Nieznany", defenseFactor: 1, description: "Brak danych o rzeźbie terenu." };
    let slope = 0, pairs = 0;
    for (const [start, count] of this.strategicRegionRuns[regionId] ?? []) for (let index = start; index < start + count; index++) {
      const x = index % MAP_W, y = Math.floor(index / MAP_W);
      const right = y * MAP_W + wrapX(x + 1), down = y + 1 < MAP_H ? index + MAP_W : -1;
      for (const next of [right, down]) if (next >= 0 && this.strategicProvinceAt[next] === regionId) { slope += Math.abs(this.elevation[index] - this.elevation[next]); pairs++; }
    }
    const roughness = slope / Math.max(1, pairs);
    if (roughness >= 105) return { label: "Górzysty", defenseFactor: 1.13, description: "Strome i nierówne podejścia lekko sprzyjają obronie." };
    if (roughness >= 48) return { label: "Pofałdowany", defenseFactor: 1.05, description: "Urozmaicona rzeźba terenu lekko utrudnia szybki atak." };
    return { label: "Równinny", defenseFactor: .96, description: "Otwarty teren ułatwia przemieszczanie się obu stronom." };
  }

  getStrategicWarAssessment(attackerId: number, defenderId: number, regionId: number | null = null): StrategicWarAssessment {
    const front = this.frontStrength(attackerId, defenderId, regionId);
    const resistance = regionId === null ? 1 : Math.sqrt(this.getStrategicRegionResistance(regionId).factor);
    const ratio = front.ratio / resistance;
    const weighted = Math.pow(Math.max(.05, ratio), 1.45);
    const chance = Math.max(5, Math.min(95, Math.round(weighted / (1 + weighted) * 100)));
    if (chance >= 70) return { chance, ratio, level: "advantage", label: "Duża szansa zwycięstwa", front };
    if (chance >= 55) return { chance, ratio, level: "favorable", label: "Przewaga — atak ma sens", front };
    if (chance >= 45) return { chance, ratio, level: "even", label: "Wynik niepewny", front };
    if (chance >= 25) return { chance, ratio, level: "risky", label: "Małe szanse — atak odradzany", front };
    return { chance, ratio, level: "danger", label: "Znikome szanse — niemal pewna porażka", front };
  }

  getStrategicWarPreview(attackerId: number, defenderId: number, regionId: number | null, casusBelli: StrategicCasusBelliId): StrategicWarPreview {
    const assessment = this.getStrategicWarAssessment(attackerId, defenderId, regionId);
    const casus = STRATEGIC_CASUS_BELLI[casusBelli];
    const politicalBefore = this.getStrategicPoliticalState(attackerId);
    const politicalAfter = {
      ...politicalBefore,
      legitimacy: clampStrategic(politicalBefore.legitimacy + casus.legitimacyDelta),
      reputation: clampStrategic(politicalBefore.reputation + casus.reputationDelta),
      warSupport: clampStrategic(politicalBefore.warSupport + casus.warSupportDelta),
    };
    const relationBefore = this.getStrategicRelation(attackerId, defenderId);
    const relationAfter = applyWarDeclarationToRelation(relationBefore, casus, this.turn + 1);
    const signed = (value: number) => `${value > 0 ? "+" : ""}${value}`;
    return {
      ...assessment,
      casusBelli,
      politicalBefore,
      politicalAfter,
      relationBefore,
      relationAfter,
      resourceReadiness: assessment.front.resourceReadiness,
      consequences: [
        `legitymizacja ${signed(casus.legitimacyDelta)}`,
        `reputacja ${signed(casus.reputationDelta)}`,
        `poparcie wojny ${signed(casus.warSupportDelta)}`,
        `zaufanie do przeciwnika ${signed(casus.trustDelta)}`,
        `pamięć wojny +${casus.memoryDelta}`,
      ],
    };
  }

  getPlayerCampaignConflict(): StrategicCampaignConflict | null {
    if (this.playerCountryId === null) return null;
    const campaign = this.strategicCampaigns.find(({ attackerId }) => attackerId === this.playerCountryId);
    if (!campaign) return null;
    const currentDefenderId = this.strategicRegions[campaign.regionId]?.ownerId;
    return currentDefenderId !== undefined && currentDefenderId !== campaign.defenderId && currentDefenderId !== campaign.attackerId
      ? { campaign: { ...campaign }, currentDefenderId }
      : null;
  }

  resolvePlayerCampaignConflict(continueCampaign: boolean) {
    const conflict = this.getPlayerCampaignConflict();
    if (!conflict) return null;
    const campaign = this.strategicCampaigns.find(({ id }) => id === conflict.campaign.id);
    if (!campaign) return null;
    // Nowy właściciel to nowy przeciwnik. Nie przypisuj mu strat poprzedniego kraju.
    this.finishStrategicWar(campaign, "withdrawn", []);
    if (!continueCampaign) {
      this.strategicCampaigns = this.strategicCampaigns.filter(({ id }) => id !== campaign.id);
      return { continued: false, retainedProgress: 0, currentDefenderId: conflict.currentDefenderId, regionId: campaign.regionId };
    }
    campaign.defenderId = conflict.currentDefenderId;
    campaign.progress = Math.max(5, campaign.progress * .7);
    campaign.id = this.nextCampaignId++;
    campaign.turns = 0;
    campaign.stallTurns = 0;
    campaign.attackerCasualties = 0;
    campaign.defenderCasualties = 0;
    campaign.battles = 0;
    campaign.refugeesFled = 0;
    campaign.refugeesFledWomen = 0;
    campaign.refugeesFledMen = 0;
    campaign.refugeesFledChildren = 0;
    campaign.refugeeDestinations = [];
    campaign.territoryPopulation = 0;
    campaign.populationBefore = { attacker: census(this.countryCapabilityStates[campaign.attackerId]), defender: census(this.countryCapabilityStates[campaign.defenderId]) };
    campaign.populationBaselineTurn = this.turn;
    return { continued: true, retainedProgress: campaign.progress, currentDefenderId: conflict.currentDefenderId, regionId: campaign.regionId };
  }

  private beginStrategicCampaign(attackerId: number, regionId: number, casusBelli: StrategicCasusBelliId = "security-threat") {
    const region = this.strategicRegions[regionId];
    if (!region || region.ownerId === attackerId || !this.getStrategicTargets(attackerId).some(({ id }) => id === regionId)) return null;
    if (this.strategicCampaigns.some((campaign) => campaign.attackerId === attackerId)) return null;
    const campaign: StrategicCampaign = { id: this.nextCampaignId++, attackerId, defenderId: region.ownerId, regionId, progress: 6 + this.random() * 9, turns: 0, attackerCasualties: 0, defenderCasualties: 0, battles: 0, refugeesFled: 0, refugeesFledWomen: 0, refugeesFledMen: 0, refugeesFledChildren: 0, refugeeDestinations: [], casusBelli };
    this.strategicCampaigns.push(campaign);
    const casus = STRATEGIC_CASUS_BELLI[casusBelli];
    const politics = this.strategicPolitics[attackerId] ?? this.initialStrategicPolitics()[attackerId];
    this.strategicPolitics[attackerId] = {
      ...politics,
      legitimacy: clampStrategic(politics.legitimacy + casus.legitimacyDelta),
      reputation: clampStrategic(politics.reputation + casus.reputationDelta),
      warSupport: clampStrategic(politics.warSupport + casus.warSupportDelta),
    };
    const relation = applyWarDeclarationToRelation(this.getStrategicRelation(attackerId, region.ownerId), casus, this.turn);
    this.strategicRelations.set(strategicRelationKey(attackerId, region.ownerId), relation);
    campaign.populationBefore = { attacker: census(this.countryCapabilityStates[attackerId]), defender: census(this.countryCapabilityStates[region.ownerId]) };
    campaign.populationBaselineTurn = this.turn;
    return campaign;
  }

  private recordStrategicBattle(campaign: StrategicCampaign, momentum: number, front: StrategicFrontStrength) {
    const sector = this.strategicRegions[campaign.regionId];
    if (!sector) return;
    // A quarterly campaign represents repeated combat, artillery fire and
    // losses on the supply line, not one skirmish. Small sectors cost
    // thousands, while a prolonged fight for a very large sector can cost far
    // more. Values remain explicit model estimates in the report.
    const scale = Math.max(4_000, Math.min(200_000, 3_000 + sector.areaKm2 / 12));
    const available = (id: number) => Math.max(0, Math.floor(this.countryCapabilityStates[id].populationAbsolute - (this.strategicPendingCasualties[id] ?? 0)));
    const attackLosses = Math.min(available(campaign.attackerId), Math.round(scale * (.55 + Math.max(0, 1 / Math.max(.25, front.ratio) - .55) + Math.max(0, -momentum) * .035)));
    const defenseLosses = Math.min(available(campaign.defenderId), Math.round(scale * (.45 + Math.max(0, front.ratio - .65) * .55 + Math.max(0, momentum) * .03)));
    campaign.attackerCasualties = (campaign.attackerCasualties ?? 0) + attackLosses;
    campaign.defenderCasualties = (campaign.defenderCasualties ?? 0) + defenseLosses;
    this.applyStrategicCasualties(campaign.attackerId, attackLosses);
    this.applyStrategicCasualties(campaign.defenderId, defenseLosses);
    campaign.battles = (campaign.battles ?? 0) + 1;
    const intensity = Math.min(100, Math.round(35 + Math.abs(momentum) * 4 + (attackLosses + defenseLosses) / Math.max(1, scale) * 20));
    this.strategicBattleArtifacts = [...this.strategicBattleArtifacts, {
      id: campaign.id * 10_000 + campaign.battles,
      regionId: sector.id,
      turn: this.turn,
      attackerId: campaign.attackerId,
      defenderId: campaign.defenderId,
      x: sector.cx / MAP_W * 100,
      y: sector.cy / MAP_H * 100,
      intensity,
      kind: intensity >= 64 ? "burned" as const : "battle" as const,
    }].slice(-320);
  }

  private applyStrategicCasualties(countryId: number, casualties: number) {
    if (casualties <= 0) return;
    this.strategicPendingCasualties[countryId] = (this.strategicPendingCasualties[countryId] ?? 0) + casualties;
  }

  private settleStrategicCasualties() {
    for (let countryId = 0; countryId < this.strategicPendingCasualties.length; countryId++) {
      const casualties = this.strategicPendingCasualties[countryId] ?? 0;
      const state = this.countryCapabilityStates[countryId];
      if (!state || casualties <= 0) continue;
      const counts = ageCounts(state.populationAbsolute, state.demographics);
      const removed = removePeople(counts, casualties, { children: 0, youth: .2, primeAge: .6, middleAge: .2, elderly: 0, veryOld: 0 });
      const deaths = populationTotal(removed);
      for (const group of AGE_GROUPS) counts[group] -= removed[group];
      state.populationAbsolute = populationTotal(counts);
      state.demographics = pyramidFromCounts(counts, state.demographics);
      state.demographicType = demographicType(state.demographics);
      recordPopulationChange(state, "combatDeaths", deaths);
      state.components.population = Math.max(0, state.components.population - deaths / 1_000_000);
      state.manpower.available = Math.max(0, state.manpower.available - Math.max(1, Math.round(casualties / 8_000)));
      this.strategicPendingCasualties[countryId] = 0;
    }
    this.strategicComponentCache.clear();
    this.strategicPowerCache.clear();
  }

  private finishStrategicWar(campaign: StrategicCampaign, outcome: StrategicWarHistoryEntry["outcome"], completedWars: StrategicWarHistoryEntry[]) {
    this.settleStrategicCasualties();
    this.synchronizeRegionalPopulation();
    const war: StrategicWarHistoryEntry = {
      id: campaign.id,
      attackerId: campaign.attackerId,
      defenderId: campaign.defenderId,
      regionId: campaign.regionId,
      startedTurn: Math.max(1, this.turn - campaign.turns),
      endedTurn: this.turn,
      outcome,
      attackerCasualties: campaign.attackerCasualties ?? 0,
      defenderCasualties: campaign.defenderCasualties ?? 0,
      battles: campaign.battles ?? 0,
      refugeesFled: campaign.refugeesFled ?? 0,
      refugeesFledWomen: campaign.refugeesFledWomen ?? 0,
      refugeesFledMen: campaign.refugeesFledMen ?? 0,
      refugeesFledChildren: campaign.refugeesFledChildren ?? 0,
      refugeeDestinations: (campaign.refugeeDestinations ?? []).map((destination) => ({ ...destination })),
      populationBefore: campaign.populationBefore ? structuredClone(campaign.populationBefore) : undefined,
      populationAfter: { attacker: census(this.countryCapabilityStates[campaign.attackerId]), defender: census(this.countryCapabilityStates[campaign.defenderId]) },
      populationBaselineTurn: campaign.populationBaselineTurn,
      territoryPopulation: campaign.territoryPopulation ?? 0,
    };
    this.strategicWarHistory = [...this.strategicWarHistory, war].slice(-1_000);
    completedWars.push(war);
  }

  private strategicRecord(countryId: number, text: string, targetId: number | null, changedKm2 = 0, eliminated: string | null = null): TurnRecord {
    const country = this.countries[countryId], target = targetId === null ? null : this.countries[targetId];
    return { turn: this.turn, countryId, countryName: country.name, countryFlag: country.flag, action: "war", direction: "Front regionalny", directionShort: "REG", size: "medium", fraction: 0, targetId, targetName: target?.name ?? null, targetFlag: target?.flag ?? null, changedKm2, actualFraction: 0, partial: false, eliminated, text };
  }

  private captureStrategicRegion(campaign: StrategicCampaign, changed: number[], completedWars: StrategicWarHistoryEntry[]) {
    const region = this.strategicRegions[campaign.regionId], oldOwner = region.ownerId;
    this.settleStrategicCasualties();
    campaign.territoryPopulation = this.transferRegionalPopulation(region.id, oldOwner, campaign.attackerId);
    for (const [start, count] of this.strategicRegionRuns[region.id] ?? []) for (let index = start; index < start + count; index++) {
      if (this.owners[index] !== oldOwner) continue;
      this.owners[index] = campaign.attackerId; changed.push(index);
    }
    region.ownerId = campaign.attackerId;
    this.strategicOccupations = this.strategicOccupations.filter(({ regionId }) => regionId !== region.id);
    if (region.originalOwnerId !== campaign.attackerId) this.strategicOccupations.push({ regionId: region.id, ownerId: campaign.attackerId, previousOwnerId: oldOwner, progress: 0, startedTurn: this.turn, lastGain: 0, policy: "annexation", casusBelli: campaign.casusBelli ?? "security-threat" });
    this.strategicComponentCache.clear(); this.strategicPowerCache.clear();
    this.strategicTerritoryLog = [...this.strategicTerritoryLog, {
      turn: this.turn, sectorId: region.id, sectorName: region.name, provinceNames: [...region.provinceNames],
      fromOwnerId: oldOwner, fromOwnerName: this.countries[oldOwner].name,
      toOwnerId: campaign.attackerId, toOwnerName: this.countries[campaign.attackerId].name,
      areaKm2: region.areaKm2,
    }].slice(-10_000);
    this.visualRevision++;
    const defenderEliminated = !this.strategicRegions.some((item) => item.ownerId === oldOwner && this.isStrategicRegionPlayable(item));
    if (defenderEliminated) this.defeats[campaign.attackerId]++;
    this.finishStrategicWar(campaign, "captured", completedWars);
    return this.strategicRecord(campaign.attackerId, `${this.countries[campaign.attackerId].name} zdobywa sektor „${region.name}” (${region.provinceCount} ${region.provinceCount === 1 ? "prowincja" : "prowincji"}) należący do ${this.countries[oldOwner].name}. Rozpoczyna się okupacja i asymilacja.`, oldOwner, region.areaKm2, defenderEliminated ? this.countries[oldOwner].name : null);
  }

  private advanceStrategicCampaign(campaign: StrategicCampaign, changed: number[], completedWars: StrategicWarHistoryEntry[] = []) {
    const sector = this.strategicRegions[campaign.regionId];
    const playerRedeploying = campaign.attackerId === this.playerCountryId
      && this.strategicDefenseState.posture !== "continue"
      && this.strategicCampaigns.some(({ defenderId }) => defenderId === this.playerCountryId);
    if (playerRedeploying) {
      campaign.progress = Math.max(0, campaign.progress - 2);
      campaign.stallTurns = 0;
      campaign.lastMomentum = -2;
      campaign.lastRandomFactor = 1;
      campaign.turns++;
      if (campaign.progress <= 0) {
        this.finishStrategicWar(campaign, "withdrawn", completedWars);
        return this.strategicRecord(campaign.attackerId, `Ofensywa o „${sector.name}” została wycofana, ponieważ wszystkie siły przerzucono do obrony kraju. Sektor pozostaje pod kontrolą państwa ${this.countries[campaign.defenderId].name}.`, campaign.defenderId);
      }
      return this.strategicRecord(campaign.attackerId, `Ofensywa o „${sector.name}” została wstrzymana, ponieważ wojska przerzucono do obrony kraju. Postęp spada do ${Math.round(campaign.progress)}%.`, campaign.defenderId);
    }
    const front = this.frontStrength(campaign.attackerId, campaign.defenderId, campaign.regionId);
    // A real large state is not conquered in the same number of quarters as a
    // tiny province. Area and administrative complexity create resistance,
    // while the bounded operational roll keeps each front uncertain.
    const resistance = this.getStrategicRegionResistance(campaign.regionId).factor;
    const randomFactor = .78 + this.random() * .44;
    const balance = Math.max(-18, Math.min(18, Math.log2(Math.max(.03, front.ratio)) * 14));
    const momentum = (7 + balance + (randomFactor - 1) * 36) / resistance;
    campaign.lastMomentum = momentum;
    campaign.lastRandomFactor = randomFactor;
    this.recordStrategicBattle(campaign, momentum, front);
    campaign.progress = Math.max(0, Math.min(100, campaign.progress + momentum));
    campaign.turns++;
    if (campaign.progress >= 100) return this.captureStrategicRegion(campaign, changed, completedWars);
    if (campaign.progress <= 0) {
      this.finishStrategicWar(campaign, "repelled", completedWars);
      return this.strategicRecord(campaign.attackerId, `Ofensywa państwa ${this.countries[campaign.attackerId].name} o „${this.strategicRegions[campaign.regionId].name}” załamuje się. Sektor pozostaje pod kontrolą państwa ${this.countries[campaign.defenderId].name}.`, campaign.defenderId);
    }
    campaign.stallTurns = Math.abs(momentum) < 1 ? (campaign.stallTurns ?? 0) + 1 : 0;
    if (campaign.stallTurns >= 4) {
      campaign.progress = 0;
      this.finishStrategicWar(campaign, "stalemate", completedWars);
      return this.strategicRecord(campaign.attackerId, `Front o „${sector.name}” wygasa po długim impasie. ${this.countries[campaign.defenderId].name} utrzymuje sektor, a ${this.countries[campaign.attackerId].name} wycofuje siły.`, campaign.defenderId);
    }
    const movement = momentum < -1 ? `front cofa się do ${Math.round(campaign.progress)}%` : Math.abs(momentum) <= 1 ? `front stoi w miejscu na ${Math.round(campaign.progress)}%` : `postęp ${Math.round(campaign.progress)}%`;
    const fortune = randomFactor >= 1.1 ? "sprzyjający przebieg działań" : randomFactor <= .9 ? "niekorzystny przebieg działań" : "typowy przebieg działań";
    return this.strategicRecord(campaign.attackerId, `${this.countries[campaign.attackerId].name} prowadzi ofensywę o „${this.strategicRegions[campaign.regionId].name}” — ${movement}; ${fortune}.`, campaign.defenderId);
  }

  private advanceStrategicOccupations(records: TurnRecord[]) {
    const activeByOwner = new Map<number, StrategicOccupation[]>();
    for (const occupation of this.strategicOccupations) {
      const region = this.strategicRegions[occupation.regionId];
      if (!region || region.ownerId !== occupation.ownerId || occupation.progress >= 100) continue;
      const list = activeByOwner.get(occupation.ownerId) ?? [];
      list.push(occupation); activeByOwner.set(occupation.ownerId, list);
    }
    for (const [ownerId, occupations] of activeByOwner) {
      const baseline = this.strategicBaseline(ownerId);
      const overload = 1 + (occupations.length - 1) * .55;
      for (const occupation of occupations) {
        const region = this.strategicRegions[occupation.regionId];
        const size = Math.max(.5, Math.min(1.25, Math.sqrt(18_000 / Math.max(3_000, region.areaKm2))));
        const institutions = .72 + (baseline.logistics + baseline.stability) / 360;
        const policy = STRATEGIC_OCCUPATION_POLICIES[occupation.policy ?? "annexation"];
        const casus = STRATEGIC_CASUS_BELLI[occupation.casusBelli ?? "security-threat"];
        const gain = Math.max(1.2, 10 * size * institutions / overload * policy.integrationRate * casus.occupationFactor);
        occupation.lastGain = Math.min(gain, 100 - occupation.progress);
        occupation.progress = Math.min(100, occupation.progress + occupation.lastGain);
        const politics = this.strategicPolitics[ownerId];
        if (politics) politics.reputation = clampStrategic(politics.reputation + policy.reputationPerTurn);
        if (occupation.progress >= 100) records.push(this.strategicRecord(ownerId, `${this.countries[ownerId].name} kończy asymilację regionu „${region.name}”. Jego zasoby są odtąd w pełni dostępne.`, occupation.previousOwnerId));
      }
    }
    this.strategicComponentCache.clear(); this.strategicPowerCache.clear();
  }

  setStrategicOccupationPolicy(regionId: number, policy: StrategicOccupationPolicyChoice) {
    if (this.gameMode !== "strategy" || this.playerCountryId === null) return false;
    const occupation = this.strategicOccupations.find((item) => item.regionId === regionId && item.ownerId === this.playerCountryId && item.progress < 100);
    const region = this.strategicRegions[regionId];
    if (!occupation || !region || region.ownerId !== this.playerCountryId) return false;
    if (policy === "withdrawal") {
      const returningOwner = occupation.previousOwnerId;
      for (const [start, count] of this.strategicRegionRuns[regionId] ?? []) this.owners.fill(returningOwner, start, start + count);
      region.ownerId = returningOwner;
      this.strategicOccupations = this.strategicOccupations.filter((item) => item !== occupation);
      const politics = this.strategicPolitics[this.playerCountryId];
      if (politics) {
        politics.reputation = clampStrategic(politics.reputation + 6);
        politics.legitimacy = clampStrategic(politics.legitimacy + 2);
      }
      this.strategicTerritoryLog = [...this.strategicTerritoryLog, {
        turn: Math.max(1, this.turn), sectorId: region.id, sectorName: region.name, provinceNames: [...region.provinceNames],
        fromOwnerId: this.playerCountryId, fromOwnerName: this.countries[this.playerCountryId].name,
        toOwnerId: returningOwner, toOwnerName: this.countries[returningOwner].name, areaKm2: region.areaKm2,
      }].slice(-10_000);
      this.visualRevision++;
    } else occupation.policy = policy;
    this.strategicComponentCache.clear();
    this.strategicPowerCache.clear();
    this.updateStrategicCapitals();
    return true;
  }

  private advanceStrategicDiplomacy() {
    for (const [key, relation] of this.strategicRelations) {
      const atWar = this.strategicCampaigns.some((campaign) => strategicRelationKey(campaign.attackerId, campaign.defenderId) === key);
      this.strategicRelations.set(key, advanceStrategicRelation(relation, atWar));
    }
    for (const politics of this.strategicPolitics) {
      if (!politics) continue;
      const outgoing = this.strategicCampaigns.filter((campaign) => campaign.attackerId === politics.countryId).length;
      const incoming = this.strategicCampaigns.filter((campaign) => campaign.defenderId === politics.countryId).length;
      politics.warSupport = clampStrategic(politics.warSupport + (outgoing || incoming ? -1.1 - outgoing * .35 : .8));
      politics.legitimacy = clampStrategic(politics.legitimacy + (outgoing ? -.25 : .35));
      politics.reputation = clampStrategic(politics.reputation + (outgoing ? -.15 : .28));
    }
  }

  private advanceStrategicExhaustion() {
    const outgoing = new Uint8Array(this.countries.length), incoming = new Uint8Array(this.countries.length);
    for (const campaign of this.strategicCampaigns) { outgoing[campaign.attackerId]++; incoming[campaign.defenderId]++; }
    for (const country of this.countries) {
      const fronts = outgoing[country.id] + incoming[country.id];
      const current = this.strategicExhaustion[country.id] ?? 0;
      const defensiveEffort = country.id === this.playerCountryId && incoming[country.id] > 0
        ? this.strategicDefenseState.posture === "sector" ? 3 : this.strategicDefenseState.posture === "general" ? 2 : 0
        : 0;
      this.strategicExhaustion[country.id] = fronts ? Math.min(100, current + outgoing[country.id] * 3.2 + incoming[country.id] * 2.2 + Math.max(0, fronts - 1) * 1.5 + defensiveEffort) : Math.max(0, current - 2.5);
    }
    this.strategicPowerCache.clear();
  }

  advanceStrategicRound(playerTargetRegionId: number | null = null, playerCasusBelli: StrategicCasusBelliId = "security-threat"): StrategicRoundResult {
    if (this.gameMode !== "strategy") return { records: [], changedIndices: [], completedWars: [] };
    this.strategicQuarterStart = this.countries.map(({ id }) => ({ ...this.strategicComponents(id) }));
    this.turn++;
    // Również ostatni kwartał kampanii ma odpływ uchodźców, przed zmianą granic.
    for (const campaign of this.strategicCampaigns) if (!campaign.populationBefore) {
      campaign.populationBefore = { attacker: census(this.countryCapabilityStates[campaign.attackerId]), defender: census(this.countryCapabilityStates[campaign.defenderId]) };
      campaign.populationBaselineTurn = this.turn;
    }
    this.distributeStrategicRefugees();
    this.synchronizeRegionalPopulation();
    const records: TurnRecord[] = [], changedIndices: number[] = [], completedWars: StrategicWarHistoryEntry[] = [];
    this.advanceStrategicOccupations(records);
    this.advanceStrategicExhaustion();
    this.advanceStrategicDiplomacy();
    const stats = this.stats();
    const actors = this.countries.filter(({ id }) => stats[id].cells > 0 && this.canCountryAct(id));
    for (const actor of actors) {
      if (!this.strategicRegions.some((region) => region.ownerId === actor.id && this.isStrategicRegionPlayable(region))) continue;
      let campaign = this.strategicCampaigns.find((item) => item.attackerId === actor.id);
      if (campaign && this.strategicRegions[campaign.regionId]?.ownerId !== campaign.defenderId) campaign = undefined;
      if (!campaign) {
        let targets = this.getStrategicTargets(actor.id);
        if (!targets.length) continue;
        let target: StrategicRegion | undefined;
        if (actor.id === this.playerCountryId) target = targets.find(({ id }) => id === playerTargetRegionId);
        else {
          if (this.turn <= 2) continue;
          // The opening diplomatic window prevents a dog-pile before the
          // player has made a meaningful decision. Afterwards a weak state
          // can face one foreign front and a major power at most two.
          if (this.playerCountryId !== null) {
            const policy = this.getPlayerDefensePolicy();
            if ((policy?.activeIncoming ?? 0) >= (policy?.maxIncoming ?? 1)) {
              targets = targets.filter(({ ownerId }) => ownerId !== this.playerCountryId);
            }
          }
          if (!targets.length) continue;
          // AI favours smaller border regions and weaker owners, with a little
          // seeded unpredictability. A separate pressure roll prevents a large
          // player country such as Ukraine from becoming effectively immune
          // merely because every neighbour always attacks the weakest target.
          const playerTargets = this.playerCountryId === null ? [] : targets.filter(({ ownerId }) => ownerId === this.playerCountryId);
          if (playerTargets.length && this.random() < .10) {
            target = playerTargets[Math.floor(this.random() * playerTargets.length)];
          } else {
            if (this.random() > .38) continue;
            let bestScore = Infinity;
            for (const candidate of targets) {
              const relation = this.getStrategicRelation(actor.id, candidate.ownerId);
              const reputation = this.getStrategicPoliticalState(candidate.ownerId).reputation;
              const diplomaticFriction = relation.trust * .22 + reputation * .08 - relation.tension * .28 - relation.warMemory * .12;
              const score = candidate.areaKm2 * .00001 + this.strategicPower(candidate.ownerId) * 2 + diplomaticFriction + this.random() * 4;
              if (score < bestScore) { bestScore = score; target = candidate; }
            }
          }
        }
        if (target) {
          const casus = actor.id === this.playerCountryId ? playerCasusBelli : (this.random() < .72 ? "security-threat" : "territorial-claim");
          campaign = this.beginStrategicCampaign(actor.id, target.id, casus) ?? undefined;
          if (campaign) records.push(this.strategicRecord(actor.id, `${actor.name} rozpoczyna kampanię o „${target.name}” przeciwko ${this.countries[target.ownerId].name}. Uzasadnienie: ${STRATEGIC_CASUS_BELLI[casus].name}.`, target.ownerId));
        }
      } else records.push(this.advanceStrategicCampaign(campaign, changedIndices, completedWars));
    }
    this.strategicCampaigns = this.strategicCampaigns.filter((campaign) => {
      if (campaign.progress <= 0 || campaign.progress >= 100) return false;
      const ownerId = this.strategicRegions[campaign.regionId]?.ownerId;
      const attackerExists = this.strategicRegions.some((r) => r.ownerId === campaign.attackerId && this.isStrategicRegionPlayable(r));
      if (attackerExists && (ownerId === campaign.defenderId || campaign.attackerId === this.playerCountryId && ownerId !== campaign.attackerId)) return true;
      this.finishStrategicWar(campaign, "withdrawn", completedWars);
      return false;
    });
    this.updateStrategicCapitals();
    this.settleStrategicCasualties();
    this.advanceCapabilityStates();
    this.synchronizeRegionalPopulation();
    for (const war of completedWars) war.populationAfter = { attacker: census(this.countryCapabilityStates[war.attackerId]), defender: census(this.countryCapabilityStates[war.defenderId]) };
    if (this.playerCountryId !== null) {
      const incoming = this.strategicCampaigns.filter(({ defenderId, regionId }) => defenderId === this.playerCountryId && this.strategicRegions[regionId]?.ownerId === this.playerCountryId);
      if (!incoming.length) {
        this.strategicDefenseState.posture = "continue";
        this.strategicDefenseState.focusRegionId = null;
      } else if (this.strategicDefenseState.posture === "sector" && !incoming.some(({ regionId }) => regionId === this.strategicDefenseState.focusRegionId)) {
        this.strategicDefenseState.focusRegionId = incoming[0].regionId;
      }
    }
    this.history = [...this.history, ...records].slice(-120);
    return { records, changedIndices, completedWars };
  }

  private activeCampaignContext(countryId: number) {
    let outgoing = 0, incoming = 0, activeOccupations = 0;
    for (const campaign of this.strategicCampaigns) {
      if (campaign.attackerId === countryId) outgoing++;
      if (campaign.defenderId === countryId) incoming++;
    }
    for (const occupation of this.strategicOccupations) if (occupation.ownerId === countryId && occupation.progress < 100) activeOccupations++;
    return {
      hasOutgoing: outgoing > 0,
      hasIncoming: incoming > 0,
      activeOccupations,
      areaShare: 1,
      foreignBasePressure: this.foreignBasePressure(countryId),
      regions: this.strategicRegions,
      countryId,
    };
  }

  private foreignBasePressure(countryId: number): number {
    const neighbours = new Set<number>();
    for (const region of this.strategicRegions) {
      if (region.ownerId === countryId) {
        for (const neighbourId of region.neighbours) neighbours.add(neighbourId);
      }
    }
    if (!neighbours.size) return 0;
    let pressure = 0;
    for (const neighbourId of neighbours) {
      const neighbourState = this.countryCapabilityStates[neighbourId];
      if (!neighbourState) continue;
      const hasCampaign = this.strategicCampaigns.some((c) => c.attackerId === neighbourId || c.defenderId === neighbourId);
      if (hasCampaign) pressure += 0.3;
      if (neighbourState.combatExperience > 15) pressure += 0.2;
      if (neighbourState.informationEnvironment.mediaControl > 70) pressure += 0.15;
      if (neighbourState.informationEnvironment.servicesStrength > 70) pressure += 0.15;
    }
    return Math.max(0, Math.min(1, pressure / neighbours.size));
  }

  getPlayerPolicyState(): PlayerPolicyState {
    return this.playerPolicyState;
  }

  activatePlayerPolicy(policyId: PolicyDecisionId) {
    if (this.gameMode !== "strategy" || this.playerCountryId === null) return false;
    const policy = this.playerPolicyState.decisions[policyId];
    if (!policy || this.playerPolicyState.decisionPoints < policy.cost) return false;
    if (policy.duration && policy.lastUsedTurn + policy.cooldown > this.turn) return false;
    if (policy.condition) {
      const state = this.countryCapabilityStates[this.playerCountryId];
      if (!state || !policy.condition(state, this.strategicRegions)) return false;
    }
    this.playerPolicyState.decisionPoints -= policy.cost;
    this.playerPolicyState.lastDecisionTurn = this.turn;
    const activated = { ...policy, lastUsedTurn: this.turn };
    this.playerPolicyState.activePolicies = [...this.playerPolicyState.activePolicies.filter((p) => p.id !== policyId), activated];
    this.playerPolicyState.decisions = { ...this.playerPolicyState.decisions, [policyId]: activated };
    this.strategicComponentCache.clear();
    this.strategicPowerCache.clear();
    this.applyLogisticsPolicyEffect(policyId, this.playerCountryId);
    return true;
  }

  activateLogisticsPolicy(policyId: PolicyDecisionId, regionId: number) {
    if (this.gameMode !== "strategy" || this.playerCountryId === null) return false;
    const policy = this.playerPolicyState.decisions[policyId];
    if (!policy || this.playerPolicyState.decisionPoints < policy.cost) return false;
    if (policy.duration && policy.lastUsedTurn + policy.cooldown > this.turn) return false;
    const region = this.strategicRegions.find((r) => r.id === regionId && r.ownerId === this.playerCountryId);
    if (!region) return false;
    if (policyId === "build-port" && region.maritimeAccess <= 0) return false;
    if (policy.condition) {
      const state = this.countryCapabilityStates[this.playerCountryId];
      if (!state || !policy.condition(state, this.strategicRegions)) return false;
    }
    this.playerPolicyState.decisionPoints -= policy.cost;
    this.playerPolicyState.lastDecisionTurn = this.turn;
    const activated = { ...policy, lastUsedTurn: this.turn };
    this.playerPolicyState.activePolicies = [...this.playerPolicyState.activePolicies.filter((p) => p.id !== policyId), activated];
    this.playerPolicyState.decisions = { ...this.playerPolicyState.decisions, [policyId]: activated };
    this.strategicComponentCache.clear();
    this.strategicPowerCache.clear();
    this.applyLogisticsPolicyEffect(policyId, this.playerCountryId, regionId);
    return true;
  }

  getAvailablePlayerPolicies(countryId: number): PlayerPolicyDecision[] {
    const state = this.countryCapabilityStates[countryId];
    if (!state) return [];
    const policies = Object.values(this.playerPolicyState.decisions);
    const now = this.turn;
    return policies.filter((policy) => {
      if (policy.duration && policy.lastUsedTurn + policy.cooldown > now) return false;
      if (policy.condition && !policy.condition(state, this.strategicRegions)) return false;
      return true;
    });
  }

  private applyLogisticsPolicyEffect(policyId: PolicyDecisionId, countryId: number, targetRegionId?: number) {
    const state = this.countryCapabilityStates[countryId];
    if (!state) return;
    const owned = this.strategicRegions.filter((r) => r.ownerId === countryId);
    const region = targetRegionId !== undefined ? owned.find((r) => r.id === targetRegionId) : owned.sort((a, b) => b.areaKm2 - a.areaKm2 || a.id - b.id)[0];
    if (!region) return;
    if (policyId === "build-port" && region.maritimeAccess <= 0) return;
    if (policyId === "expand-airport" && !region) return;
    if (policyId === "fortify-sector") {
      region.fortification = Math.min(100, region.fortification + 25);
      return;
    }
    let type: LogisticsInvestment["type"] | null = null;
    let bonus = 0;
    switch (policyId) {
      case "build-port":
        if (region.maritimeAccess > 0) type = "port", bonus = 20;
        break;
      case "modernize-roads":
        type = "road", bonus = 10;
        break;
      case "expand-airport":
        type = "airport", bonus = 12;
        break;
      case "rail-upgrade":
        type = "rail", bonus = 15;
        break;
      default:
        return;
    }
    if (!type) return;
    const policy = this.playerPolicyState.decisions[policyId];
    state.logisticsInvestments = [
      ...state.logisticsInvestments,
      {
        id: `${policyId}-${this.turn}-${region.id}`,
        regionId: region.id,
        type,
        bonus,
        remainingTurns: policy?.duration ?? 4,
      },
    ];
  }

  private advancePlayerPolicies() {
    if (this.gameMode !== "strategy" || this.playerCountryId === null) return;
    if (this.playerPolicyState.lastDecisionTurn !== this.turn) {
      this.playerPolicyState.decisionPoints = Math.min(2, this.playerPolicyState.decisionPoints + 1);
    }
    this.playerPolicyState.activePolicies = this.playerPolicyState.activePolicies.filter((policy) => {
      if (!policy.duration) return true;
      return policy.lastUsedTurn + policy.duration >= this.turn;
    });
    const state = this.countryCapabilityStates[this.playerCountryId];
    if (!state?.logisticsInvestments.length) return;
    state.logisticsInvestments = state.logisticsInvestments.filter((inv) => {
      if (inv.remainingTurns > 1) { inv.remainingTurns -= 1; return true; }
      const region = this.strategicRegions[inv.regionId];
      if (region) {
        if (inv.type === "road") region.roadDensity = Math.min(1, region.roadDensity + inv.bonus / 100);
        if (inv.type === "rail") region.railDensity = Math.min(1, region.railDensity + inv.bonus / 100);
        if (inv.type === "airport") region.airportCount++;
        if (inv.type === "port") { region.portCount++; region.maritimeAccess = Math.min(100, region.maritimeAccess + inv.bonus); }
      }
      return false;
    });
  }

  private estimatedImmigrationDelta(country: Country): number {
    const neighbours = new Set<number>();
    for (const region of this.strategicRegions) {
      if (region.ownerId === country.id) {
        for (const neighbourId of region.neighbours) neighbours.add(neighbourId);
      }
    }
    let delta = 0;
    const formerColonies = new Set(["DZA", "MAR", "TUN", "LBN", "SYR", "IRN", "IND", "PAK", "BGD", "IDN", "NGA", "EGY"]);
    for (const neighbourId of neighbours) {
      const neighbour = this.countries[neighbourId];
      if (!neighbour) continue;
      const neighbourState = this.countryCapabilityStates[neighbourId];
      if (!neighbourState) continue;
      if (neighbourState.components.population > 50 && neighbourState.components.technology < 40) delta += 0.0003;
      if (formerColonies.has(neighbour.iso3 ?? "")) delta += 0.0005;
      if (neighbourState.components.stability < 30) delta += 0.0002;
    }
    return Math.max(0, Math.min(delta, 0.004));
  }

  private advanceCapabilityStates() {
    if (this.gameMode !== "strategy" || this.turn <= 0) return;
    const states = this.countryCapabilityStates;
    if (!states.length) this.countryCapabilityStates = loadCapabilityStatesFromSnapshot(this.countries, undefined);
    this.advancePlayerPolicies();
    const playerEffects = getActivePlayerPolicyEffects(this.playerPolicyState);
    const playerInvestments = this.playerCountryId !== null ? this.getCountryLogisticsInvestments(this.playerCountryId) : [];
    const logisticsBonus = playerInvestments.reduce((sum, inv) => sum + inv.bonus, 0);
    for (let index = 0; index < this.countries.length; index++) {
      const state = this.countryCapabilityStates[index];
      if (!state || state.lastEvaluatedTurn === this.turn) continue;
      const baseline = this.strategicBaseline(index);
      const context = this.activeCampaignContext(index);
      const contextWithPolicy = {
        ...context,
        sanctionsPenalty: this.SANCTIONED_ISO3.has(this.countries[index].iso3 ?? "") ? 0.5 : 0,
        immigrationDelta: this.estimatedImmigrationDelta(this.countries[index]),
        warIntensity: context.hasIncoming ? 0.6 + Math.min(0.4, context.activeOccupations * 0.15) : context.hasOutgoing ? 0.3 : 0,
        maritimeBlockade: this.getCountryMaritimeTrade(index).blockade,
        policyEffects: index === this.playerCountryId ? { ...playerEffects, logisticsBonus } : {},
      };
      this.countryCapabilityStates[index] = evaluateCapabilityChange(state, baseline, contextWithPolicy, this.turn, this.seed);
    }
    this.strategicComponentCache.clear();
    this.strategicPowerCache.clear();
  }

  /**
   * Uchodźcy opuszczają państwo broniące się na aktywnym froncie i trafiają
   * wyłącznie do jego sąsiadów. Agresor z tego frontu jest wykluczony.
   */
  private distributeStrategicRefugees() {
    if (this.gameMode !== "strategy" || !this.strategicCampaigns.length) return;
    const incoming = this.countries.map(() => 0);
    const outgoing = this.countries.map(() => 0);
    const incomingWomen = this.countries.map(() => 0);
    const incomingMen = this.countries.map(() => 0);
    const incomingChildren = this.countries.map(() => 0);
    const frontsByDefender = new Map<number, typeof this.strategicCampaigns>();
    for (const campaign of this.strategicCampaigns) {
      if (this.strategicRegions[campaign.regionId]?.ownerId !== campaign.defenderId) continue;
      const fronts = frontsByDefender.get(campaign.defenderId) ?? [];
      fronts.push(campaign);
      frontsByDefender.set(campaign.defenderId, fronts);
    }
    const openness: Record<BorderPolicy, number> = { closed: .04, selective: .55, open: 1, mass: 1.2 };
    for (const [sourceId, fronts] of frontsByDefender) {
      const source = this.countryCapabilityStates[sourceId];
      if (!source) continue;
      const attackers = new Set(fronts.map(({ attackerId }) => attackerId));
      const recipients = this.strategicCountryNeighbours(sourceId).filter((id) => !attackers.has(id) && this.countryCapabilityStates[id]);
      if (!recipients.length) continue;
      const population = Math.max(0, source.populationAbsolute);
      const requested = Math.round(Math.min(population * .004, population * (.0008 + fronts.length * .0007)));
      if (!requested) continue;
      const weighted = recipients.map((id) => {
        const target = this.countryCapabilityStates[id];
        const components = this.strategicComponents(id);
        const score = openness[target.borderPolicy] * (.45 + components.logistics / 200) * (.45 + target.components.stability / 200);
        return { id, score };
      }).filter(({ score }) => score > 0);
      const totalWeight = weighted.reduce((sum, { score }) => sum + score, 0);
      if (!totalWeight) continue;
      const profile = refugeeArrivalProfile(source.manpower.mobilization);
      const best = [...weighted].sort((a, b) => b.score - a.score)[0];
      const campaignAmounts = fronts.map((_, index) => Math.floor(requested / fronts.length));
      campaignAmounts[0] += requested - campaignAmounts.reduce((sum, amount) => sum + amount, 0);
      for (const [index, campaign] of fronts.entries()) {
        const amount = campaignAmounts[index];
        campaign.refugeesFled = (campaign.refugeesFled ?? 0) + amount;
        campaign.refugeesFledWomen = (campaign.refugeesFledWomen ?? 0) + Math.round(amount * profile.women);
        campaign.refugeesFledMen = (campaign.refugeesFledMen ?? 0) + Math.round(amount * profile.men);
        campaign.refugeesFledChildren = (campaign.refugeesFledChildren ?? 0) + amount - Math.round(amount * profile.women) - Math.round(amount * profile.men);
        let moved = 0;
        const destinations = weighted.map(({ id, score }) => ({ id, amount: Math.floor(amount * score / totalWeight) }));
        for (const destination of destinations) moved += destination.amount;
        if (best) destinations.find(({ id }) => id === best.id)!.amount += amount - moved;
        for (const destination of destinations) {
          if (!destination.amount) continue;
          incoming[destination.id] += destination.amount;
          incomingWomen[destination.id] += destination.amount * profile.women;
          incomingMen[destination.id] += destination.amount * profile.men;
          incomingChildren[destination.id] += destination.amount * profile.children;
          const known = campaign.refugeeDestinations?.find(({ countryId }) => countryId === destination.id);
          if (known) known.people += destination.amount;
          else (campaign.refugeeDestinations ??= []).push({ countryId: destination.id, people: destination.amount });
        }
      }
      outgoing[sourceId] += requested;
    }
    for (let id = 0; id < this.countries.length; id++) {
      if (!incoming[id] && !outgoing[id]) continue;
      const profile = incoming[id] > 0
        ? { women: incomingWomen[id] / incoming[id], men: incomingMen[id] / incoming[id], children: incomingChildren[id] / incoming[id] }
        : undefined;
      this.countryCapabilityStates[id] = applyRefugeeMovement(this.countryCapabilityStates[id], incoming[id], outgoing[id], profile);
    }
  }

  private strategicCountryNeighbours(countryId: number) {
    const neighbours = new Set<number>();
    for (const region of this.strategicRegions) {
      if (region.ownerId !== countryId) continue;
      for (const neighbourId of region.neighbours) {
        const ownerId = this.strategicRegions[neighbourId]?.ownerId;
        if (ownerId !== undefined && ownerId !== countryId) neighbours.add(ownerId);
      }
    }
    return [...neighbours];
  }

  private isWarTargetPlayable(id: number, index: number) {
    if (this.isCountryPlayable(id)) return true;
    return this.gameRegion === "europe" && this.countries[id]?.iso === "RU" && isKaliningradIndex(index);
  }

  private boundaryCells() {
    if (this.boundaryRevision === this.visualRevision && this.boundaryCache.length === this.countries.length) return this.boundaryCache;
    const boundaries = this.countries.map(() => [] as number[]);
    for (let index = 0; index < this.owners.length; index++) {
      const owner = this.owners[index];
      if (owner < 0) continue;
      const x = index % MAP_W, y = Math.floor(index / MAP_W);
      let boundary = y === 0 || y === MAP_H - 1;
      for (let oy = -1; oy <= 1 && !boundary; oy++) for (let ox = -1; ox <= 1; ox++) {
        if (!ox && !oy) continue;
        const ny = y + oy;
        if (ny < 0 || ny >= MAP_H || this.owners[ny * MAP_W + wrapX(x + ox)] !== owner) { boundary = true; break; }
      }
      if (boundary) boundaries[owner].push(index);
    }
    this.boundaryCache = boundaries;
    this.boundaryRevision = this.visualRevision;
    return boundaries;
  }

  private neighbouringCountries(ownerId: number, changed?: Array<[number, number]>) {
    const neighbours = new Set<number>();
    const steps = [[-1, 0], [1, 0], [0, -1], [0, 1]];
    const candidates = changed?.length ? changed.map(([index]) => index) : this.boundaryCells()[ownerId] ?? [];
    for (const index of candidates) {
      if (this.owners[index] !== ownerId) continue;
      const x = index % MAP_W, y = Math.floor(index / MAP_W);
      for (const [ox, oy] of steps) {
        const ny = y + oy;
        if (ny < 0 || ny >= MAP_H) continue;
        const neighbour = this.owners[ny * MAP_W + wrapX(x + ox)];
        if (neighbour >= 0 && neighbour !== ownerId) neighbours.add(neighbour);
      }
    }
    return [...neighbours];
  }

  private ensureReadableColor(ownerId: number, changed?: Array<[number, number]>) {
    const neighbours = this.neighbouringCountries(ownerId, changed);
    if (!neighbours.length) return;
    const current = this.countries[ownerId].color;
    const minimumDistance = 4_800;
    if (neighbours.every((id) => colorDistanceSquared(current, this.countries[id].color) >= minimumDistance)) return;
    let best = current, bestDistance = -1;
    for (const candidate of MAP_PALETTE) {
      const distance = Math.min(...neighbours.map((id) => colorDistanceSquared(candidate, this.countries[id].color)));
      if (distance > bestDistance) { best = candidate; bestDistance = distance; }
    }
    this.countries[ownerId].color = [best[0], best[1], best[2]];
  }

  private repairColorConflicts() {
    const neighbours = this.countries.map(() => new Set<number>());
    for (let y = 0; y < MAP_H; y++) for (let x = 0; x < MAP_W; x++) {
      const owner = this.owners[y * MAP_W + x];
      if (owner < 0) continue;
      const right = this.owners[y * MAP_W + wrapX(x + 1)];
      const down = y + 1 < MAP_H ? this.owners[(y + 1) * MAP_W + x] : -1;
      for (const neighbour of [right, down]) if (neighbour >= 0 && neighbour !== owner) {
        neighbours[owner].add(neighbour);
        neighbours[neighbour].add(owner);
      }
    }
    for (let pass = 0; pass < 2; pass++) for (const country of this.countries) {
      const nearby = [...neighbours[country.id]];
      if (!nearby.length || nearby.every((id) => colorDistanceSquared(country.color, this.countries[id].color) >= 4_800)) continue;
      let best = country.color, bestDistance = -1;
      for (const candidate of MAP_PALETTE) {
        const distance = Math.min(...nearby.map((id) => colorDistanceSquared(candidate, this.countries[id].color)));
        if (distance > bestDistance) { best = candidate; bestDistance = distance; }
      }
      country.color = [best[0], best[1], best[2]];
    }
  }

  private stats(): Stats[] {
    if (this.statsRevision === this.visualRevision && this.statsCache.length === this.countries.length) return this.statsCache;
    const cells = new Int32Array(this.countries.length);
    const weight = new Float64Array(this.countries.length);
    const sx = new Float64Array(this.countries.length);
    const cx = new Float64Array(this.countries.length);
    const sy = new Float64Array(this.countries.length);
    for (let i = 0; i < this.owners.length; i++) {
      const owner = this.owners[i];
      if (owner < 0) continue;
      const x = i % MAP_W, y = Math.floor(i / MAP_W), w = this.rowWeight[y];
      const angle = x / MAP_W * Math.PI * 2;
      cells[owner]++;
      weight[owner] += w;
      sx[owner] += Math.sin(angle) * w;
      cx[owner] += Math.cos(angle) * w;
      sy[owner] += y * w;
    }
    const result = this.countries.map(({ id }) => {
      let angle = Math.atan2(sx[id], cx[id]);
      if (angle < 0) angle += Math.PI * 2;
      return { cells: cells[id], weight: weight[id], cx: weight[id] ? angle / (Math.PI * 2) * MAP_W : 0, cy: weight[id] ? sy[id] / weight[id] : 0, anchor: -1 };
    });
    this.statsSin = sx;
    this.statsCos = cx;
    this.statsY = sy;
    this.statsCache = result;
    this.statsRevision = this.visualRevision;
    return result;
  }

  /** Update country totals from the cells touched by one action. A normal
   * turn changes a local patch, so rescanning all 9.3 million cells twice made
   * the visible map wait for work unrelated to that action. */
  private commitOwnerChanges(changed: Array<[number, number]>) {
    if (!changed.length) return;
    const cacheReady = this.statsRevision === this.visualRevision
      && this.statsCache.length === this.countries.length
      && this.statsSin.length === this.countries.length;
    if (cacheReady) {
      const next = this.statsCache.map((stats) => ({ ...stats }));
      for (const [index, previousOwner] of changed) {
        const currentOwner = this.owners[index];
        if (previousOwner === currentOwner) continue;
        const x = index % MAP_W, y = Math.floor(index / MAP_W), weight = this.rowWeight[y];
        const angle = x / MAP_W * Math.PI * 2;
        const sin = Math.sin(angle) * weight, cos = Math.cos(angle) * weight, weightedY = y * weight;
        if (previousOwner >= 0) {
          next[previousOwner].cells--;
          next[previousOwner].weight -= weight;
          this.statsSin[previousOwner] -= sin;
          this.statsCos[previousOwner] -= cos;
          this.statsY[previousOwner] -= weightedY;
        }
        if (currentOwner >= 0) {
          next[currentOwner].cells++;
          next[currentOwner].weight += weight;
          this.statsSin[currentOwner] += sin;
          this.statsCos[currentOwner] += cos;
          this.statsY[currentOwner] += weightedY;
        }
      }
      for (let id = 0; id < next.length; id++) {
        if (!next[id].weight) { next[id].cx = 0; next[id].cy = 0; continue; }
        let angle = Math.atan2(this.statsSin[id], this.statsCos[id]);
        if (angle < 0) angle += Math.PI * 2;
        next[id].cx = angle / (Math.PI * 2) * MAP_W;
        next[id].cy = this.statsY[id] / next[id].weight;
      }
      this.statsCache = next;
    }
    this.visualRevision++;
    if (cacheReady) this.statsRevision = this.visualRevision;
  }

  getStats() { return this.stats(); }
  getCountry(id: number | null | undefined) { return id == null || id < 0 ? null : this.countries[id] ?? null; }
  getCountryAt(nx: number, ny: number) {
    const x = wrapX(Math.floor(nx * MAP_W));
    const y = Math.max(0, Math.min(MAP_H - 1, Math.floor(ny * MAP_H)));
    return this.getCountry(this.owners[y * MAP_W + x]);
  }

  private initialWarCapitalStates(): Array<WarCapitalState | null> {
    return this.countries.map((country) => {
      if (!country.capital) return null;
      const x = ((country.capital.longitude + 180) / 360 + 1) % 1;
      const y = Math.max(0, Math.min(1, (90 - country.capital.latitude) / 180));
      const sourceX = wrapX(Math.floor(x * MAP_W));
      const sourceY = Math.max(0, Math.min(MAP_H - 1, Math.floor(y * MAP_H)));
      const source = sourceY * MAP_W + sourceX;
      if (this.initialOwners[source] === country.id) return { index: source, lostTurn: null, relocated: false };
      // Rasteryzacja potrafi przypisać komórkę stolicy sąsiadowi (Kinszasa nad
      // rzeką, Bratysława przy granicy). Bez tej korekty kraj "traciłby"
      // stolicę już w pierwszej turze. Szukamy najbliższej własnej komórki.
      for (let radius = 1; radius <= 6; radius++) {
        for (let oy = -radius; oy <= radius; oy++) for (let ox = -radius; ox <= radius; ox++) {
          if (Math.max(Math.abs(ox), Math.abs(oy)) !== radius) continue;
          const ny = sourceY + oy;
          if (ny < 0 || ny >= MAP_H) continue;
          const index = ny * MAP_W + wrapX(sourceX + ox);
          if (this.initialOwners[index] === country.id) return { index, lostTurn: null, relocated: false };
        }
      }
      return { index: null, lostTurn: null, relocated: false };
    });
  }

  private initializeStrategicCapitals() {
    this.strategicCapitals = this.countries.map((country) => {
      if (!country.capital) return null;
      const x = ((country.capital.longitude + 180) / 360 + 1) % 1;
      const y = Math.max(0, Math.min(1, (90 - country.capital.latitude) / 180));
      const source = Math.max(0, Math.min(this.strategicProvinceAt.length - 1, Math.floor(y * MAP_H) * MAP_W + wrapX(Math.floor(x * MAP_W))));
      let regionId = this.strategicProvinceAt[source];
      if (regionId < 0 || this.strategicRegions[regionId]?.ownerId !== country.id) {
        regionId = this.strategicRegions.filter((region) => region.ownerId === country.id).sort((a, b) => gridDistanceKm(a.cx, a.cy, x * MAP_W, y * MAP_H) - gridDistanceKm(b.cx, b.cy, x * MAP_W, y * MAP_H))[0]?.id ?? -1;
      }
      return { regionId, x: x * 100, y: y * 100, name: country.capital.name, relocated: false };
    });
  }

  private capitalScore(countryId: number, region: StrategicRegion) {
    const hostileBorders = region.neighbours.filter((id) => this.strategicRegions[id]?.ownerId !== countryId).length;
    const ownNeighbours = region.neighbours.length - hostileBorders;
    return region.logisticsIndex * .75 + Math.min(28, Math.sqrt(region.areaKm2) / 6) + ownNeighbours * 4 - hostileBorders * 18;
  }

  private capitalOptions(countryId: number): StrategicCapitalRelocationOption[] {
    return this.strategicRegions.filter((region) => region.ownerId === countryId && this.isStrategicRegionPlayable(region)).map((region) => {
      const hostileBorders = region.neighbours.filter((id) => this.strategicRegions[id]?.ownerId !== countryId).length;
      return { regionId: region.id, name: region.name, score: this.capitalScore(countryId, region), reason: hostileBorders ? "dobry dojazd, ale blisko zagrożonej granicy" : "bezpieczniejsze zaplecze z dostępem do logistyki" };
    }).sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
  }

  private relocateCapital(countryId: number, regionId: number) {
    const region = this.strategicRegions[regionId];
    if (!region || region.ownerId !== countryId) return false;
    this.strategicCapitals[countryId] = { regionId, x: region.cx / MAP_W * 100, y: region.cy / MAP_H * 100, name: `Siedziba rządu, ${region.name}`, relocated: true };
    this.pendingCapitalRelocations.delete(countryId);
    return true;
  }

  private updateStrategicCapitals() {
    for (const country of this.countries) {
      const capital = this.strategicCapitals[country.id];
      if (!capital || capital.regionId < 0 || this.strategicRegions[capital.regionId]?.ownerId === country.id) continue;
      if (country.id === this.playerCountryId) this.pendingCapitalRelocations.add(country.id);
      else {
        const replacement = this.capitalOptions(country.id)[0];
        if (replacement) this.relocateCapital(country.id, replacement.regionId);
      }
    }
  }

  getCapitalRelocationOptions(countryId: number): StrategicCapitalRelocationOption[] {
    return this.pendingCapitalRelocations.has(countryId) ? this.capitalOptions(countryId).slice(0, 6) : [];
  }

  relocatePlayerCapital(regionId: number) {
    if (this.playerCountryId === null || !this.pendingCapitalRelocations.has(this.playerCountryId)) return false;
    return this.relocateCapital(this.playerCountryId, regionId);
  }

  getStrategicCityPlacements(): StrategicCityPlacement[] {
    if (this.gameMode !== "strategy") return [];
    return this.strategicRegions.map((region) => ({ id: region.id, countryId: region.ownerId, regionId: region.id, name: `Siedziba ${region.name}`, x: region.cx / MAP_W * 100, y: region.cy / MAP_H * 100, controlled: region.ownerId === region.originalOwnerId }));
  }

  getCapitalPlacements(): CapitalPlacement[] {
    if (this.gameMode === "strategy") return this.countries.flatMap((country) => {
      const capital = this.strategicCapitals[country.id];
      if (!capital) return [];
      return [{ countryId: country.id, countryName: country.name, name: capital.name, x: capital.x, y: capital.y, controlled: this.strategicRegions[capital.regionId]?.ownerId === country.id, regionId: capital.regionId, relocated: capital.relocated }];
    });
    const stats = this.stats();
    if (this.gameMode === "war") return this.countries.flatMap((country) => {
      const capital = this.capitalStates[country.id];
      if (!capital || capital.index === null || !stats[country.id]?.cells) return [];
      const x = capital.index % MAP_W, y = Math.floor(capital.index / MAP_W);
      return [{
        countryId: country.id,
        countryName: country.name,
        name: capital.relocated ? `Siedziba rządu, ${country.name}` : country.capital?.name ?? country.name,
        x: (x + .5) / MAP_W * 100,
        y: (y + .5) / MAP_H * 100,
        controlled: this.owners[capital.index] === country.id,
        regionId: null,
        relocated: capital.relocated,
      }];
    });
    return this.countries.flatMap((country) => {
      if (!country.capital || !stats[country.id]?.cells) return [];
      const x = ((country.capital.longitude + 180) / 360 + 1) % 1;
      const y = Math.max(0, Math.min(1, (90 - country.capital.latitude) / 180));
      const sourceX = wrapX(Math.floor(x * MAP_W));
      const sourceY = Math.max(0, Math.min(MAP_H - 1, Math.floor(y * MAP_H)));
      return [{
        countryId: country.id,
        countryName: country.name,
        name: country.capital.name,
        x: x * 100,
        y: y * 100,
        controlled: this.owners[sourceY * MAP_W + sourceX] === country.id,
        regionId: null,
        relocated: false,
      }];
    });
  }
  getWarExhaustion(id: number): number { return this.warExhaustion[id] ?? 0; }
  isPlayerThreatened(plan: TurnPlan): boolean { return plan.action === "war" && plan.targetId === this.playerCountryId; }
  getWarVetoesLeft(): number { return this.warVetoesLeft; }
  vetoDirection(countryId: number, action: ActionKey) {
    if (this.gameMode !== "war" || this.warVetoesLeft <= 0) return null;
    this.warVetoesLeft--;
    return this.rollDirection(countryId, action);
  }
  getWarUndosLeft(): number { return this.warUndosLeft; }
  setWarGuarantee(countryId: number): boolean {
    if (this.gameMode !== "war" || this.warGuaranteeUsed) return false;
    if (!this.countries[countryId] || !this.stats()[countryId]?.cells) return false;
    this.warGuarantee = { countryId, untilTurn: this.turn + WAR_GUARANTEE_TURNS };
    this.warGuaranteeUsed = true;
    return true;
  }
  getWarGuarantee(): { countryId: number; turnsLeft: number } | null {
    if (this.gameMode !== "war" || !this.warGuarantee || this.turn >= this.warGuarantee.untilTurn) return null;
    return { countryId: this.warGuarantee.countryId, turnsLeft: this.warGuarantee.untilTurn - this.turn };
  }
  isWarGuaranteeUsed(): boolean { return this.warGuaranteeUsed; }
  getCountryTitle(id: number): string | null {
    if (this.gameMode !== "war" || !this.countries[id]) return null;
    const defeats = this.defeats[id] ?? 0;
    if (defeats >= 5) return "Mocarstwo";
    if (defeats >= 3) return "Imperium";
    if (defeats >= 1) return "Zdobywca";
    if (!this.stats()[id]?.cells) return null;
    if (this.getCountryShare(id) <= WAR_TITLE_STEADFAST_SHARE) return "Niezłomny";
    if (this.turn >= WAR_TITLE_FORTRESS_TURN && (this.warMinShare[id] ?? 0) >= 1) return "Twierdza";
    return null;
  }
  getCountryKm2(id: number) { return (this.stats()[id]?.weight ?? 0) * this.km2PerWeight; }
  getLandRatio() { return this.ecologicalLandRatio(this.stats()); }
  isCataclysmEnabled() { return this.cataclysmEnabled; }
  setCataclysm(enabled: boolean) { this.cataclysmEnabled = enabled; }

  getCountryInitialKm2(id: number) { return (this.countries[id]?.initialWeight ?? 0) * this.km2PerWeight; }
  getCountryShare(id: number) {
    const current = this.stats()[id]?.weight ?? 0;
    return this.countries[id].initialWeight ? current / this.countries[id].initialWeight : 0;
  }

  getRanking(): CountryRanking[] {
    const stats = this.stats();
    const entries = this.countries.map((country) => ({
      rank: 0,
      countryId: country.id,
      areaKm2: stats[country.id].weight * this.km2PerWeight,
      changePercent: country.initialWeight ? (stats[country.id].weight / country.initialWeight - 1) * 100 : 0,
      defeats: this.defeats[country.id] ?? 0,
      active: stats[country.id].cells > 0 && this.canCountryAct(country.id),
    })).sort((first, second) => Number(second.active) - Number(first.active) || second.areaKm2 - first.areaKm2 || second.defeats - first.defeats);
    let rank = 0;
    return entries.map((entry) => ({ ...entry, rank: entry.active ? ++rank : 0 }));
  }

  getWinner() {
    const stats = this.stats();
    const active = this.countries.filter(({ id }) => stats[id].cells > 0 && this.canCountryAct(id));
    if (active.length !== 1) return null;
    if (this.gameRegion === "europe") {
      const russia = this.countries.find((country) => country.iso === "RU")?.id;
      const x0 = Math.floor((19 + 180) / 360 * MAP_W), x1 = Math.ceil((23.15 + 180) / 360 * MAP_W);
      const y0 = Math.floor((90 - 55.35) / 180 * MAP_H), y1 = Math.ceil((90 - 54.25) / 180 * MAP_H);
      if (russia !== undefined) for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
        const index = y * MAP_W + x;
        if (this.owners[index] === russia && isKaliningradIndex(index)) return null;
      }
    }
    return active[0];
  }

  private targetInDirection(actorId: number, direction: Direction, stats: Stats[]) {
    const cacheKey = `${this.visualRevision}:${this.gameRegion}:${actorId}:${direction.key}`;
    if (this.directionTargetCache.has(cacheKey)) return this.directionTargetCache.get(cacheKey) ?? null;
    const origin = stats[actorId];
    if (!origin?.cells) { this.directionTargetCache.set(cacheKey, null); return null; }

    // A country touching the attacker in the direction's natural compass
    // sector must be selected before an overseas target. A looser side contact
    // remains a fallback: on a concave coast (for example Bangladesh facing
    // SW), the rays can otherwise miss a genuine neighbouring state.
    const neighbours = [[-1, 0], [1, 0], [0, -1], [0, 1]];
    let strictBorderWinner: DirectionHit | null = null, strictBorderScore = Infinity;
    let borderFallback: DirectionHit | null = null, borderFallbackScore = Infinity;
    for (const actorIndex of this.boundaryCells()[actorId] ?? []) {
      const actorX = actorIndex % MAP_W, actorY = Math.floor(actorIndex / MAP_W);
      for (const [ox, oy] of neighbours) {
        const y = actorY + oy;
        if (y < 0 || y >= MAP_H) continue;
        const x = wrapX(actorX + ox), index = y * MAP_W + x;
        const owner = this.owners[index];
        if (owner < 0 || owner === actorId || stats[owner].cells < 2 || !this.isWarTargetPlayable(owner, index)) continue;
        const dx = deltaX(x, origin.cx), dy = y - origin.cy;
        const outward = dx * direction.dx + dy * direction.dy;
        if (outward <= 0) continue;
        const lateral = Math.abs(dx * -direction.dy + dy * direction.dx);
        // Eight directions describe broad, intuitive map sectors. Contacts
        // up to 67.5 degrees from the arrow belong to that sector; a country
        // behind the attacker never does.
        if (lateral > outward * 2.4143) continue;
        const score = lateral / Math.max(1, outward) - outward * 0.0001;
        const hit = { countryId: owner, index, distance: 1, offset: 0 };
        if (score < borderFallbackScore) { borderFallbackScore = score; borderFallback = hit; }
        // Only a contact inside the direction's natural 45-degree sector may
        // outrank a target across a narrow strait. A looser side contact stays
        // available as fallback when the ray finds no country at all.
        if (lateral <= outward * 0.4143 && score < strictBorderScore) {
          strictBorderScore = score;
          strictBorderWinner = hit;
        }
      }
    }
    if (strictBorderWinner) { this.directionTargetCache.set(cacheKey, strictBorderWinner); return strictBorderWinner; }

    // Launch from the country's outermost edge in the rolled direction. Using
    // its centroid made a long conquered appendage turn NW into a visually
    // southern attack on another border.
    const launches = (this.boundaryCells()[actorId] ?? []).map((index) => {
      const x = index % MAP_W, y = Math.floor(index / MAP_W);
      const dx = deltaX(x, origin.cx), dy = y - origin.cy;
      const outward = dx * direction.dx + dy * direction.dy;
      const lateral = Math.abs(dx * -direction.dy + dy * direction.dx);
      return { index, score: outward - lateral * 0.025 };
    }).sort((a, b) => b.score - a.score).slice(0, 24);
    if (!launches.length) { this.directionTargetCache.set(cacheKey, null); return null; }

    // Cast a narrow fan covering the chosen compass sector. A ray stops on
    // the first foreign country, so a nearby neighbour cannot be skipped in
    // favour of a country whose centroid merely lies farther in that direction.
    // Travelling through the attacker's own territory is free, but an open-sea
    // or neutral gap may never exceed the game's operational war range.
    const fan = [0, -7, 7, -14, 14];
    let winner: DirectionHit | null = null, best = Infinity;
    launches.forEach((launch, launchRank) => {
      const startX = launch.index % MAP_W, startY = Math.floor(launch.index / MAP_W);
      for (const offset of fan) {
        const angle = offset * Math.PI / 180, cosine = Math.cos(angle), sine = Math.sin(angle);
        const rayX = direction.dx * cosine - direction.dy * sine;
        const rayY = direction.dx * sine + direction.dy * cosine;
        let previous = -1, coastX = startX, coastY = startY;
        for (let distance = 1; distance <= MAP_W / 2; distance++) {
          const y = Math.round(startY + rayY * distance);
          if (y < 0 || y >= MAP_H) break;
          const x = wrapX(Math.round(startX + rayX * distance));
          const index = y * MAP_W + x;
          if (index === previous) continue;
          previous = index;
          const owner = this.owners[index];
          if (owner === actorId) { coastX = x; coastY = y; continue; }
          const gap = gridDistanceKm(coastX, coastY, x, y);
          if (gap > MAX_WAR_GAP_KM) break;
          if (owner < 0 || stats[owner].cells < 2) continue;
          if (!this.isWarTargetPlayable(owner, index)) break;
          const score = gap + Math.abs(offset) * 8 + launchRank * 3;
          if (score < best) { best = score; winner = { countryId: owner, index, distance, offset }; }
          break;
        }
      }
    });
    const result = winner ?? borderFallback;
    this.directionTargetCache.set(cacheKey, result);
    return result;
  }

  private warTheater(targetId: number, seedIndex: number) {
    if (this.owners[seedIndex] !== targetId) return [];
    type TheaterComponent = { cells: number[]; cx: number; cy: number; radius: number };
    const componentAt = new Int32Array(this.owners.length);
    const components: TheaterComponent[] = [];
    const steps = [[-1, 0], [1, 0], [0, -1], [0, 1]];

    for (let start = 0; start < this.owners.length; start++) {
      if (this.owners[start] !== targetId || componentAt[start]) continue;
      const id = components.length + 1, cells: number[] = [], queue = [start];
      componentAt[start] = id;
      let sx = 0, cx = 0, sy = 0;
      for (let cursor = 0; cursor < queue.length; cursor++) {
        const index = queue[cursor], x = index % MAP_W, y = Math.floor(index / MAP_W);
        cells.push(index);
        const angle = x / MAP_W * Math.PI * 2;
        sx += Math.sin(angle);
        cx += Math.cos(angle);
        sy += y;
        for (const [ox, oy] of steps) {
          const ny = y + oy;
          if (ny < 0 || ny >= MAP_H) continue;
          const next = ny * MAP_W + wrapX(x + ox);
          if (this.owners[next] !== targetId || componentAt[next]) continue;
          componentAt[next] = id;
          queue.push(next);
        }
      }
      let centreAngle = Math.atan2(sx, cx);
      if (centreAngle < 0) centreAngle += Math.PI * 2;
      const centreX = centreAngle / (Math.PI * 2) * MAP_W, centreY = sy / cells.length;
      let radius = 0;
      for (const index of cells) radius = Math.max(radius, gridDistanceKm(centreX, centreY, index % MAP_W, Math.floor(index / MAP_W)));
      components.push({ cells, cx: centreX, cy: centreY, radius });
    }

    const seedComponent = componentAt[seedIndex] - 1;
    if (seedComponent < 0) return [];
    const included = new Uint8Array(components.length), queue = [seedComponent];
    included[seedComponent] = 1;
    for (let cursor = 0; cursor < queue.length; cursor++) {
      const current = components[queue[cursor]];
      for (let candidate = 0; candidate < components.length; candidate++) {
        if (included[candidate]) continue;
        const other = components[candidate];
        const gap = gridDistanceKm(current.cx, current.cy, other.cx, other.cy) - current.radius - other.radius;
        if (gap > WAR_THEATER_GAP_KM) continue;
        included[candidate] = 1;
        queue.push(candidate);
      }
    }
    return components.flatMap((component, index) => included[index] ? component.cells : []);
  }

  private largestRemainingTerritory(ownerId: number, actorId: number, stats: Stats[]) {
    const visited = new Uint8Array(this.owners.length);
    const steps = [[-1, 0], [1, 0], [0, -1], [0, 1]];
    const actor = stats[actorId];
    let best: { cells: number; seed: number; cx: number; cy: number } | null = null;
    for (let start = 0; start < this.owners.length; start++) {
      if (this.owners[start] !== ownerId || visited[start]) continue;
      const queue = [start];
      visited[start] = 1;
      let sumSin = 0, sumCos = 0, sumY = 0, seed = start, seedDistance = Infinity;
      for (let cursor = 0; cursor < queue.length; cursor++) {
        const index = queue[cursor], x = index % MAP_W, y = Math.floor(index / MAP_W);
        const angle = x / MAP_W * Math.PI * 2;
        sumSin += Math.sin(angle); sumCos += Math.cos(angle); sumY += y;
        const distance = gridDistanceKm(actor.cx, actor.cy, x, y);
        if (distance < seedDistance) { seedDistance = distance; seed = index; }
        for (const [ox, oy] of steps) {
          const ny = y + oy;
          if (ny < 0 || ny >= MAP_H) continue;
          const next = ny * MAP_W + wrapX(x + ox);
          if (visited[next] || this.owners[next] !== ownerId) continue;
          visited[next] = 1;
          queue.push(next);
        }
      }
      if (best && best.cells >= queue.length) continue;
      let angle = Math.atan2(sumSin, sumCos);
      if (angle < 0) angle += Math.PI * 2;
      best = { cells: queue.length, seed, cx: angle / (Math.PI * 2) * MAP_W, cy: sumY / queue.length };
    }
    return best;
  }

  private relocatedWarCapitalIndex(countryId: number, stats: Stats[]) {
    const territory = this.largestRemainingTerritory(countryId, countryId, stats);
    if (!territory) return null;
    const visited = new Uint8Array(this.owners.length), queue = [territory.seed], steps = [[-1, 0], [1, 0], [0, -1], [0, 1]];
    visited[territory.seed] = 1;
    let nearest = territory.seed, nearestDistance = Infinity;
    for (let cursor = 0; cursor < queue.length; cursor++) {
      const index = queue[cursor], x = index % MAP_W, y = Math.floor(index / MAP_W);
      const distance = gridDistanceKm(territory.cx, territory.cy, x, y);
      if (distance < nearestDistance || (distance === nearestDistance && index < nearest)) { nearest = index; nearestDistance = distance; }
      for (const [ox, oy] of steps) {
        const ny = y + oy;
        if (ny < 0 || ny >= MAP_H) continue;
        const next = ny * MAP_W + wrapX(x + ox);
        if (visited[next] || this.owners[next] !== countryId) continue;
        visited[next] = 1;
        queue.push(next);
      }
    }
    return nearest;
  }

  private coast(actorId: number, direction: Direction, stats: Stats[]) {
    const result: Array<{ own: number; sea: number; score: number }> = [];
    if (this.countries[actorId]?.landlocked) return result;
    const sx = Math.sign(direction.dx), sy = Math.sign(direction.dy), origin = stats[actorId];
    const stableCoast = this.landAnchorCells(actorId);
    const shoreline = new Set<number>();
    for (const i of this.boundaryCells()[actorId] ?? []) {
      if (!stableCoast.has(i)) continue;
      const x = i % MAP_W, y = Math.floor(i / MAP_W);
      if ([[-1, 0], [1, 0], [0, -1], [0, 1]].some(([ox, oy]) => {
        const ny = y + oy;
        return ny >= 0 && ny < MAP_H && this.owners[ny * MAP_W + wrapX(x + ox)] === -1;
      })) shoreline.add(i);
    }
    // Diagonal sampling must not let a landlocked state jump over a foreign
    // border corner into the sea. New land can start only from a real shore.
    for (const i of shoreline) {
      const x = i % MAP_W, y = Math.floor(i / MAP_W), ny = y + sy;
      if (ny < 0 || ny >= MAP_H) continue;
      const next = ny * MAP_W + wrapX(x + sx);
      if (this.owners[next] !== -1) continue;
      result.push({ own: i, sea: next, score: deltaX(x, origin.cx) * direction.dx + (y - origin.cy) * direction.dy });
    }
    if (!result.length) return result;

    // Facing the rolled direction is not enough: a concave shore on the
    // opposite end of a long country may face east as well. Keep only the
    // outer directional sector of the whole country, then let seabed height
    // decide the exact emergence point inside that sector.
    let maximum = -Infinity, minimum = Infinity;
    for (const item of result) {
      maximum = Math.max(maximum, item.score);
      minimum = Math.min(minimum, item.score);
    }
    const sectorDepth = Math.max(2, (maximum - minimum) * .24);
    return result
      .filter((item) => item.score >= maximum - sectorDepth)
      .sort((a, b) => b.score - a.score)
      .slice(0, 256);
  }

  private landAnchorCells(actorId: number) {
    if (this.landAnchorRevision !== this.visualRevision) {
      this.landAnchorRevision = this.visualRevision;
      this.landAnchorCache.clear();
    }
    const cached = this.landAnchorCache.get(actorId);
    if (cached) return cached;

    const boundary = this.boundaryCells()[actorId] ?? [];
    const boundarySet = new Set(boundary);
    const visited = new Uint8Array(this.owners.length);
    const steps = [[-1, 0], [1, 0], [0, -1], [0, 1]];
    const components: Array<{ cells: number; boundary: number[] }> = [];
    for (const start of boundary) {
      if (visited[start] || this.owners[start] !== actorId) continue;
      const queue = [start], componentBoundary: number[] = [];
      visited[start] = 1;
      for (let cursor = 0; cursor < queue.length; cursor++) {
        const index = queue[cursor], x = index % MAP_W, y = Math.floor(index / MAP_W);
        if (boundarySet.has(index)) componentBoundary.push(index);
        for (const [ox, oy] of steps) {
          const ny = y + oy;
          if (ny < 0 || ny >= MAP_H) continue;
          const next = ny * MAP_W + wrapX(x + ox);
          if (visited[next] || this.owners[next] !== actorId) continue;
          visited[next] = 1;
          queue.push(next);
        }
      }
      components.push({ cells: queue.length, boundary: componentBoundary });
    }
    const largest = Math.max(0, ...components.map((component) => component.cells));
    // A one-pixel remnant or a thin speck created in an earlier turn must not
    // become a launch pad for a new continent. Meaningful islands of an
    // archipelago remain eligible, while tiny detached artefacts are ignored.
    const minimumCells = Math.max(2, Math.min(32, Math.floor(largest * .04)));
    const anchors = new Set(components.filter((component) => component.cells >= minimumCells).flatMap((component) => component.boundary));
    // Very small but playable island states can consist solely of one-cell
    // components at this raster resolution. Keep the old behaviour only when
    // filtering would otherwise make new land impossible altogether.
    if (!anchors.size) boundary.forEach((index) => anchors.add(index));
    this.landAnchorCache.set(actorId, anchors);
    return anchors;
  }

  private valid(actorId: number, action: ActionKey, direction: Direction, stats: Stats[]) {
    if (action === "war") return this.targetInDirection(actorId, direction, stats) !== null;
    if (action === "land") return this.coast(actorId, direction, stats).length > 0;
    return stats[actorId].cells > 3 && this.borderSeeds(actorId, direction.dx, direction.dy, stats).length > 0;
  }

  private preferredWarDirection(actorId: number, stats: Stats[]) {
    if (this.random() >= WAR_LEADER_TARGET_CHANCE) return null;
    const leaders = new Set(this.getRanking().filter(({ active }) => active).slice(0, 3).map(({ countryId }) => countryId));
    for (const direction of DIRECTIONS) {
      const hit = this.targetInDirection(actorId, direction, stats);
      if (hit && leaders.has(hit.countryId)) return { direction, hit };
    }
    return null;
  }

  private pickActor(stats: Stats[]) {
    const active = this.countries.filter(({ id }) => stats[id].cells > 0 && this.canCountryAct(id));
    if (!active.length) return null;
    const start = Math.floor(this.random() * active.length) % active.length;
    if (this.gameMode === "full") return active[start];
    if (this.gameMode === "war") {
      const eligible = active.filter(({ id }) => this.capitalStates[id]?.lostTurn === null || this.capitalStates[id] === null);
      const eligibleIds = new Set(eligible.map(({ id }) => id));
      const ready = new Set(eligible.filter(({ id }) => (this.warExhaustion[id] ?? 0) < WAR_EXHAUSTION_LIMIT).map(({ id }) => id));
      const readyCanAct = eligible.some(({ id }) => ready.has(id) && DIRECTIONS.some((direction) => this.valid(id, "war", direction, stats)));
      for (let offset = 0; offset < active.length; offset++) {
        const actor = active[(start + offset) % active.length];
        if (!eligibleIds.has(actor.id) || (readyCanAct && !ready.has(actor.id))) continue;
        if (DIRECTIONS.some((direction) => this.valid(actor.id, "war", direction, stats))) return actor;
      }
      // Wentyl: gdy wszystkie stolice padły, kraje bez stolicy znów mogą działać,
      // inaczej partia zamarłaby bez żadnego napastnika.
      const rested = new Set(active.filter(({ id }) => (this.warExhaustion[id] ?? 0) < WAR_EXHAUSTION_LIMIT).map(({ id }) => id));
      const restedCanAct = active.some(({ id }) => rested.has(id) && DIRECTIONS.some((direction) => this.valid(id, "war", direction, stats)));
      for (let offset = 0; offset < active.length; offset++) {
        const actor = active[(start + offset) % active.length];
        if (restedCanAct && !rested.has(actor.id)) continue;
        if (DIRECTIONS.some((direction) => this.valid(actor.id, "war", direction, stats))) return actor;
      }
      return null;
    }
    for (let offset = 0; offset < active.length; offset++) {
      const actor = active[(start + offset) % active.length];
      if (DIRECTIONS.some((direction) => this.valid(actor.id, "war", direction, stats))) return actor;
    }
    return null;
  }

  rollCountry() {
    if (this.getWinner()) return null;
    const stats = this.stats();
    const rngBefore = this.rngState;
    const actor = this.pickActor(stats);
    return actor ? { rngBefore, countryId: actor.id } : null;
  }

  rollAction(countryId: number) {
    const stats = this.stats();
    const action = this.pickAction(stats);
    return { action, possible: DIRECTIONS.some((direction) => this.valid(countryId, action, direction, stats)) };
  }

  rollDirection(countryId: number, action: ActionKey) {
    const stats = this.stats();
    const attempts: Direction[] = [];
    if (this.gameMode === "war" && action === "war") {
      const preferred = this.preferredWarDirection(countryId, stats);
      if (preferred) return { direction: preferred.direction, valid: true, targetId: preferred.hit.countryId, impactIndex: preferred.hit.index, attempts: [preferred.direction] };
    }
    for (let attempt = 0; attempt < 64; attempt++) {
      const direction = this.pick(DIRECTIONS);
      attempts.push(direction);
      const hit = action === "war" ? this.targetInDirection(countryId, direction, stats) : null;
      const valid = action === "war" ? hit !== null : this.valid(countryId, action, direction, stats);
      if (valid) return { direction, valid: true, targetId: action === "war" ? hit?.countryId ?? null : null, impactIndex: action === "war" ? hit?.index ?? null : null, attempts };
    }
    const direction = DIRECTIONS.find((item) => this.valid(countryId, action, item, stats)) ?? DIRECTIONS[0];
    const hit = action === "war" ? this.targetInDirection(countryId, direction, stats) : null;
    const valid = action === "war" ? hit !== null : this.valid(countryId, action, direction, stats);
    if (valid) attempts.push(direction);
    return { direction, valid, targetId: valid && action === "war" ? hit?.countryId ?? null : null, impactIndex: valid && action === "war" ? hit?.index ?? null : null, attempts };
  }

  rollSize(action: ActionKey) {
    const size = this.pick(action === "war" ? WAR_SIZES : OTHER_SIZES);
    const band: [number, number] = size === "all" ? [1, 1] : SIZE_BANDS[size];
    const rawFraction = band[0] + this.random() * (band[1] - band[0]);
    // +f followed by -f is biased toward disappearance. f/(1+f) is the exact
    // erosion needed to undo earlier growth by f.
    return { size, fraction: action === "erosion" ? rawFraction / (1 + rawFraction) : rawFraction };
  }

  planTurn(): TurnPlan | null {
    if (this.getWinner()) return null;
    const stats = this.stats();
    const active = this.countries.filter(({ id }) => stats[id].cells > 0 && this.canCountryAct(id));
    if (!active.length) return null;
    const rngBefore = this.rngState;
    const actor = this.pickActor(stats);
    if (!actor) return null;
    const actions = this.availableActions();
    let action = this.pickAction(stats), direction = this.gameMode === "war" ? DIRECTIONS[0] : this.pick(DIRECTIONS), found = false, actionWasRerolled = false;
    const directionAttempts: Direction[] = [];
    if (this.gameMode === "war" && action === "war") {
      const preferred = this.preferredWarDirection(actor.id, stats);
      if (preferred) { direction = preferred.direction; directionAttempts.push(direction); found = true; }
    }
    for (let actionTry = 0; actionTry < 7 && !found; actionTry++) {
      const tried = new Set<string>();
      for (let directionTry = 0; directionTry < 16; directionTry++) {
        direction = this.pick(DIRECTIONS);
        directionAttempts.push(direction);
        tried.add(direction.key);
        if (this.valid(actor.id, action, direction, stats)) { found = true; break; }
        if (tried.size === DIRECTIONS.length) break;
      }
      if (!found) { action = this.pickAction(stats); actionWasRerolled = true; }
    }
    if (!found) {
      // Random retries used to have a real chance of missing erosion seven
      // times. The automatic game then falsely reported a stalemate although
      // the selected country still had legal moves. Exhaust all combinations
      // before ever declaring that the simulation cannot continue.
      const fallbackAction = actions.find(({ key }) => DIRECTIONS.some((item) => this.valid(actor.id, key, item, stats)))?.key;
      if (!fallbackAction) return null;
      action = fallbackAction;
      direction = DIRECTIONS.find((item) => this.valid(actor.id, action, item, stats))!;
      directionAttempts.push(direction);
      actionWasRerolled = true;
    }
    const size = this.pick(action === "war" ? WAR_SIZES : OTHER_SIZES);
    const band: [number, number] = size === "all" ? [1, 1] : SIZE_BANDS[size];
    const rawFraction = band[0] + this.random() * (band[1] - band[0]);
    const fraction = action === "erosion" ? rawFraction / (1 + rawFraction) : rawFraction;
    return {
      rngBefore, countryId: actor.id, action, direction,
      directionAttempts, actionWasRerolled, size, fraction,
      targetId: action === "war" ? this.targetInDirection(actor.id, direction, stats)?.countryId ?? null : null,
    };
  }

  private borderSeeds(ownerId: number, tx: number, ty: number, stats: Stats[]) {
    const result: Array<{ index: number; score: number }> = [], origin = stats[ownerId];
    for (const i of this.boundaryCells()[ownerId] ?? []) {
      const x = i % MAP_W, y = Math.floor(i / MAP_W);
      result.push({ index: i, score: deltaX(x, origin.cx) * tx + (y - origin.cy) * ty });
    }
    return result.sort((a, b) => b.score - a.score).slice(0, 64).map((item) => item.index);
  }

  private sharedBorderSeeds(actorId: number, targetId: number, direction: Direction, stats: Stats[]) {
    const result: Array<{ index: number; score: number }> = [], origin = stats[actorId];
    const neighbours = [[-1, 0], [1, 0], [0, -1], [0, 1]];
    for (const index of this.boundaryCells()[targetId] ?? []) {
      const x = index % MAP_W, y = Math.floor(index / MAP_W);
      let touchesActor = false;
      for (const [ox, oy] of neighbours) {
        const ny = y + oy;
        if (ny >= 0 && ny < MAP_H && this.owners[ny * MAP_W + wrapX(x + ox)] === actorId) { touchesActor = true; break; }
      }
      if (!touchesActor) continue;
      const dx = deltaX(x, origin.cx), dy = y - origin.cy;
      const outward = dx * direction.dx + dy * direction.dy;
      const lateral = Math.abs(dx * -direction.dy + dy * direction.dx);
      result.push({ index, score: outward - lateral * 0.08 });
    }
    return result.sort((a, b) => b.score - a.score).slice(0, 512).map((item) => item.index);
  }

  private ownerComponent(ownerId: number, seed: number) {
    const component = new Set<number>();
    if (seed < 0 || this.owners[seed] !== ownerId) return component;
    const queue = [seed]; component.add(seed);
    for (let cursor = 0; cursor < queue.length; cursor++) {
      const index = queue[cursor], x = index % MAP_W, y = Math.floor(index / MAP_W);
      for (const [ox, oy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
        const ny = y + oy;
        if (ny < 0 || ny >= MAP_H) continue;
        const next = ny * MAP_W + wrapX(x + ox);
        if (component.has(next) || this.owners[next] !== ownerId) continue;
        component.add(next); queue.push(next);
      }
    }
    return component;
  }

  private repairSplitWarTerritory(targetId: number, replacement: number, original: Set<number>, changed: Array<[number, number]>) {
    if (original.size < 8 || changed.length < 4) return;
    const unvisited = new Set([...original].filter((index) => this.owners[index] === targetId));
    const components: number[][] = [];
    while (unvisited.size) {
      const seed = unvisited.values().next().value as number;
      const queue = [seed], component: number[] = [];
      unvisited.delete(seed);
      for (let cursor = 0; cursor < queue.length; cursor++) {
        const index = queue[cursor], x = index % MAP_W, y = Math.floor(index / MAP_W);
        component.push(index);
        for (const [ox, oy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
          const ny = y + oy;
          if (ny < 0 || ny >= MAP_H) continue;
          const next = ny * MAP_W + wrapX(x + ox);
          if (!unvisited.has(next)) continue;
          unvisited.delete(next); queue.push(next);
        }
      }
      components.push(component);
    }
    if (components.length <= 1) return;
    components.sort((a, b) => b.length - a.length);
    const changedMap = new Map(changed);
    let absorbedWeight = 0;
    for (const component of components.slice(1)) for (const index of component) {
      this.owners[index] = replacement;
      changedMap.set(index, targetId);
      absorbedWeight += this.rowWeight[Math.floor(index / MAP_W)];
    }

    // Move the same amount of the conquest back toward the defender's largest
    // surviving body. This replaces split-off pockets with one continuous
    // political front while keeping the rolled area essentially unchanged.
    const queued = new Uint8Array(this.owners.length), frontier: number[] = [];
    const enqueueActorNeighbours = (index: number) => {
      const x = index % MAP_W, y = Math.floor(index / MAP_W);
      for (const [ox, oy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
        const ny = y + oy;
        if (ny < 0 || ny >= MAP_H) continue;
        const next = ny * MAP_W + wrapX(x + ox);
        if (queued[next] || this.owners[next] !== replacement || !changedMap.has(next)) continue;
        queued[next] = 1; frontier.push(next);
      }
    };
    components[0].forEach(enqueueActorNeighbours);
    let returnedWeight = 0;
    for (let cursor = 0; cursor < frontier.length && returnedWeight + .25 < absorbedWeight; cursor++) {
      const index = frontier[cursor];
      if (this.owners[index] !== replacement || !changedMap.has(index)) continue;
      this.owners[index] = targetId;
      changedMap.delete(index);
      returnedWeight += this.rowWeight[Math.floor(index / MAP_W)];
      enqueueActorNeighbours(index);
    }
    changed.splice(0, changed.length, ...[...changedMap].map(([index, owner]) => [index, owner] as [number, number]));
  }

  private captureFront(starts: number[], allowed: number, replacement: number, goal: number, direction: Direction, changed: Array<[number, number]>) {
    if (!starts.length || goal <= 0) return;
    const primary = starts[0], primaryX = primary % MAP_W, primaryY = Math.floor(primary / MAP_W);
    const noiseSeed = Math.floor(this.random() * 0x7fffffff);
    const cardinalSteps = [[-1, 0], [1, 0], [0, -1], [0, 1]];
    // The first implementation spent up to 24% of the conquered area on a
    // one-cell-deep ribbon following the shared border. On long north/south
    // borders (Syria -> Iraq, Thailand -> Myanmar) that ribbon could consume
    // almost the whole roll and render as a vertical ruler line. Derive the
    // frontage from the square root of the requested *cell* area instead: the
    // remainder is then forced to advance several cells into the defender.
    const localWeight = Math.max(.08, this.rowWeight[primaryY]);
    const targetCells = Math.max(1, goal / localWeight);
    const baseGoal = Math.max(1, Math.min(280, Math.ceil(Math.sqrt(targetCells * 1.35))));
    const halfWidth = Math.max(2, Math.min(160, baseGoal * 0.48));
    const organicScale = Math.max(4, Math.min(16, Math.round(halfWidth / 5)));
    const noiseAt = (x: number, y: number) => {
      let hash = Math.imul(x + noiseSeed, 374761393) ^ Math.imul(y - noiseSeed, 668265263);
      hash = Math.imul(hash ^ (hash >>> 13), 1274126177);
      return ((hash ^ (hash >>> 16)) >>> 0) / 4294967295 * 2 - 1;
    };
    const smoothNoiseAt = (x: number, y: number) => {
      const gx = Math.floor(x / organicScale), gy = Math.floor(y / organicScale);
      const fx = x / organicScale - gx, fy = y / organicScale - gy;
      const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
      const top = noiseAt(gx, gy) * (1 - sx) + noiseAt(gx + 1, gy) * sx;
      const bottom = noiseAt(gx, gy + 1) * (1 - sx) + noiseAt(gx + 1, gy + 1) * sx;
      return top * (1 - sy) + bottom * sy;
    };
    const projected = (index: number) => {
      const x = index % MAP_W, y = Math.floor(index / MAP_W);
      const dx = deltaX(x, primaryX), dy = y - primaryY;
      return {
        x, y,
        outward: dx * direction.dx + dy * direction.dy,
        lateral: Math.abs(dx * -direction.dy + dy * direction.dx),
      };
    };

    // Build a long, connected bridgehead along the real shared border first.
    // A radial flood from one contact cell is what used to draw diamonds.
    const baseQueued = new Uint8Array(this.owners.length);
    const baseFront: Array<{ index: number; priority: number }> = [];
    const baseCells: number[] = [];
    const basePriority = (index: number) => {
      const { x, y, outward, lateral } = projected(index);
      return Math.abs(outward) * 2.8 + Math.max(0, lateral - halfWidth) * 1.5
        + lateral * 0.018 + smoothNoiseAt(x, y) * 0.42 + noiseAt(x, y) * 0.08;
    };
    heapPush(baseFront, { index: primary, priority: basePriority(primary) });
    baseQueued[primary] = 1;
    while (baseFront.length && baseCells.length < baseGoal) {
      const current = heapPop(baseFront);
      if (this.owners[current.index] !== allowed) continue;
      baseCells.push(current.index);
      const { x, y } = projected(current.index);
      for (const [ox, oy] of cardinalSteps) {
        const ny = y + oy;
        if (ny < 0 || ny >= MAP_H) continue;
        const next = ny * MAP_W + wrapX(x + ox);
        if (baseQueued[next] || this.owners[next] !== allowed) continue;
        baseQueued[next] = 1;
        heapPush(baseFront, { index: next, priority: basePriority(next) });
      }
    }

    let accumulated = 0;
    const committedBase: number[] = [];
    for (const index of baseCells) {
      if (accumulated >= goal) break;
      if (this.owners[index] !== allowed) continue;
      const weight = this.rowWeight[Math.floor(index / MAP_W)];
      if (accumulated > 0 && accumulated + weight > goal) break;
      changed.push([index, allowed]);
      this.owners[index] = replacement;
      accumulated += weight;
      committedBase.push(index);
    }
    if (accumulated >= goal) return;

    type FrontItem = PriorityItem & { depth: number };
    const queued = new Uint8Array(this.owners.length);
    const frontier: FrontItem[] = [];
    committedBase.forEach((index) => { queued[index] = 1; });
    const queueNeighbours = (index: number, travelCost: number) => {
      const x = index % MAP_W, y = Math.floor(index / MAP_W);
      for (const [ox, oy] of cardinalSteps) {
        const ny = y + oy;
        if (ny < 0 || ny >= MAP_H) continue;
        const next = ny * MAP_W + wrapX(x + ox);
        if (queued[next] || this.owners[next] !== allowed) continue;
        queued[next] = 1;
        const point = projected(next);
        const outsideFront = Math.max(0, point.lateral - halfWidth);
        const backward = Math.max(0, -point.outward);
        const nextCost = travelCost + 1 + smoothNoiseAt(point.x, point.y) * 0.2 + noiseAt(point.x, point.y) * 0.045;
        // Once the bridgehead has a useful width, spend the remaining roll on
        // depth. A weak lateral penalty let east/west attacks keep crawling up
        // and down a long border, recreating the familiar vertical stripe.
        const priority = nextCost * 3.2 + backward * 2.4 + outsideFront * 4
          - Math.max(0, point.outward) * 0.7
          + smoothNoiseAt(point.x, point.y) * 1.75 + noiseAt(point.x, point.y) * 0.16;
        heapPush(frontier, { index: next, depth: nextCost, priority });
      }
    };
    committedBase.forEach((index) => queueNeighbours(index, 0));

    // Commit the priority flood cell by cell. The previous integer "bands"
    // could contain more cells than the remaining roll; rejecting such a band
    // stopped the offensive after its shallow border base and left a long
    // north/south stripe. Per-cell commits keep the region connected and let
    // it advance to the intended depth without exceeding the rolled area.
    while (frontier.length && accumulated < goal) {
      const current = heapPop(frontier);
      if (this.owners[current.index] !== allowed) continue;
      const weight = this.rowWeight[Math.floor(current.index / MAP_W)];
      if (accumulated > 0 && accumulated + weight > goal) continue;
      changed.push([current.index, allowed]);
      this.owners[current.index] = replacement;
      accumulated += weight;
      queueNeighbours(current.index, current.depth);
    }
  }

  private pruneWarTendrils(changed: Array<[number, number]>, replacement: number, direction: Direction) {
    if (changed.length < 4) return;
    const captured = new Set(changed.map(([index]) => index));
    const oldOwner = new Map(changed);
    const neighbours = [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]];
    const perpendicular = { x: -direction.dy, y: direction.dx };
    const offsetAt = (index: number, step: number) => {
      const x = index % MAP_W, y = Math.floor(index / MAP_W);
      const nx = wrapX(x + Math.round(perpendicular.x * step));
      const ny = y + Math.round(perpendicular.y * step);
      return ny < 0 || ny >= MAP_H ? -1 : ny * MAP_W + nx;
    };

    // Tendril cleanup is a land-front operation. In a naval invasion none of
    // the captured cells touches the attacker's pre-war territory; applying a
    // thickness test there mistakes one/two-cell-wide islands for artefacts
    // and can erase the whole conquest (Gabon -> Sao Tome and Principe).
    const hasOriginalLandSupport = [...captured].some((index) => {
      const x = index % MAP_W, y = Math.floor(index / MAP_W);
      return neighbours.some(([ox, oy]) => {
        const ny = y + oy;
        if (ny < 0 || ny >= MAP_H) return false;
        const next = ny * MAP_W + wrapX(x + ox);
        return !captured.has(next) && this.owners[next] === replacement;
      });
    });
    if (!hasOriginalLandSupport) return;

    // Evaluate thickness once against the complete captured shape. Repeating
    // this as a morphological erosion used to peel a perfectly healthy small
    // bridgehead layer by layer (up to 24 times), turning BIG into a handful
    // of cells for microstates such as Djibouti. A true one/two-cell spear is
    // thin along its entire length and is still removed in this single pass;
    // only the outer fringe of a compact region can be trimmed.
    const remove: number[] = [];
    for (const index of captured) {
      const x = index % MAP_W, y = Math.floor(index / MAP_W);
      let originalSupport = false, connected = 0;
      for (const [ox, oy] of neighbours) {
        const ny = y + oy;
        if (ny < 0 || ny >= MAP_H) continue;
        const next = ny * MAP_W + wrapX(x + ox);
        if (captured.has(next)) connected++;
        else if (this.owners[next] === replacement) originalSupport = true;
      }
      if (originalSupport) continue;
      const lateral = new Set<number>();
      for (let step = -2; step <= 2; step++) {
        const next = offsetAt(index, step);
        if (next >= 0 && captured.has(next)) lateral.add(next);
      }
      if (connected <= 2 || lateral.size < 3) remove.push(index);
    }
    for (const index of remove) {
      captured.delete(index);
      this.owners[index] = oldOwner.get(index) ?? -1;
    }
    if (captured.size === changed.length) return;
    const kept = changed.filter(([index]) => captured.has(index));
    changed.splice(0, changed.length, ...kept);
  }

  private closeWarEnclaves(targetId: number, replacement: number, goal: number, changed: Array<[number, number]>) {
    if (changed.length < 8 || goal <= 0) return;
    const steps = [[-1, 0], [1, 0], [0, -1], [0, 1]];
    const changedSet = new Set(changed.map(([index]) => index));
    const checked = new Uint8Array(this.owners.length);
    const seeds = new Set<number>();
    for (const [index] of changed) {
      const x = index % MAP_W, y = Math.floor(index / MAP_W);
      for (const [ox, oy] of steps) {
        const ny = y + oy;
        if (ny < 0 || ny >= MAP_H) continue;
        const next = ny * MAP_W + wrapX(x + ox);
        if (this.owners[next] === targetId) seeds.add(next);
      }
    }

    // Only small pockets created by the current offensive are closed. This
    // prevents legitimate large enclaves (or an entire surrounded country)
    // from being annexed merely because they already bordered the attacker.
    const maxPocketWeight = Math.max(4, goal * .18);
    const maxPocketCells = 180;
    for (const seed of seeds) {
      if (checked[seed] || this.owners[seed] !== targetId) continue;
      const queue = [seed], component: number[] = [];
      checked[seed] = 1;
      let enclosed = true, touchesNewCapture = false, componentWeight = 0, oversized = false;
      for (let cursor = 0; cursor < queue.length; cursor++) {
        const index = queue[cursor], x = index % MAP_W, y = Math.floor(index / MAP_W);
        component.push(index);
        componentWeight += this.rowWeight[y];
        if (component.length > maxPocketCells || componentWeight > maxPocketWeight) oversized = true;
        for (const [ox, oy] of steps) {
          const ny = y + oy;
          if (ny < 0 || ny >= MAP_H) { enclosed = false; continue; }
          const next = ny * MAP_W + wrapX(x + ox), owner = this.owners[next];
          if (owner === targetId) {
            if (!checked[next]) { checked[next] = 1; queue.push(next); }
          } else if (owner === replacement) {
            if (changedSet.has(next)) touchesNewCapture = true;
          } else enclosed = false;
        }
      }
      if (!enclosed || !touchesNewCapture || oversized || !component.length) continue;

      // Protect the ring that actually surrounds the pocket. To keep the
      // rolled km2 unchanged, peel the same weight from the exposed outer edge
      // of the new conquest, working backwards through the growth order.
      const protectedRing = new Set<number>();
      for (const index of component) {
        const x = index % MAP_W, y = Math.floor(index / MAP_W);
        for (const [ox, oy] of steps) {
          const ny = y + oy;
          if (ny < 0 || ny >= MAP_H) continue;
          const next = ny * MAP_W + wrapX(x + ox);
          if (changedSet.has(next)) protectedRing.add(next);
        }
      }
      const originalChanged = changed.slice(), reverted: number[] = [];
      for (const index of component) {
        this.owners[index] = replacement;
        changedSet.add(index);
        changed.push([index, targetId]);
      }
      let toRebalance = componentWeight, progress = true;
      while (toRebalance > .25 && progress) {
        progress = false;
        for (let cursor = originalChanged.length - 1; cursor >= 0; cursor--) {
          const index = originalChanged[cursor];
          if (!changedSet.has(index[0]) || protectedRing.has(index[0]) || this.owners[index[0]] !== replacement) continue;
          const x = index[0] % MAP_W, y = Math.floor(index[0] / MAP_W);
          const exposed = steps.some(([ox, oy]) => {
            const ny = y + oy;
            return ny >= 0 && ny < MAP_H && this.owners[ny * MAP_W + wrapX(x + ox)] === targetId;
          });
          if (!exposed) continue;
          this.owners[index[0]] = targetId;
          changedSet.delete(index[0]);
          reverted.push(index[0]);
          toRebalance -= this.rowWeight[y];
          progress = true;
          break;
        }
      }
      if (toRebalance > .25) {
        for (const index of component) this.owners[index] = targetId;
        for (const index of reverted) this.owners[index] = replacement;
        changed.splice(0, changed.length, ...originalChanged);
        changedSet.clear();
        originalChanged.forEach(([index]) => changedSet.add(index));
      } else {
        const kept = changed.filter(([index]) => changedSet.has(index));
        changed.splice(0, changed.length, ...kept);
      }
    }
  }

  private erodeLowlands(actorId: number, direction: Direction, goal: number, stats: Stats[], changed: Array<[number, number]>) {
    if (goal <= 0) return;
    const origin = stats[actorId];
    const cardinalSteps = [[-1, 0], [1, 0], [0, -1], [0, 1]];
    const candidates: Array<{ index: number; outward: number; coastal: boolean }> = [];
    let maximumOutward = -Infinity, minimumOutward = Infinity;
    for (let index = 0; index < this.owners.length; index++) {
      if (this.owners[index] !== actorId) continue;
      const x = index % MAP_W, y = Math.floor(index / MAP_W);
      const outward = deltaX(x, origin.cx) * direction.dx + (y - origin.cy) * direction.dy;
      let coastal = false;
      for (const [ox, oy] of cardinalSteps) {
        const ny = y + oy;
        if (ny >= 0 && ny < MAP_H && this.owners[ny * MAP_W + wrapX(x + ox)] === -1) { coastal = true; break; }
      }
      candidates.push({ index, outward, coastal });
      maximumOutward = Math.max(maximumOutward, outward);
      minimumOutward = Math.min(minimumOutward, outward);
    }
    if (!candidates.length) return;

    // The compass chooses a broad sector; terrain height chooses the exact place.
    // An archipelago may need several separate flood fronts to reach the rolled size.
    const sectorEdge = maximumOutward - Math.max(2, (maximumOutward - minimumOutward) * 0.3);
    const localHeight = (index: number) => {
      const x = index % MAP_W, y = Math.floor(index / MAP_W);
      let total = this.elevation[index], samples = 1;
      for (const [ox, oy] of cardinalSteps) {
        const ny = y + oy;
        if (ny < 0 || ny >= MAP_H) continue;
        const next = ny * MAP_W + wrapX(x + ox);
        if (this.owners[next] === actorId) { total += this.elevation[next]; samples++; }
      }
      return total / samples;
    };

    type FloodItem = PriorityItem & { spill: number; depth: number };
    const visited = new Uint16Array(this.owners.length);
    let floodId = 0;
    const noiseSeed = Math.floor(this.random() * 0x7fffffff);
    const erosionRadius = Math.max(4, Math.sqrt(goal));
    const noiseAt = (x: number, y: number) => {
      let hash = Math.imul(x + noiseSeed, 374761393) ^ Math.imul(y - noiseSeed, 668265263);
      hash = Math.imul(hash ^ (hash >>> 13), 1274126177);
      return ((hash ^ (hash >>> 16)) >>> 0) / 4294967295 * 2 - 1;
    };
    const smoothNoiseAt = (x: number, y: number, scale: number) => {
      const gx = Math.floor(x / scale), gy = Math.floor(y / scale);
      const fx = x / scale - gx, fy = y / scale - gy;
      const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
      const top = noiseAt(gx, gy) * (1 - sx) + noiseAt(gx + 1, gy) * sx;
      const bottom = noiseAt(gx, gy + 1) * (1 - sx) + noiseAt(gx + 1, gy + 1) * sx;
      return top * (1 - sy) + bottom * sy;
    };
    let accumulated = 0;

    let remainingCells = stats[actorId].cells;
    while (accumulated < goal && remainingCells > 3) {
      const remaining = candidates.filter((item) => this.owners[item.index] === actorId);
      if (!remaining.length) break;
      const directional = remaining.filter((item) => item.outward >= sectorEdge);
      const directionalPool = directional.length ? directional : remaining;
      const coastal = directionalPool.filter((item) => item.coastal);
      const seedPool = coastal.length ? coastal : directionalPool;
      let seed = seedPool[0].index, best = Infinity;
      for (const candidate of seedPool) {
        const score = localHeight(candidate.index) + (maximumOutward - candidate.outward) * 4;
        if (score < best) { best = score; seed = candidate.index; }
      }

      floodId++;
      if (floodId === 65_535) { visited.fill(0); floodId = 1; }
      const frontier: FloodItem[] = [];
      const seedX = seed % MAP_W, seedY = Math.floor(seed / MAP_W);
      const priorityAt = (index: number, spill: number, depth: number) => {
        const x = index % MAP_W, y = Math.floor(index / MAP_W);
        const dx = deltaX(x, seedX), dy = y - seedY;
        const outward = dx * direction.dx + dy * direction.dy;
        const angle = Math.atan2(dy, dx), distance = Math.hypot(dx, dy);
        const phase = (noiseSeed % 6_283) / 1_000;
        const contour = 1
          + Math.sin(angle * 3 + phase) * 0.08
          + Math.sin(angle * 6 - phase * 0.61) * 0.04;
        const regionalNoise = smoothNoiseAt(x, y, 17) * erosionRadius * 0.11;
        // Direction selects the basin and remains only a gentle preference.
        // Terrain and organic local variation shape the flooded shoreline.
        return spill + distance * contour * 0.16 + Math.max(0, -outward) * 0.28
          + regionalNoise + depth * 0.015 + noiseAt(x, y) * 0.45;
      };
      heapPush(frontier, { index: seed, spill: this.elevation[seed], depth: 0, priority: this.elevation[seed] });
      visited[seed] = floodId;
      let componentChanged = false;
      while (frontier.length && accumulated < goal && remainingCells > 3) {
        const current = heapPop(frontier);
        if (this.owners[current.index] !== actorId) continue;
        const x = current.index % MAP_W, y = Math.floor(current.index / MAP_W);
        changed.push([current.index, actorId]);
        this.owners[current.index] = -1;
        remainingCells--;
        componentChanged = true;
        accumulated += this.rowWeight[y];
        for (const [ox, oy] of cardinalSteps) {
          const ny = y + oy;
          if (ny < 0 || ny >= MAP_H) continue;
          const next = ny * MAP_W + wrapX(x + ox);
          if (visited[next] === floodId || this.owners[next] !== actorId) continue;
          visited[next] = floodId;
          const spill = Math.max(current.spill, this.elevation[next]), depth = current.depth + 1;
          heapPush(frontier, { index: next, spill, depth, priority: priorityAt(next, spill, depth) });
        }
      }
      if (!componentChanged) break;
    }
  }

  private grow(starts: number[], allowed: number, replacement: number, goal: number, direction: Direction, changed: Array<[number, number]>) {
    if (!starts.length || goal <= 0) return;
    const seedPool = [...new Set(starts)];
    const noiseSeed = Math.floor(this.random() * 0x7fffffff);
    const radius = Math.max(4, Math.sqrt(goal) * 0.35);
    const queued = new Uint8Array(this.owners.length);
    let accumulated = 0;
    const steps = [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, -1], [-1, 1], [1, 1]];
    const noiseAt = (x: number, y: number) => {
      let hash = Math.imul(x + noiseSeed, 374761393) ^ Math.imul(y - noiseSeed, 668265263);
      hash = Math.imul(hash ^ (hash >>> 13), 1274126177);
      return ((hash ^ (hash >>> 16)) >>> 0) / 4294967295 * 2 - 1;
    };
    const smoothNoiseAt = (x: number, y: number, scale: number) => {
      const gx = Math.floor(x / scale), gy = Math.floor(y / scale);
      const fx = x / scale - gx, fy = y / scale - gy;
      const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
      const top = noiseAt(gx, gy) * (1 - sx) + noiseAt(gx + 1, gy) * sx;
      const bottom = noiseAt(gx, gy + 1) * (1 - sx) + noiseAt(gx + 1, gy + 1) * sx;
      return top * (1 - sy) + bottom * sy;
    };
    // ETOPO is lower-resolution than the simulation grid. Averaging across one
    // source cell prevents its upscaled pixels from becoming visible terraces.
    const seabedAt = (index: number) => {
      const x = index % MAP_W, y = Math.floor(index / MAP_W), sampleRadius = 6;
      let total = this.elevation[index] * 4, samples = 4;
      for (const [ox, oy] of [[-sampleRadius, 0], [sampleRadius, 0], [0, -sampleRadius], [0, sampleRadius]]) {
        const ny = y + oy;
        if (ny < 0 || ny >= MAP_H) continue;
        total += this.elevation[ny * MAP_W + wrapX(x + ox)];
        samples++;
      }
      return total / samples;
    };
    while (accumulated < goal) {
      const availableSeeds = seedPool.filter((index) => this.owners[index] === allowed && !queued[index]);
      if (!availableSeeds.length) break;
      let first = availableSeeds[0], bestSeedScore = -Infinity;
      availableSeeds.forEach((index, rank) => {
        const score = this.elevation[index] - rank * 1.5 + this.random() * 2;
        if (score > bestSeedScore) { bestSeedScore = score; first = index; }
      });
      const seedX = first % MAP_W, seedY = Math.floor(first / MAP_W);
      const seedSeabed = seabedAt(first);
      const seedRowWeight = Math.max(.12, this.rowWeight[seedY]);
      const maximumReach = Math.max(12, Math.sqrt(goal / seedRowWeight) * 2.35 + 5);
      const frontier: Array<{ index: number; priority: number }> = [];
      const priorityAt = (index: number) => {
        const x = index % MAP_W, y = Math.floor(index / MAP_W);
        const dx = deltaX(x, seedX), dy = y - seedY;
        const outward = dx * direction.dx + dy * direction.dy;
        const lateral = Math.abs(dx * -direction.dy + dy * direction.dx);
        const angle = Math.atan2(dy, dx), distance = Math.hypot(dx, dy);
        const phase = (noiseSeed % 6_283) / 1_000;
        const contour = 1
          + Math.sin(angle * 3 + phase) * 0.09
          + Math.sin(angle * 5 - phase * 0.73) * 0.05
          + Math.sin(angle * 8 + phase * 1.31) * 0.025;
        const regionalNoise = smoothNoiseAt(x, y, 43) * radius * 0.055;
        // Terrain chooses among nearby cells, but cannot outweigh hundreds of
        // kilometres of distance. The old unbounded elevation bonus made a
        // thin causeway race across open sea toward a distant shallow shelf.
        const terrainBonus = Math.max(-14, Math.min(14, (seabedAt(index) - seedSeabed) / 180));
        const drowned = this.initialOwners[index] >= 0 && this.owners[index] < 0 ? DROWNED_LAND_BONUS : 0;
        return -terrainBonus - drowned + distance * contour - outward * 0.08
          + lateral * 0.025 + regionalNoise + noiseAt(x, y) * 1.5;
      };
      heapPush(frontier, { index: first, priority: 0 });
      queued[first] = 1;
      while (frontier.length && accumulated < goal) {
        const index = heapPop(frontier).index;
        if (this.owners[index] !== allowed) continue;
        const x = index % MAP_W, y = Math.floor(index / MAP_W);
        changed.push([index, allowed]);
        this.owners[index] = replacement;
        accumulated += this.rowWeight[y];
        for (const [ox, oy] of steps) {
          const ny = y + oy;
          if (ny < 0 || ny >= MAP_H) continue;
          const nx = wrapX(x + ox), next = ny * MAP_W + nx;
          if (queued[next] || this.owners[next] !== allowed) continue;
          if (Math.hypot(deltaX(nx, seedX), ny - seedY) > maximumReach) continue;
          queued[next] = 1;
          heapPush(frontier, { index: next, priority: priorityAt(next) });
        }
      }
    }
  }

  // Every CATACLYSM_EVERY_TURNS turns the sea takes a slice of every state at
  // once. One direction is rolled for the whole world so a saved game replays
  // the same random stream regardless of how many countries are still alive.
  private runCataclysm(actor: Country, changed: Array<[number, number]>): TurnRecord | undefined {
    if (this.gameMode !== "full" || !this.cataclysmEnabled) return undefined;
    if (this.turn <= 0 || this.turn % CATACLYSM_EVERY_TURNS !== 0) return undefined;
    const stats = this.stats(), direction = this.pick(DIRECTIONS);
    const cataclysmChanged: Array<[number, number]> = [];
    for (const country of this.countries) {
      if (!this.isCountryPlayable(country.id) || (stats[country.id]?.cells ?? 0) <= 3) continue;
      this.erodeLowlands(country.id, direction, stats[country.id].weight * CATACLYSM_FRACTION, stats, cataclysmChanged);
    }
    if (!cataclysmChanged.length) return undefined;
    this.commitOwnerChanges(cataclysmChanged);
    const weight = cataclysmChanged.reduce((sum, [index]) => sum + this.rowWeight[Math.floor(index / MAP_W)], 0);
    const changedKm2 = weight * this.km2PerWeight;
    changed.push(...cataclysmChanged);
    return {
      turn: this.turn, countryId: actor.id, countryName: actor.name, countryFlag: actor.flag,
      action: "erosion", direction: direction.label, directionShort: direction.short,
      size: "tiny", fraction: CATACLYSM_FRACTION, targetId: null, targetName: null, targetFlag: null,
      changedKm2, actualFraction: CATACLYSM_FRACTION, eliminated: null, cataclysm: true,
      text: `Kataklizm: morza zalewają niziny na całym świecie, ląd traci około ${formatNumber(changedKm2)} km²`,
    };
  }

  apply(plan: TurnPlan) {
    const before = this.stats(), actor = this.countries[plan.countryId], changed: Array<[number, number]> = [];
    let bridgeTo: string | undefined;
    const actorColorBefore: [number, number, number] = [actor.color[0], actor.color[1], actor.color[2]];
    const warExhaustionBefore = this.gameMode === "war" ? [...this.warExhaustion] : undefined;
    const capitalStatesBefore = this.gameMode === "war" ? this.capitalStates.map((capital) => capital ? { ...capital } : null) : undefined;
    const warMinShareBefore = this.gameMode === "war" ? [...this.warMinShare] : undefined;
    let goal = before[plan.countryId].weight * plan.fraction;
    let target: Country | null = null;
    if (plan.action === "war" && plan.targetId !== null) {
      target = this.countries[plan.targetId];
      const targetCapital = this.capitalStates[target.id];
      if (this.gameMode === "war" && targetCapital && targetCapital.lostTurn !== null) goal *= 1.5;
      if (this.gameMode === "war" && this.warGuarantee && target.id === this.warGuarantee.countryId && this.turn < this.warGuarantee.untilTurn) goal *= WAR_GUARANTEE_MULTIPLIER;
      // TINY–LARGE remains a percentage of the attacker, but the same rolled
      // percentage is also a hard ceiling on the defender. Only ALL may erase
      // the entire defending state in one action.
      if (plan.size !== "all") goal = Math.min(goal, before[target.id].weight * plan.fraction);
      if (plan.size === "all") {
        // ALL refers to the current political owner, not merely the connected
        // landmass hit by the ray. Islands and overseas possessions fall too.
        // In the Europe-without-Russia mode Kaliningrad is the one Russian
        // territory participating in the game. Capturing it must not annex
        // the whole of Russia outside the selected region.
        const kaliningradOnly = this.gameRegion === "europe" && target.iso === "RU";
        for (let index = 0; index < this.owners.length; index++) if (this.owners[index] === target.id && (!kaliningradOnly || isKaliningradIndex(index))) {
          changed.push([index, target.id]);
          this.owners[index] = actor.id;
        }
      } else {
        const sharedBorder = this.sharedBorderSeeds(actor.id, target.id, plan.direction, before);
        const impact = this.targetInDirection(actor.id, plan.direction, before);
        const firstSeed = sharedBorder[0] ?? (impact?.countryId === target.id ? impact.index : -1);
        const attackedTerritory = this.ownerComponent(target.id, firstSeed);
        if (sharedBorder.length) {
          this.captureFront(sharedBorder, target.id, actor.id, goal, plan.direction, changed);
        } else if (impact?.countryId === target.id) {
          this.captureFront([impact.index], target.id, actor.id, goal, plan.direction, changed);
        } else {
          const dx = deltaX(before[actor.id].cx, before[target.id].cx), dy = before[actor.id].cy - before[target.id].cy;
          const length = Math.max(1, Math.hypot(dx, dy)), tx = dx / length, ty = dy / length;
          const seeds = this.borderSeeds(target.id, tx, ty, before);
          this.captureFront(seeds, target.id, actor.id, goal, { ...plan.direction, dx: -tx, dy: -ty }, changed);
        }

        // A rolled share is a share of the attacker, even when the first hit
        // is a tiny island. Continue on the defender's largest remaining
        // possession until the requested amount is actually reached.
        const changedWeight = () => changed.reduce((sum, [index]) => sum + this.rowWeight[Math.floor(index / MAP_W)], 0);
        let remaining = goal - changedWeight(), attempts = 0;
        const localWeight = Math.max(.08, this.rowWeight[Math.floor(Math.max(0, firstSeed) / MAP_W)]);
        const tinyFirstTerritory = attackedTerritory.size <= Math.max(64, goal / localWeight * .2)
          && !(this.gameRegion === "europe" && target.iso === "RU");
        while (remaining > 1 && tinyFirstTerritory && attempts++ < 32) {
          const currentStats = this.stats();
          const territory = this.largestRemainingTerritory(target.id, actor.id, currentStats);
          if (!territory) break;
          const seedX = territory.seed % MAP_W, seedY = Math.floor(territory.seed / MAP_W);
          const dx = deltaX(territory.cx, seedX), dy = territory.cy - seedY;
          const length = Math.max(1, Math.hypot(dx, dy));
          const beforeCount = changed.length;
          this.captureFront([territory.seed], target.id, actor.id, remaining, { ...plan.direction, dx: dx / length, dy: dy / length }, changed);
          if (changed.length === beforeCount) break;
          remaining = goal - changedWeight();
        }
        this.repairSplitWarTerritory(target.id, actor.id, attackedTerritory, changed);
        const captureBeforeCleanup = changed.slice();
        this.pruneWarTendrils(changed, actor.id, plan.direction);
        // Cleanup is visual and must never silently change the rolled size on
        // an ordinary, broad land front. If it removes more than raster
        // rounding allows, keep the organically generated capture. Very narrow
        // contacts may still be marked partial rather than drawing a spear.
        if (sharedBorder.length > 4 && changedWeight() + 1 < goal) {
          const kept = new Set(changed.map(([index]) => index));
          for (const [index] of captureBeforeCleanup) if (!kept.has(index)) this.owners[index] = actor.id;
          changed.splice(0, changed.length, ...captureBeforeCleanup);
        }
        this.closeWarEnclaves(target.id, actor.id, goal, changed);
      }
      // In the Europe scenario only the Kaliningrad enclave participates.
      // Russia uses one political owner id on the source map, so an ordinary
      // front that starts in the enclave must be clipped before it can follow
      // that same owner into mainland Russia.
      if (this.gameRegion === "europe" && target.iso === "RU") {
        for (let position = changed.length - 1; position >= 0; position--) {
          const [index, previousOwner] = changed[position];
          if (isKaliningradIndex(index)) continue;
          this.owners[index] = previousOwner;
          changed.splice(position, 1);
        }
      }
    } else if (plan.action === "land") {
      // A land roll that closes the last strait between two states is an event
      // of its own: compare the political neighbourhood before and after.
      const neighboursBefore = new Set(this.neighbouringCountries(actor.id));
      this.grow(this.coast(actor.id, plan.direction, before).map((item) => item.sea), -1, actor.id, goal, plan.direction, changed);
      for (const id of this.neighbouringCountries(actor.id, changed)) {
        if (neighboursBefore.has(id)) continue;
        bridgeTo ??= this.countries[id]?.name;
      }
    } else {
      this.erodeLowlands(actor.id, plan.direction, goal, before, changed);
    }
    this.commitOwnerChanges(changed);
    this.ensureReadableColor(actor.id, changed);
    const weight = changed.reduce((sum, [index]) => sum + this.rowWeight[Math.floor(index / MAP_W)], 0);
    const changedKm2 = weight * this.km2PerWeight, actualFraction = before[actor.id].weight ? weight / before[actor.id].weight : 0;
    const partial = (plan.action !== "war" || plan.size !== "all") && weight + 1 < goal;
    const after = this.stats();
    const eliminated = target && after[target.id].cells === 0 ? target.name : null;
    if (eliminated && target) this.defeats[actor.id]++;
    this.turn++;
    let capitalLost: string | undefined, capitalRelocated: string | undefined;
    if (this.gameMode === "war") {
      this.warMinShare = this.countries.map((country) => {
        const share = country.initialWeight ? (after[country.id]?.weight ?? 0) / country.initialWeight : 0;
        return Math.min(this.warMinShare[country.id] ?? share, share);
      });
      if (plan.action === "war") this.warExhaustion = this.warExhaustion.map((value, id) => id === actor.id ? value + WAR_EXHAUSTION_GAIN : Math.max(0, value - WAR_EXHAUSTION_DECAY));
      for (const country of this.countries) {
        const capital = this.capitalStates[country.id];
        if (!capital || capital.index === null || capital.lostTurn !== null || this.owners[capital.index] === country.id || !this.isCountryPlayable(country.id)) continue;
        capital.lostTurn = this.turn;
        capitalLost ??= country.name;
      }
      for (const country of this.countries) {
        const capital = this.capitalStates[country.id];
        if (!capital || capital.lostTurn === null || this.turn - capital.lostTurn < WAR_CAPITAL_RELOCATION_TURNS || !after[country.id]?.cells) continue;
        const index = this.relocatedWarCapitalIndex(country.id, after);
        if (index === null) continue;
        capital.index = index;
        capital.lostTurn = null;
        capital.relocated = true;
        capitalRelocated ??= country.name;
      }
    }
    let text = plan.action === "war" && target
      ? eliminated
        ? `${actor.name} przejmuje całe terytorium: ${target.name}.`
        : partial
          ? `${actor.name} odbiera ${target.name} około ${formatNumber(changedKm2)} km² — ukształtowanie granicy nie pozwoliło wykonać pełnego ${SIZE_LABELS[plan.size]}.`
          : `${actor.name} odbiera ${target.name} około ${formatNumber(changedKm2)} km².`
      : plan.action === "land"
        ? partial
          ? `${actor.name} tworzy tylko ${formatNumber(changedKm2)} km² nowego lądu — w kierunku ${plan.direction.short} zabrakło wolnej wody na pełne ${SIZE_LABELS[plan.size]}.`
          : `${actor.name} tworzy około ${formatNumber(changedKm2)} km² nowego lądu.`
        : partial
          ? `${actor.name} traci przez erozję tylko około ${formatNumber(changedKm2)} km² — zachowano minimalne terytorium państwa.`
          : `${actor.name} traci przez erozję około ${formatNumber(changedKm2)} km².`;
    if (capitalLost) text = `${text.replace(/\.$/, "")}, stolica ${capitalLost} upada`;
    if (bridgeTo) text = `${text.replace(/\.$/, "")}, nowy ląd łączy je z ${bridgeTo}.`;
    const record: TurnRecord = {
      turn: this.turn, countryId: actor.id, countryName: actor.name, countryFlag: actor.flag,
      action: plan.action, direction: plan.direction.label, directionShort: plan.direction.short,
      size: plan.size, fraction: plan.fraction, targetId: target?.id ?? null,
      targetName: target?.name ?? null, targetFlag: target?.flag ?? null,
      changedKm2, actualFraction, partial, eliminated, ...(capitalLost ? { capitalLost } : {}), ...(capitalRelocated ? { capitalRelocated } : {}), ...(bridgeTo ? { bridgeTo } : {}), text,
    };
    const cataclysmRecord = this.runCataclysm(actor, changed);
    this.history = [...this.history, record, ...(cataclysmRecord ? [cataclysmRecord] : [])].slice(-120);
    this.undoStack = [...this.undoStack, {
      rngBefore: plan.rngBefore, changed, color: actorColorBefore, countryId: actor.id, defeatedId: eliminated && target ? target.id : null,
      ...(cataclysmRecord ? { historyEntries: 2 } : {}),
      ...(warExhaustionBefore ? { warExhaustion: warExhaustionBefore } : {}), ...(capitalStatesBefore ? { capitalStates: capitalStatesBefore } : {}), ...(warMinShareBefore ? { warMinShare: warMinShareBefore } : {}),
    }].slice(-40);
    const changedIndices = changed.map(([index]) => index);
    this.updateVectorChangedPixels(changedIndices);
    return { record, changedIndices, ...(cataclysmRecord ? { cataclysmRecord } : {}) };
  }

  canUndo() { return this.undoStack.length > 0 && (this.gameMode !== "war" || this.warUndosLeft > 0); }
  undo() {
    if (this.gameMode === "war" && this.warUndosLeft <= 0) return false;
    const undo = this.undoStack.pop();
    if (!undo) return false;
    if (this.gameMode === "war") this.warUndosLeft--;
    const reversedChanges = undo.changed.map(([index]) => [index, this.owners[index]] as [number, number]);
    for (let i = undo.changed.length - 1; i >= 0; i--) this.owners[undo.changed[i][0]] = undo.changed[i][1];
    this.updateVectorChangedPixels(undo.changed.map(([index]) => index));
    this.countries[undo.countryId].color = [undo.color[0], undo.color[1], undo.color[2]];
    if (undo.defeatedId !== null) this.defeats[undo.countryId] = Math.max(0, this.defeats[undo.countryId] - 1);
    this.commitOwnerChanges(reversedChanges);
    this.rngState = undo.rngBefore;
    if (undo.warExhaustion) this.warExhaustion = [...undo.warExhaustion];
    if (undo.capitalStates) this.capitalStates = undo.capitalStates.map((capital) => capital ? { ...capital } : null);
    if (undo.warMinShare) this.warMinShare = [...undo.warMinShare];
    this.turn = Math.max(0, this.turn - 1);
    for (let entry = 0; entry < (undo.historyEntries ?? 1); entry++) this.history.pop();
    return true;
  }
  reset(seed = freshSeed(), mode: GameMode = this.gameMode, region: GameRegion = this.gameRegion, microstates: MicrostateRule = this.microstateRule, options?: { cataclysm?: boolean }) {
    this.owners.set(this.initialOwners);
    this.initialColors.forEach((color, id) => { this.countries[id].color = [color[0], color[1], color[2]]; });
    this.seed = seed || 1;
    this.rngState = this.seed;
    this.gameMode = mode;
    this.gameRegion = region;
    this.microstateRule = microstates;
    this.playerCountryId = null;
    this.cataclysmEnabled = options?.cataclysm ?? false;
    this.turn = 0;
    this.history = [];
    this.defeats.fill(0);
    this.undoStack = [];
    this.warExhaustion = this.countries.map(() => 0);
    this.capitalStates = this.initialWarCapitalStates();
    this.resetWarResources();
    this.countryCapabilityStates = loadCapabilityStatesFromSnapshot(this.countries, undefined);
    this.playerPolicyState.decisionPoints = mode === "strategy" ? 1 : 0;
    this.playerPolicyState.lastDecisionTurn = 0;
    this.playerPolicyState.activePolicies = [];
    this.playerPolicyState.decisions = createPlayerPolicyDecisionDefaults();
    if (mode === "strategy") {
      this.buildStrategicRegions();
      this.strategicPolitics = this.initialStrategicPolitics();
      this.strategicRelations.clear();
    }
    else { this.strategicProvinceAt = new Int32Array(0); this.strategicAdministrativeAt = new Int32Array(0); this.strategicRegions = []; this.strategicRegionRuns = []; this.strategicCampaigns = []; this.strategicTerritoryLog = []; this.strategicOccupations = []; this.strategicBattleArtifacts = []; this.strategicWarHistory = []; this.strategicPendingCasualties = this.countries.map(() => 0); this.strategicExhaustion = this.countries.map(() => 0); this.strategicPolitics = []; this.strategicRelations.clear(); this.strategicDefenseState = { posture: "continue", focusRegionId: null, mobilizedUntil: 0, mobilizationCooldownUntil: 0 }; }
    if (mode !== "strategy") { this.strategicCapitals = []; this.pendingCapitalRelocations.clear(); }
    this.regionalPopulation = [];
    this.vectorChangedPixels.fill(0);
    this.vectorChangedRows.fill(0);
    this.vectorHasChanges = false;
    this.vectorChangeLayerRevision = -1;
    this.vectorChangeLayers = [];
    this.initializePopulationWeights();
    this.populationDistribution = this.populationGrid.length === MAP_W * MAP_H ? "ghsl-2020" : "area";
    this.synchronizeRegionalPopulation();
    this.strategicQuarterStart = mode === "strategy" ? this.countries.map(({ id }) => ({ ...this.strategicComponents(id) })) : [];
    this.visualRevision++;
  }

  snapshot(): GameSnapshot {
    if (this.runsRevision !== this.visualRevision) {
      const runs: Array<[number, number]> = [];
      let owner = this.owners[0], count = 1;
      for (let i = 1; i < this.owners.length; i++) {
        if (this.owners[i] === owner && count < 65535) count++;
        else { runs.push([owner, count]); owner = this.owners[i]; count = 1; }
      }
      runs.push([owner, count]);
      this.runsCache = runs;
      this.runsRevision = this.visualRevision;
    }
    return {
      version: 1,
      mode: this.gameMode,
      region: this.gameRegion,
      microstates: this.microstateRule,
      playerCountryId: this.playerCountryId,
      strategicRegionSchema: this.gameMode === "strategy" ? 5 : undefined,
      strategicRegionOwners: this.gameMode === "strategy" ? this.strategicRegions.map(({ ownerId }) => ownerId) : undefined,
      strategicCampaigns: this.gameMode === "strategy" ? this.getStrategicCampaigns() : undefined,
      strategicTerritoryLog: this.gameMode === "strategy" ? this.getStrategicTerritoryLog() : undefined,
      strategicOccupations: this.gameMode === "strategy" ? this.getStrategicOccupations() : undefined,
      strategicBattleArtifacts: this.gameMode === "strategy" ? this.getStrategicBattleArtifacts() : undefined,
      strategicWarHistory: this.gameMode === "strategy" ? this.getStrategicWarHistory() : undefined,
      strategicExhaustion: this.gameMode === "strategy" ? [...this.strategicExhaustion] : undefined,
      strategicFortifications: this.gameMode === "strategy" ? this.strategicRegions.map(({ fortification }) => fortification) : undefined,
      strategicDefenseState: this.gameMode === "strategy" ? { ...this.strategicDefenseState } : undefined,
      strategicCapitals: this.gameMode === "strategy" ? this.strategicCapitals.map((capital) => capital ? { ...capital } : null) : undefined,
      warExhaustion: this.gameMode === "war" ? [...this.warExhaustion] : undefined,
      capitalStates: this.gameMode === "war" ? this.capitalStates.map((capital) => capital ? { ...capital } : null) : undefined,
      warVetoesLeft: this.gameMode === "war" ? this.warVetoesLeft : undefined,
      warUndosLeft: this.gameMode === "war" ? this.warUndosLeft : undefined,
      warGuarantee: this.gameMode === "war" ? this.warGuarantee ? { ...this.warGuarantee } : null : undefined,
      warGuaranteeUsed: this.gameMode === "war" ? this.warGuaranteeUsed : undefined,
      warMinShare: this.gameMode === "war" ? [...this.warMinShare] : undefined,
      cataclysmEnabled: this.cataclysmEnabled,
      colors: this.countries.map(({ color }) => [color[0], color[1], color[2]]),
      mapRevision: CURRENT_MAP_REVISION,
      width: MAP_W,
      height: MAP_H,
      seed: this.seed,
      rngState: this.rngState,
      turn: this.turn,
      runs: this.runsCache.map(([owner, count]) => [owner, count]),
      history: this.history.map((record) => ({ ...record })),
      defeats: [...this.defeats],
      countryCapabilityStates: this.countryCapabilityStates.map(capabilityStateToSnapshotArray),
      capabilityStatesV2: structuredClone(this.countryCapabilityStates),
      regionalPopulationV1: this.gameMode === "strategy" ? structuredClone(this.regionalPopulation) : undefined,
      populationDistributionV1: this.gameMode === "strategy" ? this.populationDistribution : undefined,
      strategicQuarterStartV1: this.gameMode === "strategy" ? structuredClone(this.strategicQuarterStart) : undefined,
      strategicPoliticsV1: this.gameMode === "strategy" ? this.strategicPolitics.map((state) => ({ ...state })) : undefined,
      strategicRelationsV1: this.gameMode === "strategy" ? [...this.strategicRelations.values()].map((relation) => ({ ...relation })) : undefined,
      policyStateV2: { decisionPoints: this.playerPolicyState.decisionPoints, lastDecisionTurn: this.playerPolicyState.lastDecisionTurn, used: Object.values(this.playerPolicyState.decisions).map((p) => ({ id: p.id, turn: p.lastUsedTurn })), active: this.playerPolicyState.activePolicies.map((p) => p.id) },
      infrastructureV2: this.strategicRegions.map(({ roadDensity, railDensity, airportCount, portCount, maritimeAccess }) => ({ roadDensity, railDensity, airportCount, portCount, maritimeAccess })),
    };
  }

  load(snapshot: GameSnapshot) {
    if (!isSnapshot(snapshot)) throw new Error("Plik zapisu jest uszkodzony.");
    if (snapshot.mapRevision !== undefined && snapshot.mapRevision > CURRENT_MAP_REVISION) throw new Error("Ten zapis pochodzi z nowszej wersji mapy.");
    if (snapshot.colors !== undefined && snapshot.colors.length !== this.countries.length) throw new Error("Plik zapisu ma nieprawidłową listę państw.");
    if (snapshot.defeats !== undefined && (snapshot.defeats.length !== this.countries.length || snapshot.defeats.some((count) => !Number.isInteger(count) || count < 0))) throw new Error("Plik zapisu ma nieprawidłowe statystyki państw.");
    if (snapshot.warExhaustion !== undefined && snapshot.warExhaustion.length !== this.countries.length) throw new Error("Plik zapisu ma nieprawidłowy stan zmęczenia wojną.");
    if (snapshot.capitalStates !== undefined && snapshot.capitalStates.length !== this.countries.length) throw new Error("Plik zapisu ma nieprawidłowy stan stolic.");
    if (snapshot.warMinShare !== undefined && snapshot.warMinShare.length !== this.countries.length) throw new Error("Plik zapisu ma nieprawidłowy stan tytułów.");
    if (snapshot.warGuarantee != null && snapshot.warGuarantee.countryId >= this.countries.length) throw new Error("Gwarancja zapisu wskazuje nieistniejące państwo.");
    if (snapshot.strategicTerritoryLog?.some((event) => event.fromOwnerId >= this.countries.length || event.toOwnerId >= this.countries.length)) throw new Error("Log zapisu odwołuje się do nieistniejącego państwa.");
    for (const record of snapshot.history) {
      if (record.countryId >= this.countries.length || (record.targetId !== null && record.targetId >= this.countries.length)) throw new Error("Historia zapisu odwołuje się do nieistniejącego państwa.");
    }
    const decode = (length: number) => {
      const decoded = new Int16Array(length);
      let offset = 0;
      for (const [owner, count] of snapshot.runs) {
        if (owner < -1 || owner >= this.countries.length || count < 1 || offset + count > length) throw new Error("Plik zapisu jest uszkodzony.");
        decoded.fill(owner, offset, offset + count);
        offset += count;
      }
      if (offset !== length) throw new Error("Plik zapisu jest uszkodzony.");
      return decoded;
    };

    let nextOwners: Int16Array;
    if (snapshot.width === MAP_W && snapshot.height === MAP_H) {
      const saved = decode(this.owners.length);
      nextOwners = snapshot.turn === 0 ? this.initialOwners.slice() : saved;
    } else if ((snapshot.width === PREVIOUS_MAP_W && snapshot.height === PREVIOUS_MAP_H)
      || (snapshot.width === OLDER_MAP_W && snapshot.height === OLDER_MAP_H)
      || (snapshot.width === LEGACY_MAP_W && snapshot.height === LEGACY_MAP_H)) {
      const sourceWidth = snapshot.width, sourceHeight = snapshot.height;
      const saved = decode(sourceWidth * sourceHeight);
      nextOwners = this.initialOwners.slice();
      if (snapshot.turn > 0) for (let y = 0; y < MAP_H; y++) for (let x = 0; x < MAP_W; x++) {
        const sourceX = Math.min(sourceWidth - 1, Math.floor(x * sourceWidth / MAP_W));
        const sourceY = Math.min(sourceHeight - 1, Math.floor(y * sourceHeight / MAP_H));
        const sourceIndex = sourceY * sourceWidth + sourceX;
        const unchangedLegacy = sourceWidth === LEGACY_MAP_W && saved[sourceIndex] === this.legacyInitialOwners[sourceIndex];
        if (!unchangedLegacy) nextOwners[y * MAP_W + x] = saved[sourceIndex];
      }
    } else {
      throw new Error("Ten zapis pochodzi z innej wersji mapy.");
    }
    const nextHistory = snapshot.history.slice(-120).map((record) => ({ ...record }));
    this.owners.set(nextOwners);
    this.seed = snapshot.seed; this.rngState = snapshot.rngState; this.gameMode = snapshot.mode ?? "full"; this.gameRegion = snapshot.region ?? "world"; this.microstateRule = snapshot.microstates ?? "all"; this.playerCountryId = snapshot.playerCountryId ?? null; this.cataclysmEnabled = snapshot.cataclysmEnabled ?? false; this.turn = snapshot.turn;
    if (this.gameMode === "strategy") {
      this.buildStrategicRegions();
      if (snapshot.playerCountryId !== undefined && snapshot.playerCountryId !== null && snapshot.playerCountryId >= this.countries.length) throw new Error("Zapis wskazuje nieistniejące państwo gracza.");
      const currentStrategicSchema = snapshot.strategicRegionSchema === 4 || snapshot.strategicRegionSchema === 5;
      if (currentStrategicSchema && snapshot.strategicRegionOwners && (snapshot.strategicRegionOwners.length !== this.strategicRegions.length || snapshot.strategicRegionOwners.some((ownerId) => ownerId >= this.countries.length))) throw new Error("Zapis ma nieprawidłową mapę regionów.");
      if (currentStrategicSchema && snapshot.strategicCampaigns?.some((campaign) => campaign.attackerId >= this.countries.length || campaign.defenderId >= this.countries.length || campaign.regionId >= this.strategicRegions.length)) throw new Error("Zapis ma nieprawidłową kampanię.");
      if (snapshot.strategicRegionSchema === 5 && snapshot.strategicOccupations?.some((occupation) => occupation.ownerId >= this.countries.length || occupation.previousOwnerId >= this.countries.length || occupation.regionId >= this.strategicRegions.length)) throw new Error("Zapis ma nieprawidłową okupację.");
      if (snapshot.strategicRegionSchema === 5 && snapshot.strategicExhaustion && snapshot.strategicExhaustion.length !== this.countries.length) throw new Error("Zapis ma nieprawidłowy stan wyczerpania.");
      if (snapshot.strategicDefenseState?.focusRegionId !== null
        && snapshot.strategicDefenseState?.focusRegionId !== undefined
        && snapshot.strategicDefenseState.focusRegionId >= this.strategicRegions.length) throw new Error("Zapis ma nieprawidłowy priorytet obrony.");
      if (currentStrategicSchema && snapshot.strategicRegionOwners?.length === this.strategicRegions.length) {
        snapshot.strategicRegionOwners.forEach((ownerId, id) => { this.strategicRegions[id].ownerId = ownerId; });
      } else for (const strategicRegion of this.strategicRegions) {
        const counts = new Map<number, number>();
        for (const [start, count] of this.strategicRegionRuns[strategicRegion.id] ?? []) for (let index = start; index < start + count; index++) {
          const owner = this.owners[index];
          if (owner >= 0) counts.set(owner, (counts.get(owner) ?? 0) + 1);
        }
        let majorityOwner = strategicRegion.originalOwnerId, majorityCells = -1;
        for (const [owner, count] of counts) if (count > majorityCells) { majorityOwner = owner; majorityCells = count; }
        strategicRegion.ownerId = majorityOwner;
        // Old procedural saves are migrated to coherent real provinces.
        for (const [start, count] of this.strategicRegionRuns[strategicRegion.id] ?? []) this.owners.fill(majorityOwner, start, start + count);
      }
      if (snapshot.strategicFortifications?.length === this.strategicRegions.length) {
        snapshot.strategicFortifications.forEach((fortification, id) => { this.strategicRegions[id].fortification = Math.max(0, Math.min(100, fortification)); });
      }
      this.strategicCampaigns = currentStrategicSchema ? structuredClone(snapshot.strategicCampaigns ?? []).map((campaign) => ({ ...campaign, casusBelli: campaign.casusBelli ?? "security-threat" })) : [];
      this.strategicTerritoryLog = currentStrategicSchema ? snapshot.strategicTerritoryLog?.map((event) => ({ ...event, provinceNames: [...event.provinceNames] })) ?? [] : [];
      this.strategicBattleArtifacts = snapshot.strategicBattleArtifacts?.map((artifact) => ({ ...artifact })) ?? [];
      this.strategicWarHistory = snapshot.strategicWarHistory?.map((war) => ({
        ...structuredClone(war),
        refugeesFled: war.refugeesFled ?? 0,
        refugeesFledWomen: war.refugeesFledWomen ?? 0,
        refugeesFledMen: war.refugeesFledMen ?? 0,
        refugeesFledChildren: war.refugeesFledChildren ?? 0,
        refugeeDestinations: war.refugeeDestinations?.map((destination) => ({ ...destination })) ?? [],
      })) ?? [];
      this.strategicPendingCasualties = this.countries.map(() => 0);
      this.strategicOccupations = snapshot.strategicRegionSchema === 5 && snapshot.strategicOccupations
        ? snapshot.strategicOccupations.map((occupation) => ({ ...occupation, policy: occupation.policy ?? "annexation", casusBelli: occupation.casusBelli ?? "security-threat" }))
        : this.strategicRegions.filter(({ ownerId, originalOwnerId }) => ownerId !== originalOwnerId).map((region) => ({
          regionId: region.id, ownerId: region.ownerId, previousOwnerId: region.originalOwnerId,
          progress: 35, startedTurn: Math.max(1, this.turn), lastGain: 0, policy: "annexation", casusBelli: "security-threat",
        }));
      this.strategicExhaustion = snapshot.strategicRegionSchema === 5 && snapshot.strategicExhaustion?.length === this.countries.length ? [...snapshot.strategicExhaustion] : this.countries.map(() => 0);
      this.strategicPolitics = snapshot.strategicPoliticsV1?.length === this.countries.length
        ? snapshot.strategicPoliticsV1.map((state) => ({ ...state }))
        : this.initialStrategicPolitics();
      this.strategicRelations = new Map((snapshot.strategicRelationsV1 ?? []).map((relation) => [strategicRelationKey(relation.firstId, relation.secondId), { ...relation }]));
      this.strategicDefenseState = snapshot.strategicDefenseState
        ? { ...snapshot.strategicDefenseState }
        : { posture: "continue", focusRegionId: null, mobilizedUntil: 0, mobilizationCooldownUntil: 0 };
      if (snapshot.strategicCapitals?.length === this.countries.length) this.strategicCapitals = snapshot.strategicCapitals.map((capital) => capital ? { ...capital } : null);
      this.pendingCapitalRelocations.clear();
      this.updateStrategicCapitals();
      this.nextCampaignId = Math.max(0, ...this.strategicCampaigns.map(({ id }) => id)) + 1;
    } else { this.strategicProvinceAt = new Int32Array(0); this.strategicAdministrativeAt = new Int32Array(0); this.strategicRegions = []; this.strategicRegionRuns = []; this.strategicCampaigns = []; this.strategicTerritoryLog = []; this.strategicOccupations = []; this.strategicBattleArtifacts = []; this.strategicWarHistory = []; this.strategicPendingCasualties = this.countries.map(() => 0); this.strategicExhaustion = this.countries.map(() => 0); this.strategicPolitics = []; this.strategicRelations.clear(); this.strategicDefenseState = { posture: "continue", focusRegionId: null, mobilizedUntil: 0, mobilizationCooldownUntil: 0 }; this.strategicCapitals = []; this.pendingCapitalRelocations.clear(); }
    if ((snapshot.mapRevision ?? 0) >= CURRENT_MAP_REVISION && snapshot.colors?.length === this.countries.length && snapshot.colors.every((color) => color.length === 3 && color.every(Number.isFinite))) {
      snapshot.colors.forEach((color, id) => { this.countries[id].color = [color[0], color[1], color[2]]; });
    } else {
      this.initialColors.forEach((color, id) => { this.countries[id].color = [color[0], color[1], color[2]]; });
      if (snapshot.turn > 0) this.repairColorConflicts();
    }
    this.history = nextHistory; this.undoStack = [];
    this.defeats = snapshot.defeats ? [...snapshot.defeats] : this.countries.map(({ id }) => nextHistory.filter((record) => record.countryId === id && record.eliminated).length);
    this.warExhaustion = snapshot.warExhaustion ? [...snapshot.warExhaustion] : this.countries.map(() => 0);
    this.capitalStates = snapshot.capitalStates ? snapshot.capitalStates.map((capital) => capital ? { ...capital } : null) : this.initialWarCapitalStates();
    this.warVetoesLeft = snapshot.warVetoesLeft ?? (this.gameMode === "war" ? WAR_VETO_LIMIT : 0);
    this.warUndosLeft = snapshot.warUndosLeft ?? (this.gameMode === "war" ? WAR_UNDO_LIMIT : 0);
    this.warGuarantee = snapshot.warGuarantee ? { ...snapshot.warGuarantee } : null;
    this.warGuaranteeUsed = snapshot.warGuaranteeUsed ?? false;
    this.warMinShare = snapshot.warMinShare ? [...snapshot.warMinShare] : this.countries.map(({ id }) => this.getCountryShare(id));
    this.directionTargetCache.clear();
    this.countryCapabilityStates = loadCapabilityStatesFromSnapshot(this.countries, snapshot.countryCapabilityStates);
    if (snapshot.capabilityStatesV2?.length === this.countries.length) this.countryCapabilityStates = structuredClone(snapshot.capabilityStatesV2);
    this.playerPolicyState.decisions = createPlayerPolicyDecisionDefaults();
    this.playerPolicyState.activePolicies = [];
    this.playerPolicyState.decisionPoints = this.gameMode === "strategy" ? 1 : 0;
    this.playerPolicyState.lastDecisionTurn = this.turn;
    if (snapshot.policyStateV2) {
      const saved = snapshot.policyStateV2;
      this.playerPolicyState.decisionPoints = saved.decisionPoints;
      this.playerPolicyState.lastDecisionTurn = saved.lastDecisionTurn;
      for (const used of saved.used) if (this.playerPolicyState.decisions[used.id]) this.playerPolicyState.decisions[used.id].lastUsedTurn = used.turn;
      this.playerPolicyState.activePolicies = saved.active.filter((id) => this.playerPolicyState.decisions[id]).map((id) => ({ ...this.playerPolicyState.decisions[id] }));
    }
    if (snapshot.infrastructureV2?.length === this.strategicRegions.length) snapshot.infrastructureV2.forEach((infra, id) => Object.assign(this.strategicRegions[id], infra));
    this.initializePopulationWeights();
    const preservePopulation = snapshot.regionalPopulationV1?.length === this.strategicRegions.length
      && (snapshot.turn > 0 || snapshot.populationDistributionV1 === "ghsl-2020" || !this.populationGrid.length);
    this.regionalPopulation = preservePopulation ? structuredClone(snapshot.regionalPopulationV1!) : [];
    this.populationDistribution = preservePopulation ? snapshot.populationDistributionV1 ?? "area" : this.populationGrid.length === MAP_W * MAP_H ? "ghsl-2020" : "area";
    this.synchronizeRegionalPopulation();
    this.strategicQuarterStart = snapshot.strategicQuarterStartV1 ? structuredClone(snapshot.strategicQuarterStartV1) : this.countries.map(({ id }) => ({ ...this.strategicComponents(id) }));
    this.strategicComponentCache.clear();
    this.strategicPowerCache.clear();
    this.updateVectorChangedPixels(undefined, true);
    this.visualRevision++;
  }

  private prepareRenderOwners(width: number, height: number) {
    const key = `world:${this.visualRevision}:${width}:${height}`;
    if (this.renderOwnersKey === key) return;
    const rendered = new Int16Array(width * height);
    const sources = new Int32Array(width * height);
    const scaleX = MAP_W / width, scaleY = MAP_H / height;
    for (let y = 0; y < height; y++) {
      const sourceY = Math.min(MAP_H - 1, Math.floor((y + 0.5) * scaleY));
      for (let x = 0; x < width; x++) {
        const sourceX = Math.min(MAP_W - 1, Math.floor((x + 0.5) * scaleX));
        const target = y * width + x, source = sourceY * MAP_W + sourceX;
        rendered[target] = this.owners[source];
        sources[target] = source;
      }
    }
    this.renderOwners = rendered;
    this.renderSourceIndices = sources;
    this.renderOwnersWidth = width;
    this.renderOwnersHeight = height;
    this.renderOwnersRevision = this.visualRevision;
    this.renderOwnersKey = key;
    this.componentRevision = -1;
    this.borderCacheRevision = -1;
    this.outlineCacheKey = "";
  }

  private prepareViewportOwners(width: number, height: number, viewZoom: number, panX: number, panY: number) {
    const key = `view:${this.visualRevision}:${width}:${height}:${viewZoom.toFixed(5)}:${panX.toFixed(5)}:${panY.toFixed(5)}`;
    if (this.renderOwnersKey === key) return;
    const rendered = new Int16Array(width * height), sources = new Int32Array(width * height);

    // A close viewport used to magnify every simulation cell into a visible
    // square.  Keep the simulation raster exact, but reconstruct its visual
    // boundary between four neighbouring cell centres.  Weighted categorical
    // voting is the multi-country equivalent of marching squares: straight
    // stair steps become diagonal/curved contours while no province changes
    // owner in the actual game state.
    const categoryWeight = (value: number, a: number, b: number, c: number, d: number, wa: number, wb: number, wc: number, wd: number) =>
      (a === value ? wa : 0) + (b === value ? wb : 0) + (c === value ? wc : 0) + (d === value ? wd : 0);
    const categoryPeak = (value: number, a: number, b: number, c: number, d: number, wa: number, wb: number, wc: number, wd: number) =>
      Math.max(a === value ? wa : 0, b === value ? wb : 0, c === value ? wc : 0, d === value ? wd : 0);
    const weightedCategory = (a: number, b: number, c: number, d: number, wa: number, wb: number, wc: number, wd: number) => {
      let best = a, bestWeight = categoryWeight(a, a, b, c, d, wa, wb, wc, wd), bestPeak = categoryPeak(a, a, b, c, d, wa, wb, wc, wd);
      if (b !== a) {
        const weight = categoryWeight(b, a, b, c, d, wa, wb, wc, wd), peak = categoryPeak(b, a, b, c, d, wa, wb, wc, wd);
        if (weight > bestWeight + 1e-7 || (Math.abs(weight - bestWeight) <= 1e-7 && peak > bestPeak)) { best = b; bestWeight = weight; bestPeak = peak; }
      }
      if (c !== a && c !== b) {
        const weight = categoryWeight(c, a, b, c, d, wa, wb, wc, wd), peak = categoryPeak(c, a, b, c, d, wa, wb, wc, wd);
        if (weight > bestWeight + 1e-7 || (Math.abs(weight - bestWeight) <= 1e-7 && peak > bestPeak)) { best = c; bestWeight = weight; bestPeak = peak; }
      }
      if (d !== a && d !== b && d !== c) {
        const weight = categoryWeight(d, a, b, c, d, wa, wb, wc, wd), peak = categoryPeak(d, a, b, c, d, wa, wb, wc, wd);
        if (weight > bestWeight + 1e-7 || (Math.abs(weight - bestWeight) <= 1e-7 && peak > bestPeak)) best = d;
      }
      return best;
    };
    const wrapSourceX = (x: number) => ((x % MAP_W) + MAP_W) % MAP_W;
    const regionAt = (source: number) => this.strategicProvinceAt.length ? this.strategicProvinceAt[source] : -1;
    const administrativeAt = (source: number) => this.strategicAdministrativeAt.length ? this.strategicAdministrativeAt[source] : -1;

    for (let y = 0; y < height; y++) {
      const worldY = .5 + ((y + .5) / height - .5 - panY) / viewZoom;
      const gridY = Math.max(-.5, Math.min(MAP_H - .5, worldY * MAP_H - .5));
      const y0 = Math.max(0, Math.min(MAP_H - 1, Math.floor(gridY))), y1 = Math.min(MAP_H - 1, y0 + 1), fy = gridY - Math.floor(gridY);
      for (let x = 0; x < width; x++) {
        const worldX = .5 + ((x + .5) / width - .5 - panX) / viewZoom;
        const gridX = worldX * MAP_W - .5, rawX0 = Math.floor(gridX), x0 = wrapSourceX(rawX0), x1 = wrapSourceX(rawX0 + 1), fx = gridX - rawX0;
        const wa = (1 - fx) * (1 - fy), wb = fx * (1 - fy), wc = (1 - fx) * fy, wd = fx * fy;
        const a = y0 * MAP_W + x0, b = y0 * MAP_W + x1, c = y1 * MAP_W + x0, d = y1 * MAP_W + x1;
        const oa = this.owners[a], ob = this.owners[b], oc = this.owners[c], od = this.owners[d];
        const regionA = regionAt(a), regionB = regionAt(b), regionC = regionAt(c), regionD = regionAt(d);
        const adminA = administrativeAt(a), adminB = administrativeAt(b), adminC = administrativeAt(c), adminD = administrativeAt(d);
        const target = y * width + x;
        if (oa === ob && oa === oc && oa === od && regionA === regionB && regionA === regionC && regionA === regionD && adminA === adminB && adminA === adminC && adminA === adminD) {
          const source = fy < .5 ? (fx < .5 ? a : b) : (fx < .5 ? c : d);
          rendered[target] = oa;
          sources[target] = source;
          continue;
        }
        const owner = weightedCategory(oa, ob, oc, od, wa, wb, wc, wd);

        // Resolve internal borders hierarchically. A province can win only
        // among corners belonging to the already selected country; a district
        // can win only inside that province. This prevents colour leaks across
        // a national border and smooths every border level consistently.
        const ra = oa === owner ? regionA : -2, rb = ob === owner ? regionB : -2;
        const rc = oc === owner ? regionC : -2, rd = od === owner ? regionD : -2;
        const region = weightedCategory(ra, rb, rc, rd, wa, wb, wc, wd);
        const aa = oa === owner && ra === region ? adminA : -2;
        const ab = ob === owner && rb === region ? adminB : -2;
        const ac = oc === owner && rc === region ? adminC : -2;
        const ad = od === owner && rd === region ? adminD : -2;
        const administrative = weightedCategory(aa, ab, ac, ad, wa, wb, wc, wd);

        let source = a, sourceWeight = -1;
        if (oa === owner && ra === region && aa === administrative && wa > sourceWeight) { source = a; sourceWeight = wa; }
        if (ob === owner && rb === region && ab === administrative && wb > sourceWeight) { source = b; sourceWeight = wb; }
        if (oc === owner && rc === region && ac === administrative && wc > sourceWeight) { source = c; sourceWeight = wc; }
        if (od === owner && rd === region && ad === administrative && wd > sourceWeight) { source = d; sourceWeight = wd; }
        // Ocean and non-strategic maps can legitimately have no deeper ID.
        if (sourceWeight < 0) {
          if (oa === owner && wa > sourceWeight) { source = a; sourceWeight = wa; }
          if (ob === owner && wb > sourceWeight) { source = b; sourceWeight = wb; }
          if (oc === owner && wc > sourceWeight) { source = c; sourceWeight = wc; }
          if (od === owner && wd > sourceWeight) { source = d; sourceWeight = wd; }
        }
        rendered[target] = owner;
        sources[target] = source;
      }
    }
    this.renderOwners = rendered;
    this.renderSourceIndices = sources;
    this.renderOwnersWidth = width;
    this.renderOwnersHeight = height;
    this.renderOwnersRevision = this.visualRevision;
    this.renderOwnersKey = key;
    this.componentRevision = -1;
    this.borderCacheRevision = -1;
    this.outlineCacheKey = "";
  }

  private rebuildVisualComponents(width: number, height: number, ownersPrepared = false) {
    if (!ownersPrepared) this.prepareRenderOwners(width, height);
    if (this.componentRevision === this.visualRevision && this.componentOwnersKey === this.renderOwnersKey && this.componentWidth === width && this.componentHeight === height) return;
    const componentAt = new Int32Array(this.renderOwners.length), components: VisualComponent[] = [];
    const columnMarks = new Uint32Array(width);
    const steps = [[-1, 0], [1, 0], [0, -1], [0, 1]];
    const wrapRenderX = (x: number) => (x + width) % width;
    for (let start = 0; start < this.renderOwners.length; start++) {
      const owner = this.renderOwners[start];
      if (owner < 0 || componentAt[start]) continue;
      const id = components.length + 1, queue = [start], columns: number[] = [];
      componentAt[start] = id;
      let minY = Math.floor(start / width), maxY = minY, sumSin = 0, sumCos = 0, sumY = 0;
      for (let cursor = 0; cursor < queue.length; cursor++) {
        const index = queue[cursor], x = index % width, y = Math.floor(index / width);
        minY = Math.min(minY, y); maxY = Math.max(maxY, y);
        const angle = x / width * Math.PI * 2;
        sumSin += Math.sin(angle); sumCos += Math.cos(angle); sumY += y;
        if (columnMarks[x] !== id) { columnMarks[x] = id; columns.push(x); }
        for (const [ox, oy] of steps) {
          const ny = y + oy;
          if (ny < 0 || ny >= height) continue;
          const next = ny * width + wrapRenderX(x + ox);
          if (this.renderOwners[next] !== owner || componentAt[next]) continue;
          componentAt[next] = id;
          queue.push(next);
        }
      }
      const { startX, spanX } = circularColumnSpan(columns, width);
      let centreAngle = Math.atan2(sumSin, sumCos);
      if (centreAngle < 0) centreAngle += Math.PI * 2;
      const centreX = centreAngle / (Math.PI * 2) * width, centreY = sumY / queue.length;
      let anchor = queue[0], anchorDistance = Infinity;
      for (const index of queue) {
        const x = index % width, y = Math.floor(index / width);
        let dx = x - centreX;
        if (dx > width / 2) dx -= width;
        if (dx < -width / 2) dx += width;
        const distance = dx * dx + (y - centreY) ** 2;
        if (distance < anchorDistance) { anchorDistance = distance; anchor = index; }
      }
      components.push({ owner, cells: queue.length, startX, spanX, minY, maxY, anchorX: anchor % width, anchorY: Math.floor(anchor / width) });
    }
    this.componentAt = componentAt;
    this.visualComponents = components;
    this.componentRevision = this.visualRevision;
    this.componentOwnersKey = this.renderOwnersKey;
    this.componentWidth = width;
    this.componentHeight = height;
  }

  private flagTexture(owner: number) {
    const cached = this.flagTextures.get(owner);
    if (cached) return cached;
    const canvas = document.createElement("canvas");
    canvas.width = FLAG_TEXTURE_W; canvas.height = FLAG_TEXTURE_H;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) return null;
    context.fillStyle = "#d8dde0";
    context.fillRect(0, 0, FLAG_TEXTURE_W, FLAG_TEXTURE_H);
    context.font = '152px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText(this.countries[owner].flag, FLAG_TEXTURE_W / 2, FLAG_TEXTURE_H / 2 + 4);
    const pixels = context.getImageData(0, 0, FLAG_TEXTURE_W, FLAG_TEXTURE_H).data;
    this.flagTextures.set(owner, pixels);
    canvas.width = 1; canvas.height = 1;
    return pixels;
  }

  private sampleFlag(owner: number, index: number, x: number, y: number) {
    const component = this.visualComponents[this.componentAt[index] - 1];
    if (!component || component.cells < 6) return null;
    const texture = this.flagTexture(owner);
    if (!texture) return null;
    const width = component.spanX, height = component.maxY - component.minY + 1;
    const localX = (x - component.startX + this.renderOwnersWidth) % this.renderOwnersWidth;
    let u = (localX + 0.5) / width, v = (y - component.minY + 0.5) / height;
    if (width / height > 1.5) {
      v = 0.5 + (v - 0.5) * Math.min(1, height * 1.5 / width);
    } else {
      u = 0.5 + (u - 0.5) * Math.min(1, width / (height * 1.5));
    }
    const sx = Math.max(0, Math.min(FLAG_TEXTURE_W - 1, Math.floor(u * FLAG_TEXTURE_W)));
    const sy = Math.max(0, Math.min(FLAG_TEXTURE_H - 1, Math.floor(v * FLAG_TEXTURE_H)));
    const offset = (sy * FLAG_TEXTURE_W + sx) * 4;
    return [texture[offset], texture[offset + 1], texture[offset + 2]] as [number, number, number];
  }

  private prepareBorders(width: number, height: number, ownersPrepared = false) {
    if (this.borderCacheRevision === this.visualRevision && this.borderCacheWidth === width && this.borderCacheHeight === height && this.countryBorders && this.coastlines) return;
    if (!ownersPrepared) this.prepareRenderOwners(width, height);
    const countryBorders = new Path2D(), coastlines = new Path2D();
    const wrapRenderX = (x: number) => (x + width) % width;
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      const index = y * width + x, owner = this.renderOwners[index];
      const right = this.renderOwners[y * width + wrapRenderX(x + 1)];
      const down = y + 1 < height ? this.renderOwners[(y + 1) * width + x] : -1;
      if (right !== owner && (right >= 0 || owner >= 0)) {
        const path = right >= 0 && owner >= 0 ? countryBorders : coastlines;
        path.moveTo(x + 1, y); path.lineTo(x + 1, y + 1);
      }
      if (down !== owner && (down >= 0 || owner >= 0)) {
        const path = down >= 0 && owner >= 0 ? countryBorders : coastlines;
        path.moveTo(x, y + 1); path.lineTo(x + 1, y + 1);
      }
    }
    this.countryBorders = countryBorders;
    this.coastlines = coastlines;
    this.borderCacheRevision = this.visualRevision;
    this.borderCacheWidth = width;
    this.borderCacheHeight = height;
  }

  private prepareStrategicBorders(width: number, height: number) {
    const key = `${this.renderOwnersKey}:${this.seed}:${this.strategicRegions.length}`;
    if (this.strategicBorderKey === key && this.strategicBorders && this.strategicAdministrativeBorders) return;
    const path = new Path2D(), administrativePath = new Path2D(), wrapRenderX = (x: number) => (x + width) % width;
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      const index = y * width + x, source = this.renderSourceIndices[index], region = this.strategicProvinceAt[source], owner = this.renderOwners[index];
      if (region < 0) continue;
      const rightIndex = y * width + wrapRenderX(x + 1), downIndex = y + 1 < height ? (y + 1) * width + x : -1;
      const rightSource = this.renderSourceIndices[rightIndex], downSource = downIndex >= 0 ? this.renderSourceIndices[downIndex] : -1;
      const rightOwner = this.renderOwners[rightIndex], downOwner = downIndex >= 0 ? this.renderOwners[downIndex] : -1;
      const administrative = this.strategicAdministrativeAt[source];
      if (rightOwner === owner && rightSource >= 0 && this.strategicAdministrativeAt[rightSource] >= 0 && this.strategicAdministrativeAt[rightSource] !== administrative) {
        administrativePath.moveTo(x + 1, y); administrativePath.lineTo(x + 1, y + 1);
      }
      if (downOwner === owner && downSource >= 0 && this.strategicAdministrativeAt[downSource] >= 0 && this.strategicAdministrativeAt[downSource] !== administrative) {
        administrativePath.moveTo(x, y + 1); administrativePath.lineTo(x + 1, y + 1);
      }
      if (rightOwner === owner && rightSource >= 0 && this.strategicProvinceAt[rightSource] >= 0 && this.strategicProvinceAt[rightSource] !== region) {
        path.moveTo(x + 1, y); path.lineTo(x + 1, y + 1);
      }
      if (downOwner === owner && downSource >= 0 && this.strategicProvinceAt[downSource] >= 0 && this.strategicProvinceAt[downSource] !== region) {
        path.moveTo(x, y + 1); path.lineTo(x + 1, y + 1);
      }
    }
    this.strategicBorders = path;
    this.strategicAdministrativeBorders = administrativePath;
    this.strategicBorderKey = key;
  }

  private prepareHighlightOutline(width: number, height: number, highlight: number[], highlightHash: number) {
    if (!highlight.length) { this.highlightOutlineKey = ""; this.highlightOutline = null; return; }
    const key = `${this.renderOwnersKey}:${highlight.length}:${highlightHash}`;
    if (this.highlightOutlineKey === key && this.highlightOutline) return;
    const selected = new Uint8Array(this.owners.length);
    for (const index of highlight) if (index >= 0 && index < selected.length) selected[index] = 1;
    const path = new Path2D(), wrapRenderX = (x: number) => (x + width) % width;
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      const index = y * width + x;
      if (!selected[this.renderSourceIndices[index]]) continue;
      const top = y > 0 && selected[this.renderSourceIndices[index - width]];
      const right = selected[this.renderSourceIndices[y * width + wrapRenderX(x + 1)]];
      const bottom = y + 1 < height && selected[this.renderSourceIndices[index + width]];
      const left = selected[this.renderSourceIndices[y * width + wrapRenderX(x - 1)]];
      if (!top) { path.moveTo(x, y); path.lineTo(x + 1, y); }
      if (!right) { path.moveTo(x + 1, y); path.lineTo(x + 1, y + 1); }
      if (!bottom) { path.moveTo(x, y + 1); path.lineTo(x + 1, y + 1); }
      if (!left) { path.moveTo(x, y); path.lineTo(x, y + 1); }
    }
    this.highlightOutline = path;
    this.highlightOutlineKey = key;
  }

  private drawCountryLabels(context: CanvasRenderingContext2D, width: number, viewZoom: number) {
    const displayScale = width / Math.max(1, context.canvas.clientWidth * viewZoom);
    const largest = new Map<number, VisualComponent>();
    for (const component of this.visualComponents) {
      const previous = largest.get(component.owner);
      if (!previous || component.cells > previous.cells) largest.set(component.owner, component);
    }
    const occupied: Array<{ left: number; right: number; top: number; bottom: number }> = [];
    const splitLabel = (name: string) => {
      const words = name.toLocaleUpperCase("pl").split(/\s+/);
      if (words.length < 2) return words;
      let best = 1, difference = Infinity;
      for (let split = 1; split < words.length; split++) {
        const value = Math.abs(words.slice(0, split).join(" ").length - words.slice(split).join(" ").length);
        if (value < difference) { difference = value; best = split; }
      }
      return [words.slice(0, best).join(" "), words.slice(best).join(" ")];
    };

    const candidates = [...largest.values()].sort((a, b) => b.cells - a.cells);
    context.save();
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.lineJoin = "round";
    for (const component of candidates) {
      const screenArea = component.cells / (displayScale * displayScale);
      const screenWidth = component.spanX / displayScale;
      const screenHeight = (component.maxY - component.minY + 1) / displayScale;
      if (screenArea < 52 || screenWidth < 13 || screenHeight < 7) continue;
      const lines = splitLabel(this.countries[component.owner].name);
      let fontCss = Math.min(20, Math.max(6.5, Math.sqrt(screenArea) * 0.16));
      const longest = Math.max(...lines.map((line) => line.length));
      fontCss = Math.min(fontCss, screenWidth * 0.92 / Math.max(1, longest * 0.57), screenHeight * 0.78 / lines.length);
      if (fontCss < 5.8) continue;
      const fontSize = fontCss * displayScale, lineHeight = fontSize * 0.92;
      context.font = `800 ${fontSize}px "Arial Narrow",Inter,ui-sans-serif,sans-serif`;
      const labelWidth = Math.max(...lines.map((line) => context.measureText(line).width));
      const labelHeight = lineHeight * lines.length;
      const left = component.anchorX - labelWidth / 2, right = component.anchorX + labelWidth / 2;
      const top = component.anchorY - labelHeight / 2, bottom = component.anchorY + labelHeight / 2;
      const padding = 2.2 * displayScale;
      if (occupied.some((box) => left < box.right + padding && right > box.left - padding && top < box.bottom + padding && bottom > box.top - padding)) continue;
      occupied.push({ left, right, top, bottom });
      context.lineWidth = Math.max(1.5, fontSize * 0.2);
      context.strokeStyle = "rgba(238,246,248,.82)";
      context.fillStyle = "rgba(3,13,18,.94)";
      lines.forEach((line, index) => {
        const y = component.anchorY + (index - (lines.length - 1) / 2) * lineHeight;
        context.strokeText(line, component.anchorX, y);
        context.fillText(line, component.anchorX, y);
      });
    }
    context.restore();
  }

  countryLabelPlacements(width: number, clientWidth: number, viewZoom: number): CountryLabelPlacement[] {
    const height = Math.max(2, Math.round(width / 2));
    const labelComponentsKey = `${this.visualRevision}:${width}:${height}`;
    if (labelComponentsKey !== this.labelComponentsKey) {
      this.rebuildVisualComponents(width, height);
      this.labelComponents = this.visualComponents.map((component) => ({ ...component }));
      this.labelComponentsKey = labelComponentsKey;
    }
    const displayScale = width / Math.max(1, clientWidth * viewZoom);
    const largest = new Map<number, VisualComponent>();
    for (const component of this.labelComponents) {
      const previous = largest.get(component.owner);
      if (!previous || component.cells > previous.cells) largest.set(component.owner, component);
    }
    const occupied: Array<{ left: number; right: number; top: number; bottom: number }> = [];
    const result: CountryLabelPlacement[] = [];
    const splitLabel = (name: string) => {
      const words = name.toLocaleUpperCase("pl").split(/\s+/);
      if (words.length < 2) return words;
      let best = 1, difference = Infinity;
      for (let split = 1; split < words.length; split++) {
        const value = Math.abs(words.slice(0, split).join(" ").length - words.slice(split).join(" ").length);
        if (value < difference) { difference = value; best = split; }
      }
      return [words.slice(0, best).join(" "), words.slice(best).join(" ")];
    };
    for (const component of [...largest.values()].sort((a, b) => b.cells - a.cells)) {
      const screenArea = component.cells / (displayScale * displayScale);
      const screenWidth = component.spanX / displayScale;
      const screenHeight = (component.maxY - component.minY + 1) / displayScale;
      if (screenArea < 52 || screenWidth < 13 || screenHeight < 7) continue;
      const lines = splitLabel(this.countries[component.owner].name);
      let fontSize = Math.min(20, Math.max(6.5, Math.sqrt(screenArea) * 0.16));
      const longest = Math.max(...lines.map((line) => line.length));
      fontSize = Math.min(fontSize, screenWidth * 0.92 / Math.max(1, longest * 0.57), screenHeight * 0.78 / lines.length);
      if (fontSize < 5.8) continue;
      const labelWidth = longest * fontSize * 0.57, labelHeight = fontSize * 0.92 * lines.length;
      const screenX = component.anchorX / displayScale, screenY = component.anchorY / displayScale;
      const box = { left: screenX - labelWidth / 2, right: screenX + labelWidth / 2, top: screenY - labelHeight / 2, bottom: screenY + labelHeight / 2 };
      if (occupied.some((other) => box.left < other.right + 2.2 && box.right > other.left - 2.2 && box.top < other.bottom + 2.2 && box.bottom > other.top - 2.2)) continue;
      occupied.push(box);
      result.push({ owner: component.owner, name: this.countries[component.owner].name, x: component.anchorX / width * 100, y: component.anchorY / this.componentHeight * 100, fontSize, lines });
    }
    return result;
  }

  private visualElevation(index: number) {
    if (this.owners[index] < 0) return 0;
    if (this.initialOwners[index] >= 0) return this.elevation[index];

    // Land created during the game has no historical height sample. Give it a
    // low coast and a gently raised, deterministic interior instead of a flat
    // colour patch. The shape follows the current shoreline, so erosion and
    // later regrowth remain visually coherent.
    const x = index % MAP_W, y = Math.floor(index / MAP_W);
    let support = 0;
    for (const radius of [2, 5, 9]) {
      for (const [ox, oy] of [[-radius, 0], [radius, 0], [0, -radius], [0, radius]]) {
        const ny = y + oy;
        if (ny >= 0 && ny < MAP_H && this.owners[ny * MAP_W + wrapX(x + ox)] >= 0) support++;
      }
    }
    const undulation = Math.sin(x * .031) * 115 + Math.sin(y * .027) * 90 + Math.sin((x + y) * .013) * 135;
    return Math.max(120, Math.round(260 + support * 165 + undulation));
  }

  private isCoastalWater(index: number) {
    const x = index % MAP_W, y = Math.floor(index / MAP_W);
    for (const radius of [2, 6]) {
      for (const [ox, oy] of [[-radius, 0], [radius, 0], [0, -radius], [0, radius], [-radius, -radius], [radius, -radius], [-radius, radius], [radius, radius]]) {
        const ny = y + oy;
        if (ny >= 0 && ny < MAP_H && this.owners[ny * MAP_W + wrapX(x + ox)] >= 0) return radius;
      }
    }
    return 0;
  }

  private reliefNoise(worldX: number, worldY: number, scale: number) {
    const gridX = Math.floor(worldX / scale), gridY = Math.floor(worldY / scale);
    const fractionX = worldX / scale - gridX, fractionY = worldY / scale - gridY;
    const smoothX = fractionX * fractionX * (3 - 2 * fractionX);
    const smoothY = fractionY * fractionY * (3 - 2 * fractionY);
    const derivativeX = 6 * fractionX * (1 - fractionX);
    const derivativeY = 6 * fractionY * (1 - fractionY);
    const sample = (x: number, y: number) => {
      let hash = Math.imul(x + 37_121, 374_761_393) ^ Math.imul(y - 91_337, 668_265_263);
      hash = Math.imul(hash ^ (hash >>> 13), 1_274_126_177);
      return (((hash ^ (hash >>> 16)) >>> 0) / 4_294_967_295) * 2 - 1;
    };
    const topLeft = sample(gridX, gridY), topRight = sample(gridX + 1, gridY);
    const bottomLeft = sample(gridX, gridY + 1), bottomRight = sample(gridX + 1, gridY + 1);
    const top = topLeft * (1 - smoothX) + topRight * smoothX;
    const bottom = bottomLeft * (1 - smoothX) + bottomRight * smoothX;
    return {
      value: top * (1 - smoothY) + bottom * smoothY,
      dx: ((topRight - topLeft) * (1 - smoothY) + (bottomRight - bottomLeft) * smoothY) * derivativeX,
      dy: (bottom - top) * derivativeY,
    };
  }

  private reliefColour(owner: number, source: number, worldX: number, worldY: number, detailZoom: number, selected: number | null, flashed: boolean) {
    const sourceX = source % MAP_W, sourceY = Math.floor(source / MAP_W);
    const wrappedWorldX = ((worldX % MAP_W) + MAP_W) % MAP_W;
    if (owner < 0) {
      const coast = this.isCoastalWater(source);
      const detail = Math.max(0, Math.min(1, (detailZoom - 1.5) / 5));
      const wave = (Math.sin(wrappedWorldX * .067 + worldY * .041) + Math.sin(wrappedWorldX * .019 - worldY * .053)) * (2.2 + detail * 1.8);
      if (coast === 2) return [16 + wave, 112 + wave, 139 + wave] as [number, number, number];
      if (coast === 6) return [9 + wave, 72 + wave, 105 + wave] as [number, number, number];
      return [5 + wave, 39 + wave, 68 + wave] as [number, number, number];
    }

    // Bilinear height sampling prevents the 4320×2160 simulation cells from
    // becoming visible blocks at deep zoom. Ownership still comes from the
    // exact game grid, but the geographic surface is continuous.
    const x0 = Math.floor(wrappedWorldX), y0 = Math.max(0, Math.min(MAP_H - 1, Math.floor(worldY)));
    const x1 = wrapX(x0 + 1), y1 = Math.min(MAP_H - 1, y0 + 1);
    const fx = wrappedWorldX - x0, fy = Math.max(0, Math.min(1, worldY - y0));
    const h00 = this.visualElevation(y0 * MAP_W + wrapX(x0));
    const h10 = this.visualElevation(y0 * MAP_W + x1);
    const h01 = this.visualElevation(y1 * MAP_W + wrapX(x0));
    const h11 = this.visualElevation(y1 * MAP_W + x1);
    const topHeight = h00 * (1 - fx) + h10 * fx, bottomHeight = h01 * (1 - fx) + h11 * fx;
    const detail = Math.max(0, Math.min(1, (detailZoom - 1.5) / 5));
    const broad = detail ? this.reliefNoise(wrappedWorldX, worldY, 18) : { value: 0, dx: 0, dy: 0 };
    const medium = detail ? this.reliefNoise(wrappedWorldX, worldY, 6) : { value: 0, dx: 0, dy: 0 };
    const fine = detail ? this.reliefNoise(wrappedWorldX, worldY, 2.1) : { value: 0, dx: 0, dy: 0 };
    const height = topHeight * (1 - fy) + bottomHeight * fy
      + detail * (broad.value * 190 + medium.value * 75 + fine.value * 24);
    const normalized = Math.max(0, Math.min(1, height / 7_200));
    const stops: Array<[number, [number, number, number]]> = [
      [0, [91, 151, 88]],
      [.3, [126, 158, 89]],
      [.52, [178, 153, 88]],
      [.72, [151, 116, 76]],
      [.88, [190, 177, 148]],
      [1, [239, 241, 232]],
    ];
    let lower = stops[0], upper = stops.at(-1)!;
    for (let stop = 1; stop < stops.length; stop++) {
      if (normalized <= stops[stop][0]) { lower = stops[stop - 1]; upper = stops[stop]; break; }
    }
    const amount = Math.max(0, Math.min(1, (normalized - lower[0]) / Math.max(.001, upper[0] - lower[0])));
    const terrain = lower[1].map((channel, channelIndex) => channel + (upper[1][channelIndex] - channel) * amount);

    const west = sourceY * MAP_W + wrapX(sourceX - 3), east = sourceY * MAP_W + wrapX(sourceX + 3);
    const north = Math.max(0, sourceY - 3) * MAP_W + sourceX, south = Math.min(MAP_H - 1, sourceY + 3) * MAP_W + sourceX;
    const slopeX = this.visualElevation(west) - this.visualElevation(east);
    const slopeY = this.visualElevation(north) - this.visualElevation(south);
    // Directional derivatives turn deterministic multi-scale terrain noise
    // into genuine-looking light and shadow instead of blurry colour bands.
    const microRelief = detail * (
      -(broad.dx * .061 + broad.dy * .075)
      -(medium.dx * .044 + medium.dy * .052)
      -(fine.dx * .021 + fine.dy * .027)
      + broad.value * .035 + medium.value * .026 + fine.value * .014
    );
    const shade = Math.max(.61, Math.min(1.34, 1 + (slopeX * .65 + slopeY * .82) / 3_600 + microRelief));
    const [countryR, countryG, countryB] = this.countries[owner].color;
    const country = [countryR, countryG, countryB];
    const glow = flashed ? 18 : owner === selected ? 10 : 0;
    const playable = this.isCountryPlayable(owner), fade = playable ? 1 : .25;
    return terrain.map((channel, index) => Math.max(0, Math.min(255,
      ((channel * .52 + country[index] * .48) * shade + glow) * fade + (playable ? 0 : index === 0 ? 8 : index === 1 ? 18 : 23),
    ))) as [number, number, number];
  }

  render(canvas: HTMLCanvasElement, highlight: number[] = [], selected: number | null = null, viewZoom = 1, mapStyle: MapStyle = "colors", labelsOnCanvas = true, viewport?: { panX: number; panY: number }, screenSpaceBorders = false) {
    const context = canvas.getContext("2d");
    if (!context) return;
    const width = canvas.width, height = canvas.height;
    if (viewport) this.prepareViewportOwners(width, height, viewZoom, viewport.panX, viewport.panY);
    else this.prepareRenderOwners(width, height);
    if (mapStyle === "flags" || mapStyle === "hybrid" || ((mapStyle === "labels" || mapStyle === "relief") && labelsOnCanvas)) this.rebuildVisualComponents(width, height, Boolean(viewport));
    let highlightHash = 0;
    for (const index of highlight) highlightHash = Math.imul(highlightHash ^ index, 16777619) >>> 0;
    const fillKey = `${this.renderOwnersKey}:${mapStyle}:${selected ?? -1}:${this.gameRegion}:${highlight.length}:${highlightHash}`;
    if (fillKey !== this.fillCacheKey) {
      if (this.buffer.width !== width || this.buffer.height !== height) { this.buffer.width = width; this.buffer.height = height; }
      const image = this.bufferContext.createImageData(width, height), pixels = image.data;
      const sourceFlash = highlight.length ? new Uint8Array(this.owners.length) : null;
      if (sourceFlash) for (const sourceIndex of highlight) sourceFlash[sourceIndex] = 1;
      for (let index = 0; index < this.renderOwners.length; index++) {
        const owner = this.renderOwners[index], x = index % width, y = Math.floor(index / width), source = this.renderSourceIndices[index], sourceX = source % MAP_W, sourceY = Math.floor(source / MAP_W), pixel = index * 4;
        if (mapStyle === "relief") {
          const worldX = viewport
            ? (.5 + ((x + .5) / width - .5 - viewport.panX) / viewZoom) * MAP_W
            : (x + .5) * MAP_W / width;
          const worldY = viewport
            ? (.5 + ((y + .5) / height - .5 - viewport.panY) / viewZoom) * MAP_H
            : (y + .5) * MAP_H / height;
          const [r, g, b] = this.reliefColour(owner, source, worldX, worldY, viewport ? viewZoom : 1, selected, Boolean(sourceFlash?.[source]));
          pixels[pixel] = r; pixels[pixel + 1] = g; pixels[pixel + 2] = b;
        } else if (owner < 0) {
          pixels[pixel] = 7; pixels[pixel + 1] = 19; pixels[pixel + 2] = 28;
        } else {
          const [r, g, b] = this.countries[owner].color;
          const glow = sourceFlash?.[source] ? 18 : owner === selected ? 10 : 0;
          const playable = this.isCountryPlayable(owner), fade = playable ? 1 : 0.24;
          const flag = mapStyle === "flags" || mapStyle === "hybrid" ? this.sampleFlag(owner, index, x, y) : null;
          const mix = flag ? mapStyle === "flags" ? 0.9 : 0.42 : 0;
          const baseR = r * (1 - mix) + (flag?.[0] ?? r) * mix;
          const baseG = g * (1 - mix) + (flag?.[1] ?? g) * mix;
          const baseB = b * (1 - mix) + (flag?.[2] ?? b) * mix;
          const luminance = baseR * .2126 + baseG * .7152 + baseB * .0722;
          const roomR = (luminance + (baseR - luminance) * MAP_ROOM_SATURATION) * MAP_ROOM_BRIGHTNESS + MAP_ROOM_LIFT;
          const roomG = (luminance + (baseG - luminance) * MAP_ROOM_SATURATION) * MAP_ROOM_BRIGHTNESS + MAP_ROOM_LIFT;
          const roomB = (luminance + (baseB - luminance) * MAP_ROOM_SATURATION) * MAP_ROOM_BRIGHTNESS + MAP_ROOM_LIFT;
          pixels[pixel] = Math.min(255, Math.max(0, (roomR + glow) * fade + (playable ? 0 : 8)));
          pixels[pixel + 1] = Math.min(255, Math.max(0, (roomG + glow) * fade + (playable ? 0 : 18)));
          pixels[pixel + 2] = Math.min(255, Math.max(0, (roomB + glow * 0.3) * fade + (playable ? 0 : 23)));
        }
        pixels[pixel + 3] = 255;
      }
      this.bufferContext.putImageData(image, 0, 0);
      this.fillCacheKey = fillKey;
    }
    context.clearRect(0, 0, width, height);
    context.imageSmoothingEnabled = false;
    context.drawImage(this.buffer, 0, 0);
    if (!screenSpaceBorders) this.prepareBorders(width, height, Boolean(viewport));

    // Hidden render sources still need sane stroke widths. A CSS accident that
    // made an off-screen canvas 1px wide used to inflate borders by ~4096x,
    // blocking the main thread before the first map frame appeared.
    const displayWidth = canvas.clientWidth >= 16 ? canvas.clientWidth : canvas.width;
    const displayScale = Math.min(8, canvas.width / Math.max(1, displayWidth * (viewport ? 1 : viewZoom)));
    if (!screenSpaceBorders) {
      context.lineCap = "round";
      context.lineJoin = "round";
      context.strokeStyle = "rgba(1,8,13,.78)";
      context.lineWidth = Math.max(.08, displayScale * .9);
      if (this.coastlines) context.stroke(this.coastlines);
      context.strokeStyle = "rgba(1,7,12,.9)";
      context.lineWidth = Math.max(.08, displayScale * 1.25);
      if (this.countryBorders) context.stroke(this.countryBorders);
      if (this.gameMode === "strategy" && this.strategicProvinceAt.length) {
        const showStrategic = viewZoom >= 3.5, showAdministrative = viewZoom >= 6.5;
        if (showStrategic || showAdministrative) {
          this.prepareStrategicBorders(width, height);
          context.save();
          if (showAdministrative) {
            context.strokeStyle = "rgba(12,31,38,.26)";
            context.lineWidth = Math.max(.06, displayScale * .48);
            if (this.strategicAdministrativeBorders) context.stroke(this.strategicAdministrativeBorders);
          }
          if (showStrategic) {
            context.strokeStyle = "rgba(6,24,31,.48)";
            context.lineWidth = Math.max(.07, displayScale * .78);
            if (this.strategicBorders) context.stroke(this.strategicBorders);
          }
          context.restore();
        }
      }
    }

    if (highlight.length) {
      this.prepareHighlightOutline(width, height, highlight, highlightHash);
      if (this.highlightOutline) {
        context.save();
        context.lineCap = "round"; context.lineJoin = "round";
        // Steel-blue focus stays crisp without an alarm-like glow.
        context.strokeStyle = "rgba(89,170,205,.14)";
        context.lineWidth = Math.max(3.2, displayScale * 3.1);
        context.stroke(this.highlightOutline);
        context.strokeStyle = "rgba(12,30,39,.94)";
        context.lineWidth = Math.max(1.4, displayScale * 1.35);
        context.stroke(this.highlightOutline);
        context.strokeStyle = "rgba(222,242,250,.96)";
        context.lineWidth = Math.max(.7, displayScale * .62);
        context.stroke(this.highlightOutline);
        context.restore();
      }
    }

    if ((mapStyle === "labels" || mapStyle === "relief") && labelsOnCanvas) this.drawCountryLabels(context, width, viewZoom);

  }

  /** Packs political owner + strategic sector IDs and raw administrative IDs
   * into two nearest-sampled textures. The GPU can then derive borders in
   * screen pixels, so zooming never turns a thin province line into a road. */
  renderBoundaryIds(identityCanvas: HTMLCanvasElement, administrativeCanvas: HTMLCanvasElement, width: number, height: number) {
    if (this.countries.length > 254) throw new Error("Zbyt wiele państw dla tekstury granic");
    this.prepareRenderOwners(width, height);
    for (const canvas of [identityCanvas, administrativeCanvas]) {
      if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; }
    }
    const identityContext = identityCanvas.getContext("2d"), administrativeContext = administrativeCanvas.getContext("2d");
    if (!identityContext || !administrativeContext) return;
    const identity = identityContext.createImageData(width, height), administrative = administrativeContext.createImageData(width, height);
    for (let index = 0; index < this.renderOwners.length; index++) {
      const offset = index * 4, source = this.renderSourceIndices[index];
      const ownerCode = this.renderOwners[index] + 1;
      const regionCode = source >= 0 && this.strategicProvinceAt.length ? this.strategicProvinceAt[source] + 1 : 0;
      const administrativeCode = source >= 0 && this.strategicAdministrativeAt.length ? this.strategicAdministrativeAt[source] + 1 : 0;
      identity.data[offset] = Math.max(0, ownerCode);
      identity.data[offset + 1] = regionCode & 255;
      identity.data[offset + 2] = (regionCode >>> 8) & 255;
      identity.data[offset + 3] = 255;
      administrative.data[offset] = administrativeCode & 255;
      administrative.data[offset + 1] = (administrativeCode >>> 8) & 255;
      administrative.data[offset + 2] = (administrativeCode >>> 16) & 255;
      administrative.data[offset + 3] = 255;
    }
    identityContext.putImageData(identity, 0, 0);
    administrativeContext.putImageData(administrative, 0, 0);
  }

  renderTurnOutline(canvas: HTMLCanvasElement, activeTurn: number | null, viewZoom = 1, viewport?: { panX: number; panY: number }) {
    const context = canvas.getContext("2d");
    if (!context) return;
    context.clearRect(0, 0, canvas.width, canvas.height);
    if (activeTurn === null) return;

    const width = canvas.width, height = canvas.height;
    if (viewport) this.prepareViewportOwners(width, height, viewZoom, viewport.panX, viewport.panY);
    else this.prepareRenderOwners(width, height);
    const outlineKey = `${this.renderOwnersKey}:${activeTurn}`;
    if (outlineKey !== this.outlineCacheKey || !this.outlinePath) {
      const path = new Path2D(), wrapRenderX = (x: number) => (x + width) % width;
      for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
        const index = y * width + x;
        if (this.renderOwners[index] !== activeTurn) continue;
        const top = y > 0 ? this.renderOwners[index - width] : -1;
        const right = this.renderOwners[y * width + wrapRenderX(x + 1)];
        const bottom = y + 1 < height ? this.renderOwners[index + width] : -1;
        const left = this.renderOwners[y * width + wrapRenderX(x - 1)];
        if (top !== activeTurn) { path.moveTo(x, y); path.lineTo(x + 1, y); }
        if (right !== activeTurn) { path.moveTo(x + 1, y); path.lineTo(x + 1, y + 1); }
        if (bottom !== activeTurn) { path.moveTo(x, y + 1); path.lineTo(x + 1, y + 1); }
        if (left !== activeTurn) { path.moveTo(x, y); path.lineTo(x, y + 1); }
      }
      this.outlinePath = path;
      this.outlineCacheKey = outlineKey;
    }

    const displayWidth = canvas.clientWidth >= 16 ? canvas.clientWidth : canvas.width;
    const displayScale = Math.min(8, canvas.width / Math.max(1, displayWidth * (viewport ? 1 : viewZoom)));
    context.save();
    context.lineCap = "round";
    context.lineJoin = "round";
    context.strokeStyle = "rgba(255,0,38,.42)";
    context.lineWidth = Math.max(.28, displayScale * 2.7);
    context.shadowColor = "rgba(255,0,32,.95)";
    context.shadowBlur = displayScale * 5.2;
    context.stroke(this.outlinePath);
    context.shadowBlur = 0;
    context.strokeStyle = "#ff0037";
    context.lineWidth = Math.max(.18, displayScale * 1.12);
    context.stroke(this.outlinePath);
    context.strokeStyle = "rgba(255,232,238,.92)";
    context.lineWidth = Math.max(.08, displayScale * .34);
    context.stroke(this.outlinePath);
    context.restore();
  }
}

export function isSnapshot(value: unknown): value is GameSnapshot {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<GameSnapshot>;
  const validMode = candidate.mode === undefined || candidate.mode === "full" || candidate.mode === "war" || candidate.mode === "strategy";
  const validRegion = candidate.region === undefined || ["world", "europe", "asia_oceania", "africa", "north_america", "central_america_caribbean", "south_america"].includes(candidate.region);
  const validMicrostates = candidate.microstates === undefined || candidate.microstates === "all" || candidate.microstates === "exclude";
  const integer = (item: unknown, minimum = 0, maximum = Number.MAX_SAFE_INTEGER) => typeof item === "number" && Number.isInteger(item) && item >= minimum && item <= maximum;
  const finite = (item: unknown, minimum = -Infinity, maximum = Infinity) => typeof item === "number" && Number.isFinite(item) && item >= minimum && item <= maximum;
  const validAccounting = (item: unknown) => {
    if (!item || typeof item !== "object") return false;
    const record = item as PopulationCensus["accounting"];
    return integer(record.naturalChange, -Number.MAX_SAFE_INTEGER)
      && [record.combatDeaths, record.refugeesIn, record.refugeesOut, record.territoryIn, record.territoryOut].every((v) => integer(v));
  };
  const validCensus = (item: PopulationCensus) => item && integer(item.population) && validAccounting(item.accounting)
    && item.demographics && AGE_GROUPS.every((key) => finite(item.demographics[key], 0, 1))
    && Math.abs(AGE_GROUPS.reduce((sum, key) => sum + item.demographics[key], 0) - 1) < .000001;
  const validPair = (item: { attacker: PopulationCensus; defender: PopulationCensus } | undefined) => item === undefined || !!item && validCensus(item.attacker) && validCensus(item.defender);
  const dimensions = [[MAP_W, MAP_H], [PREVIOUS_MAP_W, PREVIOUS_MAP_H], [OLDER_MAP_W, OLDER_MAP_H], [LEGACY_MAP_W, LEGACY_MAP_H]];
  const validDimensions = dimensions.some(([width, height]) => candidate.width === width && candidate.height === height);
  if (candidate.version !== 1 || !validMode || !validRegion || !validMicrostates || !validDimensions
    || !integer(candidate.seed, 1, 0xffff_ffff) || !integer(candidate.rngState, 0, 0xffff_ffff)
    || !integer(candidate.turn, 0) || (candidate.mapRevision !== undefined && !integer(candidate.mapRevision, 1, CURRENT_MAP_REVISION))
    || !Array.isArray(candidate.runs) || !Array.isArray(candidate.history) || candidate.history.length > 1_000) return false;

  const expectedCells = (candidate.width as number) * (candidate.height as number);
  let cells = 0;
  for (const run of candidate.runs) {
    if (!Array.isArray(run) || run.length !== 2 || !integer(run[0], -1, 0x7fff) || !integer(run[1], 1, 65_535)) return false;
    cells += run[1];
    if (cells > expectedCells) return false;
  }
  if (cells !== expectedCells) return false;

  if (candidate.colors !== undefined && (!Array.isArray(candidate.colors) || !candidate.colors.every((color) =>
    Array.isArray(color) && color.length === 3 && color.every((channel) => finite(channel, 0, 255))))) return false;
  if (candidate.defeats !== undefined && (!Array.isArray(candidate.defeats) || !candidate.defeats.every((count) => integer(count, 0)))) return false;
  const countryCount = Array.isArray(candidate.colors) ? candidate.colors.length
    : Array.isArray(candidate.defeats) ? candidate.defeats.length
      : Array.isArray(candidate.countryCapabilityStates) ? candidate.countryCapabilityStates.length
        : undefined;
  if (candidate.capabilityStatesV2 !== undefined) {
    const fields = ["economy", "population", "technology", "logistics", "military", "stability"] as const;
    const groups = ["children", "youth", "primeAge", "middleAge", "elderly", "veryOld"] as const;
    if (!Array.isArray(candidate.capabilityStatesV2) || candidate.capabilityStatesV2.length !== countryCount
      || !candidate.capabilityStatesV2.every((s) => s && typeof s === "object"
        && s.components && fields.every((k) => finite(s.components[k]))
        && s.change && fields.every((k) => finite(s.change[k]))
        && finite(s.populationAbsolute, 0) && finite(s.uncertainty) && integer(s.lastEvaluatedTurn)
        && (s.populationAccounting === undefined || validAccounting(s.populationAccounting))
        && finite(s.assimilationProgress) && finite(s.refugeesHosted, 0) && finite(s.combatExperience)
        && s.demographics && groups.every((k) => finite(s.demographics[k], 0, 1))
        && ["healthy", "chimney", "inverted"].includes(s.demographicType)
        && ["democracy", "authoritarian", "totalitarian"].includes(s.regimeType)
        && ["closed", "selective", "open", "mass"].includes(s.borderPolicy)
        && s.manpower && ["hidden", "open", "full"].includes(s.manpower.mobilization)
        && [s.manpower.available, s.manpower.active, s.manpower.reserves, s.manpower.maintenanceCost].every((v) => finite(v))
        && s.informationEnvironment && [s.informationEnvironment.score, s.informationEnvironment.techComponent, s.informationEnvironment.mediaControl, s.informationEnvironment.servicesStrength].every((v) => finite(v))
        && s.refugeeComposition && [s.refugeeComposition.women, s.refugeeComposition.men, s.refugeeComposition.children].every((v) => finite(v, 0))
        && s.culturalProximity && typeof s.culturalProximity === "object"
        && Array.isArray(s.logisticsInvestments) && s.logisticsInvestments.every((inv) => inv && typeof inv.id === "string" && integer(inv.regionId) && ["road", "rail", "airport", "port"].includes(inv.type) && finite(inv.bonus, 0) && integer(inv.remainingTurns, 1)))) return false;
  }
  if (candidate.policyStateV2 !== undefined) {
    const p = candidate.policyStateV2, defaults = createPlayerPolicyDecisionDefaults();
    if (!p || !integer(p.decisionPoints, 0, 2) || !integer(p.lastDecisionTurn)
      || !Array.isArray(p.used) || !p.used.every((u) => u && Object.hasOwn(defaults, u.id) && integer(u.turn, -20))
      || !Array.isArray(p.active) || !p.active.every((id) => Object.hasOwn(defaults, id))) return false;
  }
  if (candidate.strategicQuarterStartV1 !== undefined && (!Array.isArray(candidate.strategicQuarterStartV1)
    || candidate.strategicQuarterStartV1.length !== countryCount
    || !candidate.strategicQuarterStartV1.every((entry) => entry && [entry.economy, entry.population, entry.technology, entry.logistics, entry.military, entry.stability].every((n) => finite(n, 0))))) return false;
  if (candidate.infrastructureV2 !== undefined && (!Array.isArray(candidate.infrastructureV2)
    || !candidate.infrastructureV2.every((i) => i && finite(i.roadDensity, 0, 1) && finite(i.railDensity, 0, 1) && integer(i.airportCount) && integer(i.portCount) && finite(i.maritimeAccess, 0, 100)))) return false;
  if (candidate.warExhaustion !== undefined && (!Array.isArray(candidate.warExhaustion)
    || countryCount === undefined || candidate.warExhaustion.length !== countryCount
    || !candidate.warExhaustion.every((value) => finite(value, 0)))) return false;
  if (candidate.capitalStates !== undefined && (!Array.isArray(candidate.capitalStates)
    || countryCount === undefined || candidate.capitalStates.length !== countryCount
    || !candidate.capitalStates.every((capital) => capital === null || Boolean(capital) && typeof capital === "object"
      && (capital.index === null || integer(capital.index, 0, expectedCells - 1))
      && (capital.lostTurn === null || finite(capital.lostTurn, 0))
      && typeof capital.relocated === "boolean"))) return false;
  if (candidate.warVetoesLeft !== undefined && !integer(candidate.warVetoesLeft, 0, WAR_VETO_LIMIT)) return false;
  if (candidate.warUndosLeft !== undefined && !integer(candidate.warUndosLeft, 0, WAR_UNDO_LIMIT)) return false;
  if (candidate.warGuaranteeUsed !== undefined && typeof candidate.warGuaranteeUsed !== "boolean") return false;
  if (candidate.warGuarantee !== undefined && candidate.warGuarantee !== null && !(Boolean(candidate.warGuarantee) && typeof candidate.warGuarantee === "object"
    && integer(candidate.warGuarantee.countryId, 0) && finite(candidate.warGuarantee.untilTurn, 0))) return false;
  if (candidate.warMinShare !== undefined && (!Array.isArray(candidate.warMinShare)
    || countryCount === undefined || candidate.warMinShare.length !== countryCount
    || !candidate.warMinShare.every((value) => finite(value, 0)))) return false;
  if (candidate.cataclysmEnabled !== undefined && typeof candidate.cataclysmEnabled !== "boolean") return false;
  if (candidate.playerCountryId !== undefined && candidate.playerCountryId !== null && !integer(candidate.playerCountryId, 0)) return false;
  if (candidate.strategicRegionSchema !== undefined && candidate.strategicRegionSchema !== 1 && candidate.strategicRegionSchema !== 2 && candidate.strategicRegionSchema !== 3 && candidate.strategicRegionSchema !== 4 && candidate.strategicRegionSchema !== 5) return false;
  if (candidate.strategicRegionOwners !== undefined && (!Array.isArray(candidate.strategicRegionOwners) || !candidate.strategicRegionOwners.every((id) => integer(id, 0)))) return false;
  if (candidate.regionalPopulationV1 !== undefined && (!Array.isArray(candidate.regionalPopulationV1)
    || candidate.regionalPopulationV1.length !== candidate.strategicRegionOwners?.length
    || !candidate.regionalPopulationV1.every((counts) => counts && AGE_GROUPS.every((key) => integer(counts[key]))))) return false;
  if (candidate.populationDistributionV1 !== undefined && !["ghsl-2020", "area"].includes(candidate.populationDistributionV1)) return false;
  if (candidate.strategicFortifications !== undefined && (!Array.isArray(candidate.strategicFortifications) || !candidate.strategicFortifications.every((value) => finite(value, 0, 100)))) return false;
  if (candidate.strategicCampaigns !== undefined && (!Array.isArray(candidate.strategicCampaigns) || !candidate.strategicCampaigns.every((campaign) => campaign && typeof campaign === "object"
    && integer(campaign.id, 1) && integer(campaign.attackerId, 0) && integer(campaign.defenderId, 0) && integer(campaign.regionId, 0)
    && finite(campaign.progress, 0, 100) && integer(campaign.turns, 0)
    && validPair(campaign.populationBefore)
    && (campaign.populationBaselineTurn === undefined || integer(campaign.populationBaselineTurn, 0, candidate.turn))
    && (campaign.territoryPopulation === undefined || integer(campaign.territoryPopulation))
    && (campaign.stallTurns === undefined || integer(campaign.stallTurns, 0, 12))
    && (campaign.attackerCasualties === undefined || integer(campaign.attackerCasualties, 0, 10_000_000))
    && (campaign.defenderCasualties === undefined || integer(campaign.defenderCasualties, 0, 10_000_000))
    && (campaign.battles === undefined || integer(campaign.battles, 0, 10_000))
    && (campaign.lastMomentum === undefined || finite(campaign.lastMomentum, -100, 100))
    && (campaign.lastRandomFactor === undefined || finite(campaign.lastRandomFactor, .5, 1.5))
    && (campaign.casusBelli === undefined || Object.hasOwn(STRATEGIC_CASUS_BELLI, campaign.casusBelli))))) return false;
  if (candidate.strategicTerritoryLog !== undefined && (!Array.isArray(candidate.strategicTerritoryLog) || candidate.strategicTerritoryLog.length > 10_000
    || !candidate.strategicTerritoryLog.every((event) => event && typeof event === "object"
      && integer(event.turn, 1) && integer(event.sectorId, 0) && typeof event.sectorName === "string"
      && Array.isArray(event.provinceNames) && event.provinceNames.length <= 500 && event.provinceNames.every((name) => typeof name === "string")
      && integer(event.fromOwnerId, 0) && typeof event.fromOwnerName === "string"
      && integer(event.toOwnerId, 0) && typeof event.toOwnerName === "string" && finite(event.areaKm2, 0)))) return false;
  if (candidate.strategicOccupations !== undefined && (!Array.isArray(candidate.strategicOccupations) || candidate.strategicOccupations.length > 2_000
    || !candidate.strategicOccupations.every((occupation) => occupation && typeof occupation === "object"
      && integer(occupation.regionId, 0) && integer(occupation.ownerId, 0) && integer(occupation.previousOwnerId, 0)
      && finite(occupation.progress, 0, 100) && integer(occupation.startedTurn, 1) && finite(occupation.lastGain, 0, 100)
      && (occupation.policy === undefined || Object.hasOwn(STRATEGIC_OCCUPATION_POLICIES, occupation.policy))
      && (occupation.casusBelli === undefined || Object.hasOwn(STRATEGIC_CASUS_BELLI, occupation.casusBelli))))) return false;
  if (candidate.strategicBattleArtifacts !== undefined && (!Array.isArray(candidate.strategicBattleArtifacts) || candidate.strategicBattleArtifacts.length > 320
    || !candidate.strategicBattleArtifacts.every((artifact) => artifact && typeof artifact === "object"
      && integer(artifact.id, 1) && integer(artifact.regionId, 0) && integer(artifact.turn, 1)
      && integer(artifact.attackerId, 0) && integer(artifact.defenderId, 0)
      && finite(artifact.x, 0, 100) && finite(artifact.y, 0, 100) && finite(artifact.intensity, 0, 100)
      && (artifact.kind === "battle" || artifact.kind === "burned")))) return false;
  if (candidate.strategicWarHistory !== undefined) {
    if (!Array.isArray(candidate.strategicWarHistory) || candidate.strategicWarHistory.length > 1_000) return false;
    if (!candidate.strategicWarHistory.every((war) => war && typeof war === "object"
      && integer(war.id, 1) && integer(war.attackerId, 0) && integer(war.defenderId, 0) && integer(war.regionId, 0)
      && integer(war.startedTurn, 1) && integer(war.endedTurn, 1) && war.endedTurn >= war.startedTurn
      && ["captured", "repelled", "withdrawn", "stalemate"].includes(war.outcome as string)
      && validPair(war.populationBefore) && validPair(war.populationAfter)
      && (war.populationBaselineTurn === undefined || integer(war.populationBaselineTurn, 0, war.endedTurn))
      && (war.territoryPopulation === undefined || integer(war.territoryPopulation))
      && integer(war.attackerCasualties, 0, 10_000_000) && integer(war.defenderCasualties, 0, 10_000_000) && integer(war.battles, 0, 10_000)
      && (war.refugeesFled === undefined || integer(war.refugeesFled, 0, 100_000_000))
      && (war.refugeesFledWomen === undefined || integer(war.refugeesFledWomen, 0, 100_000_000))
      && (war.refugeesFledMen === undefined || integer(war.refugeesFledMen, 0, 100_000_000))
      && (war.refugeesFledChildren === undefined || integer(war.refugeesFledChildren, 0, 100_000_000)))) return false;
  }
  if (candidate.strategicExhaustion !== undefined && (!Array.isArray(candidate.strategicExhaustion) || !candidate.strategicExhaustion.every((value) => finite(value, 0, 100)))) return false;
  if (candidate.strategicPoliticsV1 !== undefined && (!Array.isArray(candidate.strategicPoliticsV1)
    || candidate.strategicPoliticsV1.length !== countryCount
    || !candidate.strategicPoliticsV1.every((state, index) => state && state.countryId === index && finite(state.legitimacy, 0, 100) && finite(state.reputation, 0, 100) && finite(state.warSupport, 0, 100)))) return false;
  if (candidate.strategicRelationsV1 !== undefined && (!Array.isArray(candidate.strategicRelationsV1) || candidate.strategicRelationsV1.length > 20_000
    || !candidate.strategicRelationsV1.every((relation) => relation && integer(relation.firstId, 0, (countryCount ?? 1) - 1) && integer(relation.secondId, 0, (countryCount ?? 1) - 1)
      && relation.firstId !== relation.secondId && finite(relation.trust, 0, 100) && finite(relation.tension, 0, 100)
      && finite(relation.warMemory, 0, 100) && integer(relation.lastChangedTurn, 0)))) return false;
  if (candidate.strategicDefenseState !== undefined) {
    const defense = candidate.strategicDefenseState;
    if (!defense || !["continue", "general", "sector"].includes(defense.posture)
      || (defense.focusRegionId !== null && !integer(defense.focusRegionId, 0))
      || !integer(defense.mobilizedUntil, 0) || !integer(defense.mobilizationCooldownUntil, 0)) return false;
  }

  const actions = new Set<ActionKey>(["war", "land", "erosion"]);
  const sizes = new Set<SizeKey>(["all", "large", "big", "medium", "small", "tiny"]);
  return candidate.history.every((item) => {
    if (!item || typeof item !== "object") return false;
    const record = item as Partial<TurnRecord>;
    return integer(record.turn, 1) && integer(record.countryId, 0)
      && typeof record.countryName === "string" && typeof record.countryFlag === "string"
      && typeof record.action === "string" && actions.has(record.action as ActionKey)
      && typeof record.direction === "string" && typeof record.directionShort === "string"
      && typeof record.size === "string" && sizes.has(record.size as SizeKey)
      && finite(record.fraction, 0, 1)
      && (record.targetId === null || integer(record.targetId, 0))
      && (record.targetName === null || typeof record.targetName === "string")
      && (record.targetFlag === null || typeof record.targetFlag === "string")
      && finite(record.changedKm2, 0)
      && (record.actualFraction === undefined || finite(record.actualFraction, 0))
      && (record.partial === undefined || typeof record.partial === "boolean")
      && (record.eliminated === null || typeof record.eliminated === "string")
      && (record.capitalLost === undefined || typeof record.capitalLost === "string")
      && (record.capitalRelocated === undefined || typeof record.capitalRelocated === "string")
      && typeof record.text === "string";
  });
}

export function formatArea(value: number) { return `${formatNumber(Math.max(0, value))} km²`; }
