/**
 * Download streets and stations (Overpass API) and building footprints (city ArcGIS service)
 * for a city into tools/map/cache/.
 * Usage: `tsx tools/map/fetch.ts <city> [--force]`. `build.ts` calls this automatically when the cache is missing.
 */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  backdropBuildingsCachePath,
  backdropOsmCachePath,
  buildingsCachePath,
  CACHE_DIR,
  osmBuildingsCachePath,
  osmPartsCachePath,
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

/**
 * OSM `building:part`s (3D shapes: setbacks and roofs) and building relations (outlines with
 * courtyards, e.g. City Hall). A separate cache so the older downloads, and the level, stay as they were.
 */
export async function fetchOsmParts(city: string, force = false): Promise<string> {
  const cfg = loadConfig(city);
  const { south, west, north, east } = cfg.fetchBbox;
  const bbox = `${south},${west},${north},${east}`;
  return cached(osmPartsCachePath(city), force, `${city}: OSM building parts`, () =>
    overpass(
      `[out:json][timeout:120];(way["building:part"](${bbox});relation["building:part"](${bbox});relation["building"](${bbox}););out geom;`,
    ),
  );
}

/** ArcGIS feature services cap each response; page through with resultOffset. */
const ARCGIS_PAGE = 2000;

type Bbox = CityConfig['fetchBbox'];

/** Page through the city's footprint service for a bbox (optionally simplified server-side). */
async function fetchFootprints(
  cfg: CityConfig,
  bbox: Bbox,
  simplifyDeg?: number,
): Promise<FootprintCollection> {
  const { south, west, north, east } = bbox;
  const b = cfg.buildings;
  const all: FootprintCollection = { type: 'FeatureCollection', features: [] };
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
      ...(simplifyDeg ? { maxAllowableOffset: String(simplifyDeg), geometryPrecision: '6' } : {}),
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
    if (offset > 0 && offset % (ARCGIS_PAGE * 10) === 0)
      console.log(`[map:fetch]   … ${all.features.length}`);
    if (page.features.length < ARCGIS_PAGE) break;
  }
  return all;
}

async function cached(
  out: string,
  force: boolean,
  what: string,
  get: () => Promise<unknown>,
): Promise<string> {
  if (existsSync(out) && !force) return out;
  console.log(`[map:fetch] ${what}…`);
  const data = await get();
  mkdirSync(CACHE_DIR, { recursive: true });
  const text = typeof data === 'string' ? data : JSON.stringify(data);
  writeFileSync(out, text);
  console.log(`[map:fetch] wrote ${out} (${(text.length / 1024).toFixed(0)} kB)`);
  return out;
}

/** Building footprints with heights for the level's fetch bbox. */
export function fetchBuildings(city: string, force = false): Promise<string> {
  const cfg = loadConfig(city);
  return cached(buildingsCachePath(city), force, `${city}: building footprints`, () =>
    fetchFootprints(cfg, cfg.fetchBbox),
  );
}

/** Backdrop (D027): simplified footprints for the wider area, plus tall OSM buildings for skyline gaps. */
export async function fetchBackdrop(city: string, force = false): Promise<void> {
  const cfg = loadConfig(city);
  const bd = cfg.backdrop;
  await cached(backdropBuildingsCachePath(city), force, `${city}: backdrop footprints`, () =>
    fetchFootprints(cfg, bd.bbox, bd.simplifyDeg),
  );
  const { south, west, north, east } = bd.bbox;
  const bbox = `${south},${west},${north},${east}`;
  await cached(backdropOsmCachePath(city), force, `${city}: backdrop OSM tall buildings`, () =>
    overpass(
      `[out:json][timeout:120];(way["building"]["height"](${bbox});way["building"]["building:levels"](${bbox}););out geom tags;`,
    ),
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const city = args.find((a) => !a.startsWith('--')) ?? 'philly';
  await fetchCity(city, args.includes('--force'));
  await fetchBuildings(city, args.includes('--force'));
  await fetchOsmBuildings(city, args.includes('--force'));
  await fetchOsmParts(city, args.includes('--force'));
  await fetchBackdrop(city, args.includes('--force'));
}
