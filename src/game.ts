import { loadCityFile } from './loadCity';
import { cityToTileMap, type CityFileV0 } from './sim/cityFile';
import { FixedStepper } from './sim/stepper';
import { createWorld, resetWorld, type World } from './sim/world';
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

export async function loadCity(name: string): Promise<void> {
  const city = await loadCityFile(name);
  game.city = city;
  game.world.map = cityToTileMap(city);
  useHud.getState().setCity({
    name: city.meta.city,
    title: city.meta.title,
    width: city.meta.width,
    height: city.meta.height,
    spawns: city.spawns.length,
  });
  publish();
}
