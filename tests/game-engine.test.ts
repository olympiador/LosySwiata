import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { inflateSync } from "node:zlib";
import { assignCrimeaToUkraine, assignFrenchGuianaOwner, circularColumnSpan, classifyGameRegion, curatedFortificationBaseline, DIRECTIONS, isCrimeaCoordinate, isKaliningradCoordinate, isSnapshot, MAP_H, MAP_W, WorldEngine, type Country, type Direction, type TurnPlan } from "../app/game-engine";
import { applyRefugeeMovement, evaluateCapabilityChange, initialCapabilityStates, loadCapabilityStatesFromSnapshot, refugeeArrivalProfile } from "../app/country-capability";
import { ADMIN1_DEFLATE_BASE64, ADMIN1_ISO, ADMIN1_NAMES } from "../app/admin1-data";
import { REAL_AIRPORTS_DEFLATE_BASE64 } from "../app/airport-data";
import { CAPITALS } from "../app/capital-data";

Object.defineProperty(globalThis, "document", {
  configurable: true,
  value: {
    createElement: () => ({
      width: 0,
      height: 0,
      getContext: () => ({}),
    }),
  },
});

const countries: Country[] = [
  { id: 0, iso: "AA", name: "Atakujący", flag: "A", color: [220, 60, 60], initialWeight: 0 },
  { id: 1, iso: "BB", name: "Cel", flag: "B", color: [60, 120, 220], initialWeight: 0 },
];

const EngineConstructor = WorldEngine as unknown as new (
  countries: Country[],
  owners: Int16Array,
  legacyOwners: Int16Array,
  seed: number,
  elevation?: Uint16Array,
  admin1At?: Int16Array,
  airports?: Uint16Array,
  ports?: Uint16Array,
) => WorldEngine;

function engineFrom(owners: Int16Array, elevation?: Uint16Array, sourceCountries = countries, admin1At?: Int16Array) {
  return new EngineConstructor(sourceCountries.map((country) => ({ ...country, color: [...country.color] as [number, number, number] })), owners, owners.slice(), 1, elevation, admin1At);
}

function indexAt(x: number, y: number) { return y * MAP_W + x; }
function capitalAt(name: string, x: number, y: number) { return { name, latitude: 90 - (y + .5) / MAP_H * 180, longitude: (x + .5) / MAP_W * 360 - 180 }; }

test("capital reference covers every sovereign country used by the game", () => {
  assert.deepEqual(CAPITALS.PL, ["Warsaw", 52.22977, 21.01178]);
  assert.deepEqual(CAPITALS.EE, ["Tallinn", 59.43696, 24.75353]);
  assert.ok(Object.keys(CAPITALS).length >= 195);
});

test("curated baseline recognizes the documented defensive preparation in Donbas", () => {
  assert.equal(curatedFortificationBaseline("UA", "doniecki").score, 40);
  assert.equal(curatedFortificationBaseline("UA", "ługański").score, 40);
  assert.equal(curatedFortificationBaseline("KR", "Gyeonggi", MAP_W * (127.5 + 180) / 360, MAP_H * (90 - 37.5) / 180).score, 45);
  assert.equal(curatedFortificationBaseline("PK", "Azad Kashmir", MAP_W * (74 + 180) / 360, MAP_H * (90 - 34) / 180).score, 32);
  assert.equal(curatedFortificationBaseline("MA", "Sahara", MAP_W * (-13 + 180) / 360, MAP_H * (90 - 25) / 180).score, 35);
  assert.equal(curatedFortificationBaseline("KG", "Naryn").score, 0);
});

test("continent classification separates North, Central and South America", () => {
  assert.equal(classifyGameRegion("US", "Americas", "North America"), "north_america");
  assert.equal(classifyGameRegion("MX", "Americas", "North America"), "north_america");
  assert.equal(classifyGameRegion("CU", "Americas", "Caribbean"), "central_america_caribbean");
  assert.equal(classifyGameRegion("BR", "Americas", "South America"), "south_america");
  assert.equal(classifyGameRegion("RU", "Europe", "Eastern Europe"), "asia_oceania");
});

test("legacy capability saves keep their progress and original regime", () => {
  const saved = [[61, 27, 46, 52, 70, 63, 74, 9, 32, 17, 15, 144_000_000, 18, 2_000]];
  const restored = loadCapabilityStatesFromSnapshot([{ ...countries[0], iso: "RU", iso3: "RUS" }], saved);
  assert.equal(restored[0].components.economy, 61);
  assert.equal(restored[0].components.military, 70);
  assert.equal(restored[0].populationAbsolute, 144_000_000);
  assert.equal(restored[0].regimeType, "authoritarian");
});

test("initial demographic pyramids differ by country development", () => {
  const states = initialCapabilityStates([
    { ...countries[0], iso: "PL", iso3: "POL" },
    { ...countries[1], iso: "KP", iso3: "PRK" },
  ]);
  assert.notDeepEqual(states[0].demographics, states[1].demographics);
  assert.ok(states[0].demographics.elderly > states[1].demographics.elderly);
});

test("refugee transfers change the sending and receiving populations without inventing residents", () => {
  const state = initialCapabilityStates([{ ...countries[0], iso: "PL", iso3: "POL" }])[0];
  const moved = applyRefugeeMovement(state, 12_000, 3_500, refugeeArrivalProfile("full"));
  assert.equal(moved.populationAbsolute, state.populationAbsolute + 8_500);
  assert.equal(moved.refugeesHosted, state.refugeesHosted + 12_000);
  assert.equal(moved.refugeeComposition.women, 6_840);
  assert.equal(moved.refugeeComposition.men, 720);
  assert.equal(moved.refugeeComposition.children, 4_440);
  assert.ok(moved.demographics.children > state.demographics.children, "full mobilization should send a child-heavy civilian profile");
});

test("French Guiana can be assigned as the game's independent country", () => {
  const guianaAdmin = ADMIN1_NAMES.indexOf("Gujana Francuska");
  assert.ok(guianaAdmin >= 0);
  const owners = new Int16Array([3, 3, 4]);
  const administrative = new Int16Array([guianaAdmin, -1, guianaAdmin]);
  assert.equal(assignFrenchGuianaOwner(owners, administrative, 3, 7), 1);
  assert.deepEqual([...owners], [7, 3, 4]);
});

test("capability evaluation does not shorten logistics investments a second time", () => {
  const [state] = initialCapabilityStates(countries);
  state.logisticsInvestments = [{ id: "roads-1", regionId: 0, type: "road", bonus: 10, remainingTurns: 4 }];
  const updated = evaluateCapabilityChange(state, state.components, {
    hasIncoming: false,
    hasOutgoing: false,
    activeOccupations: 0,
    areaShare: 1,
  }, 1, 1);
  assert.equal(updated.logisticsInvestments[0]?.remainingTurns, 4);
});

test("map picking wraps horizontally like a cylinder", () => {
  const owners = new Int16Array(MAP_W * MAP_H);
  owners.fill(-1);
  const y = Math.floor(MAP_H / 2), wrappedX = Math.floor(.9995 * MAP_W);
  owners[indexAt(wrappedX, y)] = 0;
  const engine = engineFrom(owners);
  assert.equal(engine.getCountryAt(-.0005, .5)?.id, 0);
  assert.equal(engine.getCountryAt(.9995, .5)?.id, 0);
});

test("Crimea and Sevastopol are assigned to Ukraine within internationally recognized borders", () => {
  assert.equal(isCrimeaCoordinate(34.10, 44.95), true, "Simferopol should lie inside Crimea");
  assert.equal(isCrimeaCoordinate(33.52, 44.62), true, "Sevastopol should lie inside Crimea");
  assert.equal(isCrimeaCoordinate(30.72, 46.48), false, "Odesa must remain outside the correction polygon");
  const owners = new Int16Array(MAP_W * MAP_H);
  owners.fill(-1);
  const russiaId = 0, ukraineId = 1;
  const simferopolX = Math.floor((34.10 + 180) / 360 * MAP_W);
  const simferopolY = Math.floor((90 - 44.95) / 180 * MAP_H);
  owners[indexAt(simferopolX, simferopolY)] = russiaId;
  assignCrimeaToUkraine(owners, [
    { id: russiaId, iso: "RU", name: "Rosja", flag: "R", color: [1, 2, 3], initialWeight: 0 },
    { id: ukraineId, iso: "UA", name: "Ukraina", flag: "U", color: [4, 5, 6], initialWeight: 0 },
  ]);
  assert.equal(owners[indexAt(simferopolX, simferopolY)], ukraineId);
});

test("Kaliningrad participates in Europe without making all of Russia playable", () => {
  assert.equal(isKaliningradCoordinate(20.5, 54.7), true);
  assert.equal(isKaliningradCoordinate(37.6, 55.7), false);
  const owners = new Int16Array(MAP_W * MAP_H);
  owners.fill(-1);
  const xFromLongitude = (longitude: number) => Math.floor((longitude + 180) / 360 * MAP_W);
  const yFromLatitude = (latitude: number) => Math.floor((90 - latitude) / 180 * MAP_H);
  const kaliningradX = xFromLongitude(20.5), kaliningradY = yFromLatitude(54.7);
  for (let y = kaliningradY - 5; y <= kaliningradY + 5; y++) for (let x = kaliningradX - 18; x < kaliningradX; x++) owners[indexAt(x, y)] = 0;
  for (let y = kaliningradY - 5; y <= kaliningradY + 5; y++) for (let x = kaliningradX; x <= kaliningradX + 12; x++) owners[indexAt(x, y)] = 1;
  for (let y = 300; y <= 340; y++) for (let x = 2_500; x <= 2_560; x++) owners[indexAt(x, y)] = 1;
  const sourceCountries: Country[] = [
    { ...countries[0], iso: "PL", name: "Polska", region: "europe" },
    { ...countries[1], iso: "RU", name: "Rosja", region: "asia_oceania" },
  ];
  const engine = engineFrom(owners, undefined, sourceCountries);
  engine.setGameMode("war");
  engine.setGameRegion("europe");
  const east = DIRECTIONS.find((direction) => direction.short === "E") as Direction;
  const hit = (engine as unknown as { targetInDirection: (actorId: number, direction: Direction, stats: unknown[]) => { countryId: number } | null })
    .targetInDirection(0, east, engine.getStats());
  assert.equal(hit?.countryId, 1, "the Russian enclave must be a valid European war target");
  assert.equal(engine.getWinner(), null, "the European game is not won while Kaliningrad remains");
  engine.apply({ rngBefore: engine.rngState, countryId: 0, action: "war", direction: east, directionAttempts: [east], actionWasRerolled: false, size: "all", fraction: 1, targetId: 1 });
  assert.equal(engine.owners[indexAt(kaliningradX + 4, kaliningradY)], 0, "ALL must capture Kaliningrad");
  assert.equal(engine.owners[indexAt(2_520, 320)], 1, "Europe mode must not annex mainland Russia");
  assert.equal(engine.getWinner()?.id, 0);
});

test("a partial European war cannot spill from Kaliningrad into mainland Russia", () => {
  const owners = new Int16Array(MAP_W * MAP_H);
  owners.fill(-1);
  const xFromLongitude = (longitude: number) => Math.floor((longitude + 180) / 360 * MAP_W);
  const yFromLatitude = (latitude: number) => Math.floor((90 - latitude) / 180 * MAP_H);
  const kaliningradX = xFromLongitude(20.5), kaliningradY = yFromLatitude(54.7);
  for (let y = kaliningradY - 7; y <= kaliningradY + 7; y++) for (let x = kaliningradX - 24; x < kaliningradX; x++) owners[indexAt(x, y)] = 0;
  for (let y = kaliningradY - 7; y <= kaliningradY + 7; y++) for (let x = kaliningradX; x <= kaliningradX + 60; x++) owners[indexAt(x, y)] = 1;
  const mainlandIndex = indexAt(kaliningradX + 45, kaliningradY);
  const sourceCountries: Country[] = [
    { ...countries[0], iso: "PL", name: "Polska", region: "europe" },
    { ...countries[1], iso: "RU", name: "Rosja", region: "asia_oceania" },
  ];
  const engine = engineFrom(owners, undefined, sourceCountries);
  engine.setGameMode("war");
  engine.setGameRegion("europe");
  const east = DIRECTIONS.find((direction) => direction.short === "E") as Direction;
  engine.apply({ rngBefore: engine.rngState, countryId: 0, action: "war", direction: east, directionAttempts: [east], actionWasRerolled: false, size: "large", fraction: .75, targetId: 1 });
  assert.equal(engine.owners[mainlandIndex], 1, "mainland Russia must remain outside the European scenario");
  assert.ok([...engine.owners].every((owner, index) => owner !== 0 || owners[index] === 0 || isKaliningradCoordinate((index % MAP_W) / MAP_W * 360 - 180, 90 - Math.floor(index / MAP_W) / MAP_H * 180)));
});

test("a flag crossing the map seam uses one circular span instead of repeated tiles", () => {
  assert.deepEqual(circularColumnSpan([0, 1, 2, 90, 91, 92], 100), { startX: 90, spanX: 13 });
  assert.deepEqual(circularColumnSpan([20, 21, 22, 23], 100), { startX: 20, spanX: 4 });
});

test("War only never rolls land or erosion and survives save/load", () => {
  const owners = new Int16Array(MAP_W * MAP_H);
  owners.fill(-1);
  for (let y = 100; y <= 110; y++) for (let x = 100; x <= 110; x++) owners[indexAt(x, y)] = 0;
  for (let y = 100; y <= 110; y++) for (let x = 111; x <= 121; x++) owners[indexAt(x, y)] = 1;
  const engine = engineFrom(owners);
  engine.countries.forEach((country) => { country.region = "europe"; });
  engine.setGameMode("war");
  engine.setGameRegion("europe");

  for (let roll = 0; roll < 30; roll++) assert.equal(engine.rollAction(0).action, "war");

  const snapshot = engine.snapshot();
  assert.equal(snapshot.mode, "war");
  assert.equal(snapshot.region, "europe");
  const restored = engineFrom(owners);
  restored.countries.forEach((country) => { country.region = "europe"; });
  restored.load(snapshot);
  assert.equal(restored.gameMode, "war");
  assert.equal(restored.gameRegion, "europe");
  assert.equal(restored.rollAction(0).action, "war");
});

test("strategic mode uses adjacent provinces, multi-round campaigns and restores command state", () => {
  const sourceCountries: Country[] = [...countries, { id: 2, iso: "CC", name: "Nowy właściciel", flag: "C", color: [70, 180, 100], initialWeight: 0 }];
  const owners = new Int16Array(MAP_W * MAP_H);
  owners.fill(-1);
  for (let y = 420; y < 650; y++) {
    for (let x = 500; x < 820; x++) owners[indexAt(x, y)] = 0;
    for (let x = 820; x < 1_140; x++) owners[indexAt(x, y)] = 1;
  }
  const initialOwners = owners.slice();
  const engine = engineFrom(initialOwners.slice(), undefined, sourceCountries);
  engine.reset(12345, "strategy", "world", "all");
  engine.setPlayerCountry(0);
  const playerStrength = engine.getStrategicStrength(0);
  assert.equal(playerStrength.rating, Math.round(playerStrength.power), "the visible strategic rating must be the country's own 0-100 score, not a percentage of the current leader");
  const regions = engine.getStrategicRegions();
  assert.equal(regions.length, 2, "without Admin-1 data each connected country shape remains one strategic sector");
  const target = engine.getStrategicTargets(0)[0];
  assert.ok(target, "the player should see an adjacent enemy province");

  engine.advanceStrategicRound(target.id);
  const started = engine.getStrategicCampaigns().find(({ attackerId }) => attackerId === 0);
  assert.ok(started && started.progress < 100, "a campaign must not capture a province in its opening round");

  const snapshot = engine.snapshot();
  const restored = engineFrom(initialOwners.slice(), undefined, sourceCountries);
  restored.load(snapshot);
  assert.equal(restored.playerCountryId, 0);
  assert.deepEqual(restored.getStrategicCampaigns(), engine.getStrategicCampaigns());

  const conflictEngine = engineFrom(initialOwners.slice(), undefined, sourceCountries);
  conflictEngine.load(snapshot);
  const internalRegions = (conflictEngine as unknown as { strategicRegions: Array<{ ownerId: number }> }).strategicRegions;
  internalRegions[target.id].ownerId = 2;
  const conflict = conflictEngine.getPlayerCampaignConflict();
  assert.equal(conflict?.currentDefenderId, 2, "the player must be asked when another country captures the campaign target");
  const progressBeforeDecision = conflict?.campaign.progress ?? 0;
  const resolution = conflictEngine.resolvePlayerCampaignConflict(true);
  assert.equal(resolution?.currentDefenderId, 2);
  assert.equal(Math.round(resolution?.retainedProgress ?? 0), Math.round(progressBeforeDecision * .7), "continuing should retain 70 percent of campaign progress");
  assert.equal(conflictEngine.getStrategicCampaigns().find(({ attackerId }) => attackerId === 0)?.defenderId, 2);

  (restored as unknown as { random: () => number }).random = () => 1;
  let rounds = 1;
  while (restored.getStrategicRegions()[target.id].ownerId !== 0 && rounds < 40) {
    restored.advanceStrategicRound();
    rounds++;
  }
  assert.ok(rounds > 1 && rounds < 40, "the campaign should resolve after several quarterly rounds");
  assert.ok(restored.getStrategicRegionIndices(target.id).every((index) => restored.owners[index] === 0), "capture must transfer the entire province");
  const territoryLog = restored.getStrategicTerritoryLog();
  assert.ok(territoryLog.some(({ sectorId, fromOwnerId, toOwnerId }) => sectorId === target.id && fromOwnerId === 1 && toOwnerId === 0));
  const occupation = restored.getStrategicOccupations().find(({ regionId }) => regionId === target.id);
  assert.ok(occupation && occupation.progress < 100, "a captured foreign region must begin a multi-quarter assimilation");
  restored.advanceStrategicRound();
  assert.ok((restored.getStrategicOccupations().find(({ regionId }) => regionId === target.id)?.progress ?? 0) > occupation.progress, "assimilation should advance each quarter");
  const restoredAfterCapture = engineFrom(initialOwners.slice(), undefined, sourceCountries);
  restoredAfterCapture.load(restored.snapshot());
  assert.deepEqual(restoredAfterCapture.getStrategicTerritoryLog(), restored.getStrategicTerritoryLog(), "territorial audit must survive save and load");
  assert.deepEqual(restoredAfterCapture.getStrategicOccupations(), restored.getStrategicOccupations(), "assimilation state must survive save and load");
  const legacyStrategic = restored.snapshot();
  legacyStrategic.strategicRegionSchema = 4;
  delete legacyStrategic.strategicOccupations;
  delete legacyStrategic.strategicExhaustion;
  assert.equal(legacyStrategic.strategicRegionOwners?.[target.id], 0, "the v4 fixture must retain the captured region owner");
  const migratedLegacy = engineFrom(initialOwners.slice(), undefined, sourceCountries);
  migratedLegacy.load(legacyStrategic);
  const migratedOccupations = migratedLegacy.getStrategicOccupations();
  assert.ok(migratedOccupations.some(({ regionId }) => regionId === target.id), `a v4 conquest must migrate into an active assimilation instead of staying permanently unavailable: target ${target.id}, got ${JSON.stringify(migratedOccupations)}`);
});

test("wartime refugees cross into eligible neighbouring countries, never automatically into the attacker", () => {
  const sourceCountries: Country[] = [
    { ...countries[0], id: 0, iso: "AA", name: "Napadnięty", region: "europe" },
    { ...countries[1], id: 1, iso: "BB", name: "Agresor", region: "europe" },
    { id: 2, iso: "CC", name: "Bezpieczny sąsiad", flag: "C", color: [70, 180, 100], initialWeight: 0, region: "europe" },
  ];
  const owners = new Int16Array(MAP_W * MAP_H); owners.fill(-1);
  for (let y = 400; y < 620; y++) {
    for (let x = 500; x < 720; x++) owners[indexAt(x, y)] = 1;
    for (let x = 720; x < 940; x++) owners[indexAt(x, y)] = 0;
    for (let x = 940; x < 1_160; x++) owners[indexAt(x, y)] = 2;
  }
  const engine = engineFrom(owners, undefined, sourceCountries);
  engine.reset(2468, "strategy", "world", "all");
  const internal = engine as unknown as { beginStrategicCampaign: (attackerId: number, regionId: number) => unknown; countryCapabilityStates: Array<{ borderPolicy: "closed" | "selective" | "open" | "mass" }> };
  internal.countryCapabilityStates[1].borderPolicy = "closed";
  internal.countryCapabilityStates[2].borderPolicy = "open";
  const target = engine.getStrategicTargets(1).find(({ ownerId }) => ownerId === 0)!;
  internal.beginStrategicCampaign(1, target.id);
  engine.advanceStrategicRound();
  assert.equal(engine.getCountryCapabilityState(1)?.refugeesHosted, 0, "the attacker on this front must not receive the defender's refugees");
  assert.ok((engine.getCountryCapabilityState(2)?.refugeesHosted ?? 0) > 0, "an open, safe neighbour should receive refugees");
});

test("losing the capital sector requires the player to choose a surviving regional seat", () => {
  const sourceCountries: Country[] = [
    { ...countries[0], id: 0, iso: "AA", name: "Państwo gracza", capital: { name: "Stara Stolica", latitude: 48.3, longitude: -130 } },
    { ...countries[1], id: 1, iso: "BB", name: "Najeźdźca" },
  ];
  const owners = new Int16Array(MAP_W * MAP_H); owners.fill(-1);
  for (let y = 470; y < 650; y++) {
    for (let x = 500; x < 720; x++) owners[indexAt(x, y)] = 0;
    for (let x = 720; x < 940; x++) owners[indexAt(x, y)] = 1;
  }
  for (let y = 800; y < 980; y++) for (let x = 500; x < 720; x++) owners[indexAt(x, y)] = 0;
  const engine = engineFrom(owners, undefined, sourceCountries);
  engine.reset(1357, "strategy", "world", "all");
  engine.setPlayerCountry(0);
  const target = engine.getStrategicTargets(1).find(({ ownerId }) => ownerId === 0)!;
  const internal = engine as unknown as { beginStrategicCampaign: (attackerId: number, regionId: number) => unknown; strategicCampaigns: Array<{ progress: number }> };
  internal.beginStrategicCampaign(1, target.id);
  internal.strategicCampaigns[0].progress = 99;
  (engine as unknown as { random: () => number }).random = () => 1;
  engine.advanceStrategicRound();
  const options = engine.getCapitalRelocationOptions(0);
  assert.ok(options.length > 0, "a player who retains territory must choose a replacement capital");
  assert.equal(engine.relocatePlayerCapital(options[0].regionId), true);
  assert.equal(engine.getCapitalRelocationOptions(0).length, 0);
  assert.equal(engine.getCapitalPlacements().find(({ countryId }) => countryId === 0)?.relocated, true);
});

test("a neighbouring AI country can put pressure on a strong player country", () => {
  const owners = new Int16Array(MAP_W * MAP_H); owners.fill(-1);
  for (let y = 400; y < 620; y++) {
    for (let x = 500; x < 720; x++) owners[indexAt(x, y)] = 0;
    for (let x = 720; x < 940; x++) owners[indexAt(x, y)] = 1;
  }
  const engine = engineFrom(owners);
  engine.reset(640459150, "strategy", "world", "all");
  engine.setPlayerCountry(0);
  engine.advanceStrategicRound(null);
  engine.advanceStrategicRound(null);
  assert.equal(engine.getStrategicCampaigns().some(({ defenderId }) => defenderId === 0), false, "the opening pact must cover two full rounds");
  const rolls = [0.05, 0, 0.5];
  (engine as unknown as { random: () => number }).random = () => rolls.shift() ?? 0.5;
  engine.advanceStrategicRound(null);
  assert.ok(engine.getStrategicCampaigns().some(({ attackerId, defenderId }) => attackerId === 1 && defenderId === 0));
  const policy = engine.getPlayerDefensePolicy();
  assert.ok(policy && policy.maxIncoming >= 1 && policy.maxIncoming <= 2);
});

test("player defense posture, sector priority and mobilization change an incoming front and survive save", () => {
  const owners = new Int16Array(MAP_W * MAP_H); owners.fill(-1);
  for (let y = 400; y < 620; y++) {
    for (let x = 500; x < 720; x++) owners[indexAt(x, y)] = 0;
    for (let x = 720; x < 940; x++) owners[indexAt(x, y)] = 1;
  }
  const engine = engineFrom(owners);
  engine.reset(9876, "strategy", "world", "all");
  engine.setPlayerCountry(0);
  const outgoingTarget = engine.getStrategicTargets(0).find(({ ownerId }) => ownerId === 1)!;
  const incomingTarget = engine.getStrategicTargets(1).find(({ ownerId }) => ownerId === 0)!;
  const internals = engine as unknown as {
    beginStrategicCampaign: (attackerId: number, regionId: number) => unknown;
    frontStrength: (attackerId: number, defenderId: number, regionId: number) => { defense: number; homeDefense: number };
  };
  internals.beginStrategicCampaign(0, outgoingTarget.id);
  internals.beginStrategicCampaign(1, incomingTarget.id);
  const baseline = internals.frontStrength(1, 0, incomingTarget.id);
  assert.equal(engine.setPlayerDefensePosture("general"), true);
  const general = internals.frontStrength(1, 0, incomingTarget.id);
  assert.ok(general.defense > baseline.defense * 1.29);
  assert.equal(engine.setPlayerDefensePosture("sector", incomingTarget.id), true);
  const focused = internals.frontStrength(1, 0, incomingTarget.id);
  assert.ok(focused.defense > baseline.defense * 1.49);
  const exhaustionBefore = engine.getStrategicExhaustion(0);
  assert.equal(engine.activatePlayerMobilization(), true);
  assert.equal(engine.getStrategicExhaustion(0), exhaustionBefore + 12);
  const mobilized = internals.frontStrength(1, 0, incomingTarget.id);
  assert.ok(mobilized.defense > focused.defense * 1.18, `the tactical mobilization bonus remains substantial after its immediate exhaustion cost: ${mobilized.defense} vs ${focused.defense}`);

  const playerProgress = engine.getStrategicCampaigns().find(({ attackerId }) => attackerId === 0)!.progress;
  (engine as unknown as { random: () => number }).random = () => .5;
  engine.advanceStrategicRound();
  assert.equal(engine.getStrategicCampaigns().find(({ attackerId }) => attackerId === 0)!.progress, Math.max(0, playerProgress - 2), "redeployment must freeze and slowly erode the player's offensive");

  const restored = engineFrom(owners);
  restored.load(engine.snapshot());
  assert.equal(restored.getPlayerDefenseState().posture, "sector");
  assert.equal(restored.getPlayerDefenseState().focusRegionId, incomingTarget.id);
});

test("real Admin-1 borders give Poland sixteen named voivodeships independent of seed", () => {
  const inflated = inflateSync(Buffer.from(ADMIN1_DEFLATE_BASE64, "base64"));
  const admin1At = new Int16Array(inflated.buffer, inflated.byteOffset, inflated.byteLength / 2);
  const owners = new Int16Array(MAP_W * MAP_H);
  owners.fill(-1);
  for (let index = 0; index < admin1At.length; index++) if (admin1At[index] >= 0 && ADMIN1_ISO[admin1At[index]] === "PL") owners[index] = 0;
  const poland: Country[] = [{ ...countries[0], iso: "PL", name: "Polska" }];
  const engine = engineFrom(owners, undefined, poland, admin1At);

  engine.reset(441987146, "strategy", "europe", "all");
  const first = engine.getStrategicRegions().filter(({ originalOwnerId }) => originalOwnerId === 0);
  assert.equal(first.length, 16);
  assert.ok(first.some(({ name }) => name === "województwo kujawsko-pomorskie"));
  assert.ok(first.some(({ name }) => name === "województwo mazowieckie"));

  engine.reset(123, "strategy", "europe", "all");
  const second = engine.getStrategicRegions().filter(({ originalOwnerId }) => originalOwnerId === 0);
  assert.deepEqual(second.map(({ name, cells }) => [name, cells]), first.map(({ name, cells }) => [name, cells]));
  assert.ok(ADMIN1_NAMES.includes("województwo pomorskie"));
});

test("a new Polish strategy game places airports from the bundled real-airport dataset", () => {
  const admin1At = new Int16Array(inflateSync(Buffer.from(ADMIN1_DEFLATE_BASE64, "base64")).buffer);
  const airports = new Uint16Array(inflateSync(Buffer.from(REAL_AIRPORTS_DEFLATE_BASE64, "base64")).buffer);
  const owners = new Int16Array(MAP_W * MAP_H);
  owners.fill(-1);
  for (let index = 0; index < admin1At.length; index++) if (admin1At[index] >= 0 && ADMIN1_ISO[admin1At[index]] === "PL") owners[index] = 0;
  const engine = new EngineConstructor([{ ...countries[0], iso: "PL", name: "Polska" }], owners, owners.slice(), 1, undefined, admin1At, airports);
  engine.reset(1, "strategy", "europe", "all");
  assert.ok(engine.getStrategicRegions().filter(({ originalOwnerId }) => originalOwnerId === 0).reduce((sum, region) => sum + region.airportCount, 0) > 0);
});

test("fallback strategic regions preserve real connected country shapes instead of a square grid", () => {
  const owners = new Int16Array(MAP_W * MAP_H); owners.fill(-1);
  const y = Math.floor(MAP_H / 2), x = Math.floor(MAP_W / 2);
  for (let offsetY = 0; offsetY < 5; offsetY++) for (let offsetX = 0; offsetX < 8; offsetX++) owners[indexAt(x + offsetX, y + offsetY)] = 0;
  for (let offsetY = 0; offsetY < 4; offsetY++) for (let offsetX = 0; offsetX < 3; offsetX++) owners[indexAt(x + 24 + offsetX, y + offsetY)] = 0;
  const engine = engineFrom(owners, undefined, [{ ...countries[0], iso: "PL", name: "Polska" }]);
  engine.reset(1, "strategy", "world", "all");
  const regions = engine.getStrategicRegions().filter(({ originalOwnerId }) => originalOwnerId === 0);
  assert.equal(regions.length, 2, "disconnected real land components remain sectors instead of being sliced into rectangles");
  assert.deepEqual([...regions.map(({ name }) => name)].sort(), ["Polska — region 1", "Polska — region 2"]);
});

test("strategic sectors balance Latvia without reducing Poland or Germany", () => {
  const inflated = inflateSync(Buffer.from(ADMIN1_DEFLATE_BASE64, "base64"));
  const admin1At = new Int16Array(inflated.buffer, inflated.byteOffset, inflated.byteLength / 2);
  const sectorCountries: Country[] = [
    { ...countries[0], id: 0, iso: "LV", name: "Łotwa" },
    { ...countries[1], id: 1, iso: "DE", name: "Niemcy" },
    { ...countries[0], id: 2, iso: "PL", name: "Polska" },
  ];
  const isoToOwner = new Map(sectorCountries.map(({ iso, id }) => [iso, id]));
  const owners = new Int16Array(MAP_W * MAP_H); owners.fill(-1);
  for (let index = 0; index < admin1At.length; index++) {
    const owner = admin1At[index] >= 0 ? isoToOwner.get(ADMIN1_ISO[admin1At[index]]) : undefined;
    if (owner !== undefined) owners[index] = owner;
  }
  const engine = engineFrom(owners, undefined, sectorCountries, admin1At);
  const internals = engine as unknown as { rowWeight: Float32Array; km2PerWeight: number };
  let globalAdministrativeWeight = 0;
  for (let index = 0; index < admin1At.length; index++) if (admin1At[index] >= 0) globalAdministrativeWeight += internals.rowWeight[Math.floor(index / MAP_W)];
  internals.km2PerWeight = 148_940_000 / globalAdministrativeWeight;
  engine.reset(441987146, "strategy", "world", "all");
  const regions = engine.getStrategicRegions();
  const latvia = regions.filter(({ originalOwnerId }) => originalOwnerId === 0);
  const germany = regions.filter(({ originalOwnerId }) => originalOwnerId === 1);
  const poland = regions.filter(({ originalOwnerId }) => originalOwnerId === 2);
  assert.ok(latvia.length >= 5 && latvia.length <= 9, `Latvia should have a handful of sectors, got ${latvia.length}`);
  assert.equal(germany.length, 16);
  assert.equal(poland.length, 16);
  assert.ok(latvia.some(({ provinceCount }) => provinceCount > 10), "a Latvian sector should group many municipalities");
  assert.ok(latvia.every(({ provinceNames }) => provinceNames.length > 0));
});

test("Gotland, Saaremaa and Hiiumaa remain separate strategic island regions", () => {
  const inflated = inflateSync(Buffer.from(ADMIN1_DEFLATE_BASE64, "base64"));
  const admin1At = new Int16Array(inflated.buffer, inflated.byteOffset, inflated.byteLength / 2);
  const islandCountries: Country[] = [
    { ...countries[0], id: 0, iso: "SE", name: "Szwecja" },
    { ...countries[1], id: 1, iso: "EE", name: "Estonia" },
  ];
  const isoToOwner = new Map(islandCountries.map(({ iso, id }) => [iso, id]));
  const owners = new Int16Array(MAP_W * MAP_H); owners.fill(-1);
  for (let index = 0; index < admin1At.length; index++) {
    const owner = admin1At[index] >= 0 ? isoToOwner.get(ADMIN1_ISO[admin1At[index]]) : undefined;
    if (owner !== undefined) owners[index] = owner;
  }
  const engine = engineFrom(owners, undefined, islandCountries, admin1At);
  const internals = engine as unknown as { rowWeight: Float32Array; km2PerWeight: number };
  let globalWeight = 0;
  for (let index = 0; index < admin1At.length; index++) if (admin1At[index] >= 0) globalWeight += internals.rowWeight[Math.floor(index / MAP_W)];
  internals.km2PerWeight = 148_940_000 / globalWeight;
  engine.reset(123, "strategy", "world", "all");
  const regions = engine.getStrategicRegions();
  for (const name of ["Gotland", "Saaremaa", "Hiiumaa"]) {
    const region = regions.find((candidate) => candidate.name === name);
    assert.ok(region, `${name} should be its own sector`);
    assert.deepEqual(region.provinceNames, [name]);
    assert.equal(region.provinceCount, 1);
  }
});

test("Brazil and Lithuania keep their real first-level region counts", () => {
  const inflated = inflateSync(Buffer.from(ADMIN1_DEFLATE_BASE64, "base64"));
  const admin1At = new Int16Array(inflated.buffer, inflated.byteOffset, inflated.byteLength / 2);
  const regionalCountries: Country[] = [
    { ...countries[0], id: 0, iso: "BR", name: "Brazylia" },
    { ...countries[1], id: 1, iso: "LT", name: "Litwa" },
  ];
  const isoToOwner = new Map(regionalCountries.map(({ iso, id }) => [iso, id]));
  const owners = new Int16Array(MAP_W * MAP_H); owners.fill(-1);
  for (let index = 0; index < admin1At.length; index++) {
    const owner = admin1At[index] >= 0 ? isoToOwner.get(ADMIN1_ISO[admin1At[index]]) : undefined;
    if (owner !== undefined) owners[index] = owner;
  }
  const engine = engineFrom(owners, undefined, regionalCountries, admin1At);
  engine.reset(640459150, "strategy", "world", "all");
  const regions = engine.getStrategicRegions();
  assert.equal(regions.filter(({ originalOwnerId }) => originalOwnerId === 0).length, 27);
  assert.equal(regions.filter(({ originalOwnerId }) => originalOwnerId === 1).length, 10);
});

test("a huge Suriname district is split before strategic sectors are balanced", () => {
  const inflated = inflateSync(Buffer.from(ADMIN1_DEFLATE_BASE64, "base64"));
  const admin1At = new Int16Array(inflated.buffer, inflated.byteOffset, inflated.byteLength / 2);
  const owners = new Int16Array(MAP_W * MAP_H); owners.fill(-1);
  for (let index = 0; index < admin1At.length; index++) if (admin1At[index] >= 0 && ADMIN1_ISO[admin1At[index]] === "SR") owners[index] = 0;
  const engine = engineFrom(owners, undefined, [{ ...countries[0], iso: "SR", name: "Surinam" }], admin1At);
  engine.reset(1, "strategy", "world", "all");
  const regions = engine.getStrategicRegions().filter(({ originalOwnerId }) => originalOwnerId === 0);
  assert.ok(regions.length >= 4 && regions.length <= 8, `Suriname should have balanced sectors, got ${regions.length}`);
  assert.ok(regions.some(({ provinceNames }) => provinceNames.some((name) => name.includes("Sipaliwini, część"))));
});

test("area and strategic strength correct flat-map distortion by latitude", () => {
  const owners = new Int16Array(MAP_W * MAP_H); owners.fill(-1);
  const equatorY = Math.floor(MAP_H / 2), sixtyNorthY = Math.floor(MAP_H / 6);
  for (let y = equatorY; y < equatorY + 20; y++) for (let x = 500; x < 600; x++) owners[indexAt(x, y)] = 0;
  for (let y = sixtyNorthY; y < sixtyNorthY + 20; y++) for (let x = 800; x < 900; x++) owners[indexAt(x, y)] = 1;
  const engine = engineFrom(owners);
  const areaRatio = engine.getCountryKm2(1) / engine.getCountryKm2(0);
  assert.ok(areaRatio > .45 && areaRatio < .55, `equal raster cells at 60°N should have about half the equatorial area, got ${areaRatio}`);
  engine.reset(1, "strategy", "world", "all");
  const firstSeedRatio = engine.getStrategicStrength(1).power / engine.getStrategicStrength(0).power;
  engine.reset(987_654_321, "strategy", "world", "all");
  const secondSeedRatio = engine.getStrategicStrength(1).power / engine.getStrategicStrength(0).power;
  assert.ok(firstSeedRatio < 1, "the smaller latitude-corrected territory should not gain power from flat-map pixel area");
  assert.ok(Math.abs(secondSeedRatio - firstSeedRatio) < .001, "seed must not add a hidden national strength modifier");
});

test("Poland can attack Sweden across the Baltic but not distant Norway", () => {
  const inflated = inflateSync(Buffer.from(ADMIN1_DEFLATE_BASE64, "base64"));
  const admin1At = new Int16Array(inflated.buffer, inflated.byteOffset, inflated.byteLength / 2);
  const navalCountries: Country[] = [
    { ...countries[0], id: 0, iso: "PL", name: "Polska" },
    { ...countries[1], id: 1, iso: "SE", name: "Szwecja" },
    { ...countries[0], id: 2, iso: "NO", name: "Norwegia" },
  ];
  const isoToOwner = new Map(navalCountries.map(({ iso, id }) => [iso, id]));
  const owners = new Int16Array(MAP_W * MAP_H); owners.fill(-1);
  for (let index = 0; index < admin1At.length; index++) {
    const owner = admin1At[index] >= 0 ? isoToOwner.get(ADMIN1_ISO[admin1At[index]]) : undefined;
    if (owner !== undefined) owners[index] = owner;
  }
  const engine = engineFrom(owners, undefined, navalCountries, admin1At);
  engine.reset(441987146, "strategy", "world", "all");
  const targets = engine.getStrategicTargets(0).map(({ ownerId }) => ownerId);
  assert.ok(targets.includes(1), "a Swedish Baltic province should be within naval range");
  assert.equal(targets.includes(2), false, "Norway should remain outside Poland's naval range");
});

test("a much weaker strategic attacker can be repelled instead of gaining guaranteed progress", () => {
  const owners = new Int16Array(MAP_W * MAP_H);
  owners.fill(-1);
  for (let y = 440; y < 490; y++) for (let x = 500; x < 550; x++) owners[indexAt(x, y)] = 0;
  for (let y = 300; y < 700; y++) for (let x = 550; x < 1_250; x++) owners[indexAt(x, y)] = 1;
  const engine = engineFrom(owners);
  engine.reset(777, "strategy", "world", "all");
  engine.setPlayerCountry(0);
  const target = engine.getStrategicTargets(0)[0];
  const attackerPopulation = engine.getCountryPopulationAbsolute(0), defenderPopulation = engine.getCountryPopulationAbsolute(1);
  assert.ok(target, "the smaller country should have an adjacent target");
  const assessment = engine.getStrategicWarAssessment(0, 1);
  assert.ok(assessment.chance < 50 && ["risky", "danger"].includes(assessment.level));
  assert.match(assessment.label, /odradzany|niemal pewna porażka/);

  (engine as unknown as { random: () => number }).random = () => 0;
  engine.advanceStrategicRound(target.id);
  assert.ok(engine.getStrategicCampaigns().some(({ attackerId }) => attackerId === 0));
  const result = engine.advanceStrategicRound();
  assert.equal(engine.getStrategicCampaigns().some(({ attackerId }) => attackerId === 0), false, "a collapsed offensive must be removed");
  assert.ok(result.records.some(({ countryId, text }) => countryId === 0 && text.includes("załamuje się")), "the player receives an explicit defeat record");
  assert.equal(engine.getStrategicRegions()[target.id].ownerId, 1, "the defender keeps the province");
  const war = engine.getStrategicWarHistory(0).at(-1);
  assert.equal(war?.outcome, "repelled");
  assert.ok((war?.attackerCasualties ?? 0) > 0 && (war?.defenderCasualties ?? 0) > 0, "a finished war records losses on both sides");
  assert.ok(engine.getCountryPopulationAbsolute(0) < attackerPopulation, "battle losses reduce the attacking country's population");
  assert.ok(engine.getCountryPopulationAbsolute(1) !== defenderPopulation, "the defending country's demographic state is recalculated after battle losses and migration");
  assert.ok(engine.getStrategicBattleArtifacts().some(({ regionId }) => regionId === target.id), "a battle leaves a persistent map artifact");
  const restored = engineFrom(owners);
  restored.load(engine.snapshot());
  assert.deepEqual(restored.getStrategicWarHistory(0), engine.getStrategicWarHistory(0), "war history survives saving and loading");
});

test("a stalled strategic front ends instead of standing forever", () => {
  const owners = new Int16Array(MAP_W * MAP_H); owners.fill(-1);
  for (let y = 450; y < 510; y++) {
    for (let x = 500; x < 560; x++) owners[indexAt(x, y)] = 0;
    for (let x = 560; x < 620; x++) owners[indexAt(x, y)] = 1;
  }
  const engine = engineFrom(owners);
  engine.reset(1, "strategy", "world", "all");
  const target = engine.getStrategicTargets(0).find(({ ownerId }) => ownerId === 1)!;
  const internals = engine as unknown as {
    beginStrategicCampaign: (attackerId: number, regionId: number) => { progress: number };
    advanceStrategicCampaign: (campaign: { progress: number }, changed: number[]) => { text: string };
    frontStrength: () => { ratio: number };
    getStrategicRegionResistance: () => { factor: number };
    random: () => number;
  };
  const campaign = internals.beginStrategicCampaign(0, target.id);
  internals.frontStrength = () => ({ ratio: Math.SQRT1_2 });
  internals.getStrategicRegionResistance = () => ({ factor: 1 });
  internals.random = () => .5;
  let record = { text: "" };
  for (let round = 0; round < 4; round++) record = internals.advanceStrategicCampaign(campaign, []);
  assert.equal(campaign.progress, 0);
  assert.match(record.text, /wygasa po długim impasie/);
});

test("automatic planning exhausts legal actions before declaring a false stalemate", () => {
  const owners = new Int16Array(MAP_W * MAP_H);
  owners.fill(-1);
  for (let y = 200; y < 212; y++) for (let x = 200; x < 212; x++) owners[indexAt(x, y)] = 0;
  for (let y = 700; y < 712; y++) for (let x = 2_500; x < 2_512; x++) owners[indexAt(x, y)] = 1;
  const engine = engineFrom(owners);
  (engine as unknown as { random: () => number }).random = () => 0; // always tries war north first
  const plan = engine.planTurn();
  assert.ok(plan, "a failed random sample must not stop a game that still has legal land or erosion moves");
  assert.notEqual(plan.action, "war");
});

test("balanced erosion exactly reverses an equally sized land-growth roll", () => {
  const owners = new Int16Array(MAP_W * MAP_H);
  owners.fill(-1);
  owners[indexAt(100, 100)] = 0;
  const engine = engineFrom(owners);
  (engine as unknown as { random: () => number }).random = () => .5;
  const land = engine.rollSize("land").fraction;
  const erosion = engine.rollSize("erosion").fraction;
  assert.ok(Math.abs((1 + land) * (1 - erosion) - 1) < 1e-12);
});

test("no-microstates rule prevents tiny starting countries from acting or winning", () => {
  const owners = new Int16Array(MAP_W * MAP_H);
  owners.fill(-1);
  for (let y = 200; y < 300; y++) for (let x = 200; x < 1_200; x++) owners[indexAt(x, y)] = 0;
  owners[indexAt(1_500, 500)] = 1;
  owners[indexAt(1_501, 500)] = 1;
  owners[indexAt(1_500, 501)] = 1;
  const engine = engineFrom(owners);
  engine.setMicrostateRule("exclude");
  assert.equal(engine.canCountryAct(0), true);
  assert.equal(engine.canCountryAct(1), false);
  assert.equal(engine.getActiveCountryCount(), 1);
  assert.equal(engine.getWinner()?.id, 0);
  assert.equal(engine.snapshot().microstates, "exclude");
});

test("snapshot validation rejects malformed state before loading", () => {
  const owners = new Int16Array(MAP_W * MAP_H);
  owners.fill(-1);
  const engine = engineFrom(owners);
  const valid = engine.snapshot();
  assert.equal(isSnapshot(valid), true);
  assert.equal(isSnapshot({ ...valid, rngState: undefined }), false);
  assert.throws(() => engine.load({ ...valid, rngState: undefined } as never), /uszkodzony/);
  assert.equal(isSnapshot({ ...valid, history: [{}] }), false);
  assert.equal(isSnapshot({ ...valid, runs: [[-1, MAP_W * MAP_H]] }), false, "a run may never exceed the encoder limit");
});

test("load rejects an unknown owner without mutating the current world", () => {
  const owners = new Int16Array(MAP_W * MAP_H);
  owners.fill(-1);
  owners[indexAt(20, 20)] = 0;
  const engine = engineFrom(owners);
  const beforeOwners = engine.owners.slice();
  const beforeRng = engine.rngState;
  const snapshot = engine.snapshot();
  const total = MAP_W * MAP_H;
  const runs: Array<[number, number]> = [];
  for (let remaining = total; remaining > 0;) {
    const count = Math.min(65_535, remaining);
    runs.push([99, count]);
    remaining -= count;
  }
  assert.equal(isSnapshot({ ...snapshot, turn: 1, runs }), true, "generic validation cannot know the engine's country count");
  assert.throws(() => engine.load({ ...snapshot, turn: 1, runs }), /uszkodzony/);
  assert.deepEqual(engine.owners, beforeOwners);
  assert.equal(engine.rngState, beforeRng);
});

test("snapshots do not expose mutable history or RLE cache references", () => {
  const owners = new Int16Array(MAP_W * MAP_H);
  owners.fill(-1);
  const engine = engineFrom(owners);
  const first = engine.snapshot();
  first.runs[0][0] = 123;
  first.history.push({} as never);
  const second = engine.snapshot();
  assert.notEqual(second.runs[0][0], 123);
  assert.equal(second.history.length, 0);
});

test("a regional game rolls only countries from the selected region", () => {
  const owners = new Int16Array(MAP_W * MAP_H);
  owners.fill(-1);
  for (let y = 100; y <= 110; y++) for (let x = 100; x <= 110; x++) owners[indexAt(x, y)] = 0;
  for (let y = 300; y <= 310; y++) for (let x = 300; x <= 310; x++) owners[indexAt(x, y)] = 1;
  for (let y = 500; y <= 510; y++) for (let x = 500; x <= 510; x++) owners[indexAt(x, y)] = 2;
  const regionalCountries: Country[] = [
    { ...countries[0], region: "europe" },
    { ...countries[1], region: "africa" },
    { id: 2, iso: "CC", name: "Drugi kraj Europy", flag: "C", color: [80, 190, 120], initialWeight: 0, region: "europe" },
  ];
  const engine = engineFrom(owners, undefined, regionalCountries);
  engine.setGameRegion("europe");

  for (let roll = 0; roll < 20; roll++) assert.ok([0, 2].includes(engine.rollCountry()?.countryId ?? -1));
});

test("new land automatically rerolls an invalid direction", () => {
  const owners = new Int16Array(MAP_W * MAP_H);
  owners.fill(1);
  for (let x = 103; x <= 105; x++) owners[indexAt(x, 101)] = -1;
  for (let y = 0; y <= 101; y++) owners[indexAt(105, y)] = -1;
  for (let y = 100; y <= 102; y++) for (let x = 100; x <= 102; x++) owners[indexAt(x, y)] = 0;
  const engine = engineFrom(owners);
  const rolls = [0.01, 0.26];
  (engine as unknown as { random: () => number }).random = () => rolls.shift() ?? 0.26;

  const result = engine.rollDirection(0, "land");

  assert.equal(result.valid, true);
  assert.equal(result.direction.short, "E");
  assert.deepEqual(result.attempts.map((direction) => direction.short), ["N", "E"]);
});

test("enclosed sea water still counts as space for new land", () => {
  const owners = new Int16Array(MAP_W * MAP_H);
  owners.fill(1);
  owners[indexAt(2, 2)] = 0;
  owners[indexAt(2, 3)] = 0;
  owners[indexAt(2, 4)] = 0;
  owners[indexAt(3, 3)] = -1;
  const engine = engineFrom(owners);
  (engine as unknown as { random: () => number }).random = () => 0.4;

  assert.deepEqual(engine.rollAction(0), { action: "land", possible: true });
});

test("war capture starts on a shared border instead of a distant island", () => {
  const owners = new Int16Array(MAP_W * MAP_H);
  owners.fill(-1);
  for (let y = 100; y <= 110; y++) for (let x = 100; x <= 110; x++) owners[indexAt(x, y)] = 0;
  for (let y = 85; y <= 99; y++) for (let x = 95; x <= 115; x++) owners[indexAt(x, y)] = 1;
  for (let y = 100; y <= 110; y++) for (let x = 450; x <= 470; x++) owners[indexAt(x, y)] = 1;
  const original = owners.slice();
  const engine = engineFrom(owners);
  const east = DIRECTIONS.find((direction) => direction.short === "E") as Direction;
  const plan: TurnPlan = {
    rngBefore: engine.rngState,
    countryId: 0,
    action: "war",
    direction: east,
    directionAttempts: [east],
    actionWasRerolled: false,
    size: "small",
    fraction: 0.1,
    targetId: 1,
  };

  const result = engine.apply(plan);
  const changedX = result.changedIndices.map((index) => index % MAP_W);

  assert.ok(changedX.length > 0);
  assert.ok(changedX.every((x) => x < 200), "capture must remain at the countries' shared border");
  assert.equal(engine.owners[indexAt(455, 105)], 1, "the distant island must remain untouched");

  const changed = new Set(result.changedIndices);
  const visited = new Set<number>();
  const queue = [result.changedIndices[0]];
  while (queue.length) {
    const index = queue.shift() as number;
    if (visited.has(index)) continue;
    visited.add(index);
    const x = index % MAP_W, y = Math.floor(index / MAP_W);
    for (const [ox, oy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
      const ny = y + oy, nx = (x + ox + MAP_W) % MAP_W, next = ny * MAP_W + nx;
      if (ny >= 0 && ny < MAP_H && changed.has(next) && !visited.has(next)) queue.push(next);
    }
  }
  assert.equal(visited.size, changed.size, "captured territory must form one edge-connected area");
  assert.ok(result.changedIndices.some((index) => {
    const x = index % MAP_W, y = Math.floor(index / MAP_W);
    return [[-1, 0], [1, 0], [0, -1], [0, 1]].some(([ox, oy]) => {
      const ny = y + oy, nx = (x + ox + MAP_W) % MAP_W;
      return ny >= 0 && ny < MAP_H && original[indexAt(nx, ny)] === 0;
    });
  }), "captured territory must touch the attacker's original territory");
});

test("war advances as a broad front instead of stamping a circular bubble", () => {
  const owners = new Int16Array(MAP_W * MAP_H);
  owners.fill(-1);
  for (let y = 300; y <= 329; y++) for (let x = 500; x <= 599; x++) owners[indexAt(x, y)] = 0;
  for (let y = 200; y <= 299; y++) for (let x = 450; x <= 649; x++) owners[indexAt(x, y)] = 1;
  const engine = engineFrom(owners);
  const north = DIRECTIONS.find((direction) => direction.short === "N") as Direction;
  const result = engine.apply({
    rngBefore: engine.rngState,
    countryId: 0,
    action: "war",
    direction: north,
    directionAttempts: [north],
    actionWasRerolled: false,
    size: "medium",
    fraction: 0.2,
    targetId: 1,
  });
  const xs = result.changedIndices.map((index) => index % MAP_W);
  const ys = result.changedIndices.map((index) => Math.floor(index / MAP_W));
  const width = Math.max(...xs) - Math.min(...xs) + 1;
  const depth = Math.max(...ys) - Math.min(...ys) + 1;

  assert.ok(result.changedIndices.length > 300);
  assert.ok(width > depth * 2, `the captured area should resemble a front; got ${width}×${depth}`);
  assert.equal(Math.max(...ys), 299, "the offensive must start at the shared border");
});

test("a narrow border contact grows into an irregular bridgehead instead of a triangular spear", () => {
  const owners = new Int16Array(MAP_W * MAP_H);
  owners.fill(-1);
  for (let y = 200; y <= 349; y++) for (let x = 500; x <= 700; x++) owners[indexAt(x, y)] = 1;
  owners[indexAt(600, 350)] = 0;
  for (let y = 351; y <= 380; y++) for (let x = 575; x <= 625; x++) owners[indexAt(x, y)] = 0;
  const engine = engineFrom(owners);
  const north = DIRECTIONS.find((direction) => direction.short === "N") as Direction;
  const result = engine.apply({
    rngBefore: engine.rngState,
    countryId: 0,
    action: "war",
    direction: north,
    directionAttempts: [north],
    actionWasRerolled: false,
    size: "large",
    fraction: 0.6,
    targetId: 1,
  });
  const xs = result.changedIndices.map((index) => index % MAP_W);
  const ys = result.changedIndices.map((index) => Math.floor(index / MAP_W));
  const width = Math.max(...xs) - Math.min(...xs) + 1;
  const depth = Math.max(...ys) - Math.min(...ys) + 1;
  const rows = new Map<number, number>();
  result.changedIndices.forEach((index) => {
    const y = Math.floor(index / MAP_W);
    rows.set(y, (rows.get(y) ?? 0) + 1);
  });
  const widestRow = Math.max(...rows.values());
  const orderedRows = [...rows.entries()].sort((a, b) => a[0] - b[0]);
  const leadingBand = (orderedRows[0]?.[1] ?? 0) + (orderedRows[1]?.[1] ?? 0) + (orderedRows[2]?.[1] ?? 0);

  assert.ok(result.changedIndices.length > 500);
  assert.ok(width > depth * 1.25, `the bridgehead should spread along the front; got ${width}×${depth}`);
  assert.ok(widestRow > depth * 1.1, "the captured region must not taper into a long triangular point");
  assert.ok(leadingBand >= widestRow * 0.9, `the offensive edge must stay broad after a short organic fringe; got ${leadingBand}/${widestRow}`);
});

test("war removes a one-cell spear advancing away from its supporting front", () => {
  const owners = new Int16Array(MAP_W * MAP_H);
  owners.fill(-1);
  for (let y = 180; y <= 300; y++) for (let x = 500; x <= 700; x++) owners[indexAt(x, y)] = 1;
  for (let y = 301; y <= 400; y++) owners[indexAt(600, y)] = 1;
  for (let y = 401; y <= 430; y++) for (let x = 575; x <= 625; x++) owners[indexAt(x, y)] = 0;
  const engine = engineFrom(owners);
  const north = DIRECTIONS.find((direction) => direction.short === "N") as Direction;
  const result = engine.apply({
    rngBefore: engine.rngState,
    countryId: 0,
    action: "war",
    direction: north,
    directionAttempts: [north],
    actionWasRerolled: false,
    size: "tiny",
    fraction: .02,
    targetId: 1,
  });
  const capturedYs = result.changedIndices.map((index) => Math.floor(index / MAP_W));
  const advance = capturedYs.length ? 400 - Math.min(...capturedYs) : 0;

  assert.ok(advance <= 3, `a one-cell corridor must not become a long vertical conquest line; advanced ${advance} cells`);
});

test("a west-to-east attack cannot spend the roll on a vertical border ribbon", () => {
  const owners = new Int16Array(MAP_W * MAP_H);
  owners.fill(-1);
  // A long shared north/south border, matching Syria attacking Iraq.
  for (let y = 220; y <= 360; y++) for (let x = 180; x <= 239; x++) owners[indexAt(x, y)] = 0;
  for (let y = 190; y <= 390; y++) for (let x = 240; x <= 430; x++) owners[indexAt(x, y)] = 1;
  const engine = engineFrom(owners);
  const east = DIRECTIONS.find((direction) => direction.short === "E") as Direction;
  const result = engine.apply({
    rngBefore: engine.rngState,
    countryId: 0,
    action: "war",
    direction: east,
    directionAttempts: [east],
    actionWasRerolled: false,
    size: "tiny",
    fraction: .02,
    targetId: 1,
  });
  const xs = result.changedIndices.map((index) => index % MAP_W);
  const ys = result.changedIndices.map((index) => Math.floor(index / MAP_W));
  const depth = Math.max(...xs) - Math.min(...xs) + 1;
  const frontage = Math.max(...ys) - Math.min(...ys) + 1;

  assert.ok(depth >= 5, `the conquest must advance into the defender; got only ${depth} cells of depth`);
  assert.ok(frontage <= depth * 2.5, `the conquest must be an area, not a vertical line; got ${depth}×${frontage}`);
  assert.ok((result.record.actualFraction ?? 0) >= .019,
    `the front flood must complete the rolled share instead of stopping on an oversized priority band; got ${((result.record.actualFraction ?? 0) * 100).toFixed(2)}%`);
});

test("repeated wars keep one coherent Czechia-Austria-style frontier", () => {
  const owners = new Int16Array(MAP_W * MAP_H);
  owners.fill(-1);
  for (let y = 300; y <= 419; y++) for (let x = 200; x <= 299; x++) owners[indexAt(x, y)] = 0;
  for (let y = 300; y <= 419; y++) for (let x = 300; x <= 399; x++) owners[indexAt(x, y)] = 1;
  const engine = engineFrom(owners);
  const east = DIRECTIONS.find((direction) => direction.short === "E") as Direction;
  const west = DIRECTIONS.find((direction) => direction.short === "W") as Direction;
  for (let turn = 0; turn < 12; turn++) {
    const actor = turn % 2, target = actor === 0 ? 1 : 0, direction = actor === 0 ? east : west;
    const result = engine.apply({
      rngBefore: engine.rngState,
      countryId: actor,
      action: "war",
      direction,
      directionAttempts: [direction],
      actionWasRerolled: false,
      size: "medium",
      fraction: .2,
      targetId: target,
    });
    const changed = new Set(result.changedIndices);
    if (!changed.size) continue;
    const queue = [result.changedIndices[0]], visited = new Set<number>();
    while (queue.length) {
      const index = queue.pop() as number;
      if (visited.has(index)) continue;
      visited.add(index);
      const x = index % MAP_W, y = Math.floor(index / MAP_W);
      for (const [ox, oy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
        const ny = y + oy;
        if (ny < 0 || ny >= MAP_H) continue;
        const next = indexAt((x + ox + MAP_W) % MAP_W, ny);
        if (changed.has(next) && !visited.has(next)) queue.push(next);
      }
    }
    assert.ok(visited.size > 0);
  }
  const componentCount = (owner: number) => {
    const visited = new Uint8Array(owners.length);
    let count = 0;
    for (let start = 0; start < engine.owners.length; start++) {
      if (visited[start] || engine.owners[start] !== owner) continue;
      count++;
      const queue = [start]; visited[start] = 1;
      for (let cursor = 0; cursor < queue.length; cursor++) {
        const index = queue[cursor], x = index % MAP_W, y = Math.floor(index / MAP_W);
        for (const [ox, oy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
          const ny = y + oy;
          if (ny < 0 || ny >= MAP_H) continue;
          const next = indexAt((x + ox + MAP_W) % MAP_W, ny);
          if (!visited[next] && engine.owners[next] === owner) { visited[next] = 1; queue.push(next); }
        }
      }
    }
    return count;
  };
  assert.equal(componentCount(0), 1, "the western country must remain one coherent territory");
  assert.equal(componentCount(1), 1, "the eastern country must remain one coherent territory");
});

test("BIG keeps its percentage for a microstate instead of pruning it to one map cell", () => {
  const owners = new Int16Array(MAP_W * MAP_H);
  owners.fill(-1);
  // A small attacker with a short border, analogous to Djibouti and Eritrea.
  for (let y = 300; y <= 304; y++) for (let x = 200; x <= 204; x++) owners[indexAt(x, y)] = 0;
  for (let y = 295; y <= 310; y++) for (let x = 205; x <= 216; x++) owners[indexAt(x, y)] = 1;
  const engine = engineFrom(owners);
  const east = DIRECTIONS.find((direction) => direction.short === "E") as Direction;
  const result = engine.apply({
    rngBefore: engine.rngState,
    countryId: 0,
    action: "war",
    direction: east,
    directionAttempts: [east],
    actionWasRerolled: false,
    size: "big",
    fraction: .4,
    targetId: 1,
  });

  assert.ok((result.record.actualFraction ?? 0) >= .3,
    `BIG must retain at least its 30% band within raster tolerance; got ${((result.record.actualFraction ?? 0) * 100).toFixed(1)}%`);
  assert.ok(result.changedIndices.length > 1, "a BIG microstate conquest must not collapse to one map cell");
});

test("war tendril cleanup does not repeatedly erode a compact small conquest", () => {
  const owners = new Int16Array(MAP_W * MAP_H);
  owners.fill(-1);
  for (let y = 200; y < 210; y++) for (let x = 190; x < 200; x++) owners[indexAt(x, y)] = 0;
  const changed: Array<[number, number]> = [];
  for (let y = 200; y < 210; y++) for (let x = 200; x < 210; x++) {
    const index = indexAt(x, y);
    owners[index] = 0;
    changed.push([index, 1]);
  }
  const engine = engineFrom(owners);
  const east = DIRECTIONS.find((direction) => direction.short === "E") as Direction;
  (engine as unknown as {
    pruneWarTendrils: (cells: Array<[number, number]>, replacement: number, direction: Direction) => void;
  }).pruneWarTendrils(changed, 0, east);

  assert.ok(changed.length >= 80, `cleanup may trim a fringe but must retain a compact capture; kept ${changed.length}/100 cells`);
});

test("a naval attack on a tiny archipelago cannot be pruned to zero km2", () => {
  const owners = new Int16Array(MAP_W * MAP_H);
  owners.fill(-1);
  for (let y = 500; y <= 506; y++) for (let x = 100; x <= 106; x++) owners[indexAt(x, y)] = 0;
  // At world-map resolution small islands can be only one or two cells thick.
  for (let y = 500; y <= 501; y++) for (let x = 118; x <= 129; x++) owners[indexAt(x, y)] = 1;
  for (let y = 505; y <= 506; y++) for (let x = 126; x <= 131; x++) owners[indexAt(x, y)] = 1;
  const engine = engineFrom(owners);
  const east = DIRECTIONS.find((direction) => direction.short === "E") as Direction;
  const result = engine.apply({
    rngBefore: engine.rngState,
    countryId: 0,
    action: "war",
    direction: east,
    directionAttempts: [east],
    actionWasRerolled: false,
    size: "large",
    fraction: .6,
    targetId: 1,
  });

  assert.ok(result.changedIndices.length > 0, "a successful naval LARGE attack must capture territory");
  assert.ok(result.record.changedKm2 > 0, "the result message must never report 0 km2 for a successful war");
});

test("a broad Romania-Bulgaria-style front keeps the full rolled BIG area", () => {
  const owners = new Int16Array(MAP_W * MAP_H);
  owners.fill(-1);
  for (let y = 260; y <= 319; y++) for (let x = 500; x <= 679; x++) owners[indexAt(x, y)] = 0;
  for (let y = 320; y <= 369; y++) for (let x = 520; x <= 659; x++) owners[indexAt(x, y)] = 1;
  const engine = engineFrom(owners);
  const south = DIRECTIONS.find((direction) => direction.short === "S") as Direction;
  const targetBefore = engine.getStats()[1].weight;
  const result = engine.apply({
    rngBefore: engine.rngState,
    countryId: 0,
    action: "war",
    direction: south,
    directionAttempts: [south],
    actionWasRerolled: false,
    size: "big",
    fraction: .4,
    targetId: 1,
  });
  const targetAfter = engine.getStats()[1].weight;

  assert.ok((targetBefore - targetAfter) / targetBefore >= .39,
    `BIG on a broad border must retain the rolled 40% within raster tolerance; got ${(((targetBefore - targetAfter) / targetBefore) * 100).toFixed(1)}%`);
  assert.equal(result.record.partial, false);
});

test("war closes a small defender enclave and rebalances the same area at the outer front", () => {
  const owners = new Int16Array(MAP_W * MAP_H);
  owners.fill(-1);
  for (let y = 200; y <= 230; y++) for (let x = 180; x <= 199; x++) owners[indexAt(x, y)] = 0;
  for (let y = 190; y <= 240; y++) for (let x = 200; x <= 270; x++) owners[indexAt(x, y)] = 1;
  const changed: Array<[number, number]> = [];
  for (let y = 202; y <= 228; y++) for (let x = 200; x <= 225; x++) {
    if (x >= 211 && x <= 213 && y >= 214 && y <= 216) continue;
    const index = indexAt(x, y);
    owners[index] = 0;
    changed.push([index, 1]);
  }
  const engine = engineFrom(owners);
  const beforeCount = changed.length;
  (engine as unknown as {
    closeWarEnclaves: (targetId: number, replacement: number, goal: number, cells: Array<[number, number]>) => void;
  }).closeWarEnclaves(1, 0, beforeCount, changed);

  for (let y = 214; y <= 216; y++) for (let x = 211; x <= 213; x++) {
    assert.equal(engine.owners[indexAt(x, y)], 0, "the surrounded defender pocket must be absorbed");
  }
  assert.ok(Math.abs(changed.length - beforeCount) <= 2,
    `closing the enclave must preserve the rolled area; changed ${beforeCount} cells into ${changed.length}`);
  assert.ok(changed.some(([index]) => engine.owners[index] === 0), "the conquest must remain present");
});

test("war does not auto-annex a large pre-existing surrounded country", () => {
  const owners = new Int16Array(MAP_W * MAP_H);
  owners.fill(0);
  for (let y = 200; y <= 260; y++) for (let x = 200; x <= 260; x++) owners[indexAt(x, y)] = 1;
  const changed: Array<[number, number]> = [];
  for (let y = 200; y <= 205; y++) for (let x = 200; x <= 260; x++) {
    const index = indexAt(x, y);
    owners[index] = 0;
    changed.push([index, 1]);
  }
  const engine = engineFrom(owners);
  (engine as unknown as {
    closeWarEnclaves: (targetId: number, replacement: number, goal: number, cells: Array<[number, number]>) => void;
  }).closeWarEnclaves(1, 0, changed.length, changed);

  assert.equal(engine.owners[indexAt(230, 230)], 1, "a large surrounded state must remain until the rolled size reaches it");
});

test("a diagonal offensive does not cut the defender with a ruler-straight diagonal", () => {
  const owners = new Int16Array(MAP_W * MAP_H);
  owners.fill(-1);
  for (let y = 200; y <= 400; y++) for (let x = 400; x <= 700; x++) owners[indexAt(x, y)] = 1;
  for (let y = 401; y <= 470; y++) for (let x = 550; x <= 650; x++) owners[indexAt(x, y)] = 0;
  const engine = engineFrom(owners);
  const northWest = DIRECTIONS.find((direction) => direction.short === "NW") as Direction;
  const result = engine.apply({
    rngBefore: engine.rngState,
    countryId: 0,
    action: "war",
    direction: northWest,
    directionAttempts: [northWest],
    actionWasRerolled: false,
    size: "big",
    fraction: 0.4,
    targetId: 1,
  });
  const captured = new Set(result.changedIndices);
  const boundary = result.changedIndices.filter((index) => {
    const x = index % MAP_W, y = Math.floor(index / MAP_W);
    return [[-1, 0], [1, 0], [0, -1], [0, 1]].some(([ox, oy]) => {
      const ny = y + oy;
      return ny < 0 || ny >= MAP_H || !captured.has(indexAt((x + ox + MAP_W) % MAP_W, ny));
    });
  });
  const diagonalRuns = new Map<number, number>();
  boundary.forEach((index) => {
    const diagonal = index % MAP_W + Math.floor(index / MAP_W);
    diagonalRuns.set(diagonal, (diagonalRuns.get(diagonal) ?? 0) + 1);
  });
  const longestStraightDiagonal = Math.max(...diagonalRuns.values());

  assert.ok(longestStraightDiagonal < boundary.length * 0.25, `the border must meander instead of following one diagonal; got ${longestStraightDiagonal}/${boundary.length}`);
});

test("war cannot cross an ocean-sized gap", () => {
  const owners = new Int16Array(MAP_W * MAP_H);
  owners.fill(-1);
  for (let y = 536; y <= 544; y++) for (let x = 100; x <= 108; x++) owners[indexAt(x, y)] = 0;
  for (let y = 536; y <= 544; y++) for (let x = 340; x <= 348; x++) owners[indexAt(x, y)] = 1;
  const engine = engineFrom(owners);
  const east = DIRECTIONS.find((direction) => direction.short === "E") as Direction;
  const hit = (engine as unknown as { targetInDirection: (actorId: number, direction: Direction, stats: unknown[]) => unknown })
    .targetInDirection(0, east, engine.getStats());

  assert.equal(hit, null, "a country must not attack a target more than 1200 km beyond its coast");
});

test("a neighbouring country in the rolled sector is targeted before a remote island", () => {
  const owners = new Int16Array(MAP_W * MAP_H);
  owners.fill(-1);
  for (let y = 400; y <= 440; y++) for (let x = 500; x <= 540; x++) owners[indexAt(x, y)] = 0;
  // A real shared front on the attacker's south-western side.
  for (let y = 425; y <= 440; y++) for (let x = 485; x <= 499; x++) owners[indexAt(x, y)] = 1;
  // A remote island lies almost exactly on a SW ray cast from the coast.
  for (let y = 475; y <= 484; y++) for (let x = 455; x <= 464; x++) owners[indexAt(x, y)] = 2;
  const sourceCountries: Country[] = [
    countries[0], countries[1],
    { id: 2, iso: "CC", name: "Odległa wyspa", flag: "C", color: [80, 190, 120], initialWeight: 0 },
  ];
  const engine = engineFrom(owners, undefined, sourceCountries);
  const southWest = DIRECTIONS.find((direction) => direction.short === "SW") as Direction;
  const hit = (engine as unknown as { targetInDirection: (actorId: number, direction: Direction, stats: unknown[]) => { countryId: number } | null })
    .targetInDirection(0, southWest, engine.getStats());

  assert.equal(hit?.countryId, 1, "the adjacent SW front must win over an overseas target on the same ray");
});

test("NW launches from the north-western edge even after the attacker grows a southern appendage", () => {
  const owners = new Int16Array(MAP_W * MAP_H);
  owners.fill(-1);
  for (let y = 300; y <= 349; y++) for (let x = 500; x <= 599; x++) owners[indexAt(x, y)] = 0;
  for (let y = 350; y <= 449; y++) for (let x = 550; x <= 559; x++) owners[indexAt(x, y)] = 0;
  for (let y = 440; y <= 500; y++) for (let x = 480; x <= 620; x++) if (owners[indexAt(x, y)] < 0) owners[indexAt(x, y)] = 1;
  for (let y = 250; y <= 299; y++) for (let x = 450; x <= 500; x++) owners[indexAt(x, y)] = 2;
  const sourceCountries: Country[] = [
    countries[0], countries[1],
    { id: 2, iso: "CC", name: "Północny zachód", flag: "C", color: [80, 190, 120], initialWeight: 0 },
  ];
  const engine = engineFrom(owners, undefined, sourceCountries);
  const northWest = DIRECTIONS.find((direction) => direction.short === "NW") as Direction;
  const hit = (engine as unknown as { targetInDirection: (actorId: number, direction: Direction, stats: unknown[]) => { countryId: number } | null })
    .targetInDirection(0, northWest, engine.getStats());

  assert.equal(hit?.countryId, 2, "NW must not turn into an attack on the southern neighbour");
});

test("ALL captures every possession of the defending owner, including distant islands", () => {
  const owners = new Int16Array(MAP_W * MAP_H);
  owners.fill(-1);
  for (let y = 536; y <= 544; y++) for (let x = 100; x <= 108; x++) owners[indexAt(x, y)] = 0;
  for (let y = 536; y <= 544; y++) for (let x = 110; x <= 116; x++) owners[indexAt(x, y)] = 1;
  for (let y = 536; y <= 544; y++) for (let x = 121; x <= 127; x++) owners[indexAt(x, y)] = 1;
  for (let y = 536; y <= 544; y++) for (let x = 600; x <= 660; x++) owners[indexAt(x, y)] = 1;
  const engine = engineFrom(owners);
  const east = DIRECTIONS.find((direction) => direction.short === "E") as Direction;
  const result = engine.apply({
    rngBefore: engine.rngState,
    countryId: 0,
    action: "war",
    direction: east,
    directionAttempts: [east],
    actionWasRerolled: false,
    size: "all",
    fraction: 1,
    targetId: 1,
  });

  assert.ok(result.changedIndices.some((index) => index % MAP_W >= 121 && index % MAP_W <= 127), "nearby islands belong to one theater");
  assert.equal(engine.owners[indexAt(620, 540)], 0, "ALL must include distant overseas possessions");
  assert.equal(result.record.eliminated, "Cel");
});

test("a percentage attack continues on the defender's main territory after a tiny island is exhausted", () => {
  const owners = new Int16Array(MAP_W * MAP_H);
  owners.fill(-1);
  for (let y = 500; y <= 549; y++) for (let x = 100; x <= 179; x++) owners[indexAt(x, y)] = 0;
  for (let y = 485; y <= 499; y++) for (let x = 130; x <= 134; x++) owners[indexAt(x, y)] = 1;
  for (let y = 400; y <= 449; y++) for (let x = 300; x <= 349; x++) owners[indexAt(x, y)] = 1;
  const engine = engineFrom(owners);
  const north = DIRECTIONS.find((direction) => direction.short === "N") as Direction;
  const result = engine.apply({
    rngBefore: engine.rngState,
    countryId: 0,
    action: "war",
    direction: north,
    directionAttempts: [north],
    actionWasRerolled: false,
    size: "medium",
    fraction: 0.2,
    targetId: 1,
  });

  const mainTerritoryCaptured = result.changedIndices.filter((index) => {
    const x = index % MAP_W, y = Math.floor(index / MAP_W);
    return x >= 300 && x <= 349 && y >= 400 && y <= 449;
  });
  assert.ok(mainTerritoryCaptured.length > 300, "the attack must continue on the defender's large possession");
  assert.ok(result.changedIndices.length > 400, "the rolled percentage must not collapse to the tiny island's area");
});

test("LARGE cannot remove more than the rolled 75 percent of a smaller defender", () => {
  const owners = new Int16Array(MAP_W * MAP_H);
  owners.fill(-1);
  for (let y = 500; y <= 599; y++) for (let x = 100; x <= 199; x++) owners[indexAt(x, y)] = 0;
  for (let y = 450; y <= 499; y++) for (let x = 100; x <= 119; x++) owners[indexAt(x, y)] = 1;
  const engine = engineFrom(owners);
  const targetBefore = engine.getStats()[1].weight;
  const north = DIRECTIONS.find((direction) => direction.short === "N") as Direction;
  engine.apply({
    rngBefore: engine.rngState,
    countryId: 0,
    action: "war",
    direction: north,
    directionAttempts: [north],
    actionWasRerolled: false,
    size: "large",
    fraction: 0.75,
    targetId: 1,
  });
  const targetAfter = engine.getStats()[1].weight;

  assert.ok(targetAfter >= targetBefore * 0.25 - 0.001, `LARGE must leave at least 25% of the defender; left ${targetAfter / targetBefore}`);
  assert.ok(targetAfter > 0, "only ALL may eliminate a defender whose territory is smaller than the attacker");
});

test("erosion turns a landlocked country's edge into water", () => {
  const owners = new Int16Array(MAP_W * MAP_H);
  owners.fill(1);
  for (let y = 100; y <= 110; y++) for (let x = 100; x <= 110; x++) owners[indexAt(x, y)] = 0;
  const engine = engineFrom(owners);
  (engine as unknown as { random: () => number }).random = () => 0.9;
  const action = engine.rollAction(0);
  const north = DIRECTIONS.find((direction) => direction.short === "N") as Direction;

  assert.deepEqual(action, { action: "erosion", possible: true });
  const result = engine.apply({
    rngBefore: engine.rngState,
    countryId: 0,
    action: "erosion",
    direction: north,
    directionAttempts: [north],
    actionWasRerolled: false,
    size: "medium",
    fraction: 0.2,
    targetId: null,
  });

  assert.ok(result.changedIndices.length > 0);
  assert.ok(result.changedIndices.every((index) => engine.owners[index] === -1));
  assert.ok(result.changedIndices.some((index) => Math.floor(index / MAP_W) === 100), "erosion must begin at the selected northern edge");
});

test("erosion never strands a country as a dead one or two pixel remnant", () => {
  const owners = new Int16Array(MAP_W * MAP_H);
  owners.fill(-1);
  owners[indexAt(500, 500)] = 0;
  owners[indexAt(501, 500)] = 0;
  owners[indexAt(500, 501)] = 0;
  owners[indexAt(501, 501)] = 0;
  const engine = engineFrom(owners);
  const north = DIRECTIONS.find((direction) => direction.short === "N") as Direction;
  engine.apply({ rngBefore: engine.rngState, countryId: 0, action: "erosion", direction: north, directionAttempts: [north], actionWasRerolled: false, size: "large", fraction: .75, targetId: null });
  assert.equal(engine.getStats()[0].cells, 3);
});

test("landlocked erosion floods the lowest basin in the rolled sector", () => {
  const owners = new Int16Array(MAP_W * MAP_H);
  owners.fill(1);
  const elevation = new Uint16Array(MAP_W * MAP_H);
  elevation.fill(5_000);
  for (let y = 200; y <= 259; y++) for (let x = 300; x <= 359; x++) owners[indexAt(x, y)] = 0;
  for (let y = 208; y <= 219; y++) for (let x = 320; x <= 339; x++) elevation[indexAt(x, y)] = 100;
  const engine = engineFrom(owners, elevation);
  const north = DIRECTIONS.find((direction) => direction.short === "N") as Direction;
  const result = engine.apply({
    rngBefore: engine.rngState,
    countryId: 0,
    action: "erosion",
    direction: north,
    directionAttempts: [north],
    actionWasRerolled: false,
    size: "tiny",
    fraction: 0.03,
    targetId: null,
  });

  assert.ok(result.changedIndices.length > 50);
  assert.ok(result.changedIndices.every((index) => {
    const x = index % MAP_W, y = Math.floor(index / MAP_W);
    return x >= 320 && x <= 339 && y >= 208 && y <= 219;
  }), "water should fill the low basin before climbing into higher terrain");
  assert.ok(result.changedIndices.every((index) => engine.owners[index] === -1));
});

test("coastal erosion enters through the lowest coast", () => {
  const owners = new Int16Array(MAP_W * MAP_H);
  owners.fill(-1);
  const elevation = new Uint16Array(MAP_W * MAP_H);
  elevation.fill(6_000);
  for (let y = 300; y <= 349; y++) for (let x = 500; x <= 559; x++) owners[indexAt(x, y)] = 0;
  for (let y = 320; y <= 339; y++) for (let x = 548; x <= 559; x++) elevation[indexAt(x, y)] = 80;
  const engine = engineFrom(owners, elevation);
  const east = DIRECTIONS.find((direction) => direction.short === "E") as Direction;
  const result = engine.apply({
    rngBefore: engine.rngState,
    countryId: 0,
    action: "erosion",
    direction: east,
    directionAttempts: [east],
    actionWasRerolled: false,
    size: "tiny",
    fraction: 0.02,
    targetId: null,
  });

  assert.equal(result.changedIndices[0] % MAP_W, 559, "flooding should start on the coastline");
  assert.ok(result.changedIndices.every((index) => elevation[index] === 80), "the nearby lowland should flood before the high coast");
});

test("erosion keeps the rolled compass sector while following low terrain", () => {
  const owners = new Int16Array(MAP_W * MAP_H);
  owners.fill(-1);
  const elevation = new Uint16Array(MAP_W * MAP_H);
  elevation.fill(6_000);
  for (let y = 300; y <= 399; y++) for (let x = 500; x <= 599; x++) owners[indexAt(x, y)] = 0;
  for (let y = 300; y <= 319; y++) for (let x = 500; x <= 599; x++) elevation[indexAt(x, y)] = 80;
  for (let y = 380; y <= 399; y++) for (let x = 500; x <= 599; x++) elevation[indexAt(x, y)] = 80;
  const engine = engineFrom(owners, elevation);
  const north = DIRECTIONS.find((direction) => direction.short === "N") as Direction;
  const result = engine.apply({
    rngBefore: engine.rngState,
    countryId: 0,
    action: "erosion",
    direction: north,
    directionAttempts: [north],
    actionWasRerolled: false,
    size: "tiny",
    fraction: 0.02,
    targetId: null,
  });

  assert.ok(result.changedIndices.length > 100);
  assert.ok(result.changedIndices.every((index) => Math.floor(index / MAP_W) < 350), "north erosion must not jump to an equally low southern basin");
});

test("landlocked erosion forms an organic shoreline instead of a near-vertical cut", () => {
  const owners = new Int16Array(MAP_W * MAP_H);
  owners.fill(1);
  for (let y = 300; y <= 459; y++) for (let x = 300; x <= 379; x++) owners[indexAt(x, y)] = 0;
  const engine = engineFrom(owners, new Uint16Array(MAP_W * MAP_H));
  const east = DIRECTIONS.find((direction) => direction.short === "E") as Direction;
  engine.apply({
    rngBefore: engine.rngState,
    countryId: 0,
    action: "erosion",
    direction: east,
    directionAttempts: [east],
    actionWasRerolled: false,
    size: "large",
    fraction: 0.5,
    targetId: null,
  });

  const shoreline: number[] = [];
  for (let y = 300; y <= 459; y++) {
    let minimumX = Infinity;
    for (let x = 300; x <= 379; x++) if (engine.owners[indexAt(x, y)] === -1) minimumX = Math.min(minimumX, x);
    if (Number.isFinite(minimumX)) shoreline.push(minimumX);
  }
  let reversals = 0, previousSign = 0;
  for (let index = 1; index < shoreline.length; index++) {
    const sign = Math.sign(shoreline[index] - shoreline[index - 1]);
    if (sign && previousSign && sign !== previousSign) reversals++;
    if (sign) previousSign = sign;
  }

  assert.ok(new Set(shoreline).size >= 20, "the flooded edge must not collapse into a few vertical columns");
  assert.ok(reversals >= 8, "the flooded edge should meander instead of following one straight trend");
});

test("large erosion continues across an archipelago until the rolled share is reached", () => {
  const owners = new Int16Array(MAP_W * MAP_H);
  owners.fill(-1);
  const elevation = new Uint16Array(MAP_W * MAP_H);
  elevation.fill(6_000);
  const islands = [[300, 300], [360, 300], [300, 360], [360, 360], [420, 360]];
  islands.forEach(([startX, startY], island) => {
    for (let y = startY; y < startY + 8; y++) for (let x = startX; x < startX + 8; x++) {
      owners[indexAt(x, y)] = 0;
      elevation[indexAt(x, y)] = 80 + island * 20;
    }
  });
  const engine = engineFrom(owners, elevation);
  const southEast = DIRECTIONS.find((direction) => direction.short === "SE") as Direction;
  const result = engine.apply({
    rngBefore: engine.rngState,
    countryId: 0,
    action: "erosion",
    direction: southEast,
    directionAttempts: [southEast],
    actionWasRerolled: false,
    size: "large",
    fraction: 0.6,
    targetId: null,
  });
  const affectedIslands = new Set<number>();
  result.changedIndices.forEach((index) => {
    const x = index % MAP_W, y = Math.floor(index / MAP_W);
    islands.forEach(([startX, startY], island) => {
      if (x >= startX && x < startX + 8 && y >= startY && y < startY + 8) affectedIslands.add(island);
    });
  });

  assert.ok(affectedIslands.size >= 3, "erosion must not stop after flooding only one island");
  assert.ok(engine.getCountryShare(0) <= 0.42, "LARGE should remove about 60% of the whole archipelago");
  assert.ok(engine.getCountryShare(0) >= 0.35, "erosion should not substantially exceed the rolled share");
});

test("new land does not end in a ruler-straight diagonal", () => {
  const owners = new Int16Array(MAP_W * MAP_H);
  owners.fill(-1);
  for (let y = 250; y <= 349; y++) for (let x = 400; x <= 999; x++) owners[indexAt(x, y)] = 0;
  const engine = engineFrom(owners);
  const northEast = DIRECTIONS.find((direction) => direction.short === "NE") as Direction;
  const result = engine.apply({
    rngBefore: engine.rngState,
    countryId: 0,
    action: "land",
    direction: northEast,
    directionAttempts: [northEast],
    actionWasRerolled: false,
    size: "large",
    fraction: 0.5,
    targetId: null,
  });
  const exposedDiagonalCounts = new Map<number, number>();
  for (const index of result.changedIndices) {
    const x = index % MAP_W, y = Math.floor(index / MAP_W);
    const touchesSea = [[-1, 0], [1, 0], [0, -1], [0, 1]].some(([ox, oy]) => {
      const ny = y + oy, nx = (x + ox + MAP_W) % MAP_W;
      return ny >= 0 && ny < MAP_H && engine.owners[indexAt(nx, ny)] === -1;
    });
    if (!touchesSea) continue;
    exposedDiagonalCounts.set(x - y, (exposedDiagonalCounts.get(x - y) ?? 0) + 1);
  }
  const longestRulerEdge = Math.max(0, ...exposedDiagonalCounts.values());

  assert.ok(result.changedIndices.length > 10_000);
  assert.ok(longestRulerEdge < 20, `new coastline must be organic; found ${longestRulerEdge} cells on one exact diagonal`);
});

test("large new land does not expose long terraced shelves from the elevation grid", () => {
  const owners = new Int16Array(MAP_W * MAP_H);
  owners.fill(-1);
  const elevation = new Uint16Array(MAP_W * MAP_H);
  for (let y = 0; y < MAP_H; y++) for (let x = 0; x < MAP_W; x++) {
    elevation[indexAt(x, y)] = 2_000 + ((Math.floor(x / 6) * 17 + Math.floor(y / 6) * 29) % 9) * 180;
  }
  for (let y = 300; y <= 599; y++) for (let x = 500; x <= 999; x++) owners[indexAt(x, y)] = 0;
  const engine = engineFrom(owners, elevation);
  const south = DIRECTIONS.find((direction) => direction.short === "S") as Direction;
  const result = engine.apply({
    rngBefore: engine.rngState,
    countryId: 0,
    action: "land",
    direction: south,
    directionAttempts: [south],
    actionWasRerolled: false,
    size: "large",
    fraction: 0.55,
    targetId: null,
  });

  const boundaryByRow = new Map<number, number[]>();
  for (const index of result.changedIndices) {
    const x = index % MAP_W, y = Math.floor(index / MAP_W);
    const touchesSea = [[-1, 0], [1, 0], [0, -1], [0, 1]].some(([ox, oy]) => {
      const ny = y + oy;
      return ny >= 0 && ny < MAP_H && engine.owners[indexAt((x + ox + MAP_W) % MAP_W, ny)] === -1;
    });
    if (touchesSea) boundaryByRow.set(y, [...(boundaryByRow.get(y) ?? []), x]);
  }
  let longestShelf = 0;
  for (const xs of boundaryByRow.values()) {
    xs.sort((a, b) => a - b);
    let run = 1;
    for (let i = 1; i < xs.length; i++) {
      run = xs[i] === xs[i - 1] + 1 ? run + 1 : 1;
      longestShelf = Math.max(longestShelf, run);
    }
  }

  assert.ok(result.changedIndices.length > 50_000);
  assert.ok(longestShelf <= 24, `new coastline must not form long elevation-grid shelves; found ${longestShelf} cells`);
});

test("new land raises the highest nearby seabed first", () => {
  const owners = new Int16Array(MAP_W * MAP_H);
  owners.fill(-1);
  const elevation = new Uint16Array(MAP_W * MAP_H);
  elevation.fill(100);
  for (let y = 100; y <= 159; y++) for (let x = 100; x <= 109; x++) owners[indexAt(x, y)] = 0;
  for (let y = 130; y <= 149; y++) for (let x = 110; x <= 129; x++) elevation[indexAt(x, y)] = 7_000;
  const engine = engineFrom(owners, elevation);
  const east = DIRECTIONS.find((direction) => direction.short === "E") as Direction;
  const result = engine.apply({
    rngBefore: engine.rngState,
    countryId: 0,
    action: "land",
    direction: east,
    directionAttempts: [east],
    actionWasRerolled: false,
    size: "tiny",
    fraction: 0.02,
    targetId: null,
  });

  assert.ok(result.changedIndices.length > 0);
  assert.equal(elevation[result.changedIndices[0]], 7_000, "the first emerged cell should be the highest available seabed");
  assert.ok(result.changedIndices.every((index) => Math.floor(index / MAP_W) >= 130 && Math.floor(index / MAP_W) <= 149));
});

test("eastward new land starts on the eastern sector of a long island", () => {
  const owners = new Int16Array(MAP_W * MAP_H);
  owners.fill(-1);
  const elevation = new Uint16Array(MAP_W * MAP_H);
  elevation.fill(100);
  for (let y = 500; y <= 519; y++) for (let x = 100; x <= 299; x++) owners[indexAt(x, y)] = 0;

  // Tempt the old algorithm with higher seabed beside an east-facing notch
  // near the western end. Direction must win before terrain ranking begins.
  owners[indexAt(119, 509)] = -1;
  owners[indexAt(119, 510)] = -1;
  elevation[indexAt(119, 509)] = 9_000;
  elevation[indexAt(119, 510)] = 9_000;

  const engine = engineFrom(owners, elevation);
  const east = DIRECTIONS.find((direction) => direction.short === "E") as Direction;
  const result = engine.apply({
    rngBefore: engine.rngState,
    countryId: 0,
    action: "land",
    direction: east,
    directionAttempts: [east],
    actionWasRerolled: false,
    size: "tiny",
    fraction: 0.02,
    targetId: null,
  });

  assert.ok(result.changedIndices.length > 0);
  assert.ok(result.changedIndices.every((index) => index % MAP_W >= 250), "E must not create land at a western east-facing indentation");
});

test("new land ignores tiny detached remnants from earlier turns", () => {
  const owners = new Int16Array(MAP_W * MAP_H);
  owners.fill(-1);
  const elevation = new Uint16Array(MAP_W * MAP_H);
  elevation.fill(100);
  for (let y = 500; y <= 529; y++) for (let x = 100; x <= 129; x++) owners[indexAt(x, y)] = 0;
  // A stray two-cell island lies much farther east and has tempting shallow
  // seabed beside it. It must not become the anchor for the next LARGE roll.
  owners[indexAt(500, 514)] = 0;
  owners[indexAt(500, 515)] = 0;
  for (let y = 505; y <= 524; y++) for (let x = 501; x <= 530; x++) elevation[indexAt(x, y)] = 8_000;
  const engine = engineFrom(owners, elevation);
  const east = DIRECTIONS.find((direction) => direction.short === "E") as Direction;
  const result = engine.apply({
    rngBefore: engine.rngState,
    countryId: 0,
    action: "land",
    direction: east,
    directionAttempts: [east],
    actionWasRerolled: false,
    size: "large",
    fraction: 0.55,
    targetId: null,
  });

  assert.ok(result.changedIndices.length > 100);
  assert.ok(result.changedIndices.every((index) => index % MAP_W < 220), "a detached speck must not launch a remote landmass");
});

test("new land cannot chase a distant shallow shelf across open sea", () => {
  const owners = new Int16Array(MAP_W * MAP_H);
  owners.fill(-1);
  const elevation = new Uint16Array(MAP_W * MAP_H);
  elevation.fill(100);
  for (let y = 700; y <= 729; y++) for (let x = 100; x <= 129; x++) owners[indexAt(x, y)] = 0;
  for (let y = 680; y <= 749; y++) for (let x = 360; x <= 430; x++) elevation[indexAt(x, y)] = 8_000;
  const engine = engineFrom(owners, elevation);
  const east = DIRECTIONS.find((direction) => direction.short === "E") as Direction;
  const result = engine.apply({
    rngBefore: engine.rngState,
    countryId: 0,
    action: "land",
    direction: east,
    directionAttempts: [east],
    actionWasRerolled: false,
    size: "large",
    fraction: 0.6,
    targetId: null,
  });

  assert.ok(result.changedIndices.length > 100);
  assert.ok(result.changedIndices.every((index) => index % MAP_W < 260), "terrain height must only shape nearby growth, not pull a causeway across the sea");
});

test("new land continues from another coast pocket when the first one is too small", () => {
  const owners = new Int16Array(MAP_W * MAP_H);
  owners.fill(1);
  const elevation = new Uint16Array(MAP_W * MAP_H);
  elevation.fill(100);
  for (let y = 900; y <= 909; y++) for (let x = 100; x <= 109; x++) owners[indexAt(x, y)] = 0;
  for (let y = 900; y <= 909; y++) for (let x = 200; x <= 219; x++) owners[indexAt(x, y)] = 0;
  owners[indexAt(105, 910)] = -1;
  elevation[indexAt(105, 910)] = 9_000;
  for (let y = 910; y <= 949; y++) for (let x = 200; x <= 239; x++) {
    owners[indexAt(x, y)] = -1;
    elevation[indexAt(x, y)] = 500;
  }
  const engine = engineFrom(owners, elevation);
  const south = DIRECTIONS.find((direction) => direction.short === "S") as Direction;
  const result = engine.apply({
    rngBefore: engine.rngState,
    countryId: 0,
    action: "land",
    direction: south,
    directionAttempts: [south],
    actionWasRerolled: false,
    size: "large",
    fraction: 0.5,
    targetId: null,
  });

  assert.ok(result.changedIndices.includes(indexAt(105, 910)), "the highest tiny pocket should emerge first");
  assert.ok(result.changedIndices.some((index) => index % MAP_W >= 200), "growth must continue from the second coast pocket");
  assert.equal(result.record.partial, false);
  assert.ok((result.record.actualFraction ?? 0) >= 0.49, "the full rolled share should be created when enough water exists");
});

test("new land reports a partial result when the rolled direction truly has no more water", () => {
  const owners = new Int16Array(MAP_W * MAP_H);
  owners.fill(1);
  for (let y = 900; y <= 919; y++) for (let x = 100; x <= 119; x++) owners[indexAt(x, y)] = 0;
  owners[indexAt(110, 920)] = -1;
  const engine = engineFrom(owners);
  const south = DIRECTIONS.find((direction) => direction.short === "S") as Direction;
  const result = engine.apply({
    rngBefore: engine.rngState,
    countryId: 0,
    action: "land",
    direction: south,
    directionAttempts: [south],
    actionWasRerolled: false,
    size: "large",
    fraction: 0.6,
    targetId: null,
  });

  assert.equal(result.changedIndices.length, 1);
  assert.equal(result.record.partial, true);
  assert.match(result.record.text, /zabrakło wolnej wody na pełne LARGE/);
});

test("a country is recolored when conquest creates an unreadable same-color border", () => {
  const owners = new Int16Array(MAP_W * MAP_H);
  owners.fill(-1);
  for (let y = 200; y <= 219; y++) for (let x = 200; x <= 219; x++) owners[indexAt(x, y)] = 0;
  for (let y = 200; y <= 219; y++) for (let x = 220; x <= 229; x++) owners[indexAt(x, y)] = 1;
  for (let y = 200; y <= 219; y++) for (let x = 230; x <= 249; x++) owners[indexAt(x, y)] = 2;
  const sameRed: [number, number, number] = [227, 79, 95];
  const colorCountries: Country[] = [
    { ...countries[0], color: [...sameRed], region: "europe" },
    { ...countries[1], color: [57, 183, 201], region: "europe" },
    { id: 2, iso: "CC", name: "Nowy sąsiad", flag: "C", color: [...sameRed], initialWeight: 0, region: "europe" },
  ];
  const engine = engineFrom(owners, undefined, colorCountries);
  const originalColor: [number, number, number] = [...engine.countries[0].color];
  const east = DIRECTIONS.find((direction) => direction.short === "E") as Direction;
  engine.apply({
    rngBefore: engine.rngState,
    countryId: 0,
    action: "war",
    direction: east,
    directionAttempts: [east],
    actionWasRerolled: false,
    size: "all",
    fraction: 1,
    targetId: 1,
  });
  const actorColor = engine.countries[0].color, neighbourColor = engine.countries[2].color;
  const distance = actorColor.reduce((sum, channel, index) => sum + (channel - neighbourColor[index]) ** 2, 0);

  assert.ok(distance >= 4_800, `new neighbours need contrasting colors; got distance ${distance}`);
  assert.notDeepEqual(actorColor, originalColor);
  assert.equal(engine.undo(), true);
  assert.deepEqual(engine.countries[0].color, originalColor, "undo must restore the color from before the turn");
});

test("ranking tracks defeats and preserves them through save, load and undo", () => {
  const owners = new Int16Array(MAP_W * MAP_H);
  owners.fill(-1);
  for (let y = 300; y <= 309; y++) for (let x = 300; x <= 309; x++) owners[indexAt(x, y)] = 0;
  for (let y = 300; y <= 309; y++) for (let x = 310; x <= 314; x++) owners[indexAt(x, y)] = 1;
  const engine = engineFrom(owners);
  const east = DIRECTIONS.find((direction) => direction.short === "E") as Direction;
  engine.apply({
    rngBefore: engine.rngState,
    countryId: 0,
    action: "war",
    direction: east,
    directionAttempts: [east],
    actionWasRerolled: false,
    size: "all",
    fraction: 1,
    targetId: 1,
  });

  assert.equal(engine.getRanking().find((entry) => entry.countryId === 0)?.defeats, 1);
  assert.equal(engine.getRanking().find((entry) => entry.countryId === 1)?.active, false);
  assert.equal(engine.getRanking().find((entry) => entry.countryId === 0)?.rank, 1, "the surviving state must be first in the live War only ranking");
  assert.equal(engine.getRanking().find((entry) => entry.countryId === 1)?.rank, 0, "an eliminated state must not consume a territorial rank");
  const restored = engineFrom(owners);
  restored.load(engine.snapshot());
  assert.equal(restored.getRanking().find((entry) => entry.countryId === 0)?.defeats, 1);
  assert.equal(engine.undo(), true);
  assert.equal(engine.getRanking().find((entry) => entry.countryId === 0)?.defeats, 0);
});

test("war mode tracks war exhaustion per country", () => {
  const owners = new Int16Array(MAP_W * MAP_H);
  owners.fill(-1);
  for (let y = 100; y <= 110; y++) for (let x = 100; x <= 110; x++) owners[indexAt(x, y)] = 0;
  for (let y = 100; y <= 110; y++) for (let x = 111; x <= 121; x++) owners[indexAt(x, y)] = 1;
  const engine = engineFrom(owners);
  engine.countries.forEach((country) => { country.region = "europe"; });
  engine.setGameMode("war");
  engine.setGameRegion("europe");
  const east = DIRECTIONS.find((direction) => direction.short === "E") as Direction;
  const west = DIRECTIONS.find((direction) => direction.short === "W") as Direction;
  assert.equal(engine.getWarExhaustion(0), 0);
  for (let turn = 0; turn < 3; turn++) engine.apply({ rngBefore: engine.rngState, countryId: 0, action: "war", direction: east, directionAttempts: [east], actionWasRerolled: false, size: "tiny", fraction: .001, targetId: 1 });
  assert.ok(Math.abs(engine.getWarExhaustion(0) - 9.6) < 1e-12);
  assert.equal(engine.rollCountry()?.countryId, 1, "a country exhausted by three consecutive attacks must leave the attacker pool");
  for (let turn = 0; turn < 3; turn++) engine.apply({ rngBefore: engine.rngState, countryId: 1, action: "war", direction: west, directionAttempts: [west], actionWasRerolled: false, size: "tiny", fraction: .001, targetId: 0 });
  assert.equal(engine.rollCountry()?.countryId, 0, "exhaustion must decay while other countries attack");
});

test("war mode blocks a country after capital loss and relocates its government after two turns", () => {
  const owners = new Int16Array(MAP_W * MAP_H);
  owners.fill(-1);
  for (let y = 100; y <= 110; y++) for (let x = 100; x <= 110; x++) owners[indexAt(x, y)] = 0;
  for (let y = 100; y <= 110; y++) for (let x = 111; x <= 130; x++) owners[indexAt(x, y)] = 1;
  const sourceCountries: Country[] = [
    { ...countries[0], capital: capitalAt("Stolica A", 105, 105) },
    { ...countries[1], capital: capitalAt("Stolica B", 111, 105) },
  ];
  const engine = engineFrom(owners, undefined, sourceCountries);
  engine.setGameMode("war");
  const east = DIRECTIONS.find((direction) => direction.short === "E") as Direction;
  const plan: TurnPlan = { rngBefore: engine.rngState, countryId: 0, action: "war", direction: east, directionAttempts: [east], actionWasRerolled: false, size: "tiny", fraction: .001, targetId: 1 };
  const loss = engine.apply(plan);
  assert.equal(loss.record.capitalLost, "Cel");
  assert.match(loss.record.text, /, stolica Cel upada$/);
  assert.equal(engine.getCapitalPlacements().find(({ countryId }) => countryId === 1)?.controlled, false);
  assert.equal(engine.rollCountry()?.countryId, 0, "a government without a capital cannot initiate a war");
  engine.apply({ ...plan, rngBefore: engine.rngState });
  assert.equal(engine.getCapitalPlacements().find(({ countryId }) => countryId === 1)?.relocated, false);
  const relocation = engine.apply({ ...plan, rngBefore: engine.rngState });
  const placement = engine.getCapitalPlacements().find(({ countryId }) => countryId === 1);
  assert.equal(relocation.record.capitalRelocated, "Cel");
  assert.equal(placement?.relocated, true);
  assert.equal(placement?.controlled, true);
  assert.equal(placement?.name, "Siedziba rządu, Cel");
});

test("war mode increases gains against a country without a capital up to the defender clamp", () => {
  const owners = new Int16Array(MAP_W * MAP_H);
  owners.fill(-1);
  for (let y = 200; y < 210; y++) for (let x = 200; x < 208; x++) owners[indexAt(x, y)] = 0;
  for (let y = 200; y < 210; y++) for (let x = 208; x < 228; x++) owners[indexAt(x, y)] = 1;
  const sourceCountries: Country[] = [
    { ...countries[0], capital: capitalAt("Stolica A", 203, 205) },
    { ...countries[1], capital: capitalAt("Stolica B", 220, 205) },
  ];
  const controlled = engineFrom(owners, undefined, sourceCountries);
  controlled.setGameMode("war");
  const capitalLess = engineFrom(owners, undefined, sourceCountries);
  capitalLess.setGameMode("war");
  const capitalLessSnapshot = capitalLess.snapshot();
  capitalLessSnapshot.capitalStates![1]!.lostTurn = 0;
  capitalLess.load(capitalLessSnapshot);
  const east = DIRECTIONS.find((direction) => direction.short === "E") as Direction;
  const plan: TurnPlan = { rngBefore: controlled.rngState, countryId: 0, action: "war", direction: east, directionAttempts: [east], actionWasRerolled: false, size: "medium", fraction: .2, targetId: 1 };
  const defenderClampKm2 = controlled.getCountryKm2(1) * plan.fraction;
  const controlledGain = controlled.apply(plan).record.changedKm2;
  const capitalLessGain = capitalLess.apply(plan).record.changedKm2;
  assert.ok(capitalLessGain > controlledGain, "loss of the capital must increase territorial losses");
  assert.ok(capitalLessGain <= defenderClampKm2 + 1e-6, "the defender-side fraction remains a hard ceiling");
});

test("war mode targets a top-three country more often than a uniform direction roll", () => {
  const sourceCountries: Country[] = Array.from({ length: 9 }, (_, id) => ({ id, iso: `C${id}`, name: `Kraj ${id}`, flag: `${id}`, color: [20 + id, 40 + id, 60 + id] as [number, number, number], initialWeight: 0 }));
  const owners = new Int16Array(MAP_W * MAP_H);
  owners.fill(-1);
  for (let index = 0; index < sourceCountries.length; index++) {
    const cells = index === 0 ? 100 : index === 1 ? 80 : index === 2 ? 60 : 10;
    for (let cell = 0; cell < cells; cell++) owners[indexAt(100 + cell, 100 + index * 3)] = index;
  }
  const engine = engineFrom(owners, undefined, sourceCountries);
  engine.setGameMode("war");
  const directionTargets = new Map(DIRECTIONS.map((direction, index) => [direction.key, index + 1]));
  (engine as unknown as { targetInDirection: (actorId: number, direction: Direction) => { countryId: number; index: number; distance: number; offset: number } }).targetInDirection = (_actorId, direction) => ({ countryId: directionTargets.get(direction.key)!, index: 0, distance: 1, offset: 0 });
  let leaderHits = 0;
  for (let sample = 0; sample < 200; sample++) if (engine.rollDirection(0, "war").targetId === 1) leaderHits++;
  assert.ok(leaderHits > 50, `top-three target received ${leaderHits} of 200 rolls, expected more than the uniform average of 25`);
});

test("war snapshots preserve exhaustion and capitals, reject wrong lengths, and load legacy defaults", () => {
  const owners = new Int16Array(MAP_W * MAP_H);
  owners.fill(-1);
  for (let y = 300; y <= 310; y++) for (let x = 300; x <= 310; x++) owners[indexAt(x, y)] = 0;
  for (let y = 300; y <= 310; y++) for (let x = 311; x <= 330; x++) owners[indexAt(x, y)] = 1;
  const sourceCountries: Country[] = [
    { ...countries[0], capital: capitalAt("Stolica A", 305, 305) },
    { ...countries[1], capital: capitalAt("Stolica B", 311, 305) },
  ];
  const engine = engineFrom(owners, undefined, sourceCountries);
  engine.setGameMode("war");
  const east = DIRECTIONS.find((direction) => direction.short === "E") as Direction;
  engine.apply({ rngBefore: engine.rngState, countryId: 0, action: "war", direction: east, directionAttempts: [east], actionWasRerolled: false, size: "tiny", fraction: .001, targetId: 1 });
  const snapshot = engine.snapshot();
  const restored = engineFrom(owners, undefined, sourceCountries);
  restored.load(snapshot);
  assert.equal(restored.getWarExhaustion(0), 3.2);
  assert.deepEqual(restored.snapshot().capitalStates, snapshot.capitalStates);
  assert.equal(restored.getCapitalPlacements().find(({ countryId }) => countryId === 1)?.controlled, false);
  assert.equal(isSnapshot({ ...snapshot, capitalStates: snapshot.capitalStates?.slice(1) }), false);
  assert.equal(engine.undo(), true);
  assert.equal(engine.getWarExhaustion(0), 0);
  assert.equal(engine.getCapitalPlacements().find(({ countryId }) => countryId === 1)?.controlled, true);
  const { warExhaustion: _warExhaustion, capitalStates: _capitalStates, ...legacySnapshot } = snapshot;
  const legacy = engineFrom(owners, undefined, sourceCountries);
  legacy.load(legacySnapshot);
  assert.equal(legacy.getWarExhaustion(0), 0);
  assert.equal(legacy.getCapitalPlacements().find(({ countryId }) => countryId === 1)?.relocated, false);
});

test("war mode benches a country after three consecutive wars and lets it return once exhaustion decays", () => {
  const sourceCountries: Country[] = [...countries, { id: 2, iso: "CC", name: "Sąsiad", flag: "C", color: [70, 180, 100], initialWeight: 0 }];
  const owners = new Int16Array(MAP_W * MAP_H);
  owners.fill(-1);
  for (let y = 400; y <= 410; y++) {
    for (let x = 400; x <= 410; x++) owners[indexAt(x, y)] = 0;
    for (let x = 411; x <= 425; x++) owners[indexAt(x, y)] = 1;
    for (let x = 426; x <= 440; x++) owners[indexAt(x, y)] = 2;
  }
  const engine = engineFrom(owners, undefined, sourceCountries);
  engine.setGameMode("war");
  const east = DIRECTIONS.find((direction) => direction.short === "E") as Direction;
  const warPlan = (countryId: number, targetId: number): TurnPlan => ({ rngBefore: engine.rngState, countryId, action: "war", direction: east, directionAttempts: [east], actionWasRerolled: false, size: "tiny", fraction: .001, targetId });

  for (let attack = 0; attack < 3; attack++) engine.apply(warPlan(0, 1));
  assert.ok(engine.getWarExhaustion(0) >= 9, `three consecutive wars must reach the exhaustion limit, got ${engine.getWarExhaustion(0)}`);
  for (let draw = 0; draw < 60; draw++) assert.notEqual(engine.rollCountry()?.countryId, 0, "an exhausted country must not be drawn while rested neighbours can still act");

  engine.apply(warPlan(1, 2));
  assert.ok(engine.getWarExhaustion(0) < 9, "a turn spent idle must decay the exhaustion below the limit");
  let returned = false;
  for (let draw = 0; draw < 60 && !returned; draw++) returned = engine.rollCountry()?.countryId === 0;
  assert.ok(returned, "a rested country must become eligible again");
});

function warOwners(attackerColumns: number, defenderColumns: number, row = 500) {
  const owners = new Int16Array(MAP_W * MAP_H);
  owners.fill(-1);
  for (let y = row; y < row + 10; y++) {
    for (let x = 500; x < 500 + attackerColumns; x++) owners[indexAt(x, y)] = 0;
    for (let x = 500 + attackerColumns; x < 500 + attackerColumns + defenderColumns; x++) owners[indexAt(x, y)] = 1;
  }
  return owners;
}

test("war mode limits direction vetoes to three per game and rerolls deterministically", () => {
  const owners = warOwners(11, 20);
  const engine = engineFrom(owners);
  engine.setGameMode("war");
  const reference = engineFrom(owners);
  reference.setGameMode("war");
  assert.equal(engine.getWarVetoesLeft(), 3);
  for (let use = 0; use < 3; use++) {
    const vetoed = engine.vetoDirection(0, "war");
    assert.notEqual(vetoed, null, "a veto within the limit must return a fresh direction roll");
    assert.deepEqual(vetoed, reference.rollDirection(0, "war"), "a veto must be an ordinary roll from the same RNG state");
  }
  assert.equal(engine.getWarVetoesLeft(), 0);
  assert.equal(engine.vetoDirection(0, "war"), null, "a fourth veto has no resource left");
  assert.equal(engineFrom(owners).vetoDirection(0, "war"), null, "outside war mode the veto does not exist");
  assert.equal(engine.undo(), false, "a veto must not create an undo entry");
});

test("war mode spends three undos per game while full mode stays unlimited", () => {
  const owners = warOwners(11, 20, 520);
  const east = DIRECTIONS.find((direction) => direction.short === "E") as Direction;
  const engine = engineFrom(owners);
  engine.setGameMode("war");
  assert.equal(engine.getWarUndosLeft(), 3);
  for (let attack = 0; attack < 4; attack++) engine.apply({ rngBefore: engine.rngState, countryId: 0, action: "war", direction: east, directionAttempts: [east], actionWasRerolled: false, size: "tiny", fraction: .001, targetId: 1 });
  for (let step = 0; step < 3; step++) {
    assert.equal(engine.canUndo(), true);
    assert.equal(engine.undo(), true);
  }
  assert.equal(engine.getWarUndosLeft(), 0);
  assert.equal(engine.canUndo(), false, "an exhausted undo resource must close the button even with entries left");
  assert.equal(engine.undo(), false);

  const unlimited = engineFrom(owners);
  for (let attack = 0; attack < 4; attack++) unlimited.apply({ rngBefore: unlimited.rngState, countryId: 0, action: "war", direction: east, directionAttempts: [east], actionWasRerolled: false, size: "tiny", fraction: .001, targetId: 1 });
  for (let step = 0; step < 4; step++) assert.equal(unlimited.undo(), true, "full mode keeps unlimited undos");
});

test("war mode grants one defensive guarantee that halves gains for ten turns", () => {
  const owners = warOwners(8, 20, 540);
  const east = DIRECTIONS.find((direction) => direction.short === "E") as Direction;
  const guarded = engineFrom(owners);
  guarded.setGameMode("war");
  assert.equal(guarded.getWarGuarantee(), null);
  assert.equal(guarded.setWarGuarantee(1), true);
  assert.deepEqual(guarded.getWarGuarantee(), { countryId: 1, turnsLeft: 10 });
  assert.equal(guarded.setWarGuarantee(0), false, "the guarantee is available once per game");
  assert.equal(engineFrom(owners).setWarGuarantee(1), false, "outside war mode the guarantee does not exist");

  const plain = engineFrom(owners);
  plain.setGameMode("war");
  const plan: TurnPlan = { rngBefore: plain.rngState, countryId: 0, action: "war", direction: east, directionAttempts: [east], actionWasRerolled: false, size: "medium", fraction: .2, targetId: 1 };
  const guardedGain = guarded.apply({ ...plan, rngBefore: guarded.rngState }).record.changedKm2;
  const plainGain = plain.apply(plan).record.changedKm2;
  assert.ok(guardedGain < plainGain, `a guaranteed country must lose less, got ${guardedGain} against ${plainGain}`);

  for (let turn = 1; turn < 10; turn++) guarded.apply({ rngBefore: guarded.rngState, countryId: 0, action: "war", direction: east, directionAttempts: [east], actionWasRerolled: false, size: "tiny", fraction: .001, targetId: 1 });
  assert.equal(guarded.getWarGuarantee(), null, "the guarantee expires on its own after ten turns");
  assert.equal(guarded.setWarGuarantee(1), false, "an expired guarantee is not renewable");
});

test("war mode awards titles for conquests, resilience and an untouched border", () => {
  const owners = warOwners(40, 6, 560);
  const east = DIRECTIONS.find((direction) => direction.short === "E") as Direction;
  const engine = engineFrom(owners);
  engine.setGameMode("war");
  assert.equal(engine.getCountryTitle(0), null, "a fresh full-size country holds no title");

  const conquered = engineFrom(owners);
  conquered.setGameMode("war");
  const snapshot = conquered.snapshot();
  for (const [defeats, title] of [[1, "Zdobywca"], [3, "Imperium"], [5, "Mocarstwo"]] as Array<[number, string]>) {
    conquered.load({ ...snapshot, defeats: [defeats, 0] });
    assert.equal(conquered.getCountryTitle(0), title);
  }

  const battered = engineFrom(owners);
  battered.setGameMode("war");
  battered.apply({ rngBefore: battered.rngState, countryId: 0, action: "war", direction: east, directionAttempts: [east], actionWasRerolled: false, size: "large", fraction: .6, targetId: 1 });
  assert.ok(battered.getCountryShare(1) <= .5 && battered.getCountryShare(1) > 0, `the defender must survive on at most half its land, got ${battered.getCountryShare(1)}`);
  assert.equal(battered.getCountryTitle(1), "Niezłomny");

  const fortress = engineFrom(warOwners(40, 40, 620));
  fortress.setGameMode("war");
  for (let turn = 0; turn < 30; turn++) fortress.apply({ rngBefore: fortress.rngState, countryId: 0, action: "war", direction: east, directionAttempts: [east], actionWasRerolled: false, size: "tiny", fraction: .0001, targetId: 1 });
  assert.ok(fortress.getCountryShare(1) > 0, "the defender must survive so the attacker earns no conquest title");
  assert.equal(fortress.getCountryTitle(0), "Twierdza", "thirty turns without losing a single cell earn the fortress title");

  const full = engineFrom(owners);
  full.load({ ...snapshot, mode: "full", defeats: [5, 0] });
  assert.equal(full.getCountryTitle(0), null, "titles belong to war mode only");
  assert.ok(!readFileSync(new URL("../app/game-engine.ts", import.meta.url), "utf8").includes("Hegemon"), "the engine must never use the name Hegemon");
});

test("war snapshots carry vetoes, undos, the guarantee and the minimum share", () => {
  const owners = warOwners(11, 20, 580);
  const east = DIRECTIONS.find((direction) => direction.short === "E") as Direction;
  const engine = engineFrom(owners);
  engine.setGameMode("war");
  engine.setPlayerCountry(1);
  engine.vetoDirection(0, "war");
  assert.equal(engine.setWarGuarantee(1), true);
  engine.apply({ rngBefore: engine.rngState, countryId: 0, action: "war", direction: east, directionAttempts: [east], actionWasRerolled: false, size: "medium", fraction: .2, targetId: 1 });
  assert.equal(engine.undo(), true);
  const snapshot = engine.snapshot();
  assert.equal(snapshot.warVetoesLeft, 2);
  assert.equal(snapshot.warUndosLeft, 2, "undo spends a resource that undo itself does not give back");

  const restored = engineFrom(owners);
  restored.load(snapshot);
  assert.equal(restored.playerCountryId, 1);
  assert.equal(restored.getWarVetoesLeft(), 2);
  assert.equal(restored.getWarUndosLeft(), 2);
  assert.deepEqual(restored.getWarGuarantee(), { countryId: 1, turnsLeft: 10 });
  assert.deepEqual(restored.snapshot().warMinShare, snapshot.warMinShare);
  assert.equal(restored.setWarGuarantee(0), false, "a restored game remembers that the guarantee was used");
  assert.equal(isSnapshot({ ...snapshot, warVetoesLeft: 7 }), false, "more than three vetoes is not a valid save");
  assert.equal(isSnapshot({ ...snapshot, warMinShare: snapshot.warMinShare?.slice(1) }), false);

  const { warVetoesLeft: _vetoes, warUndosLeft: _undos, warGuarantee: _guarantee, warGuaranteeUsed: _used, warMinShare: _minShare, ...legacy } = snapshot;
  const older = engineFrom(owners);
  older.load(legacy);
  assert.equal(older.getWarVetoesLeft(), 3, "an old save starts a war game with the full veto pool");
  assert.equal(older.getWarUndosLeft(), 3);
  assert.equal(older.getWarGuarantee(), null);
});

test("war mode lets capital-less countries act when nobody else can", () => {
  const owners = warOwners(11, 20, 600);
  const sourceCountries: Country[] = [
    { ...countries[0], capital: capitalAt("Stolica A", 505, 605) },
    { ...countries[1], capital: capitalAt("Stolica B", 511, 605) },
  ];
  const engine = engineFrom(owners, undefined, sourceCountries);
  engine.setGameMode("war");
  const snapshot = engine.snapshot();
  for (const capital of snapshot.capitalStates ?? []) if (capital) capital.lostTurn = 0;
  engine.load(snapshot);
  assert.notEqual(engine.rollCountry(), null, "with every capital lost the game must still find an attacker");
});
