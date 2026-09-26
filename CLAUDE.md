# City Defender

Tower defense on **real city streets**. Alien bugs pour out of subway stations and sewers and march down real streets to take a landmark. Level 1: **Philadelphia, defend City Hall.** Built with Vite + React + TypeScript + React Three Fiber.

Owner: **Stefan**, an experienced software engineer who is new to React/three.js and game dev. **Claude does most of the implementation** and follows framework best practices. Stefan reviews the design and the simulation logic.

## Get caught up (read in this order)
1. [docs/STATUS.md](docs/STATUS.md): where we are, what's next, open questions.
2. [docs/IMPLEMENTATION_PLAN.md](docs/IMPLEMENTATION_PLAN.md): the pass you're working on (read its section fully).
3. [docs/DESIGN.md](docs/DESIGN.md): game rules. Sections §3 (round loop) and §5 (pathfinding/siege rule) matter most.
4. [docs/DECISIONS.md](docs/DECISIONS.md): what's settled and why. Don't relitigate without a new entry.
5. [docs/TOOLING.md](docs/TOOLING.md): skills per pass, MCP, verification routine.
6. As needed: [docs/IDEAS.md](docs/IDEAS.md) (backlog), [docs/research/map-sources.md](docs/research/map-sources.md).

## Working rules
- **One pass at a time.** Ship something visible at the end of every pass. Respect the timebox. Don't pull work forward from later passes. Leave `// TODO(pass-N):` instead.
- **New ideas go to docs/IDEAS.md**, not into the current pass.
- **Architecture:**
  - `src/sim/` is plain TS with no three/react imports, a fixed 20 Hz tick and seeded RNG. Unit‑test it with vitest on ASCII fixture maps.
  - `src/render/` is R3F. Read sim state in `useFrame` via refs, **never setState per frame**, and use InstancedMesh for crowds.
  - `src/ui/` is a React DOM overlay with a zustand store updated at event rate.
  - `src/data/*.json` holds all balance numbers. No magic numbers in code.
  - `tools/map/` is the offline map pipeline (Node + tsx). Output goes to `public/cities/<city>/`.
- **Dev debug hook:** `window.__cd` exposes world state and commands (spawnWave, setSeed, placeBarricade…) for inspection via Chrome DevTools MCP.
- **Attribution:** keep "© OpenStreetMap contributors" visible in‑game.
- TypeScript strict. Small modules. Prefer pure functions in `sim/`.
- **Testing policy (Stefan):** write the *occasional* unit test for logic that is important or tricky (pathfinding, siege costs, the fixed-step timer, damage math). Don't write tests for every change. The codebase will churn a lot. Never fake or simulate a test run: run the real tools.
- **Seeing the game:** `npm run dev` → check `http://localhost:5173` with Chrome DevTools MCP. At the end of a pass, `npm run build:preview` and republish the live preview artifact. See the "How Claude builds and checks things" section in docs/STATUS.md.

## Commands
- `npm run setup`: one-time dependency install (run on the Mac)
- `npm run dev`: dev server at http://localhost:5173
- `npm test` / `npm run typecheck` / `npm run lint`
- `npm run map:build -- philly`: regenerate `public/cities/philly/` from cached data

## Definition of done for a pass
Typecheck, lint and tests green. Checked in a real browser: no errors in the HUD's error panel or console, and a screenshot at `docs/screenshots/pass-NN.png`. Live preview artifact republished. `docs/STATUS.md` updated (pass log, deferred items, known issues). New decisions added to `docs/DECISIONS.md`. Commit tagged `pass-NN`.

## Skills
Installed in `.claude/skills/` (symlinks to `.agents/skills/`). docs/TOOLING.md maps skills to passes. Prefer `r3f-*` over the vanilla `threejs-*` skills.
