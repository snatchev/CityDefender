# City Defender — Status

> **Agents: read this first after CLAUDE.md**, and update it at the end of every pass.

**Last updated:** 2026-09-26
**Current pass:** Pass 6 (Map generator v1): **done**, tagged `pass-06`
**Next up:** Pass 7 (data-driven roster: Mortar, Cryo, Railgun; Carapace Beetle; armor and targeting modes)
**Live preview:** https://claude.ai/artifact/6AoAPfL6V4FJSgBgNwA5d7 (private; republished at the end of each pass)

## Done
- Research: map sources and formats → decision D001 ([research/map-sources.md](research/map-sources.md))
- Design doc v0.1 ([DESIGN.md](DESIGN.md))
- Implementation plan v0.1 ([IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md))
- Pass 0: scaffold (tag `pass-00`).
- Pass 1: map generator v0 (tag `pass-01`). `npm run map:build -- philly` fetches OSM streets and stations once (cached in `tools/map/cache/`), rotates the grid by −9.35° onto Penn's streets, cuts the level at Vine / Spruce / 18th / 8th, and writes `public/cities/philly/city.json` (183×162 tiles, 12 stations, 102 street labels). The game renders it with instanced buildings, the City Hall block as the goal, orange station discs and street/station labels.
- Pass 2: one mob (tag `pass-02`). Red "skitterling" spheres leave a station (HUD picker + "Send 20 bugs", or `__cd.spawnWave(n, stationIndex)`) and walk the real streets to City Hall, which loses Integrity per arrival. Pathing is a breadth-first distance field from the goal (D020). Mob stats in `src/data/mobs.json`, start Integrity and spawn interval in `src/data/rules.json`.
- Pass 3: flow field + barricades (tag `pass-03`). Click a street to drop a Police Sawhorse across its full width; right-click removes it. Hovering shows a ghost barricade, the new route (dashed cyan) and a detour meter (`+376 m`). The selected station's current route is drawn in orange. Barricades are HP-weighted path costs (siege rule): bugs detour when that's cheaper, otherwise stop and break through the cheapest barricade. The field recomputes only on place/remove/destroy and at 25% HP bands (D021). Barricade tint goes yellow → red with damage.
- Pass 4: first playable (tag `pass-04`). A run is 5 waves (`src/data/waves.json`): PREP (30 s countdown, "Start wave" ends it early for +$1/s skipped) → ASSAULT → DEBRIEF (4 s, clear bonus) → … → won, or lost at City Hall Integrity 0, with an end screen and "Play again". Click a rooftop overlooking a street for an MG Nest ($100, hitscan, 64 m range, targets "First"); click a street for a sawhorse ($25, prep only, right-click refunds). Cash from bounties ($4/kill), wave clear bonus and the early call. Routes and ghost routes now show every station active this wave. Rooftops are picked by marching the pointer ray through the height grid.
- Pass 6: map generator v1 (tag `pass-06`).
  - Streets follow the real gaps between building footprints (D026), so walkable streets match what's drawn. Buildings are drawn as real extruded footprints (one merged mesh) with dashed lane lines on major streets.
  - Street graph, one barricade per block face, roof pads and street-corner tower spots are derived at load time in `src/sim/slots.ts` (D028). Towers go only on pads (◆) and corners (●); range grows with roof height, with a minimum range for raised towers. M toggles a map debug view.
  - A decorative backdrop city out to the rivers (70k footprints baked to 16 m / 32 m height grids, LOD by distance), a gradient sky and horizon haze (D027, Stefan's request).
  - City Hall hit feedback (flash, Integrity-scaled shake, HUD pulse), from playtest 2.
  - Balance re-tuned for the new tower spots: bug HP ×1.7 from wave 3; gentler height bonus (see Known issues).
- Real building heights (pulled forward from Pass 6 at Stefan's request, D019): per-tile heights from City of Philadelphia footprints, with OSM buildings filling the gaps (the Convention Center and Comcast Technology Center are missing from the city data). Drawn with the √ height curve from DESIGN §4. Open lots show as low grey slabs.
- 28 agent skills installed in `.agents/skills` (symlinked into `.claude/skills`). All kept (D018); see [TOOLING.md](TOOLING.md).

## In progress
- Pass 5. Playtest 1 (Stefan, 2026-09-26): "a little easy, adjust later"; mobs and towers need to be more prominent (bigger, glow); mobs should stay visible behind buildings; wants WASD pan + Q/E rotate.
  - Done: bigger, self-lit mobs (acid green) with an additive halo, and an x-ray silhouette where a building hides them (D023). Mobs scale up with camera distance so they stay readable zoomed out; towers get half that. Towers bigger and self-lit with a glowing roof ring. WASD pans relative to the view, Q/E orbit (D023).
  - Done: sell (70%) with free undo of this prep's builds; click a tower to select it (range disc, kills, Sell, Esc); hover shows range and sell value; right-click sells. HP bars on damaged bugs, death pops, screen shake on barricade breaks. Wave intel panel. 10 waves over 3 stations (Race-Vine; 11th Street from wave 4; Walnut-Locust from wave 6), tuned harder (see Known issues).

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

## Deferred from Pass 6
- Sidewalk tiles (DESIGN §4 tile types): corners are street-level spots at intersection corners instead.
- Rivers and backdrop streets (IDEAS, Pass 10). Landmark models (Pass 10).
- Overture fallback for heights: OSM covered the gaps we found.
- Very short stub streets (runs under ~7 tiles) merge into the segment they join, so they share its one-barricade limit.

## Deferred from Pass 5
- Tracers are still 1-px lines (WebGL line width); thicker tracers need mesh lines or bloom (Pass 10).
- Next-wave breach telegraph ("Tremors under 15th St") and interest/debrief summary: Pass 9.

## Deferred from Pass 4
- Tower height range bonus and roof pads: Pass 6.

## Deferred from Pass 3
- Mobs that are mid-step onto a tile when a barricade lands there finish the step and walk out of it.

## Deferred from Pass 2
- Losing at Integrity 0 (Pass 4). Integrity just stops at 0.
- Mobs pass through each other (no crowding or separation).

## Known issues / tech debt
- Balance after Pass 6 (headless bot on the real map, no barricades): two towers only → lost in wave 6; a bot that keeps buying well-placed towers on pads/corners → won with ~37 Integrity, damage from wave 6 on. Street corners put towers right on the route, which is why HP went up ×1.7. Needs a playtest.
- (Pre-Pass 6) Balance, 10 waves (headless check on the real map, throwaway script, no barricades): no towers → lost in wave 5; two towers only → lost in wave 7; a bot that keeps buying well-placed MG Nests → won with ~30 Integrity, damage from wave 8 on. Humans can do better with barricades (merging routes into kill zones). About 6 min calling every wave early, about 11 min waiting out prep. Needs playtest 2.
- The HUD's per-station route lines and the station labels can overlap the HUD panel on small windows.
- A sawhorse (100 HP) falls to a 20-bug stream in ~4 s. Matches "for steering, not holding", but tune in Pass 5.
- Testing note: pointer events dispatched from scripts get halved `offsetX/Y` on this HiDPI Chrome and confuse the camera controls. Test placement with real input: `__cd.focusTile(tx, ty)`, then DevTools `click`/`hover` on the "City map" element (it hits the canvas centre).
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
| 3 | 2026-09-26 | ✅ typecheck, lint, 25/25 tests (span, detour, siege at the cheapest barricade, no oscillation). Real clicks in Chrome: +376 m preview matched the placed route (416 → 792 m), swarm rerouted, sealed station → siege on the cheaper sawhorse. Recompute ≈3.4 ms. 60 fps | [pass-03.png](screenshots/pass-03.png) | Tests caught a float-dust bug (band 0 with 1e-13 HP) |
| 4 | 2026-09-26 | ✅ typecheck, lint, 27/27 tests (scripted run: phase sequence + seeded replay; a run can be lost). Real clicks: rooftop MG Nest placed and paid for, "Start wave" button, wave 1 cleared 12/12 with cash reconciling exactly. Headless balance on the real map (see Known issues). 60 fps | [pass-04.png](screenshots/pass-04.png) | First playable |
| 5 | 2026-09-26 | ✅ typecheck, lint, 28/28 tests (+ free undo vs 70% sell). Real clicks: select tower → panel → Sell ($100 during the same prep; $70 after). WASD/QE via real key presses. Shake starts and settles with no camera drift. Intel panel lists wave 6's three stations. 60 fps | [pass-05.png](screenshots/pass-05.png) | Playtest 1 feedback applied; a shake bug (restart detection by tick order) found and fixed in the browser |
| 5b | 2026-09-27 | ✅ review/refactor (D025): 31 files, −189 lines net. typecheck, lint, 28/28 tests. `map:build` output byte-identical. Real clicks: build, select, Restart (now also clears the selection panel). Scripted wave 1 cleared, cash reconciles, 61 fps | – | Structure only, no gameplay change |
| 5c | 2026-09-27 | ✅ City Hall hit feedback: red flash, shake that grows as Integrity drops, HUD Integrity pulses on each hit and turns red under 25. Checked in Chrome by stepping to a hit (flash visible, shake measured) | – | Playtest 2 request |
| 6 | 2026-09-27 | ✅ typecheck, lint, 33/33 tests (+ street graph, pads, one barricade per block, height range). map:build 1.3 s incl. backdrop. Real clicks: tower on a corner (street level) and on a pad (range 82 m / min 9 m on a 19 m roof), M debug view. Backdrop + sky at 60 fps; live wave 60 fps. Headless re-balance | [pass-06.png](screenshots/pass-06.png), [backdrop](screenshots/pass-06-backdrop.png) | Includes City Hall hit feedback and Stefan's backdrop/sky request |
