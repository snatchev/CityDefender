/**
 * Download streets and stations (Overpass API) and building footprints (city ArcGIS service)
 * for a city into tools/map/cache/.
 * Usage: `tsx tools/map/fetch.ts <city> [--force]`. `build.ts` calls this automatically when the cache is missing.
 */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  buildingsCachePath,
  CACHE_DIR,
  osmBuildingsCachePath,
  cachePath,
  loadConfig,
  type CityConfig,
  type FootprintCollection,
} from './config';

const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';
/** Overpass rejects requests without a User-Agent. */
const USER_AGENT = 'CityDefender-mapbuild/0.1';

/** POST a query to Overpass, retrying on busy/timeout responses (429, 5xx) with backoff. */
async function overpass(query: string, attempts = 4): Promise<string> {
  for (let i = 1; ; i++) {
    const res = await fetch(OVERPASS_URL, {
      method: 'POST',
      headers: { 'User-Agent': USER_AGENT, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ data: query }),
    });
    if (res.ok) return res.text();
    const retryable = res.status === 429 || res.status >= 500;
    if (!retryable || i >= attempts) {
      throw new Error(`Overpass HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
    }
    const waitS = 10 * i;
    console.log(
      `[map:fetch] Overpass HTTP ${res.status}, retrying in ${waitS} s (${i}/${attempts - 1})`,
    );
    await new Promise((r) => setTimeout(r, waitS * 1000));
  }
}

export function overpassQuery(cfg: CityConfig): string {
  const { south, west, north, east } = cfg.fetchBbox;
  const bbox = `${south},${west},${north},${east}`;
  return `[out:json][timeout:90];
way["highway"~"^(${cfg.highways.join('|')})$"](${bbox});
out geom;
(
  nwr["railway"~"^(station|halt)$"](${bbox});
  nwr["public_transport"="station"](${bbox});
);
out center tags;`;
}

export async function fetchCity(city: string, force = false): Promise<string> {
  const cfg = loadConfig(city);
  const out = cachePath(city);
  if (existsSync(out) && !force) return out;

  console.log(`[map:fetch] ${city}: querying Overpass…`);
  const text = await overpass(overpassQuery(cfg));
  mkdirSync(CACHE_DIR, { recursive: true });
  writeFileSync(out, text);
  console.log(`[map:fetch] wrote ${out} (${(text.length / 1024).toFixed(0)} kB)`);
  return out;
}

/** OSM building outlines (ways only; multipolygon relations are rare downtown and skipped in v0). */
export async function fetchOsmBuildings(city: string, force = false): Promise<string> {
  const cfg = loadConfig(city);
  const out = osmBuildingsCachePath(city);
  if (existsSync(out) && !force) return out;
  const { south, west, north, east } = cfg.fetchBbox;
  console.log(`[map:fetch] ${city}: querying OSM buildings…`);
  const text = await overpass(
    `[out:json][timeout:90];way["building"](${south},${west},${north},${east});out geom tags;`,
  );
  mkdirSync(CACHE_DIR, { recursive: true });
  writeFileSync(out, text);
  console.log(`[map:fetch] wrote ${out} (${(text.length / 1024).toFixed(0)} kB)`);
  return out;
}

/** ArcGIS feature services cap each response; page through with resultOffset. */
const ARCGIS_PAGE = 2000;

/** Download building footprints with heights for the fetch bbox into tools/map/cache/. */
export async function fetchBuildings(city: string, force = false): Promise<string> {
  const cfg = loadConfig(city);
  const out = buildingsCachePath(city);
  if (existsSync(out) && !force) return out;

  const { south, west, north, east } = cfg.fetchBbox;
  const b = cfg.buildings;
  const all: FootprintCollection = { type: 'FeatureCollection', features: [] };
  console.log(`[map:fetch] ${city}: querying building footprints…`);
  for (let offset = 0; ; offset += ARCGIS_PAGE) {
    const params = new URLSearchParams({
      where: '1=1',
      geometry: `${west},${south},${east},${north}`,
      geometryType: 'esriGeometryEnvelope',
      inSR: '4326',
      outSR: '4326',
      spatialRel: 'esriSpatialRelIntersects',
      outFields: `objectid,building_name,${b.heightField},${b.fallbackHeightField}`,
      orderByFields: 'objectid',
      resultOffset: String(offset),
      resultRecordCount: String(ARCGIS_PAGE),
      f: 'geojson',
    });
    const res = await fetch(b.url, {
      method: 'POST',
      headers: { 'User-Agent': USER_AGENT, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params,
    });
    if (!res.ok)
      throw new Error(`footprints HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
    const page = (await res.json()) as FootprintCollection & { error?: unknown };
    if (page.error) throw new Error(`footprints query failed: ${JSON.stringify(page.error)}`);
    all.features.push(...page.features);
    if (page.features.length < ARCGIS_PAGE) break;
  }
  mkdirSync(CACHE_DIR, { recursive: true });
  writeFileSync(out, JSON.stringify(all));
  console.log(`[map:fetch] wrote ${out} (${all.features.length} footprints)`);
  return out;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const city = args.find((a) => !a.startsWith('--')) ?? 'philly';
  await fetchCity(city, args.includes('--force'));
  await fetchBuildings(city, args.includes('--force'));
  await fetchOsmBuildings(city, args.includes('--force'));
}
