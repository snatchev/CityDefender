import type { CityFileV0 } from './sim/cityFile';

declare global {
  interface Window {
    /** Files inlined by `npm run build:preview` (scripts/inline-build.mjs), keyed by public path. */
    __CD_INLINE__?: Record<string, unknown>;
  }
}

/** Load `public/cities/<name>/city.json`, from the inlined copy in the single-file preview or over HTTP. */
export async function loadCityFile(name: string): Promise<CityFileV0> {
  const path = `cities/${name}/city.json`;
  let data = window.__CD_INLINE__?.[path];
  if (data === undefined) {
    const res = await fetch(import.meta.env.BASE_URL + path);
    if (!res.ok)
      throw new Error(
        `loading ${path}: HTTP ${res.status} (run \`npm run map:build -- ${name}\`?)`,
      );
    data = await res.json();
  }
  const file = data as CityFileV0;
  if (file.version !== 0)
    throw new Error(`${path}: unsupported city file version ${String(file.version)}`);
  return file;
}
