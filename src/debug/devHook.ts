import { game, publish, restart, setTimeScale, spawnWave } from '../game';
import { placeBarricadeAt, refreshPlanning, removeBarricadeAt, selectStation } from '../planning';
import type { CityFileV0 } from '../sim/cityFile';
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
  /** Queue `count` crawlers at spawn `spawnIndex` (index into `city.spawns`, outermost first). */
  spawnWave(count?: number, spawnIndex?: number): void;
  /** Place a sawhorse across the street at (tx, ty). Returns an error string, or null on success. */
  placeBarricade(tx: number, ty: number): string | null;
  removeBarricade(tx: number, ty: number): boolean;
  /** Select the station whose route is drawn (index into `city.spawns`). */
  selectStation(index: number): void;
  /** Centre the camera on a tile (so a real click at the canvas centre hits it). */
  focusTile(tx: number, ty: number): void;
  /** Advance exactly `n` ticks synchronously (works while paused). */
  step(n?: number): number;
}

declare global {
  interface Window {
    __cd?: DevHook;
  }
}

type FocusFn = (tx: number, ty: number) => void;
let focus: FocusFn | null = null;
/** Called by render/DevCamera.tsx once the camera controls exist. */
export function registerFocus(fn: FocusFn | null): void {
  focus = fn;
}

export function installDevHook(): void {
  window.__cd = {
    get world() {
      return game.world;
    },
    get city() {
      return game.city;
    },
    restart: (seed) => {
      restart(seed);
      refreshPlanning(true);
    },
    setSeed: (seed) => {
      restart(seed);
      refreshPlanning(true);
    },
    placeBarricade: placeBarricadeAt,
    removeBarricade: removeBarricadeAt,
    selectStation,
    focusTile: (tx, ty) => focus?.(tx, ty),
    setTimeScale,
    spawnWave: (count = 20, spawnIndex = 0) => spawnWave(count, spawnIndex),
    step(n = 1) {
      for (let i = 0; i < n; i++) tickWorld(game.world);
      publish();
      return game.world.tick;
    },
  };
  console.info('[city-defender] dev hook ready: window.__cd');
}
