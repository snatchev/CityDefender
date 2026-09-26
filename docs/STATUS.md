# City Defender — Status

> **Agents: read this first after CLAUDE.md**, and update it at the end of every pass.

**Last updated:** 2026-09-26
**Current pass:** Pass 2 (One mob): **done**, tagged `pass-02`
**Next up:** Pass 3 (flow field + barricades)
**Live preview:** https://claude.ai/artifact/6AoAPfL6V4FJSgBgNwA5d7 (private; republished at the end of each pass)

## Done
- Research: map sources and formats → decision D001 ([research/map-sources.md](research/map-sources.md))
- Design doc v0.1 ([DESIGN.md](DESIGN.md))
- Implementation plan v0.1 ([IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md))
- Pass 0: scaffold (tag `pass-00`).
- Pass 1: map generator v0 (tag `pass-01`). `npm run map:build -- philly` fetches OSM streets and stations once (cached in `tools/map/cache/`), rotates the grid by −9.35° onto Penn's streets, cuts the level at Vine / Spruce / 18th / 8th, and writes `public/cities/philly/city.json` (183×162 tiles, 12 stations, 102 street labels). The game renders it with instanced buildings, the City Hall block as the goal, orange station discs and street/station labels.
- Pass 2: one mob (tag `pass-02`). Red "skitterling" spheres leave a station (HUD picker + "Send 20 bugs", or `__cd.spawnWave(n, stationIndex)`) and walk the real streets to City Hall, which loses Integrity per arrival. Pathing is a breadth-first distance field from the goal (D020). Mob stats in `src/data/mobs.json`, start Integrity and spawn interval in `src/data/rules.json`.
- Real building heights (pulled forward from Pass 6 at Stefan's request, D019): per-tile heights from City of Philadelphia footprints, with OSM buildings filling the gaps (the Convention Center and Comcast Technology Center are missing from the city data). Drawn with the √ height curve from DESIGN §4. Open lots show as low grey slabs.
- 28 agent skills installed in `.agents/skills` (symlinked into `.claude/skills`). All kept (D018); see [TOOLING.md](TOOLING.md).

## In progress
- Nothing. Pass 3 is next.

## How Claude builds and checks things (Claude Code on the Mac, since 2026-09-26)
- Development moved from Cowork to **Claude Code running directly on Stefan's Mac** (see D010). npm, vitest, eslint and the dev server run natively in the project folder. The Cowork workarounds (a scratch copy of the project for Linux builds, checking the game through a published artifact) are no longer needed.
- Checking the game: `npm run dev`, then Chrome DevTools MCP against `http://localhost:5173` (console, screenshots, `window.__cd`, performance traces).
- The HUD shows runtime errors on screen (red panel) and a Renderer line, so problems show up in screenshots.
- Sharing: `npm run build:preview` still writes a single self-contained HTML (`dist-preview/city-defender-preview.html`, dev mode, with `window.__cd` and the error panel). Claude republishes it to the live preview artifact at the end of each pass so Stefan has a link to try: the artifact page is `scripts/preview-artifact.html`, which iframes the build published beside it as `game.html`.
- Git: one commit per pass, tagged `pass-NN` (see D011).

## Open questions for Stefan
- None right now.

## Deferred from Pass 1 (planned for Pass 6 unless noted)
- Footprint meshes (heights are per tile for now), street widths from lanes, alleys, slots, street graph.
- The goal block is ~180 m square (City Hall plus Dilworth Park), because the west side of Penn Square has no mapped road. Pass 6 can use the real City Hall footprint.
- Diagonal streets (the Parkway) rasterize as stair-steps and a bit fat.
- Camera isn't clamped to the level bounds (camera work is Pass 4–5).
- Street labels are dense when zoomed out; no label culling or level-of-detail yet.

## Deferred from Pass 2
- Losing at Integrity 0 (Pass 4). Integrity just stops at 0.
- Mobs pass through each other (no crowding or separation).

## Known issues / tech debt
- Swarms zig-zag between parallel streets: every equally short route is a tie and ties are picked at random. Correct for pure shortest path, but it may read oddly. Pass 3's flow field could prefer keeping direction (a small turn cost) if we want bugs to hold an avenue.
- The HUD panel got wider in Pass 2 and covers part of the map's north-west corner. HUD layout is Pass 4–5 work.
- Stepper needed an epsilon for float drift (fixed, covered by test).
- Console warning from @react-three/fiber 9.8: `THREE.Clock ... deprecated, use THREE.Timer`. Upstream and harmless. Revisit when R3F updates.
- Vite warns the bundle is >500 kB (it's three.js, 1.15 MB / 317 kB gzip). Ignore until Pass 10's perf pass.
- Fixed in Pass 0 check: the FPS meter overlapped the HUD (moved bottom-right), and eslint was linting build output and scripts without node globals.

## Pass log
| Pass | Date | Result | Screenshot | Notes |
|---|---|---|---|---|
| 0 | 2026-09-26 | ✅ typecheck, lint, 14/14 tests, build. Renders at 60 fps in Chrome (Vega 56). Controls, pause, step and restart verified | [pass-00.png](screenshots/pass-00.png) | drei Stats instead of r3f-perf; leva deferred to Pass 5 |
| 1 | 2026-09-26 | ✅ typecheck, lint, 19/19 tests. `map:build` reproducible from cache (identical hash). 60 fps in Chrome, no errors. Single-file preview checked | [pass-01.png](screenshots/pass-01.png) | Replaced 114 drei `<Html>` labels (26 fps, React root warnings) with one DOM label layer |
| 1b | 2026-09-26 | ✅ real building heights; 60 fps, no errors | [pass-01b-heights.png](screenshots/pass-01b-heights.png) | Stefan asked for it before Pass 2 (D019) |
| 2 | 2026-09-26 | ✅ typecheck, lint, 21/21 tests (mob arrival tick count + seeded determinism on fixtures). 400 mobs at 3× speed: 60 fps, worst frame 22 ms. All 12 stations reach City Hall | [pass-02.png](screenshots/pass-02.png) | The arrival test caught an off-by-one tick; fixed |
