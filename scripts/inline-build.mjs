// Inline a Vite build's JS/CSS into one self-contained HTML file (for sharing previews
// as a single file / artifact). Usage: node scripts/inline-build.mjs <outDir>
// Also inlines the generated city files (<outDir>/cities/**/*.json) as window.__CD_INLINE__,
// because the single-file preview has no server to fetch them from (see src/loadCity.ts).
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';

const outDir = process.argv[2] ?? 'dist-preview';
let html = readFileSync(join(outDir, 'index.html'), 'utf8');

html = html.replace(/<link rel="stylesheet"[^>]*href="\/?([^"]+)"[^>]*>/g, (_, href) => {
  return `<style>\n${readFileSync(join(outDir, href), 'utf8')}\n</style>`;
});
html = html.replace(/<script type="module"[^>]*src="\/?([^"]+)"[^>]*><\/script>/g, (_, src) => {
  const js = readFileSync(join(outDir, src), 'utf8').replace(/<\/script/gi, '<\\/script');
  return `<script type="module">\n${js}\n</script>`;
});

const inline = {};
const citiesDir = join(outDir, 'cities');
if (existsSync(citiesDir)) {
  for (const f of readdirSync(citiesDir, { recursive: true })) {
    if (!String(f).endsWith('.json')) continue;
    const full = join(citiesDir, String(f));
    inline[relative(outDir, full).split('\\').join('/')] = JSON.parse(readFileSync(full, 'utf8'));
  }
}
const inlineJson = JSON.stringify(inline).replace(/</g, '\\u003c');
html = html.replace('<head>', `<head>\n<script>window.__CD_INLINE__ = ${inlineJson};</script>`);

const file = join(outDir, 'city-defender-preview.html');
writeFileSync(file, html);
console.log(
  `[inline-build] wrote ${file} (${(html.length / 1024).toFixed(0)} kB, inlined ${Object.keys(inline).length} data file(s))`,
);
