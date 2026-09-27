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
