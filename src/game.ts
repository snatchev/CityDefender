import { loadCityFile } from './loadCity';
import { cityToTileMap, type CityFileV0 } from './sim/cityFile';
import { FixedStepper } from './sim/stepper';
import { queueWave } from './sim/mobs';
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

export function restart(seed: number = game.world.seed): void {
  resetWorld(game.world, seed);
  game.stepper.reset();
  publish();
}

export function setTimeScale(scale: number): void {
  game.stepper.timeScale = scale;
  publish();
}

/** Send `count` crawlers from a station (default: the outermost one). */
export function spawnWave(count: number, spawnIndex = 0): void {
  queueWave(game.world, count, spawnIndex);
  publish();
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
  publish();
}
