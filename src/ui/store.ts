import { create } from 'zustand';
import { simTimeSeconds, type World } from '../sim/world';

export interface CityInfo {
  name: string;
  title: string;
  width: number;
  height: number;
  spawns: number;
}

/** UI-facing snapshot of the sim. Updated at event rate (≈1 Hz or on user action), not per frame. */
interface HudState {
  tick: number;
  simTime: number;
  seed: number;
  timeScale: number;
  /** Set once the WebGL renderer is up (Canvas onCreated). */
  renderer: string | null;
  /** Set once the city file has loaded; the scene renders the map from `game.city` after that. */
  city: CityInfo | null;
  /** Runtime errors surfaced on screen (so they show up in screenshots, not just the console). */
  errors: string[];
  publishSim: (world: World, timeScale: number) => void;
  setRenderer: (info: string) => void;
  setCity: (city: CityInfo) => void;
  pushError: (message: string) => void;
}

export const useHud = create<HudState>()((set) => ({
  tick: 0,
  simTime: 0,
  seed: 0,
  timeScale: 1,
  renderer: null,
  city: null,
  errors: [],
  setRenderer: (renderer) => set({ renderer }),
  setCity: (city) => set({ city }),
  pushError: (message) => set((s) => ({ errors: [...s.errors, message].slice(-5) })),
  publishSim: (world, timeScale) =>
    set({ tick: world.tick, simTime: simTimeSeconds(world), seed: world.seed, timeScale }),
}));
