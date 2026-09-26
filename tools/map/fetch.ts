/**
 * Download streets and stations for a city from the Overpass API into tools/map/cache/.
 * Usage: `tsx tools/map/fetch.ts <city> [--force]`. `build.ts` calls this automatically when the cache is missing.
 */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { CACHE_DIR, cachePath, loadConfig, type CityConfig } from './config';

const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';
/** Overpass rejects requests without a User-Agent. */
const USER_AGENT = 'CityDefender-mapbuild/0.1';

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
  const res = await fetch(OVERPASS_URL, {
    method: 'POST',
    headers: { 'User-Agent': USER_AGENT, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ data: overpassQuery(cfg) }),
  });
  if (!res.ok) throw new Error(`Overpass HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const text = await res.text();
  mkdirSync(CACHE_DIR, { recursive: true });
  writeFileSync(out, text);
  console.log(`[map:fetch] wrote ${out} (${(text.length / 1024).toFixed(0)} kB)`);
  return out;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  await fetchCity(args.find((a) => !a.startsWith('--')) ?? 'philly', args.includes('--force'));
}
