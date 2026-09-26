/**
 * Map pipeline entry point: `npm run map:build -- <city>`.
 * Implemented in Pass 1 (fetch → project/rotate → rasterize → city.json). See docs/IMPLEMENTATION_PLAN.md.
 */
const city = process.argv[2] ?? 'philly';
console.log(`[map:build] '${city}': not implemented yet (Pass 1).`);
process.exitCode = 1;
