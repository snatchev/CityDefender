// Inline a Vite build's JS/CSS into one self-contained HTML file (for sharing previews
// as a single file / artifact). Usage: node scripts/inline-build.mjs <outDir>
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const outDir = process.argv[2] ?? 'dist-preview';
let html = readFileSync(join(outDir, 'index.html'), 'utf8');

html = html.replace(/<link rel="stylesheet"[^>]*href="\/?([^"]+)"[^>]*>/g, (_, href) => {
  return `<style>\n${readFileSync(join(outDir, href), 'utf8')}\n</style>`;
});
html = html.replace(/<script type="module"[^>]*src="\/?([^"]+)"[^>]*><\/script>/g, (_, src) => {
  const js = readFileSync(join(outDir, src), 'utf8').replace(/<\/script/gi, '<\\/script');
  return `<script type="module">\n${js}\n</script>`;
});

const file = join(outDir, 'city-defender-preview.html');
writeFileSync(file, html);
console.log(`[inline-build] wrote ${file} (${(html.length / 1024).toFixed(0)} kB)`);
