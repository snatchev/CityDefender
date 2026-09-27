import wavesData from './data/waves.json';
import { loadCityFile } from './loadCity';
import { cityToTileMap, type CityFileV0 } from './sim/cityFile';
import { queueWave } from './sim/mobs';
import { startRun, startWave, type WaveDef } from './sim/phase';
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
}

/** The single running game. The renderer and UI read from it; only sim functions mutate `world`. */
export const game: Game = {
  world: createWorld(DEFAULT_SEED),
  stepper: new FixedStepper(),
  city: null,
};

/** Push a low-frequency snapshot of sim state to the UI store (never call per frame). */
export function publish(): void {
  useHud.getState().publishSim(game.world, game.stepper.timeScale);
}

/** Start a fresh run on the loaded city (also used by Restart / Play again). */
export function restart(seed: number = game.world.seed): void {
  resetWorld(game.world, seed);
  game.stepper.reset();
  if (game.city) startRun(game.world, cityWaves(game.city));
  publish();
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

/** Dev only: send `count` crawlers from a station outside the wave script. */
export function spawnWave(count: number, spawnIndex = 0): void {
  queueWave(game.world, count, spawnIndex);
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
      type: g.type as WaveDef['groups'][number]['type'],
      count: g.count,
      hpMul: g.hpMul,
      intervalS: g.intervalS,
    })),
  }));
}

export async function loadCity(name: string): Promise<void> {
  const city = await loadCityFile(name);
  game.city = city;
  setMap(game.world, cityToTileMap(city));
  useHud.getState().setCity({
    name: city.meta.city,
    title: city.meta.title,
    width: city.meta.width,
    height: city.meta.height,
    stations: city.spawns.map((s) => s.name),
  });
  restart();
}
