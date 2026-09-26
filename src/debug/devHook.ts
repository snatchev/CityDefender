import { game, publish, restart, setTimeScale } from '../game';
import type { CityFileV0 } from '../sim/cityFile';
import { tickWorld, type World } from '../sim/world';

/**
 * Dev-only console API so agents (via Chrome DevTools MCP) and humans can inspect and drive the sim:
 *   __cd.world.tick, __cd.world.map, __cd.city.spawns, __cd.step(20), __cd.setSeed(7), __cd.setTimeScale(0)
 * Later passes add: spawnWave, placeBarricade, placeTower, snapshot().
 */
export interface DevHook {
  readonly world: World;
  readonly city: CityFileV0 | null;
  restart(seed?: number): void;
  setSeed(seed: number): void;
  setTimeScale(scale: number): void;
  /** Advance exactly `n` ticks synchronously (works while paused). */
  step(n?: number): number;
}

declare global {
  interface Window {
    __cd?: DevHook;
  }
}

export function installDevHook(): void {
  window.__cd = {
    get world() {
      return game.world;
    },
    get city() {
      return game.city;
    },
    restart,
    setSeed: (seed) => restart(seed),
    setTimeScale,
    step(n = 1) {
      for (let i = 0; i < n; i++) tickWorld(game.world);
      publish();
      return game.world.tick;
    },
  };
  console.info('[city-defender] dev hook ready: window.__cd');
}
