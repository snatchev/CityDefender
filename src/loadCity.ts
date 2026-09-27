import type { BackdropFileV0, BuildingsFileV0, CityFileV0 } from './sim/cityFile';

declare global {
  interface Window {
    /** Files inlined by `npm run build:preview` (scripts/inline-build.mjs), keyed by public path. */
    __CD_INLINE__?: Record<string, unknown>;
  }
}

/** Fetch a generated city file, from the inlined copy in the single-file preview or over HTTP. */
async function loadCityAsset(name: string, file: string): Promise<{ version: number }> {
  const path = `cities/${name}/${file}`;
  let data = window.__CD_INLINE__?.[path];
  if (data === undefined) {
    const res = await fetch(import.meta.env.BASE_URL + path);
    if (!res.ok) {
      throw new Error(
        `loading ${path}: HTTP ${res.status} (run \`npm run map:build -- ${name}\`?)`,
      );
    }
    data = await res.json();
  }
  const asset = data as { version: number };
  if (asset.version !== 0) throw new Error(`${path}: unsupported version ${String(asset.version)}`);
  return asset;
}

/** `public/cities/<name>/city.json` (tiles, stations, labels: what the sim needs). */
export async function loadCityFile(name: string): Promise<CityFileV0> {
  return (await loadCityAsset(name, 'city.json')) as CityFileV0;
}

/** `public/cities/<name>/backdrop.json` (the city beyond the level: render only). */
export async function loadBackdropFile(name: string): Promise<BackdropFileV0> {
  return (await loadCityAsset(name, 'backdrop.json')) as BackdropFileV0;
}

/** `public/cities/<name>/buildings.json` (outlines and centerlines: render only). */
export async function loadBuildingsFile(name: string): Promise<BuildingsFileV0> {
  return (await loadCityAsset(name, 'buildings.json')) as BuildingsFileV0;
}
