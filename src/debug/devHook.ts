import { cameraBridge, type CameraView } from '../cameraBridge';
import { callWave, game, publish, setTimeScale } from '../game';
import { buildAt, restartRun, sellAt } from '../planning';
import type { CityFileV0 } from '../sim/cityFile';
import type { BarricadeType } from '../sim/barricades';
import { queueWave } from '../sim/mobs';
import { TOWERS, upgradeTower, type TowerType } from '../sim/towers';
import type { Scene, WebGLRenderer } from 'three';
import { usePlan, type Ghost } from '../ui/planStore';
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
  spawnWave(count?: number, spawnIndex?: number): void;
  /**
   * Build `type` at (tx, ty) as a click with that tool would (default: an MG Nest on a tower spot, a
   * sawhorse on any other street). A barricade type on a barricade upgrades it. Error or null.
   */
  build(tx: number, ty: number, type?: TowerType | BarricadeType): string | null;
  /** Upgrade the tower at (tx, ty) one tier. Error or null. */
  upgrade(tx: number, ty: number): string | null;
  /** Sell the tower or barricade at (tx, ty) as a right-click would. Error or null. */
  sell(tx: number, ty: number): string | null;
  /** "Start wave" (ends prep early). */
  callWave(): void;
  /** Centre the camera on a tile (so a real click at the canvas centre hits it). */
  focusTile(tx: number, ty: number, view?: CameraView): void;
  /** The hover preview (hovered tile, ghost kind, error), as the planning UI sees it. */
  readonly ghost: Ghost | null;
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
/** Called from the Canvas once the renderer exists (dev builds). */
export function registerRenderer(gl: WebGLRenderer, root: Scene): void {
  renderer = gl;
  scene = root;
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
    upgrade(tx, ty) {
      const w = game.world;
      const id = w.towerAt[ty * (w.map?.width ?? 0) + tx];
      if (!id) return 'no tower here';
      return upgradeTower(w, id);
    },
    sell: sellAt,
    callWave,
    focusTile: (tx, ty, view) => cameraBridge.focusTile?.(tx, ty, view),
    setTimeScale,
    spawnWave(count = 20, spawnIndex = 0) {
      queueWave(game.world, { count, spawnIndex });
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
