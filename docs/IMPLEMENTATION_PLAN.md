# City Defender — Implementation Plan

> Status: **v0.1** (2026-09-26). Design source of truth: [DESIGN.md](DESIGN.md). Progress: [STATUS.md](STATUS.md).

## How to use this plan (agents, read this)

1. **Work one pass at a time, in order.** Every pass ends with something you can *see and play* in the browser.
2. **Timebox, then move on.** Each pass has a timebox. When it's hit, stop polishing, write what's left into [IDEAS.md](IDEAS.md) or the pass's "Deferred" list, and ship.
3. **"Good enough" beats "right".** Ugly but working is the goal of early passes. The map generator gets a *second* pass (Pass 6) specifically so Pass 1 can be crude.
4. **Don't pull work forward.** If something belongs to a later pass, leave a `// TODO(pass-N):` and move on.
5. **Definition of done (every pass):**
   - `npm run dev` shows the pass's deliverable. `npm test` and `npm run typecheck` pass.
   - Verified in a real browser (preview artifact in Chrome, or dev server + Chrome DevTools MCP): no console or HUD errors, and a screenshot saved to `docs/screenshots/pass-NN.png`. Live preview artifact republished.
   - [STATUS.md](STATUS.md) updated (done, deferred, known issues). New decisions logged in [DECISIONS.md](DECISIONS.md).
   - Commit tagged `pass-NN`.

## Architecture rules (apply from Pass 0)

- **`src/sim/`: plain TypeScript.** No `three`, no `react` imports. Deterministic: fixed tick (20 Hz), seeded RNG, all state in one `World` object. *This is the code Stefan reviews.* Tests only for important or tricky pieces (see the testing policy in CLAUDE.md); "Accept" lines that mention tests mean one focused test, not a suite.
- **`src/render/`: React Three Fiber.** Reads sim state inside `useFrame` via refs. **Never `setState` per frame.** Many identical things (mobs, building tiles, projectiles) are drawn with `InstancedMesh`.
- **`src/ui/`: React DOM overlay** (HUD, build menu) driven by a small zustand store updated at event rate, not frame rate.
- **`src/data/`: JSON tables** for mobs, towers, barricades and waves. No balance numbers in code.
- **`tools/map/`: offline map pipeline** (Node + TypeScript, run with `tsx`). Output goes to `public/cities/<city>/`. Raw downloads are cached in `tools/map/cache/` (gitignored).
- **Debug hook:** in dev builds, `window.__cd = { world, spawnWave, setSeed, placeBarricade, … }` so agents can drive and inspect the game from DevTools.
- **Coordinates:** tile `(tx, ty)` integers. World units are metres, 1 tile = 8 m. Tile x → world x, tile y → world z, and y is up.
- **Test fixtures:** tiny ASCII maps in `src/sim/__fixtures__/` (`#` building, `.` street, `S` spawn, `G` goal). Sim tests must never depend on the real city.

```
# example fixture
#########
#S.....G#
#.#####.#
#.......#
#########
```

---

## Milestone A: MVP (Passes 0–5)

At the end of Pass 5 we have a small but real game: Philly streets, one mob, barricades that reroute, one tower, waves, win/lose.

### Pass 0: Scaffold · timebox ½ day
**Deliverable:** a page with a 3D ground plane, orbit camera and FPS counter. Tests run.
- Vite + React + TypeScript (strict) + `three`, `@react-three/fiber`, `@react-three/drei`, `zustand`. FPS via drei `<Stats/>`. `leva` joins in Pass 5 for tuning.
- vitest, eslint, prettier. npm scripts: `dev`, `build`, `test`, `typecheck`, `lint`, `map:build`.
- Folder skeleton per the architecture rules. `window.__cd` stub.
- Sim loop skeleton: fixed‑timestep accumulator driving `world.tick(dt)` from `useFrame`.
- Chrome DevTools MCP confirmed working against `localhost:5173`.
**Accept:** the plane renders, a sample sim test passes, and the MCP screenshot is saved.
**Out of scope:** anything map‑ or game‑related.

### Pass 1: Map generator v0 (crude on purpose) · timebox 1–1½ days
**Deliverable:** Center City street grid rendered as flat streets plus uniform box "buildings". City Hall is a marked block. Station dots.
- `tools/map/fetch.ts`: **one Overpass query** for the bbox (approx. Vine→Spruce, 18th→8th; confirm the numbers when writing it) that returns:
  - `highway` ways (primary, secondary, tertiary, residential, unclassified, trunk). Skip footways, service roads and alleys.
  - Subway/trolley stations (`railway=station` + `station=subway`, or `public_transport=station`) inside the bbox.
  - Cache the JSON response.
- `tools/map/build.ts`:
  1. Project lat/lon to local metres (equirectangular around City Hall is fine at this scale).
  2. **Auto‑rotate:** histogram the street segment bearings mod 90° and rotate by the dominant angle so Penn's grid is axis‑aligned.
  3. Rasterize each street centerline onto 8 m tiles with a fixed width (2 tiles, or 3 for primary). Everything else becomes `building` with one constant height.
  4. Mark the goal: the block containing City Hall's coordinate (flood fill, see D012). Keep the ring road around it as `street`.
  5. Snap each station to its nearest street tile and record it as a spawn.
  6. Write `public/cities/philly/city.json` (v0 schema: `meta`, `tiles`, `spawns`, `goal`).
- Render: street tiles as one flat plane or instanced quads, building tiles as instanced boxes, goal as a white box, stations as orange discs. Show OSM attribution in a corner.
- **Plan B:** if Overpass or the rasterizer fights you for more than half a day, ship a hand‑authored ASCII map of ~10×10 blocks around City Hall and move on. Pass 6 fixes the real map.
**Accept:** someone who knows Philly recognizes Broad & Market and the grid around it. `npm run map:build` is reproducible from cache.
**Deferred to Pass 6:** real footprints, heights, street widths from lanes, alleys, landmarks, slots.

### Pass 2: One mob · timebox ½–1 day
**Deliverable:** red spheres leave one station and crawl along the streets to City Hall. City Hall Integrity counts down in the HUD.
- Sim: `Mob { id, type, tile/pos, hp, speed }`. Spawner emits N mobs at an interval from one spawn.
- Movement: BFS path from spawn to goal on street tiles (the flow field comes in Pass 3). Interpolate between tile centres.
- Reaching the goal: remove the mob and subtract integrity.
- Render: one `InstancedMesh` of spheres, positions written per frame from sim state.
- HUD: Integrity, mob count. Debug: `__cd.spawnWave(20)`.
**Accept:** 200 mobs at 60 fps. Sim test: on the fixture, a mob reaches G in the expected tick count.

### Pass 3: Flow field + barricades · timebox 1–1½ days
**Deliverable:** click a street to drop a barricade across it. The swarm visibly reroutes, and a ghost path shows the new route before you click.
- Sim: Dijkstra flow field from the goal over street tiles. Mobs step to the lowest‑cost neighbour. Recompute on barricade events.
- **Barricade placement v0:** click a street tile, then scan perpendicular to the street's direction until you hit non‑street tiles; that span is the barricade. One type (Sawhorse) with HP.
- **Siege rule** (DESIGN §5.2–5.3): barricade tiles get `cost = base + k × hp`. A mob whose next tile is a barricade stops and deals DPS to it. Destroyed → tiles freed → recompute.
- UI: hover shows a ghost barricade plus the ghost path from each active spawn and a detour meter (`+N m`). Right‑click removes (free for now).
- Render: barricade as a flat box across the street. Crack tint by HP %.
**Accept:** blocking the direct route produces a detour. Sealing all routes produces a siege at the cheapest barricade. Sim tests cover both on fixtures, plus "no oscillation" (recompute only at 25% HP bands).

### Pass 4: One tower + the wave loop (**first playable**) · timebox 1–1½ days
**Deliverable:** you can win or lose.
- **MG Nest** on any building tile adjacent to a street. Hitscan with fire rate, damage and range. Targeting = First (furthest along the flow field). Tracer line + hit flash.
- **Economy:** starting cash, tower and barricade costs, bounty per kill, wave clear bonus.
- **Phase state machine:** `PREP → ASSAULT → DEBRIEF → PREP…`. PREP has a countdown (30 s to start with, in `src/data/`, D016) and a "Start wave" button that ends it early. Barricades only in PREP.
- Waves from `src/data/waves.json` (5 waves, one mob type, growing count and HP).
- Lose at Integrity 0, win after the last wave. Simple end screen with restart.
**Accept:** a new player can finish a 5‑wave run in about 5 minutes, and it's possible to lose. Sim test: scripted run on a fixture is deterministic for a given seed.

### Pass 5: MVP polish (playtest checkpoint) · timebox 1–2 days
**Deliverable:** the MVP feels like a game.
- Speed controls (pause / 1× / 2× / 3×). Sell (70%) and **free undo during prep**.
- Range disc on hover and selection. HP bars only on damaged mobs. Death pop. Screen shake on barricade break.
- Wave intel panel: next wave's spawns and counts. Ghost paths drawn during prep.
- 3 spawns, 10 waves. Tune until it's tense.
- **Playtest with Stefan.** Log findings in STATUS.md and adjust the upcoming passes.
**Accept:** Stefan plays twice and wants a third run.

---

## Milestone B: Make it Philadelphia (Passes 6–7)

### Pass 6: Map generator v1 · timebox 2–3 days · ✅ done 2026-09-27 (see D026–D028; backdrop + sky added)
**Deliverable:** real Center City. Buildings at real (compressed) heights, correct street widths, precomputed slots.
- ✅ *Done early (D019):* City of Philadelphia footprints (`approx_hgt`) rasterized to per-tile heights, with OSM buildings as the fallback, drawn with the √ curve. Remaining here: footprint meshes, and Overture if OSM gaps show up.
- Clip and simplify with mapshaper. Drop footprints under 40 m². Merge rowhouse runs.
- Street width from `lanes` / `width` tags, with sensible defaults per highway class.
- Rasterize footprints to `building` tiles with per‑tile height (the max of overlapping footprints). Height compression curve.
- Derive: **street graph** (intersections + segments), **one barricade slot per segment**, **corner slots**, **roof pads** (1–3 per building, preferring tall buildings next to streets), **manholes** (every ~N tiles along segments).
- Render: buildings as **merged extruded footprints** (one or a few meshes), streets with lane lines. City Hall placeholder (box + tower + gold statue).
- Tower range uses the height bonus. Placement switches from "any building tile" to pads and corners.
- Map viewer debug overlay (toggle): tile types, slots, graph edges.
**Accept:** side by side with a real map, a Philadelphian recognizes the blocks and skyline ordering. `map:build` stays under 1 minute from cache.
**Deferred:** landmark models (Pass 10), multi‑city support (Pass 11).

### Pass 7: Data‑driven roster I · timebox 2 days · ✅ done 2026-09-27 (see D032–D034)
**Deliverable:** 3 more towers, 2 mob types, armor and targeting modes.
- `src/data/{mobs,towers,barricades}.json` with a schema (zod) and validation in tests.
- Mobs: **Skitterling** (fast swarm, replaces the sphere), **Carapace Beetle** (armor, 3× barricade damage).
- Towers: **Mortar** (splash, min range, roof), **Cryo** (slow, corner), **Railgun** (pierce, roof).
- Damage types and armor. Targeting modes per tower. Upgrades tiers 1–2.
- Barricades: Sawhorse, Jersey Barrier. Upgrade in place.
**Accept:** splash visibly wins against swarms and Railgun against Beetles. Tests for the damage formula.

## Milestone C: Full threat model (Passes 8–9)

### Pass 8: Fliers, diggers, sappers · timebox 2–3 days · ✅ done 2026-09-27 (see D036–D038)
- **Wasp Drone** plus a separate flier flow field (ignores barricades), rendered at roof height. **Flak Battery** and **Tesla Coil** (chain; hits air).
- **Tunneler Grub** plus sewer traversal, buried state, manhole surfacing. **Seismic Pulse**.
- **Acid Spitter** (ranged barricade damage).
- Barricades: Bus Wall, Blast Wall, Spike Strip. Width‑scaled barricade cost.
- Cryo "Wet" + Tesla synergy.
**Accept:** each new mob beats a defense that was fine before and loses to its listed counter (scripted sim tests per matchup).

### Pass 9: Full run structure · timebox 2–3 days
- 20‑wave Philadelphia script (DESIGN §9), including the wave‑10 mini‑boss and the **Brood Mother** at wave 20.
- Station breach telegraphs, interest, barricade damage persisting between waves + repair, call‑early bonus.
- **Council Grants** (pick 1 of 3 every 5 waves; start with ~9 grants).
- Tier‑3 branching upgrades for 2–3 towers. Star rating, score, end‑of‑run stats.
- Save/resume a run (localStorage, versioned).
**Accept:** a full run takes 20–30 minutes with a clear difficulty curve. Stefan finishes one run and loses one.

## Milestone D: Juice & replayability (Passes 10–11+)

### Pass 10: Presentation · timebox 3+ days (can be split)
- Low‑poly glTF models for mobs and towers (animated walk, idle, attack). City Hall and hero landmark models.
- VFX: muzzle flashes, splash rings, frost, lightning, acid, bug splat decals that fade.
- Audio: bus/mixer, weapon sounds, siren on breach, radio chatter lines with Philly flavor.
- Postprocessing: subtle bloom, SSAO, outline on selection. Day/night per wave.
- Buildings (Stefan, 2026-09-27): real 3D shapes from OSM `building:part` (643 parts in the level: setback tiers, plus ~80 gabled/hipped/pyramidal/dome/cone roofs) with generated roof meshes; parapets and rooftop mechanical boxes on flat roofs; procedural window textures. Render only: the sim keeps per-tile heights, but roof-pad towers must sit on the drawn roof. City LiDAR (PASDA) stays in reserve.
- Performance pass: 500 mobs plus effects at 60 fps on the target machine (profile with DevTools MCP traces).

### Pass 11: Replayability · timebox 2–3 days
- Run seeds (station order, grants, golden bug timing). Share a seed string.
- Mutators (Rush Hour, SEPTA Strike, Nor'easter, Construction Season, Budget Cuts) with score multipliers.
- Daily seed. Achievements. Local best scores.
- Generalize `map:build` to a `cities/<name>.config.json` (bbox, goal, landmark list) and try a second city.

### Beyond: see [IDEAS.md](IDEAS.md)
Destruction (voxelize on damage), active abilities, more cities, endless mode, campaign map.
City flavor: per-city special events, power-ups, debuffs and landmarks (research in [research/city-flavor.md](research/city-flavor.md)).

---

## Risk register

| Risk | Mitigation |
|---|---|
| Map pipeline eats the schedule | Pass 1 is crude by design with a Plan B ASCII map. Real fidelity is Pass 6, after the game is fun. |
| Flow field thrash with many barricades | Recompute on events and 25% HP bands only. A field is one Dijkstra over ~10k tiles, which is cheap. |
| Per‑frame React re‑renders kill FPS | Refs + `useFrame` + InstancedMesh rule; r3f‑perf visible in dev. |
| Balance feels flat | All numbers in JSON, leva sliders in dev, a scripted sim "autoplayer" for quick balance checks (Pass 9). |
| Scope creep from cool ideas | Ideas go to IDEAS.md, never straight into the current pass. |
