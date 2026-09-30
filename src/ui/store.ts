import { create } from 'zustand';
import { TICK_HZ } from '../sim/constants';
import type { EliteType, MobType } from '../sim/mobs';
import { stationsOpeningNextWave, type Phase } from '../sim/phase';
import { runScore } from '../sim/economy';
import { simTimeSeconds, type World } from '../sim/world';

export interface CityInfo {
  name: string;
  title: string;
  /** Station names, outermost first (index = spawn index). */
  stations: string[];
}

/** UI-facing snapshot of the sim. Updated at event rate (4 Hz or on user action), not per frame. */
interface HudState {
  tick: number;
  simTime: number;
  seed: number;
  timeScale: number;
  integrity: number;
  mobs: number;
  leaked: number;
  kills: number;
  cash: number;
  phase: Phase;
  /** 1-based wave number and total. */
  wave: number;
  waveCount: number;
  /** Seconds left in the prep/debrief countdown. */
  phaseSeconds: number;
  /** Stations opening next wave for the first time (breach telegraph, DESIGN §3.1). */
  breaches: number[];
  /** Council Grants on offer (grant phase), or null. */
  grantOffer: { id: string; name: string; text: string }[] | null;
  /** Interest paid at the last debrief. */
  lastInterest: number;
  /** End-of-run numbers (DESIGN §3.2). */
  score: number;
  stars: number;
  barricadesLost: number;
  interestTotal: number;
  /** The current wave's composition (wave intel, DESIGN §3.1). */
  waveIntel: {
    spawnIndex: number;
    type: MobType;
    count: number;
    hpMul: number;
    elite: EliteType | null;
  }[];
  /** Set once the WebGL renderer is up (Canvas onCreated). */
  renderer: string | null;
  /** Set once the city file has loaded; the scene renders the map from `game.city` after that. */
  city: CityInfo | null;
  /** Short feedback line for the player (e.g. why a placement failed). */
  notice: string | null;
  /** Debug menu toggle for the FPS meter. */
  showFps: boolean;
  /** Runtime errors surfaced on screen (so they show up in screenshots, not just the console). */
  errors: string[];
  publishSim: (world: World, timeScale: number) => void;
  setRenderer: (info: string) => void;
  setCity: (city: CityInfo) => void;
  setNotice: (notice: string | null) => void;
  setShowFps: (show: boolean) => void;
  pushError: (message: string) => void;
}

export const useHud = create<HudState>()((set, get) => ({
  tick: 0,
  simTime: 0,
  seed: 0,
  timeScale: 1,
  integrity: 0,
  mobs: 0,
  leaked: 0,
  kills: 0,
  cash: 0,
  phase: 'idle',
  wave: 0,
  waveCount: 0,
  phaseSeconds: 0,
  waveIntel: [],
  breaches: [],
  grantOffer: null,
  lastInterest: 0,
  score: 0,
  stars: 0,
  barricadesLost: 0,
  interestTotal: 0,
  renderer: null,
  city: null,
  notice: null,
  showFps: false,
  errors: [],
  setRenderer: (renderer) => set({ renderer }),
  setCity: (city) => set({ city }),
  setNotice: (notice) => set({ notice }),
  setShowFps: (showFps) => set({ showFps }),
  pushError: (message) => set((s) => ({ errors: [...s.errors, message].slice(-5) })),
  publishSim: (world, timeScale) =>
    set({
      tick: world.tick,
      simTime: simTimeSeconds(world),
      seed: world.seed,
      timeScale,
      integrity: world.integrity,
      mobs: world.mobs.length + world.spawners.reduce((n, s) => n + s.remaining, 0),
      leaked: world.stats.leaked,
      kills: world.stats.kills,
      cash: world.cash,
      phase: world.phase,
      wave: world.wave + 1,
      waveCount: world.waves.length,
      phaseSeconds: Math.ceil(world.phaseTicks / TICK_HZ),
      waveIntel: sameIntel(get().waveIntel, world),
      breaches: same(get().breaches, stationsOpeningNextWave(world)),
      grantOffer: same(
        get().grantOffer,
        world.grantOffer?.map((id) => {
          const g = world.grantPool.find((x) => x.id === id)!;
          return { id, name: g.name, text: g.text };
        }) ?? null,
      ),
      lastInterest: world.stats.lastInterest,
      ...runScore(world),
      barricadesLost: world.stats.barricadesDestroyed,
      interestTotal: world.stats.interest,
    }),
}));

/** Keep the previous value when it hasn't changed, so subscribers don't re-render at 4 Hz. */
function same<T>(prev: T, next: T): T {
  return JSON.stringify(prev) === JSON.stringify(next) ? prev : next;
}

/** Keep the previous array when the wave hasn't changed, so the intel panel doesn't re-render at 4 Hz. */
function sameIntel(prev: HudState['waveIntel'], world: World): HudState['waveIntel'] {
  const groups = world.waves[world.wave]?.groups ?? [];
  const next = groups.map((g) => ({
    spawnIndex: g.spawnIndex,
    type: g.type,
    count: g.count,
    hpMul: g.hpMul,
    elite: g.elite ?? null,
  }));
  return JSON.stringify(prev) === JSON.stringify(next) ? prev : next;
}
