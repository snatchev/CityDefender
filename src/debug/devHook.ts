import { cameraBridge, type CameraView } from '../cameraBridge';
import { callWave, game, publish, setTimeScale } from '../game';
import { buildAt, focusRouteAt, restartRun, sellAt } from '../planning';
import type { CityFileV0 } from '../sim/cityFile';
import type { BarricadeType } from '../sim/barricades';
import { queueWave, type MobType } from '../sim/mobs';
import { TOWERS, upgradeTower, type TowerType } from '../sim/towers';
import type { Camera, Scene, WebGLRenderer } from 'three';
import { usePlan, type Ghost, type Route } from '../ui/planStore';
import { tickWorld, type World } from '../sim/world';

/**
 * Dev-only console API so agents (via Chrome DevTools MCP) and humans can inspect and drive the sim:
 *   __cd.world.tick, __cd.world.map, __cd.city.spawns, __cd.step(20), __cd.setSeed(7), __cd.setTimeScale(0)
 * Later passes add: placeTower, snapshot().
 */
export interface DevHook {
  readonly world: World;
  readonly city: CityFileV0 | null;
  restart(seed?: number): void;
  setSeed(seed: number): void;
  setTimeScale(scale: number): void;
  /** Queue `count` extra crawlers at spawn `spawnIndex` (index into `city.spawns`), outside the wave script. */
  spawnWave(count?: number, spawnIndex?: number, type?: MobType): void;
  /**
   * Build `type` at (tx, ty) as a click with that tool would (default: an MG Nest on a tower spot, a
   * sawhorse on any other street). A barricade type on a barricade upgrades it. Error or null.
   */
  build(tx: number, ty: number, type?: TowerType | BarricadeType): string | null;
  /** Upgrade the tower at (tx, ty) one tier (at the last tier, to tier-3 `branch`). Error or null. */
  upgrade(tx: number, ty: number, branch?: string): string | null;
  /** Skip to the prep of wave `n` (1-based), keeping everything built. For testing late waves. */
  jumpToWave(n: number): void;
  /** Sell the tower or barricade at (tx, ty) as a right-click would. Error or null. */
  sell(tx: number, ty: number): string | null;
  /** "Start wave" (ends prep early). */
  callWave(): void;
  /** Centre the camera on a tile (so a real click at the canvas centre hits it). */
  focusTile(tx: number, ty: number, view?: CameraView): void;
  /** The hover preview (hovered tile, ghost kind, error), as the planning UI sees it. */
  readonly ghost: Ghost | null;
  /** Street life (cars, people, trees; render/ambient/life.ts), for inspection. */
  readonly streetLife: unknown;
  /** The three.js renderer and scene (profiling in the browser). */
  readonly renderer: WebGLRenderer | null;
  readonly scene: Scene | null;
  readonly camera: Camera | null;
  /** Render at this pixel ratio (to tell fill-rate cost from everything else); returns the old one. */
  setPixelRatio(ratio: number): number;
  /** This wave's routes and the focused one (station index), as the planning UI sees them. */
  readonly plan: { routes: Route[]; focus: number | null };
  /** Focus a station's route by name or index, as a click on it would (null clears). */
  focusRoute(station: string | number | null): number | null;
  /** Last frame's renderer counters (draw calls, triangles) and GPU resources. */
  renderInfo(): { calls: number; triangles: number; geometries: number; textures: number } | null;
  /** Advance exactly `n` ticks synchronously (works while paused). */
  step(n?: number): number;
  /** Show/hide every scene object with this name (perf bisecting); returns how many matched. */
  setVisible(name: string, visible: boolean): number;
}

declare global {
  interface Window {
    __cd?: DevHook;
  }
}

let renderer: WebGLRenderer | null = null;
let scene: Scene | null = null;
let camera: Camera | null = null;
/** Called from the Canvas once the renderer exists (dev builds). */
export function registerRenderer(gl: WebGLRenderer, root: Scene, cam: Camera): void {
  renderer = gl;
  scene = root;
  camera = cam;
}

let streetLife: unknown = null;
/** The street life simulation (render/ambient), for inspection. */
export function registerStreetLife(life: unknown): void {
  streetLife = life;
}

export function installDevHook(): void {
  window.__cd = {
    get world() {
      return game.world;
    },
    get city() {
      return game.city;
    },
    renderInfo() {
      if (!renderer) return null;
      const { render, memory } = renderer.info;
      return {
        calls: render.calls,
        triangles: render.triangles,
        geometries: memory.geometries,
        textures: memory.textures,
      };
    },
    setVisible(name, visible) {
      let n = 0;
      scene?.traverse((o) => {
        if (o.name !== name) return;
        o.visible = visible;
        n++;
      });
      return n;
    },
    get ghost() {
      return usePlan.getState().ghost;
    },
    get streetLife() {
      return streetLife;
    },
    get renderer() {
      return renderer;
    },
    get scene() {
      return scene;
    },
    get camera() {
      return camera;
    },
    setPixelRatio(ratio) {
      const old = renderer?.getPixelRatio() ?? 1;
      renderer?.setPixelRatio(ratio);
      return old;
    },
    get plan() {
      const p = usePlan.getState();
      return { routes: p.routes, focus: p.focus?.station ?? null };
    },
    focusRoute(station) {
      const w = game.world;
      const index =
        typeof station === 'string'
          ? (game.city?.spawns.findIndex((s) => s.name === station) ?? -1)
          : station;
      const route = usePlan.getState().routes.find((r) => r.station === index);
      if (!w.map || !route) return focusRouteAt(-99, -99); // clears
      const mid = route.tiles[Math.floor(route.tiles.length / 2)]!;
      return focusRouteAt(mid % w.map.width, Math.floor(mid / w.map.width));
    },
    restart: restartRun,
    setSeed: restartRun,
    build(tx, ty, type) {
      const w = game.world;
      const i = ty * (w.map?.width ?? 0) + tx;
      const towerSpot = (w.slots?.towerSlot[i] ?? 0) !== 0;
      const t = type ?? (towerSpot ? 'mgNest' : 'sawhorse');
      return buildAt(
        tx,
        ty,
        t in TOWERS
          ? { kind: 'tower', type: t as TowerType }
          : { kind: 'barricade', type: t as BarricadeType },
      );
    },
    upgrade(tx, ty, branch) {
      const w = game.world;
      const id = w.towerAt[ty * (w.map?.width ?? 0) + tx];
      if (!id) return 'no tower here';
      const err = upgradeTower(w, id, branch ?? null);
      publish();
      return err;
    },
    jumpToWave(n) {
      const w = game.world;
      w.mobs = [];
      w.spawners = [];
      w.shells = [];
      w.grantOffer = null;
      w.wave = Math.max(0, Math.min(w.waves.length - 1, n - 1));
      w.phase = 'prep';
      w.phaseTicks = 30 * 20;
      publish();
    },
    sell: sellAt,
    callWave,
    focusTile: (tx, ty, view) => cameraBridge.focusTile?.(tx, ty, view),
    setTimeScale,
    spawnWave(count = 20, spawnIndex = 0, type = 'skitterling') {
      queueWave(game.world, { count, spawnIndex, type });
      publish();
    },
    step(n = 1) {
      for (let i = 0; i < n; i++) tickWorld(game.world);
      publish();
      return game.world.tick;
    },
  };
  console.info('[city-defender] dev hook ready: window.__cd');
}
