# City Defender — Decision Log

> Short, dated, append‑only. Newest at the bottom. Format: **ID · date · decision** / why / consequences.
> Change a decision by adding a new entry that supersedes the old one; don't edit history.

**D001 · 2026-09-26 · Generate maps from open data instead of adapting existing game maps.**
Why: existing Minecraft/Cities: Skylines maps are OSM underneath or generic, lack semantics (street vs building), and have unclear or unfavorable reuse rights. Google Photorealistic 3D Tiles forbid caching, offline use and deriving geometry. Details: [research/map-sources.md](research/map-sources.md).
Consequences: we own an offline pipeline (`tools/map/`). Attribution "© OpenStreetMap contributors" is required in‑game.

**D002 · 2026-09-26 · Tile grid (8 m) + derived street graph.**
Why: tiles make placement, rasterization and flow fields simple, and the graph gives barricade slots and the sewer network.
Consequences: the grid is rotated to Penn's street grid, and streets are 2–4 tiles wide.

**D003 · 2026-09-26 · Barricades are HP‑weighted path costs, not walls ("siege rule").**
Why: one Dijkstra handles detours, sieges and fully sealed maps with no "invalid placement" rule.
Consequences: flow field recompute on barricade events and 25% HP bands. See DESIGN §5.3.

**D004 · 2026-09-26 · Stack: Vite + React + TypeScript + React Three Fiber + drei + zustand. Sim in plain TS, render only reads.**
Why: Claude writes R3F following best‑practice skills, and Stefan reviews framework‑free sim logic. Deterministic sim allows tests and replays.
Consequences: no game rules in React components, no per‑frame setState, InstancedMesh for crowds.

**D005 · 2026-09-26 · Build in incremental passes. Map generator is deliberately crude in Pass 1 and upgraded in Pass 6.**
Why: avoid getting stuck perfecting the map before the game is fun.
Consequences: Plan B ASCII map allowed in Pass 1. See IMPLEMENTATION_PLAN.

**D006 · 2026-09-26 · Barricades placeable only during prep. Towers placeable anytime.**
Why: keeps the maze a planning puzzle and avoids mid‑wave juggling exploits, while keeping classic tower defense responsiveness.
Consequences: repairs are allowed mid‑assault for cash. A "Police Line" active ability is the planned exception (IDEAS).

**D007 · 2026-09-26 · Map pipeline in Node/TypeScript (tsx), one language across the repo.**
Why: simpler for agents and tooling. Python (osmnx) stays optional if graph cleanup gets hard.
Consequences: use `osmtogeojson`, `@turf/turf`, `mapshaper`, `@gltf-transform/cli`.

**D008 · 2026-09-26 · Light testing policy.**
Why: Stefan expects heavy churn during development and doesn't want test upkeep to slow passes down.
Consequences: occasional focused unit tests for important or tricky logic only. Real tools only, no simulated test runs.

**D009 · 2026-09-26 · Preview via single-file build published as a private artifact.**
Why: Claude can't open `file://` or the Mac's localhost in Chrome, while an artifact URL works everywhere and gives Stefan a link to try each pass.
Consequences: `npm run build:preview` + `scripts/inline-build.mjs`. `dist-preview/` is gitignored.

**D010 · 2026-09-26 · Develop in Claude Code on the Mac. Check the game on the dev server with Chrome DevTools MCP. Partly supersedes D009.**
Why: Claude Code runs natively on the Mac, so npm works in the project folder and Chrome DevTools MCP can open `localhost:5173`. Cowork needed a scratch copy of the project (Linux binaries) and a published artifact to see the game.
Consequences: no scratch copy. The single-file preview artifact stays, but only as a shareable link republished at the end of each pass, not as the way Claude checks the game.

**D011 · 2026-09-26 · Git from Pass 0: one commit per pass, tagged `pass-NN`.**
Why: Stefan approved it. Tags give a known-good snapshot of every pass to diff against or roll back to.
Consequences: commit only at the end of a pass (or when Stefan asks). `node_modules/`, `dist*/` and `tools/map/cache/` stay out of git.

**D012 · 2026-09-26 · The goal is the whole block containing the landmark's coordinate, found by flood fill.**
Why: the plan's "tiles within ~40 m of City Hall" sits inside the building, so it isn't adjacent to any street and mobs could never reach it. The flood-filled block always borders the ring road.
Consequences: `map:build` fails loudly if the block exceeds 1,600 tiles (ring road not closed). Stations inside the goal block (City Hall station) are dropped.

**D013 · 2026-09-26 · Level bounds are given as street names; generated city data lives in `public/cities/<city>/` and is fetched at runtime.**
Why: naming the boundary streets (Vine, Spruce, 18th, 8th) puts the level edges exactly on streets after rotation, which a lat/lon box can't. Keeping data in `public/` matches the plan for later GLB assets.
Consequences: per-city settings live in `tools/map/cities/<city>.json`. The single-file preview inlines the city JSON as `window.__CD_INLINE__` (`scripts/inline-build.mjs`, read by `src/loadCity.ts`).

**D014 · 2026-09-26 · Many map labels go through one DOM layer (`render/LabelLayer.tsx`), not one drei `<Html>` each.**
Why: 114 `<Html>` labels dropped the scene to 26 fps and each created its own React root (StrictMode unmount warnings). One layer that updates transforms only when the camera moves runs at 60 fps.
Consequences: use `<Html>` only for a handful of interactive overlays. Flat ground text (troika `Text`) is an option later if we bundle a font.

**D015 · 2026-09-26 · Performance target: 60 fps in Chrome on Stefan's iMac.**
Why: Stefan confirmed it as the target machine.
Consequences: every pass is checked for 60 fps there (Chrome DevTools MCP against the dev server). The Pass 2 goal of 200 mobs and the Pass 10 goal of 500 mobs plus effects are measured on it.

**D016 · 2026-09-26 · Prep is timed: 30 s to start with.**
Why: Stefan's call. It supersedes the draft design, where prep was untimed and a timer was only a mutator.
Consequences: the prep length is a balance number in `src/data/` (Pass 4), tuned in the Pass 5 playtest. "Call wave early" ends the countdown and pays a bonus for the time skipped. Barricades are still prep-only (D006), so 30 s must be enough to place a few. Watch this in playtests.

**D017 · 2026-09-26 · Develop and verify with the real dev environment and real data. Simulation code is for unit tests only.**
Why: Stefan clarified his "don't want simulation code" remark. In Cowork the game couldn't run in a browser, so work was checked against stand-ins. Writing simulation code for unit tests is fine.
Consequences: features are developed against `npm run dev` in real Chrome with the generated OSM city data. ASCII fixture maps stay in `src/sim/__fixtures__/` for unit tests only. The `src/sim/` split and occasional tests (D004, D008) stand.

**D018 · 2026-09-26 · Keep all 28 installed skills.**
Why: Stefan saw no reason to remove the 6 flagged ones. Skills only load when relevant, so unused ones cost nearly nothing, and the vanilla three.js and shader skills hold useful background knowledge.
Consequences: CLAUDE.md's "prefer `r3f-*` over `threejs-*`" rule covers the one risk (vanilla three.js setup patterns in an R3F app).

**D019 · 2026-09-26 · Real building heights now, ahead of Pass 6.**
Why: Stefan found the uniform blocks looked off. Heights matter to the "recognizable place" pillar and to rooftop tower range later.
Consequences: `map:build` also caches City of Philadelphia footprints (ArcGIS, `approx_hgt` in feet; `max_hgt` is polluted by neighbouring towers) and OSM building outlines. Each tile takes the tallest footprint covering ≥25% of it, from the city data first and OSM where the city has none. City data lacks some landmarks (the Convention Center, Comcast Technology Center). Heights are stored as real metres (`heightRows` in city.json). Display uses `k·√h` with k in `src/data/map.json` (k = 4: 12 m → 14 m, 340 m → 74 m). Footprint meshes, street widths and slots stay in Pass 6.

**D020 · 2026-09-26 · Pass 2 pathing: one breadth-first distance field from the goal, with seeded random tie-breaks.**
Why: the plan said "BFS path from spawn to goal". A single search outward from all goal tiles gives every street tile its distance, so one field serves every station, and mobs just step to a neighbour one closer. It has the same shape as Pass 3's flow field, so Pass 3 only changes the cost function. Random tie-breaks (seeded RNG) spread a swarm over the lanes and keep replays deterministic.
Consequences: `sim/flow.ts` (`goalDistanceField`), recomputed only when the map changes. Mobs move tile centre to tile centre (4-neighbour). The renderer interpolates by the stepper's `alpha` and adds a stable per-mob offset so a swarm doesn't render as one ball.

**D021 · 2026-09-26 · Flow field and siege numbers (Pass 3).**
Why: implements D003 with integer costs so equal routes tie exactly and replays stay deterministic.
Consequences: Dijkstra from the goal tiles; stepping onto a tile costs `tileCost (1) + round(barricadeCostPerHp (0.5) × bandedHp)`, where HP is rounded up to the barricade's current 25% band. A full sawhorse (100 HP) is worth a 50-tile (400 m) detour. Band 0 counts as destroyed. Barricade span = the shorter contiguous street run through the clicked tile, max 6 tiles (wider usually means an intersection), never on a station. All numbers in `src/data/rules.json` and `barricades.json`; siege DPS per mob in `mobs.json`. Dev-only `__cd.focusTile` exists so agents can test placement with real clicks.

**D022 · 2026-09-26 · Pass 4 run loop, economy and input.**
Why: first playable with the fewest moving parts.
Consequences:

- The phase machine lives in `sim/phase.ts` ('idle' = sandbox/tests, then prep → assault → debrief → … → won/lost). Barricades can be placed and dismantled only in prep (or idle), with a full refund until Pass 5's sell/undo rules. Towers can be built any time.
- One click does both: street → sawhorse, rooftop overlooking a street → MG Nest. No build menu yet.
- Tile picking marches the pointer ray through the display-height grid instead of raycasting ~15k instanced boxes.
- Waves name stations (`waves.json`) and the game resolves them to spawn indices, so the sim stays city-agnostic.
- Balance was tuned with a headless run of the sim on the real map (no towers / two towers / keep buying). The permanent autoplayer is still Pass 9.
- Routes and ghost routes cover every station active in the current wave, completing Pass 3's "ghost path from each active spawn".

**D023 · 2026-09-26 · Unit visibility and keyboard camera (playtest 1).**
Why: Stefan found mobs and towers hard to see and wanted bugs visible behind buildings, plus WASD/QE camera keys.
Consequences:

- Mobs are drawn in three instanced passes sharing one geometry and one matrix per mob: a self-lit body, an additive halo (fake glow; real bloom stays in Pass 10), and an x-ray pass that uses the same sphere with a flat unlit material and `depthFunc = GreaterDepth`, so it draws only where something is in front. This is the standard two-pass "occluded silhouette" shader (Unity's `ZTest Greater` pass). three.js has no multi-pass materials, so the extra pass is a second InstancedMesh: one extra draw call for all mobs, not per mob.
- Alternatives considered: the postprocessing Outline effect's `xRay` mode (outlines through walls; revisit with the Pass 10 postprocessing stack if we prefer outlines to fills), a stencil pass (same cost, more setup), and "always on top" (loses depth cues).
- Mobs scale with camera distance beyond 300 m so they stay readable zoomed out; towers get half that.
- Keyboard camera: WASD pans relative to the view, Q/E orbit the target. Keys are matched by `KeyboardEvent.code` (layout-independent), ignored while typing, cleared on blur, and a tap moves at least one frame.
- Dev: `__cd.focusTile(tx, ty, { distM, pitchDeg, yawDeg })` for reproducible screenshots.

**D024 · 2026-09-26 · Pass 5 economy and feedback details.**
Why: finish the MVP loop from the plan with playtest 1's "a little easy".
Consequences:

- Selling refunds 70% (`sellRefund`), except builds placed during the current prep, which refund 100% ("free undo", DESIGN §3.1). Towers sell any time; barricades only in prep (D006).
- The sim keeps a 1-second effects log (`world.fx`: kills, barricade breaks). It's for visuals only and the sim never reads it back.
- The run is now 10 waves over 3 stations, tuned so passive play loses and a strong tower-only bot wins with ~30 Integrity.

**D025 · 2026-09-27 · Code review pass: structure only, no behaviour change.**
Why: Stefan asked for a review of code quality, readability and organisation after Pass 5.
Consequences:

- Sim: `map.ts` owns tile helpers (`N4`, `tileXY`, `inBounds`, `tileAt`), used everywhere instead of inline bounds checks. `phase.ts` has `isPlanning`/`isOver`. `world.ts` builds new and reset worlds from one `freshRun()`. `queueWave` takes a `SpawnGroup`. `mobPos` lives in `mobs.ts`.
- Game/UI: `restartRun()` (planning.ts) is the one way to start a run; it also clears selection, hover and notices. `loadCity` only loads. Unused store fields were removed and the dev-only `spawnWave` moved to the dev hook.
- Render: `view.ts` (controls type, view distance, `zoomScale`), `renderAlpha()` in game.ts, `indexToWorld()` in coords.ts, and pointer input in `pointer.ts` (was picking.ts plus handlers in Scene). LabelLayer compares camera matrices directly.
- Map tool: `build.ts` split into step modules. The rebuilt `city.json` is byte-identical.

**D026 · 2026-09-27 · Streets are painted into the gaps between real buildings, not widened by lane tags.**
Why: lane-based widths never match the drawn footprints, so bugs would walk through walls. Painting streets only where no building stands keeps the sim and the picture in agreement, and gets real widths for free.
Consequences: a tile is street if it lies within its class's max half-width (`streetHalfWidthM`) of a centerline and footprint coverage is below `streetBlockedCoverage`; the centerline tile itself is always street, and diagonal-only gaps are closed. Replaces the plan's "street width from lanes".

**D027 · 2026-09-27 · Backdrop city and sky (Stefan's request).**
Why: the level should sit in a real city, not float in grey.
Consequences: map:build bakes `backdrop.json` from ~70k simplified city footprints plus tall OSM buildings into coarse height grids (16 m cells within 700 m of the level, 32 m beyond), render only, never read by the sim. A gradient sky dome follows the camera; fog and background share the horizon haze. drei `<Sky>` was tried and saturated to white under R3F's tone mapping.

**D028 · 2026-09-27 · Street graph and slots are derived at load time, in the sim.**
Why: one implementation for real maps and test fixtures (tests exercise real logic), and no derived data to keep in sync in city.json.
Consequences: `src/sim/slots.ts`: graph nodes are crossing tiles (both street runs longer than `maxBarricadeSpanTiles`) and stations; segments (block faces) connect them; one barricade per segment; roof pads (1–3 per run of similar-height buildings, on its street front) and street-level corners (intersection corners) are the only tower spots. Towers' range = base × min(cap, 1 + factor × height), with a minimum range for raised towers (DESIGN §7). Balance re-tuned: bug HP ×1.7 from wave 3.

**D029 · 2026-09-27 · Draw buildings at real height; compress only gameplay height. Supersedes the display half of DESIGN §4's height compression.**
Why: Stefan noticed the tall buildings looked missing: the √ curve drew the 297 m Comcast Center at 69 m, below the City Hall stand-in. Philadelphia's skyline is defined by towers well above City Hall.
Consequences: buildings, backdrop and tower positions use real metres; `gameHeight()` (√ curve) stays for tower range and minimum range. City Hall stand-in at real proportions (48 m block, statue at 167 m). Footprint height = `max_hgt` when it's within 1.25× of `approx_hgt` (catches spires), else `approx_hgt` (rejects values inflated by taller neighbours).

**D030 · 2026-09-27 · See-through buildings: dithered cutaway cones (Stefan's idea).**
Why: with real heights, towers hide the streets the player is defending.
Consequences: `render/seeThrough.ts` patches the building and backdrop materials (`onBeforeCompile`). Two cones: camera → orbit target and camera → hovered tile, wide at the camera (45% of the view distance) and narrow at the focus, stopping just short of it. Surfaces inside are removed with a 4×4 ordered dither (up to 80%), so they stay opaque to the GPU (no sorting issues) and keep a ghost silhouette. Picking uses the same maths on the CPU, so the pointer passes through faded buildings. Dev hook gained `__cd.ghost`.

**D031 · 2026-09-27 · Game HUD layout: minimap + speed top right, build bar bottom, status top left, debug behind a gear (Stefan's request).**
Why: Stefan wanted the play area uncluttered, where bugs come from visible at a glance, and no instructions or dev readouts in the player's HUD.
Consequences: `ui/Minimap.tsx` is a 2D canvas fed straight from the sim (no React state): base map and routes cached in a layer rebuilt when the routes change, moving parts redrawn at 20 Hz. `ui/SpeedButton.tsx` cycles 0/1/2/3×. `ui/BuildBar.tsx` holds a build tool in `usePlan.tool`; clicking the map with no tool only selects towers. Tick, seed, speed and restart moved to the debug menu. Performance measured before/after in Chrome: the game is GPU- and CPU-light (≈1.3 ms JS per frame, 23–28 draw calls), so no renderer optimisation was done; see STATUS for the measuring caveats.

**D032 · 2026-09-27 · Balance tables are plain JSON checked by zod schemas in a test.**
Why: the plan asks for schema validation; checking in a test keeps zod out of the game bundle and fails fast with the path to a bad value.
Consequences: `src/data/schema.ts` defines the tower, mob, barricade and wave schemas; the sim imports only their inferred types (`TOWERS`, `MOBS`, `BARRICADES` are the JSON cast to those types). Each tower tier lists its full stats (not deltas), so one tier row can be read on its own. Type-specific fields are required by damage type (explosive: splash and shell time; cryo: cone, slow multiplier and duration).

**D033 · 2026-09-27 · Damage model: flat armor with a 25% floor; pierce ignores it; mortar shells land where the target was.**
Why: flat armor per hit (DESIGN §6) makes fast small hits (MG) weak and big hits (Railgun) strong against beetles, which is the counter we want. The floor (`armorMinDamageFraction`) keeps nothing immune. Shells on a fixed point with a flight time let a swarm run into the splash but let a lone fast bug dodge, without target-leading maths.
Consequences: `sim/damage.ts hitDamage(raw, type, armor)`, unit-tested. Cryo hits everything in range inside its cone (aimed at the target) and slows it; overlapping slows keep the stronger multiplier and later end. Kills from a shell are credited to its tower if it still exists.

**D034 · 2026-09-27 · Upgrades: two tiers, any phase; barricades upgrade in place during prep.**
Why: DESIGN §7–8; tier 3 branches arrive in Pass 9.
Consequences: a tower tracks everything spent on it, and selling refunds 70% of that (100% during the prep it was built in). Barricade upgrades cost the price difference and add the HP difference, so damage already taken stays taken; the flow field is recomputed. Clicking a sawhorse with the Jersey Barrier tool upgrades it.

**D035 · 2026-09-27 · Tower placement snaps to spots; the cursor's see-through cone follows the mouse (Stefan's feedback).**
Why: single-tile spots were hard to hit, especially roofs at an angle, and the "not a tower spot" label was annoying.
Consequences: `nearestTowerSite` (sim/towers.ts, tested) finds the nearest free spot the type can use within `TOWER_SNAP_TILES` (4); the ghost and the click both use it, and a map click with a tower tool builds on the previewed spot (`clickMap`). The cursor's see-through cone (D030) now aims at where the pointer ray meets the street and is updated before picking, instead of at the hovered or snapped tile: that fed back into picking (a pick moved the cone, which changed the next pick) and made the preview hop between roofs. Side effect: the cursor cone is always on while the pointer is over the map, not only when something is hovered.

**D036 · 2026-09-27 · Bugs have a layer; fliers and diggers share a barricade-free flow field.**
Why: DESIGN §5.4–5.5. One extra field (computed once per map, since nothing changes it) serves both; its values count tiles to the goal, which also gives diggers their "surface near City Hall" distance.
Consequences: `mobs.json` gives each bug a `layer` (ground, air, digger). Crawlers keep the barricade-weighted field, sieges and traps; fliers and diggers use `world.freeField` and ignore walls and traps. A digger is buried (untargetable, drawn as a mound) unless it crossed a manhole in the last `surfaceS`, a Seismic Pulse forced it up, or it's within `surfaceNearGoalTiles` of the goal. Spitters look ahead along their crawler route (first cheapest step, no RNG, so replays stay exact) and spit at the first wall within `spitRangeM`. Stuns stop movement and attacks.

**D037 · 2026-09-27 · A tower's attack is data (`attack`: hit, shell, cone, chain, pulse), separate from its damage type, with explicit target layers.**
Why: Flak and Mortar both lob splash shells but hit different layers; Tesla's chain and Seismic's pulse are new ways to hit. Branching on damage type no longer described behaviour.
Consequences: the schema requires the tier fields each attack needs. `targets` lists ground and/or air; shells carry their tower's targets. Tesla: `chains` jumps to the nearest un-hit bug within `chainRangeM`, `chainFalloff` per jump, +`wetExtraChains` (rules.json) if the first target is Wet; Cryo's cone applies Wet for `wetS`. Energy damage is reduced by armor like everything but pierce. Shots record whether the target flew, so effects aim up.

**D038 · 2026-09-27 · Barricades: walls and traps, priced per tile of street width; Blast Walls repair between waves.**
Why: DESIGN §8 and IDEAS "width-scaled cost": where you block should matter. Spike strips must not become path costs or they'd reroute bugs.
Consequences: `barricades.json` has `kind` (wall, trap) and `costPerTile`; a barricade stores what was spent, and refunds use that. Traps live in `world.traps` (one per block face, never on a wall's tiles), damage crawlers entering their tiles and lose one `hp` per crossing. Walls with `repairsBetweenWaves` go back to full when a prep starts. Upgrade chain Sawhorse → Jersey → Bus Wall → Blast Wall. The T3 wall is "Bus Wall" in the table; a Philadelphia SEPTA skin belongs in city data later (multi-city rule).

**D039 · 2026-09-29 · The cursor's see-through cone is on only while a build tool is picked (Stefan).**
Why: since D035 the cutaway followed the mouse everywhere, so just moving the pointer dithered whatever it passed over, which looked bad.
Consequences: `cursorCutaway()` (render/pointer.ts) returns the pointer's street point only when a build tool is selected; otherwise only the camera → orbit-target cone (D030) cuts away. Placement behind tall buildings still works because the cone is on whenever you're placing.

**D040 · 2026-09-29 · The see-through cutaway follows the camera only, never the mouse. Supersedes D039 and the cursor half of D030/D035.**
Why: Stefan: "I don't think it should ever do that, only the camera." Even gated to build mode (D039), a cutaway that moves with the pointer looked bad.
Consequences: `seeThrough.ts` has one sight line, camera → orbit target (screen centre), in the shader and in the CPU mirror used by picking. The pointer-street tracking and the pre-pick cursor update are gone. Picking still looks through buildings the camera cutaway has faded; since that depends only on the camera, the same mouse position always picks the same tile, so snapping stays stable. Placing behind a tall building means moving the camera, or relying on snapping to a nearby spot.

**D041 · 2026-09-29 · The cutaway eases out instead of cutting off (Stefan: "a sharp cut-off along the bottom", worst at shallow camera angles).**
Why: two hard thresholds drew edges across buildings: surfaces more than 0.15 × the cone radius below the sight line were never faded (at shallow angles that line runs through building faces), and the cutaway stopped dead at 97% of the way to the target.
Consequences: the fade is now radial × below × nearEnd, each a smoothstep: below the sight line it eases out over 0–0.5 × the local cone radius; toward the target it eases out between 80% and 97% of the way. The CPU mirror used by picking matches the shader.

**D042 · 2026-09-29 · Council Grants: generic effects in the sim, city content in `grants.json`.**
Why: DESIGN §10.6, and the multi-city rule (Philadelphia first, other cities later): mechanics stay generic, names and choices are per city.
Consequences: `grants.json` is keyed by city like `waves.json`. Effect types (cost, fire rate and range multipliers, Wet duration, bounty, interest cap, prep time, trap damage, cash, Integrity) accumulate in `world.mods`, which the sim reads where each number is used. After every `grantEveryWaves`-th wave (not the last) the phase machine enters `grant` and waits; three grants the player doesn't have are drawn with the seeded RNG. A city without grants has no grant phases.

**D043 · 2026-09-29 · Tier 3 is a choice of branches with data-defined specials.**
Why: DESIGN §7. Branches are full stat blocks like tiers, plus an optional `special`: `pierceLine` (hits every targetable bug within half a tile of the line through the target), `mark` (target takes +`markBonus` from all tower hits for `markS`), `burn` (the shell's splash area burns at `burnDps` for `burnS`, ignoring armor, ground only). A branch can override the damage type (AP Rounds pierce).
Consequences: a tower's `tier` one past the last tier means its `branch`; `towerTier()` returns the right stats; `upgradeOptions()` lists the next tier or the branches.

**D044 · 2026-09-29 · Save at the start of each prep only; restore replays exactly.**
Why: at that moment there are no mobs, spawners or shells, so a save is small, and restoring the RNG state makes the rest of the run identical (tested). Mid-wave saves would need every transient mob field and aren't worth it.
Consequences: `sim/save.ts` (versioned `SaveV1`); the game layer autosaves to localStorage at each new prep (not wave 1), deletes the save when the run ends or the player picks "New run", and offers to continue on load while the game waits.

**D045 · 2026-09-29 · Run structure numbers: interest 5% capped at $50; repair costs 60% of the missing share of the wall's price; breaches are derived, not scripted.**
Why: DESIGN §3.1/§3.3. A station's first wave is known from the script, so the telegraph ("Tremors under …") needs no extra data. Bosses: the Brood Mother's brood gets `broodHpMul` so it matters in the finale; she spawns at Race-Vine (from 15th Street she reached City Hall almost untouched).
Consequences: rules.json `interestRate`, `interestCap`, `repairCostFraction`, `grantEveryWaves`, `grantChoices`, `scoreIntegrityMul`, `saveVersion`; `stationsOpeningNextWave()` in phase.ts; score = bounty + Integrity × 20 + cash; stars per DESIGN §3.2.

**D046 · 2026-09-30 · Pass 10a buildings: real 3D shapes from OSM parts, roofs as plane envelopes, procedural windows; the sim keeps its heights.**
Why: IMPLEMENTATION_PLAN Pass 10 (Stefan, 2026-09-27): setback tiers and roofs from OSM `building:part`, parapets, rooftop boxes, windows, and a real City Hall instead of the stand-in. "Render only: the sim keeps per-tile heights, but roof-pad towers must sit on the drawn roof."
Consequences:

- map:build downloads parts and building relations into a separate cache (`<city>-osm-parts.json`) so the older downloads, city.json and the level stay identical. A footprint whose area is ≥ 60% covered by parts (`parts.replaceCoverage`) is drawn as its parts instead (478 parts replace 87 footprints in Philadelphia). Parts without a height take their footprint's.
- Heights follow OSM: `height` is the top of the roof, `roof:height` / `roof:levels` the rise, `min_height` / `building:min_level` the base. `osmTagOverrides` in the city config patches tags by OSM id; City Hall's 30 parts get hand-set heights and roofs there (main block 30 m, pavilions to 72 m, clock tower 137.8 m, cupola 155.8 m, William Penn to 167 m).
- `buildings.json` v1: solids (outline, eaves, base, roof shape and rise, OSM colours, facade hint), the landmark as its own list (City Hall is drawn by `CityHall.tsx` so it still flashes), and `roofRows`, the drawn roof height at each tile centre. The renderer places towers, pads, labels and picking on `roofRows`; the sim still reads city.json's raster heights for range and pads.
- Roofs (`render/roofShape.ts`, pure, tested): the lower envelope of planes over the footprint's minimum-area rectangle (gable 2, hip/pyramid 4, mansard 5, domes/cones/barrels faceted with tangent planes). Walls rise to the envelope along the outline (gable ends). Pitched roofs over courtyards would need a straight skeleton, so those are drawn flat.
- Facades (`render/facades.ts`): windows are drawn in the shader from a per-vertex attribute (distance along the wall, window band, style), filtered with `fwidth` so they fade to their average under ~2 px. Five styles (brick, stone, glass, parking, landmark), OSM `building:material` / `building:colour` when tagged, otherwise a seeded roll by height. The backdrop boxes use the same palettes and windows (the shader works out the facade itself).
- Flat roofs above 6 m get parapets (1.6 m on towers ≥ 60 m); roofs over 150 m² get 1–4 seeded rooftop boxes, kept 7 m clear of roof pads.
- Cost: one mesh, ~263k vertices, built in ~60 ms at load; 560k triangles and 20–24 draw calls in the scene; 60 fps at dpr 2 with 286 bugs at 3×.
- Open question for Stefan: 118 of 838 roof pads are drawn ≥ 3 m away from their sim height (69 by ≥ 10 m), mostly towers on podiums (the sim keeps the tower's height for range). Switching the sim to `roofRows` would make range match the picture but move pads and change balance.

**D047 · 2026-09-30 · No 15th Street spawn; the camera stays over the map (Stefan).**
Why: Stefan: 15th Street station is too close to the goal (132 m from City Hall), and the camera could pan off the map.
Consequences: `excludeStations` in the city config drops stations by OSM name in map:build (Philadelphia: `15th Street`); 11 spawns remain. Its wave groups (the wave 11–20 grub breach, DESIGN §9) move to **Suburban Station** (16th & JFK, 370 m), the nearest unused station on the same side, with the same counts; the telegraph reads "Tremors under Suburban Station". `CameraBounds.tsx` clamps the orbit target to the level rectangle every frame after the controls move, shifting the camera with it, so mouse, keyboard and minimap panning all stop at the edge with the view angle and distance unchanged. The backdrop past the edge is still visible, since only the point being looked at is clamped.

**D048 · 2026-09-30 · No two drawn surfaces in one plane: overlapping shapes are cut, parapets have thickness (Stefan: flickering windows and rooftops).**
Why: footprints, OSM parts and duplicate outlines overlapped (537 pairs, 88,000 m²; 26,000 m² of roofs at the same height; 222,000 m² of walls in the same plane facing the same way), and a zero-thickness parapet's inner face lay in the plane of a taller neighbour's wall. With one colour for every building the z-fighting was invisible; with per-building colours and windows (D046) it flickers.
Consequences: map:build (`tools/map/overlaps.ts`, tested) cuts from each shape the area covered by shapes at least as tall that start no higher, with each cover grown by 15 cm so outlines that disagree by centimetres leave no sliver; equal duplicates keep the first; pitched shapes are only dropped when fully covered (cutting would reshape their roof). Leftover: ~8,000 m² of walls (16 small pairs) and ~1,200 m² where pitched roof planes cross. `polygon-clipping` is a dev dependency for this (pipeline only). Parapets are 0.35 m thick with a cap (`buildingMesh.ts`). Cost: +45k triangles (606k), still 60 fps.

**D049 · 2026-09-30 · Route focus: click a route (or its station in the wave intel) to frame it and see through what hides it (Stefan: hard to get a line of sight on the bugs' path).**
Why: with real heights, the street a route runs down is usually hidden by towers from any easy camera angle, and lining the camera up by hand is slow when you need to react.
Consequences: with no tool picked, a click whose pointer is within 2.5% of the screen height of a route line (in screen space, so it works through buildings) focuses that route; towers and walls under the pointer still win. Station names in the wave intel are buttons that do the same. The camera glides (0.9 s, cancelled by mouse or WASD/QE) to look across the route's long axis at 55°, far enough back to fit it beside the status panel. While focused, a second cutaway removes 95% of the pixels of any building drawn in front of the route on screen (route projected to screen space every frame; `seeThrough.ts`), picking looks through the same pixels, and the route is drawn thicker and brighter. The focus follows reroutes and camera moves; Esc, a click away from any route, or the station going quiet clears it. Costs nothing measurable (60 fps at dpr 2). Dev hook: `__cd.plan`, `__cd.focusRoute(station)`.

**D050 · 2026-09-30 · Tactical view: T (or the grid button by the speed button) squashes the buildings and looks straight down (Stefan).**
Why: the best fix for fighting the camera (IDEAS, after D049): a board-game view where the whole level reads at once and every roof spot is easy to click.
Consequences: buildings, City Hall and the backdrop are drawn at 12% height (mesh scale; render only, the sim's heights and ranges don't change). The display heights are scaled with them, so towers, pad markers, shots, labels, picking and camera focus all sit on the squashed roofs. The camera glides (0.6 s) to 80° pitch over the same spot and heading, at least 350 m out; switching off glides back to the previous tilt. Route focus (D049) frames at 80° while tactical view is on. Fliers keep their altitude. Instant squash, no animation: everything that reads the heights re-renders once.

**D051 · 2026-09-30 · Facade presets: many wall and window styles from a small table in a texture (Stefan: more varied windows and walls).**
Why: five fixed window grids made the city look repetitive.
Consequences: `facades.ts` holds 8 families (brick, loft, stone, piers, ribbon, glass curtain wall, parking, landmark) spread into 37 seeded variants: bay and floor size, window shape, glazing bars, trim lighter or darker than the wall, bands between floors, shopfront ground floors with awnings, cornices and plinths, glass colour and how much sky it reflects (a cheap fresnel reflection of the sky gradient). The presets live in a 4×N float texture read in the vertex shader; walls carry only a preset index, and each building's window grid starts at a random offset so neighbours don't line up. Wall palettes grew too.

**D052 · 2026-09-30 · Street life: cars, pedestrians and trees, decorative only, that flee from bugs (Stefan).**
Why: the city should feel lived in and react to the invasion.
Consequences: `render/ambient/life.ts` (plain TS, never touches the sim): 120 cars drive the game's street graph (segments between intersections) on the right-hand lane, queue behind the car ahead, turn at intersections, and turn back at walls. 320 people wander the sidewalk tiles along building fronts. Within 32 m (cars) or 28 m (people) of a bug, cars U-turn and speed off, and people run, then duck into a building after a moment and come back 10–25 s later somewhere at least 110 m from any bug. About 950 trees stand at the kerb along block faces and hide under walls. Bugs are bucketed in 32 m cells for the checks. Drawn as 4 instanced meshes (a car, a body, a head, a tree: a few boxes each, vertex colours, Lambert), frozen while paused, slightly oversized and mildly zoom-compensated so they read. Costs ~0.3 ms CPU and no measurable GPU.

**D053 · 2026-09-30 · Rendering budget: chunked buildings with two levels of detail, a depth pre-pass for the see-through cutaway, pre-lit ground (Stefan: 30 fps).**
Why: Stefan saw 30 fps. Measured with WebGL timer queries: the 30 fps was Chrome's Energy Saver (battery at 14%: every page, even a blank one, capped at 30 fps), not the game. Under that cap the GPU clocks down to fill the frame, so plain timings mislead; the numbers below render each frame 6× so the GPU runs at full clock. The biggest real costs: the see-through `discard` (it stops the GPU's hidden-surface removal, so the expensive facade shader ran on every wall behind every other: ~3 ms at street level), one unculled 400k-vertex building mesh, the backdrop's window shader, and several full-screen lit planes. Triangle count as such mattered little.
Consequences:

- Buildings (`Buildings.tsx`) are split into 128 m chunks (frustum culled), each built twice: near (within 650 m: windows, parapets, rooftop boxes) and far (plain walls in their windows' average colour, no parapets or boxes).
- Only chunks the cutaway may reach (a conservative sphere-vs-cone test; all of them while a route is focused) draw in two passes: a depth-only pass that does the dithered discard, then the full material with no discard where its depth matches. The same for the backdrop's near layer. Everything else draws once without discard.
- The level ground is one unlit plane with a per-tile colour texture (replacing 16.6k block slab boxes and the goal boxes); the backdrop ground is unlit too; both use the colour the lit version produced (`lighting.ts`, `preLit`). Far backdrop layers are plain Lambert boxes in their windows' average colour.
- Result at full GPU clock (M4 MacBook, dpr 2, 80 bugs): overview 4.8 → 3.3 ms, low angle 5.1 → 3.4 ms, street 4.3 → 4.0–4.7 ms (with the richer facades, street life and trees added), triangles ~630k → ~470k. 60 fps on power in every view.
- Dev hook: `__cd.renderer`, `__cd.scene`, `__cd.setPixelRatio(r)`, `__cd.streetLife`; layers named `buildings`, `backdrop`, `cityHall`, `streetLife` for `__cd.setVisible`.

**D054 · 2026-09-30 · Branch `down-the-street`: a rail camera on the bugs' route, a threat board to switch tracks, and click-started cutscenes (Stefan: the game felt tedious because of fiddly camera controls).**
Why: Stefan wants a more cinematic game with no panning: the camera pinned to the path the bugs crawl, switching tracks from a prominent HUD element, and action camera angles, but the camera is never taken away unless the player clicked for it. An experiment on its own branch.
Consequences:

- Rail camera (`RailCamera.tsx`, `track.ts` tested): the orbit point rides the active track (a station's route, s = 0 at the station). W/↑ glides toward the station, S/↓ toward City Hall; A/D, ←/→ and Q/E turn; the mouse orbits and zooms; nothing pans (OrbitControls with pan off; left or right drag rotates). The camera turns with the street (heading smoothed over ±45 m). Retired: WASD panning (`KeyboardCamera`), grab panning, `CameraBounds`, route-focus framing flights. The active track is `planStore.focus`, which now also says where to land and whether to glide; it no longer clears on Esc. The route cutaway (D049) now always follows the active track. The minimap and `focusTile` snap to the nearest track. City Hall takes part in the see-through cutaway now (routes end at it).
- Threat board (`ThreatBoard.tsx`, replaces the wave-intel list): one card per station sending bugs this wave: INCOMING, flashing DANGER (hazard stripes, scrolling marquee, pulse) when it starts spawning, magenta BOSS / cyan ELITE when one comes out, ENGAGED / TRACKING, CLEAR; plus next wave's breach telegraph. Click (or 1–9) switches track; if the card has something new, its cutscene plays first. Kept current by `ThreatTracker.tsx`, render side: a new bug on a station tile came out of that station (the sim is untouched). The tower and wall cards moved to the right.
- Cutscenes (`Director.tsx`, `CinemaOverlay.tsx`, text in `data/cinematics.json` with a schema test): only ever started by a click. Breach: a sweep to an angled view of the station, a burst (shock ring, dust, debris; `StationBursts.tsx`), a push in, letterbox bars, a slammed banner with the bug counts flying in. Boss / elite: a whip to a low shot, the game frozen (speed restored after), a Kirby-and-the-Forgotten-Land-style title card (colour bands sweep across, an epithet over a huge name, a factoid). Click, Esc or Space skips; the camera always ends on that station's track. The OSM credit stays above the letterbox.
- 60 fps on the rail and during cutscenes (wave 15, four stations).

**D055 · 2026-10-01 · Branch `down-the-street`: one see-through rule. A building that blocks the line of sight from the camera to the active track fades out as a whole, and clicks go through it; nothing else fades (Stefan). Supersedes D030/D040/D041 (the camera → orbit-target cone) and D049 (route focus and its cutaway band).**
Why: with the camera riding the track, the orbit target is always on the track, so the cone was a weaker copy of a track rule. A band cut through buildings along the projected track (tried first) read badly; Stefan wants whole buildings to go see-through. Clicking a route to focus it is redundant now that the threat board switches tracks.
Consequences:

- `occluders.ts` (pure, tested): building footprints (each OSM part, City Hall's parts under one id, the near backdrop's boxes) rasterised once into a 4 m grid; a sight line is walked through it cell by cell (DDA) and a building blocks it where the line passes between its base and top. The target's own cell and the last 4 m are ignored, so the walls lining a street don't count.
- `seeThrough.ts`: every frame, sight lines from the camera to points every 6 m along the on-screen part of `rail.track` (2 m up; centre and ±3 m) find the blockers, about 0.3–0.6 ms of CPU. Each blocker fades to 90% dithered over 0.2 s and holds 0.35 s after it stops blocking. Fades live in a small texture that the shader reads by each vertex's (or instance's) `aOcc` id. A cutscene switches `rail.track` when it starts, so its station is cleared too.
- Only chunks (and the near backdrop) with a fading building take the depth pre-pass path (D053); everything else draws once with no `discard`.
- Picking (`pickTile`) skips roofs of buildings more than half faded.
- Clicking the map with no tool only selects a tower or wall. Removed: screen-space route picking, `focusRouteAt`, the focused-route highlight, `RouteFocus.tsx`. `focusRoute` stays (threat board, cutscenes, minimap, dev hook).
- Dev hook: `__cd.seeThrough()` (fading count, CPU ms), `__cd.hovered()` (picked tile).
