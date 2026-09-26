# City Defender — Tooling & Agent Setup

## Where to develop
Use **Claude Code in the `CityDefender` folder** (the main tool since 2026-09-26, see D010). Claude Code loads `CLAUDE.md` and `.claude/skills/` automatically. Cowork does not load folder skills, so use it only for planning and docs.

## Skills (28 installed via `npx skills`, see `skills-lock.json`)
Sources: `EnzeD/r3f-skills` (r3f‑*), `gamedev-skills/awesome-gamedev-agent-skills` (the rest).

**All 28 are kept** (D018). Prefer the R3F skills; the others are for background knowledge.
- R3F: `r3f-fundamentals`, `r3f-geometry`, `r3f-interaction`, `r3f-animation`, `r3f-materials`, `r3f-lighting`, `r3f-loaders`, `r3f-textures`, `r3f-shaders`, `r3f-postprocessing`, `r3f-physics`
- Game: `tower-defense`, `game-ai`, `game-feel`, `level-design`, `procedural-gen`, `performance-optimization`, `game-ui-ux`, `camera-systems`, `input-systems`, `audio-design`, `save-systems`, `create-game-assets`, `ai-behavior-trees-utility-ai`
- Background: `threejs-scene-setup`, `threejs-gltf-loading`, `threejs-materials-lighting` (vanilla three.js: use their material, lighting and loading knowledge, not their setup, since `<Canvas>` and `useFrame` replace the manual renderer and loop), `shader-programming` (shader fundamentals behind `r3f-shaders`).

**Add:**
- `npx skills add vercel-labs/agent-skills` → use `react-best-practices` (and optionally `composition-patterns`).
- Project skills to write later (in `.claude/skills/`): `city-map-pipeline` (how to run and extend `tools/map`, after Pass 6) and `balance-data` (how to edit and validate the JSON tables, after Pass 7).

**Which skill for which pass:**
| Pass | Skills to load |
|---|---|
| 0 | r3f-fundamentals, react-best-practices |
| 1, 6 | procedural-gen, r3f-geometry, level-design |
| 2 | r3f-geometry (instancing), game-ai |
| 3 | game-ai, r3f-interaction, tower-defense |
| 4–5 | tower-defense, game-ui-ux, game-feel, input-systems, camera-systems |
| 7–9 | tower-defense, game-ai, save-systems |
| 10 | r3f-loaders, r3f-animation, r3f-materials, r3f-lighting, r3f-postprocessing, r3f-shaders, audio-design, create-game-assets, performance-optimization |

## MCP servers
```bash
# Essential: lets Claude see the running game (console, screenshots, perf traces, heap snapshots)
claude mcp add chrome-devtools --scope user npx chrome-devtools-mcp@latest
# or, as a Claude Code plugin with bundled skills:
#   /plugin marketplace add ChromeDevTools/chrome-devtools-mcp
#   /plugin install chrome-devtools-mcp@chrome-devtools-plugins

# Optional: scripted UI interactions for e2e placement tests
claude mcp add playwright npx @playwright/mcp@latest
```
Useful flags for chrome-devtools-mcp: `--isolated` (temp profile), `--headless`, `--browser-url=http://127.0.0.1:9222` (attach to an existing Chrome).

## Install
Run `npm run setup` (see `scripts/setup.sh`) **on the Mac**. Claude Code runs on the Mac too, so it can install packages and run every npm script directly in the project folder. (Cowork's Linux VM couldn't: its native binaries don't run on macOS.)

## CLI tools
| Purpose | Tool |
|---|---|
| App | `npm create vite@latest -- --template react-ts`, `three`, `@react-three/fiber`, `@react-three/drei`, `zustand`, `zod` |
| Dev | drei `Stats` (FPS), `leva` (live tuning, Pass 5+), `vitest`, `@playwright/test`, `eslint`, `prettier`, `tsx` |
| Map | `osmtogeojson`, `@turf/turf`, `npx mapshaper`, `npx @gltf-transform/cli`, `uvx overturemaps` (Pass 6) |

## Verification routine (end of every pass)
1. `npm run typecheck && npm test`
2. `npm run dev`, then with Chrome DevTools MCP: open `http://localhost:5173`, check console for errors, take a screenshot → `docs/screenshots/pass-NN.png`.
3. `npm run build:preview` and republish the live preview artifact.
4. Update STATUS.md, commit, and tag `pass-NN`.
5. For performance passes: record a performance trace during a 200‑mob wave and note FPS in STATUS.md.
