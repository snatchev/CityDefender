import grantsData from './data/grants.json';
import type { GrantDef } from './data/schema';
import wavesData from './data/waves.json';
import { loadBackdropFile, loadBuildingsFile, loadCityFile } from './loadCity';
import {
  cityToTileMap,
  type BackdropFileV0,
  type BuildingsFileV1,
  type CityFileV0,
} from './sim/cityFile';
import type { EliteType, MobType } from './sim/mobs';
import { isOver, pickGrant, startRun, startWave, type WaveDef } from './sim/phase';
import { restoreRun, saveRun, type SaveV1 } from './sim/save';
import { FixedStepper } from './sim/stepper';
import { createWorld, resetWorld, setMap, type World } from './sim/world';
import { useHud } from './ui/store';

/** 1682: the year of Penn's plan for Philadelphia. */
export const DEFAULT_SEED = 1682;

export interface Game {
  world: World;
  stepper: FixedStepper;
  /** The loaded city file (labels, station names, meta). Its tiles live in `world.map`. */
  city: CityFileV0 | null;
  /** Building outlines and street centerlines for drawing (never read by the sim). */
  buildings: BuildingsFileV1 | null;
  /** The decorative city beyond the level (never read by the sim). */
  backdrop: BackdropFileV0 | null;
}

/** The single running game. The renderer and UI read from it; only sim functions mutate `world`. */
export const game: Game = {
  world: createWorld(DEFAULT_SEED),
  stepper: new FixedStepper(),
  city: null,
  buildings: null,
  backdrop: null,
};

/** Push a low-frequency snapshot of sim state to the UI store (never call per frame). */
export function publish(): void {
  autosave();
  useHud.getState().publishSim(game.world, game.stepper.timeScale);
}

// ---- Save / resume (browser storage; a run is saved at the start of every prep) ----

const saveKey = (city: string) => `cityDefender.run.${city}`;
let savedWave = -1;

/** Save at the start of each new prep; forget the save once the run is over. */
function autosave(): void {
  const city = game.city?.meta.city;
  const w = game.world;
  if (!city) return;
  try {
    if (isOver(w.phase)) {
      localStorage.removeItem(saveKey(city));
      savedWave = -1;
      return;
    }
    if (w.phase !== 'prep' || w.wave === savedWave || w.wave === 0) return;
    const save = saveRun(w, city);
    if (!save) return;
    localStorage.setItem(saveKey(city), JSON.stringify(save));
    savedWave = w.wave;
  } catch {
    // Storage can be unavailable (private window, blocked); the game just doesn't save.
  }
}

/** The saved run for the loaded city, if there is one this build can restore. */
export function savedRun(): SaveV1 | null {
  const city = game.city?.meta.city;
  if (!city) return null;
  try {
    const raw = localStorage.getItem(saveKey(city));
    const save = raw ? (JSON.parse(raw) as SaveV1) : null;
    return save && save.version === 1 && save.city === city ? save : null;
  } catch {
    return null;
  }
}

/** Forget the saved run (the player chose a new run instead). */
export function discardSave(): void {
  const city = game.city?.meta.city;
  if (!city) return;
  try {
    localStorage.removeItem(saveKey(city));
  } catch {
    // nothing saved, nothing to forget
  }
}

/** Continue the saved run. Returns an error if it can't be restored. */
export function resumeRun(): string | null {
  const save = savedRun();
  if (!save || !game.city) return 'no saved run';
  restart(save.seed);
  const err = restoreRun(game.world, save, game.city.meta.city);
  savedWave = game.world.wave;
  publish();
  return err;
}

/** Take a Council Grant from the current offer. */
export function chooseGrant(id: string): string | null {
  const err = pickGrant(game.world, id);
  publish();
  return err;
}

/** Start a fresh run on the loaded city (also used by Restart / Play again). */
export function restart(seed: number = game.world.seed): void {
  resetWorld(game.world, seed);
  game.stepper.reset();
  savedWave = -1;
  if (game.city) startRun(game.world, cityWaves(game.city), cityGrants(game.city));
  publish();
}

/** Fraction of a tick to interpolate by when drawing (0 while paused, so paused frames hold still). */
export function renderAlpha(): number {
  return game.stepper.paused ? 0 : game.stepper.alpha;
}

export function setTimeScale(scale: number): void {
  game.stepper.timeScale = scale;
  publish();
}

/** "Start wave" during prep: ends the countdown early for a bonus. */
export function callWave(): void {
  startWave(game.world);
  publish();
}

/** The city's wave script from src/data/waves.json, with station names resolved to spawn indices. */
function cityWaves(city: CityFileV0): WaveDef[] {
  const script = (wavesData as Record<string, (typeof wavesData)['philly']>)[city.meta.city];
  if (!script) throw new Error(`no waves for city "${city.meta.city}" in src/data/waves.json`);
  const index = (name: string) => {
    const i = city.spawns.findIndex((s) => s.name === name);
    if (i < 0) throw new Error(`waves.json: unknown station "${name}" in ${city.meta.city}`);
    return i;
  };
  return script.map((wave) => ({
    groups: wave.groups.map((g) => ({
      spawnIndex: index(g.station),
      type: g.type as MobType,
      count: g.count,
      hpMul: g.hpMul,
      intervalS: g.intervalS,
      elite: ((g as { elite?: string }).elite ?? null) as EliteType | null,
    })),
  }));
}

/** The city's Council Grants from src/data/grants.json (a city without any has no grant phases). */
function cityGrants(city: CityFileV0): GrantDef[] {
  return (grantsData as Record<string, GrantDef[]>)[city.meta.city] ?? [];
}

/** Load a city and install its map. Start a run afterwards (planning.ts `restartRun`). */
export async function loadCity(name: string): Promise<void> {
  const [city, buildings, backdrop] = await Promise.all([
    loadCityFile(name),
    loadBuildingsFile(name),
    loadBackdropFile(name),
  ]);
  game.city = city;
  game.buildings = buildings;
  game.backdrop = backdrop;
  setMap(game.world, cityToTileMap(city));
  useHud.getState().setCity({
    name: city.meta.city,
    title: city.meta.title,
    stations: city.spawns.map((s) => s.name),
  });
}
