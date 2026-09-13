import { writeFile } from "node:fs/promises";

const indicators = {
  gdpPpp: { code: "NY.GDP.MKTP.PP.CD", from: 2021, to: 2021 },
  population: { code: "SP.POP.TOTL", from: 2021, to: 2021 },
  technology: { code: "IT.NET.USER.ZS", from: 2019, to: 2021 },
  logistics: { code: "LP.LPI.OVRL.XQ", from: 2018, to: 2018 },
  military: { code: "MS.MIL.XPND.CD", from: 2019, to: 2021 },
};

// Population gaps for map entities absent from the World Bank country list.
// Sources: UN World Statistics Pocketbook 2021 (ATF, ESH, VAT), Falkland
// Islands Census 2021, INSEE (GUF), Taiwan MOI and the World Bank API
// (NCL, PRK, XKX). UNK is the ISO3 used for Kosovo by world-countries.
const supplementalPopulation2021 = {
  ATF: 0,
  ESH: 612_000,
  FLK: 3_662,
  GUF: 286_618,
  NCL: 285_214,
  PRK: 26_232_534,
  TWN: 23_375_314,
  UNK: 1_786_079,
  VAT: 451,
};

async function fetchIndicator({ code, from, to }) {
  const url = `https://api.worldbank.org/v2/country/all/indicator/${code}?date=${from}:${to}&format=json&per_page=20000`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${code}: HTTP ${response.status}`);
  const payload = await response.json();
  const rows = Array.isArray(payload?.[1]) ? payload[1] : [];
  const values = new Map();
  for (const row of rows) {
    const iso3 = row?.countryiso3code;
    if (!/^[A-Z]{3}$/.test(iso3) || !Number.isFinite(row?.value)) continue;
    const year = Number(row.date);
    if (!values.has(iso3) || year > values.get(iso3).year) values.set(iso3, { value: row.value, year });
  }
  return values;
}

const entries = Object.entries(indicators);
const fetched = {};
for (const [key, config] of entries) fetched[key] = await fetchIndicator(config);
const countries = new Set(Object.values(fetched).flatMap((map) => [...map.keys()]));
const records = {};
for (const iso3 of [...countries].sort()) {
  const record = {};
  for (const [key] of entries) {
    const item = fetched[key].get(iso3);
    if (item) record[key] = Math.round(item.value * 1000) / 1000;
  }
  if (Object.keys(record).length >= 2) records[iso3] = record;
}
for (const [iso3, population] of Object.entries(supplementalPopulation2021)) {
  records[iso3] ??= {};
  records[iso3].population ??= population;
}

const banner = `// Generated from World Bank Open Data. Baseline year: 2021.\n// LPI uses the most recent pre-baseline edition (2018); sparse series use the latest value from 2019–2021.\n// Regenerate with: node scripts/generate-strategic-baselines.mjs\n\n`;
const output = `${banner}export type StrategicBaseline = { gdpPpp?: number; population?: number; technology?: number; logistics?: number; military?: number; stability?: number };\n\nexport const STRATEGIC_BASELINES: Record<string, StrategicBaseline> = ${JSON.stringify(records, null, 2)};\n`;
await writeFile(new URL("../app/strategic-baselines.ts", import.meta.url), output);
console.log(`Wrote ${Object.keys(records).length} country baselines.`);
