import { readFile, writeFile } from "node:fs/promises";
import { deflateSync } from "node:zlib";

const SOURCE_URL = "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_admin_1_states_provinces.geojson";
const WIDTH = 4320;
const HEIGHT = 2160;
const POLISH_NAME_OVERRIDES = { "RU-KGD": "obwód królewiecki" };
const sourcePath = process.argv[2];
const outputPath = process.argv[3] ?? "app/admin1-data.ts";

if (!sourcePath) throw new Error("Podaj ścieżkę do GeoJSON Natural Earth Admin-1.");

const collection = JSON.parse(await readFile(sourcePath, "utf8"));
const features = collection.features.filter((feature) => feature.geometry && feature.properties?.iso_a2);
const raster = new Int16Array(WIDTH * HEIGHT);
raster.fill(-1);

const pixelPoint = ([longitude, latitude]) => [
  (longitude + 180) / 360 * WIDTH,
  (90 - latitude) / 180 * HEIGHT,
];

function unwrapRing(ring) {
  const result = [];
  for (const coordinate of ring) {
    let [x, y] = pixelPoint(coordinate);
    if (result.length) {
      const previous = result.at(-1)[0];
      while (x - previous > WIDTH / 2) x -= WIDTH;
      while (x - previous < -WIDTH / 2) x += WIDTH;
    }
    result.push([x, y]);
  }
  return result;
}

function fillPolygon(rings, regionId) {
  const projected = rings.map(unwrapRing);
  let minY = HEIGHT - 1, maxY = 0;
  for (const ring of projected) for (const [, y] of ring) {
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  }
  const y0 = Math.max(0, Math.floor(minY));
  const y1 = Math.min(HEIGHT - 1, Math.ceil(maxY));
  for (let y = y0; y <= y1; y++) {
    const scanY = y + .5;
    const intersections = [];
    for (const ring of projected) for (let current = 0, previous = ring.length - 1; current < ring.length; previous = current++) {
      const [x1, y1] = ring[previous], [x2, y2] = ring[current];
      if ((y1 > scanY) === (y2 > scanY)) continue;
      intersections.push(x1 + (scanY - y1) * (x2 - x1) / (y2 - y1));
    }
    intersections.sort((first, second) => first - second);
    for (let pair = 0; pair + 1 < intersections.length; pair += 2) {
      const start = Math.ceil(intersections[pair] - .5);
      const end = Math.floor(intersections[pair + 1] - .5);
      for (let x = start; x <= end; x++) raster[y * WIDTH + ((x % WIDTH + WIDTH) % WIDTH)] = regionId;
    }
  }
}

const iso = [];
const names = [];
const codes = [];
for (let regionId = 0; regionId < features.length; regionId++) {
  const feature = features[regionId];
  const properties = feature.properties;
  // Natural Earth renders occupied Crimea as Russian. The game's country map
  // follows internationally recognized borders, so UA subdivision codes win.
  iso.push(properties.iso_3166_2?.startsWith("UA-") ? "UA" : properties.iso_a2);
  const code = properties.iso_3166_2 || properties.adm1_code || String(regionId);
  names.push(POLISH_NAME_OVERRIDES[code] || properties.name_pl || properties.name_local || properties.name || `Region ${regionId + 1}`);
  codes.push(code);
  const polygons = feature.geometry.type === "Polygon" ? [feature.geometry.coordinates] : feature.geometry.coordinates;
  for (const polygon of polygons) fillPolygon(polygon, regionId);
}

const compressed = deflateSync(Buffer.from(raster.buffer), { level: 9 });
const output = `// Generated from Natural Earth Admin-1 (public domain).\n// Source: ${SOURCE_URL}\n// Do not edit manually; run scripts/generate-admin1-data.mjs.\nexport const ADMIN1_WIDTH = ${WIDTH};\nexport const ADMIN1_HEIGHT = ${HEIGHT};\nexport const ADMIN1_ISO = ${JSON.stringify(iso)} as const;\nexport const ADMIN1_NAMES = ${JSON.stringify(names)} as const;\nexport const ADMIN1_CODES = ${JSON.stringify(codes)} as const;\nexport const ADMIN1_DEFLATE_BASE64 = ${JSON.stringify(compressed.toString("base64"))};\n`;
await writeFile(outputPath, output);
console.log(`Generated ${features.length} Admin-1 regions; ${compressed.length} compressed bytes.`);
