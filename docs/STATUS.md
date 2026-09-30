# City Defender — Status

> **Agents: read this first after CLAUDE.md**, and update it at the end of every pass.

**Last updated:** 2026-09-30
**Current pass:** Pass 10a (Buildings and City Hall): **done**, tagged `pass-10a`. Pass 9 playtested by Stefan (2026-09-30): "It was okay", no balance changes asked for.
**Next up:** Pass 10b (bug and tower models, VFX, postprocessing, day/night), then 10c (audio, performance pass). 
**Live preview:** https://claude.ai/artifact/6AoAPfL6V4FJSgBgNwA5d7 (private; republished at the end of each pass)

## Done
- Livelier city (Stefan, 2026-09-30): varied facades from 37 style presets (D051); cars, pedestrians and street trees that flee from bugs (D052); rendering budget work after Stefan saw 30 fps (D053: that was Chrome's Energy Saver on a 14% battery; the game itself now costs 3.3–4.7 ms GPU per frame at full clock, down from 4.3–5.1 before these changes). Checked in Chrome via DevTools MCP.
- Tactical view (Stefan, 2026-09-30, D050): T or the grid button next to the speed button squashes all buildings to 12% height and glides the camera to near top-down; towers and markers stay on the squashed roofs. T again goes back. Checked in Chrome via DevTools MCP: whole-level board view, a tower on a 118 m roof follows the squash both ways.
- Route focus (Stefan, 2026-09-30, D049): click a route line (it works even when buildings hide it) or a station name in the wave intel; the camera glides to frame the whole route and buildings in front of it fade almost completely. Esc lets go. Checked in Chrome via DevTools MCP with real clicks: the hidden Suburban Station route along JFK, the Race-Vine route; 60 fps at dpr 2.
- After 10a (Stefan, 2026-09-30, D047): **15th Street station removed** (too close to City Hall); its wave 11–20 grub breach now comes from **Suburban Station**. **Camera can't pan past the map edges** (the point in the middle of the view stays inside the level). Checked in Chrome via DevTools MCP: 11 spawns, "Tremors under Suburban Station" in wave 10, wave 11 grubs leave Suburban Station; focusing 2 km west and holding W both stop at the edge.
- Pass 10a: buildings and City Hall (tag `pass-10a`, D046).
  - **Real 3D shapes from OSM `building:part`**: setback tiers and roofs. 478 parts replace 87 footprints (Liberty Place's crowns, Comcast towers, podiums). Roof shapes: gabled, hipped (also quadruple saltbox), pyramidal, mansard, skillion, dome/onion, cone, round, as faceted planes (`render/roofShape.ts`, tested).
  - **City Hall** built from its OSM relation and 30 parts with hand-set heights (`osmTagOverrides` in `tools/map/cities/philly.json`): marble block with courtyard, pavilions with slate mansards and pyramids, clock tower, cupola, gold William Penn at 167 m. Still flashes red on hits. The plaza around it is a warm grey now.
  - **Procedural windows** in the building shader (brick, stone, glass, parking and landmark styles), fading to their average colour at distance so they don't shimmer. Colours from OSM where tagged, otherwise seeded palettes by height. **Parapets** on flat roofs, seeded **rooftop boxes** (kept clear of roof pads).
  - The **backdrop** uses the same palettes and windows, so the city past the level edge matches.
  - **Towers stand on the drawn roof**: `buildings.json` v1 carries the drawn roof height per tile (`roofRows`), used for towers, pads, labels and picking. The sim's heights are unchanged (city.json is identical apart from the OSM timestamp).
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
- Pass 9: full run structure (tag `pass-09`, D042–D045).
  - **20-wave Philadelphia script** after DESIGN §9: Race-Vine alone, then 11th Street (beetles), Walnut-Locust (spitters), wasps at 9, the **Beetle Matriarch** at 10, **15th Street breaches** at 11 (grubs), elite affixes from 15 (Armored, Hasted, Regenerating), **13th Street** at 16, and the **Brood Mother** at 20 (births 6 skitterlings per quarter of HP lost, crushes Sawhorses on contact). Breaching stations are telegraphed a wave ahead ("Tremors under 15th Street").
  - **Council Grants** every 5 waves: pick 1 of 3 (11 Philadelphia grants in `grants.json`; the effects are generic sim mechanics).
  - **Interest** at each debrief (5% of banked cash, capped at $50), shown on the phase chip. **Barricade repair** for cash during prep or a wave (click a wall with no tool: HP, Repair, Upgrade, Sell).
  - **Tier-3 branches**: Railgun (Penetrator: pierces a line; Spotter: marked bugs take +30%), Mortar (Cluster Shells; Incendiary: burning ground), MG Nest (Twin Guns; AP Rounds pierce armor).
  - **Stars, score and end-of-run stats**; the run **autosaves at every prep** and offers to continue on load (versioned; the game waits while you choose).
- Pass 8: fliers, diggers, sappers (tag `pass-08`, D036–D038).
  - Bugs have a layer. **Wasp Drones** fly at roof height on a barricade-free route field (walls and ground-only towers don't stop them). **Tunneler Grubs** travel under the streets on the same field, buried and untargetable except for 3 s after crossing a manhole and for good within 10 tiles of City Hall; they show as a moving mound of earth. **Acid Spitters** stop once a wall on their route is within 48 m and melt it from there.
  - Towers attack by type (`attack` in the table): **Flak Battery** (air-only splash shells), **Tesla Coil** (chain lightning to 3 more bugs, hits air, +1 jump off a Wet bug), **Seismic Pulse** (hits everything around it, forces buried grubs up for 3 s and stuns them). Cryo now also makes bugs Wet. Each tower lists what it can hit (ground, air).
  - Barricades: **Bus Wall** (1200 HP) and **Blast Wall** (3000 HP, repairs to full before every wave) extend the upgrade chain; **Spike Strip** is a trap that doesn't block or reroute, hurts every crawler crossing and wears out after 40 crossings. Prices are **per tile of street width**, so blocking Broad costs more than a side street; the preview shows the price.
  - Wave script: wasps from wave 2, grubs from 4, spitters from 5, all three in the late waves.
- Tower placement snapping (Stefan, after Pass 7, D035): with a tower tool picked, the preview snaps to the nearest free spot that tower can use within 4 tiles of the pointer, drawn as a see-through model of the tower on a pulsing ring plus its range. No spot in reach: no preview, no label, clicks do nothing. The only label left is money ("needs $100"). Spot markers for the picked tower grow and brighten; the others hide. A click builds exactly where the preview is. Screenshot: [placement-snap.png](screenshots/placement-snap.png).
- Pass 7: data-driven roster I (tag `pass-07`, D032–D034).
  - Balance tables with zod schemas (`src/data/schema.ts`), checked by `schema.test.ts`; the sim imports only the inferred types.
  - Towers: MG Nest (kinetic, pads + corners), **Mortar** (explosive splash, shells land where the target was, 40 m minimum range, pads), **Cryo Sprayer** (slows everything in a cone, corners), **Railgun** (pierces armor, long range that grows most with height, pads). Each has two tiers (upgrade in the tower card) and a targeting mode (first, last, strongest, weakest, closest).
  - Bugs: Skitterling (new bug shape, faces where it walks) and **Carapace Beetle** (armor 6, slow, 5 Integrity per leak, 3× barricade damage, gold). Armor is flat reduction per hit with a 25% floor; pierce ignores it (`sim/damage.ts`).
  - **Jersey Barrier** (400 HP): build it directly or click a sawhorse with it to upgrade in place for the difference ($65); damage taken stays taken.
  - Shots: MG tracers, violet rail beams, icy spray cones, mortar shells arcing to an orange splash ring. Slowed bugs turn ice blue. Bug halos fade when zoomed in so shapes read up close.
  - Build bar lists all six from the tables with stats cards; wave intel names the bug type.
  - Waves: beetles from wave 3, beetle-heavy waves 9–10 (see Known issues for the balance run).
- UI + performance pass (6b, Stefan's request, D031):
  - Top right: an overhead minimap (street grid, City Hall, this wave's stations pulsing, their routes, live bugs, towers, barricades, the camera's view; click to move the camera), with one big speed button under it that cycles pause / 1× / 2× / 3×.
  - Bottom: a build bar (Police Sawhorse, MG Nest). Hovering shows stats; click picks the tool, Esc puts it down. Towers and barricades are only built with a tool picked.
  - Top left: a status HUD (City Hall integrity bar, cash, wave + phase, Start wave, wave intel, bugs/kills/leaked). No instructions anywhere; no restart button in the HUD.
  - Tick, seed, speed, sim time, renderer, FPS meter, map debug view, Restart and New seed live in the debug menu (gear, bottom left).
  - Performance: see the pass log and D031. The game is well inside budget; no renderer changes were needed.
- Real building heights (pulled forward from Pass 6 at Stefan's request, D019): per-tile heights from City of Philadelphia footprints, with OSM buildings filling the gaps (the Convention Center and Comcast Technology Center are missing from the city data). Drawn with the √ height curve from DESIGN §4. Open lots show as low grey slabs.
- 28 agent skills installed in `.agents/skills` (symlinked into `.claude/skills`). All kept (D018); see [TOOLING.md](TOOLING.md).

## In progress
- Pass 5. Playtest 1 (Stefan, 2026-09-26): "a little easy, adjust later"; mobs and towers need to be more prominent (bigger, glow); mobs should stay visible behind buildings; wants WASD pan + Q/E rotate.
  - Done: bigger, self-lit mobs (acid green) with an additive halo, and an x-ray silhouette where a building hides them (D023). Mobs scale up with camera distance so they stay readable zoomed out; towers get half that. Towers bigger and self-lit with a glowing roof ring. WASD pans relative to the view, Q/E orbit (D023).
  - Done: sell (70%) with free undo of this prep's builds; click a tower to select it (range disc, kills, Sell, Esc); hover shows range and sell value; right-click sells. HP bars on damaged bugs, death pops, screen shake on barricade breaks. Wave intel panel. 10 waves over 3 stations (Race-Vine; 11th Street from wave 4; Walnut-Locust from wave 6), tuned harder (see Known issues).

## How Claude builds and checks things (Claude Code on the Mac, since 2026-09-26)
- 2026-09-30: this checkout was freshly cloned, and the Chrome DevTools MCP wasn't configured here; Stefan added it (`claude mcp add chrome-devtools --scope user -- npx chrome-devtools-mcp@latest`) and it works. The Blender MCP (local scope) is `uvx mcp-for-blender` with the "MCP for Blender" add-on; Blender Lab's own "MCP" extension also uses port 9876 and must stay disabled or the server hangs on connect. Pass 10a was checked in real Chrome driven headlessly by a throwaway puppeteer-core script (installed in the session scratch folder, not the project) against `npm run dev`, with Metal/ANGLE: screenshots, console, `window.__cd`, frame times.
- 2026-09-30: `tools/map/cache/` was missing on this Mac (it's gitignored); `map:build` re-downloaded everything and produced byte-identical city/buildings/backdrop files apart from the OSM timestamp.
- Development moved from Cowork to **Claude Code running directly on Stefan's Mac** (see D010). npm, vitest, eslint and the dev server run natively in the project folder. The Cowork workarounds (a scratch copy of the project for Linux builds, checking the game through a published artifact) are no longer needed.
- Checking the game: `npm run dev`, then Chrome DevTools MCP against `http://localhost:5173` (console, screenshots, `window.__cd`, performance traces).
- The HUD shows runtime errors on screen (red panel) and a Renderer line, so problems show up in screenshots.
- Sharing: `npm run build:preview` still writes a single self-contained HTML (`dist-preview/city-defender-preview.html`, dev mode, with `window.__cd` and the error panel). Claude republishes it to the live preview artifact at the end of each pass so Stefan has a link to try: the artifact page is `scripts/preview-artifact.html`, which iframes the build published beside it as `game.html`.
- Git: one commit per pass, tagged `pass-NN` (see D011).

## Open questions for Stefan
- None right now. (Sim heights vs drawn roofs is parked for the end of the project: IMPLEMENTATION_PLAN, "Final polish & playtest".)

## Deferred from Pass 1 (planned for Pass 6 unless noted)
- Footprint meshes (heights are per tile for now), street widths from lanes, alleys, slots, street graph.
- The goal block is ~180 m square (City Hall plus Dilworth Park), because the west side of Penn Square has no mapped road. Pass 6 can use the real City Hall footprint.
- Diagonal streets (the Parkway) rasterize as stair-steps and a bit fat.
- Camera isn't clamped to the level bounds (camera work is Pass 4–5).
- Street labels are dense when zoomed out; no label culling or level-of-detail yet.

## Deferred from Pass 10a
- Shadows and lit night windows (IDEAS, Pass 10b). Hand-modelled landmarks beyond City Hall: the OSM parts already give Liberty Place, the Comcast towers and others real shapes; revisit if one needs more.
- Parts hidden inside footprints they cover < 60% of, skybridges, pitched roofs over courtyards (drawn flat). See IDEAS.
- City Hall's real details (clock faces, dormers, statue shape): the parts give the massing only.

## Deferred from Pass 9
- Splitting and Shielded elites (DESIGN §6); only Armored, Hasted and Regenerating so far.
- "Rooftop Access Permits: +1 pad on every tower building" (DESIGN §10.6) became +10% roof range: adding pads at runtime changes the slot layout.
- A debrief summary panel (kills, leaks, damage taken); the phase chip shows interest only.
- Barricade skins per city (SEPTA bus) and grant names per city are data-ready; only Philadelphia content exists.

## Deferred from Pass 8
- Acid Spitters damaging corner towers (DESIGN §6 "beats corner towers"): towers have no HP yet.
- Diggers surfacing through the underground concourse network, sewer-burst events (IDEAS).
- City skins for barricades (DESIGN calls T3 the "SEPTA Bus Wall"; the table says "Bus Wall" and the SEPTA look belongs in Philadelphia's city data, see the multi-city note).
- Wasp and grub animations (wing flap, burrowing dirt), real models (Pass 10).

## Deferred from Pass 7
- Tier 3 branching upgrades (Pass 9). Cryo "wet" + Tesla synergy (Pass 8). Width-scaled barricade cost (Pass 8).
- Mortar craters that slow (a DESIGN §7 upgrade idea); mortar shells don't lead moving targets (they land where the target was, on purpose).
- Walk animation and real models for bugs and towers (Pass 10). Swarms still render as a single file along the tile centre line.
- `balance-data` project skill (TOOLING.md): write it once the tables settle after Pass 8.

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
- Perf measuring caveat (2026-09-30, D053): on battery, Chrome's Energy Saver caps every page at 30 fps (a blank page too), and Apple GPUs then clock down to fill the frame, so frame and GPU times stop meaning anything. Check `pmset -g batt` first; to compare GPU cost, render each frame several times inside one timer query (see D053). The dev machine is now an M4 MacBook (Chrome, ANGLE Metal).
- Fixed 2026-09-30: flickering windows and rooftops (Stefan). Overlapping shapes drew two roofs and two facades in the same plane (z-fighting), and parapets shared a plane with neighbours' walls. map:build now cuts covered areas out of lower shapes and parapets have thickness (D048).
- Pass 10a: the sim/drawn height mismatch on setback pads; a tower's range uses the sim height. Parked for final polish (IMPLEMENTATION_PLAN, "Final polish & playtest").
- Balance after Pass 9 (throwaway headless bot on the real map, no barricades, grants by preference, tier-3 upgrades): waiting out every prep → **won with 30 Integrity in 26 minutes** of game time; calling every wave early → won with 8 in 15 minutes. The curve is gentle to wave 11 and bites from 12 (the inner stations breach next to City Hall). The Brood Mother comes from Race-Vine: from 15th Street she reached City Hall almost untouched. Needs Stefan's playtest (acceptance: finish one run, lose one).
- Fixed 2026-09-29: a sharp edge along the bottom of the camera cutaway, worst at shallow angles (Stefan). The cutaway now eases out below the sight line and near the target (D041).
- Fixed 2026-09-29: moving the mouse dithered buildings under the pointer (Stefan). The cutaway now follows the camera only, never the mouse (D040); the centre-of-screen cutaway (D030) is unchanged.
- Balance after Pass 8 (throwaway headless bot on the real map, no barricades, calls every wave early): MG Nests only → lost in wave 8; the Pass 7 mix (MG, Mortar, Cryo, Railgun) → won with 14 Integrity but let every wasp through; a Pass 8 mix (adds Flak and Seismic on the wasp and grub routes) → stopped every wasp and all but 2 grubs, then lost in wave 10 with $734 unspent (the bot stops buying when a Flak or Seismic spot isn't useful). The bot is sensitive to small strategy changes, so treat these as direction, not precision. Needs a playtest.
- Sim matchup tests (`matchups.test.ts`): walls + Mortar + Cryo stop a swarm but not one of 30 wasps; one Flak stops most; two MG Nests let 12 of 12 grubs through, with a Seismic Pulse 0; a guarded Jersey Barrier holds a swarm but spitters melt it from outside the guards' reach, and a Railgun behind it keeps it standing; Cryo + Tesla out-kill Tesla alone.
- Balance after Pass 7 (throwaway headless bot on the real map, calls every wave early, no barricades): MG Nests only → lost in wave 8 (beetles shrug off MG chip damage); a mixed bot (mortars, railguns once beetles are coming, one cryo, upgrades) → won with 27 Integrity and $840 unspent. Needs a playtest.
- Sim matchup test (`matchups.test.ts`, one tower alone on a straight street, kills per $100): vs a tight swarm Mortar 22.9, MG 7.0, Railgun 5.8; vs 16 beetles Railgun 7.1, Mortar 2.3, MG 1.0.
- Perf measuring caveat (2026-09-27): halfway through the perf check the Mac dropped to `CPU_Speed_Limit = 28` (`pmset -g therm`) with Messages, Spotlight and Photos indexing busy; every scene, even with no bugs drawn, fell to ~35 ms frames and there were multi-second stalls. Check `pmset -g therm` and Activity Monitor before trusting a perf number.
- Chrome's CPU profile charges ~6% of main-thread time to the minimap's `draw` even when it returns immediately (it is the first rAF callback of the frame and absorbs the browser's own work). Measured directly it costs 0.18 ms per redraw at 20 Hz. Don't chase it.
- 2026-09-27 (after pass-06): buildings drawn at real height (D029), see-through cutaway for buildings between the camera and the focus / cursor (D030). Both from Stefan's feedback.
- Fixed 2026-09-27: streets flickered while moving the camera (Stefan). Z-fighting between the level asphalt and the backdrop ground 5 cm below it, made worse by the larger far plane. Backdrop ground now 3 m lower with polygon offset, camera near plane 1 → 4 m, lane lines lifted to 25 cm.
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
| 6b | 2026-09-27 | ✅ typecheck, lint, 33/33 tests. UI checked with real hover/clicks. Perf at 1440×900 (dpr 2): dev build idle 60 fps, 26 draw calls, 507k tris, 65 MB heap; 400 bugs + 10 towers at 3× 60 fps, 929k tris, 72 MB. Production build: idle 60 fps / 23 calls / 42 MB heap; heavy 60 fps apart from one stall that coincided with macOS CPU throttling. Main-thread JS per frame ~1.3 ms (dev) | [ui-pass.png](screenshots/ui-pass.png) | Minimap: static layer cached, overlay at 20 Hz. Dev hook: `renderInfo()`, `setVisible(name, on)`, `build` picks a tool |
| 7 | 2026-09-27 | ✅ typecheck, lint, 50/50 tests (+ damage formula, table schemas, matchups: Mortar vs swarm, Railgun vs beetles). Real clicks: select a Railgun, Upgrade $200 → tier 2 (172 m), targeting dropdown, Cryo refused on a roof pad. Sawhorse → Jersey upgrade keeps damage (60/100 → 360/400). Wave 3 with beetles played in Chrome. 400 bugs (80 beetles) + 12 mixed towers at 3×: 60 fps, p95 17.6 ms, 37 draw calls | [pass-07.png](screenshots/pass-07.png) | Headless re-balance with beetles |
| 8 | 2026-09-27 | ✅ typecheck, lint, 62/62 tests (+ per-bug matchups, width cost, spike wear, Blast Wall repair). Chrome: all seven towers placed, a mixed wave of wasps, grubs and spitters played; Jersey Barrier on Broad rerouted the route via 15th, spike strip beside it. 420 bugs of five types + 14 towers of seven types at 3×: 60 fps, p95 17.4 ms, 52 draw calls | [pass-08.png](screenshots/pass-08.png) | Headless re-balance with the new bugs |
| 9 | 2026-09-29 | ✅ typecheck, lint, 74/74 tests (+ grant phase, interest cap, save/resume replays exactly, Brood Mother thresholds, tier-3 branch + Penetrator line). Chrome: resume prompt (paused) → Continue restored wave 10; breach telegraph and Matriarch in intel; Penetrator chosen by real click; Incendiary fire under the Matriarch; wall Repair $53; Federal Grant picked by real click; end screen ★★ with score. Wave 20 finale at 3×: 60 fps, p95 17.9 ms | [pass-09.png](screenshots/pass-09.png) | Headless re-balance of the 20-wave script |
| 10a | 2026-09-30 | ✅ typecheck, lint, 82/82 tests (+ roof shapes: gable/hip/mansard/dome heights, gable wall breaks, facets tile a concave footprint). map:build 0.9 s from cache; city.json unchanged. Chrome (headless, Metal): no errors; towers built on setback pads stand on the drawn podium/roof; single-file preview runs. dpr 2: idle 60 fps, 286 bugs at 3× 60 fps (p95 16.8 ms), 20–24 draw calls, 560k tris; building mesh ~60 ms at load | [pass-10a.png](screenshots/pass-10a.png) | Pass 9 playtest: "It was okay" |
