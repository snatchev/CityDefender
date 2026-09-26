# City Defender — Status

> **Agents: read this first after CLAUDE.md**, and update it at the end of every pass.

**Last updated:** 2026-09-26
**Current pass:** Pass 0 (Scaffold): **done**, committed and tagged `pass-00`
**Next up:** Pass 1 (map generator v0)
**Live preview:** https://claude.ai/artifact/6AoAPfL6V4FJSgBgNwA5d7 (private; republished at the end of each pass)

## Done
- Research: map sources and formats → decision D001 ([research/map-sources.md](research/map-sources.md))
- Design doc v0.1 ([DESIGN.md](DESIGN.md))
- Implementation plan v0.1 ([IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md))
- 28 agent skills installed in `.agents/skills` (symlinked into `.claude/skills`). See [TOOLING.md](TOOLING.md) for which to keep.

## In progress
- Nothing. Pass 1 is next.

## How Claude builds and checks things (Claude Code on the Mac, since 2026-09-26)
- Development moved from Cowork to **Claude Code running directly on Stefan's Mac** (see D010). npm, vitest, eslint and the dev server run natively in the project folder. The Cowork workarounds (a scratch copy of the project for Linux builds, checking the game through a published artifact) are no longer needed.
- Checking the game: `npm run dev`, then Chrome DevTools MCP against `http://localhost:5173` (console, screenshots, `window.__cd`, performance traces).
- The HUD shows runtime errors on screen (red panel) and a Renderer line, so problems show up in screenshots.
- Sharing: `npm run build:preview` still writes a single self-contained HTML (`dist-preview/city-defender-preview.html`, dev mode, with `window.__cd` and the error panel). Claude republishes it to the live preview artifact at the end of each pass so Stefan has a link to try.
- Git: one commit per pass, tagged `pass-NN` (see D011).

## Open questions for Stefan
- Target machine and browser for the performance budget? (Assumed: this iMac Pro, Chrome.)
- Prep timer: untimed by default (current design). Confirm.
- Remove the 6 skills flagged in TOOLING.md?
- OK to keep the sim/render split (`src/sim` plain TS) with only occasional tests? (Stefan: "don't want simulation code", which Claude read as "don't fake/simulate test runs"; confirm.)

## Known issues / tech debt
- Stepper needed an epsilon for float drift (fixed, covered by test).
- `tools/map/build.ts` is a stub that exits 1 until Pass 1.
- Console warning from @react-three/fiber 9.8: `THREE.Clock ... deprecated, use THREE.Timer`. Upstream and harmless. Revisit when R3F updates.
- Vite warns the bundle is >500 kB (it's three.js, 1.15 MB / 317 kB gzip). Ignore until Pass 10's perf pass.
- Fixed in Pass 0 check: the FPS meter overlapped the HUD (moved bottom-right), and eslint was linting build output and scripts without node globals.

## Pass log
| Pass | Date | Result | Screenshot | Notes |
|---|---|---|---|---|
| 0 | 2026-09-26 | ✅ typecheck, lint, 14/14 tests, build. Renders at 60 fps in Chrome (Vega 56). Controls, pause, step and restart verified | [pass-00.png](screenshots/pass-00.png) | drei Stats instead of r3f-perf; leva deferred to Pass 5 |
