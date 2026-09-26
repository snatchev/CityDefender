import { create } from 'zustand';
import { simTimeSeconds, type World } from '../sim/world';

/** UI-facing snapshot of the sim. Updated at event rate (≈1 Hz or on user action), not per frame. */
interface HudState {
  tick: number;
  simTime: number;
  seed: number;
  timeScale: number;
  /** Set once the WebGL renderer is up (Canvas onCreated). */
  renderer: string | null;
  /** Runtime errors surfaced on screen (so they show up in screenshots, not just the console). */
  errors: string[];
  publishSim: (world: World, timeScale: number) => void;
  setRenderer: (info: string) => void;
  pushError: (message: string) => void;
}

export const useHud = create<HudState>()((set) => ({
  tick: 0,
  simTime: 0,
  seed: 0,
  timeScale: 1,
  renderer: null,
  errors: [],
  setRenderer: (renderer) => set({ renderer }),
  pushError: (message) => set((s) => ({ errors: [...s.errors, message].slice(-5) })),
  publishSim: (world, timeScale) =>
    set({ tick: world.tick, simTime: simTimeSeconds(world), seed: world.seed, timeScale }),
}));
