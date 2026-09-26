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
