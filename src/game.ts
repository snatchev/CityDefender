import { FixedStepper } from './sim/stepper';
import { createWorld, resetWorld, type World } from './sim/world';
import { useHud } from './ui/store';

/** 1682: the year of Penn's plan for Philadelphia. */
export const DEFAULT_SEED = 1682;

export interface Game {
  world: World;
  stepper: FixedStepper;
}

/** The single running game. The renderer and UI read from it; only sim functions mutate `world`. */
export const game: Game = {
  world: createWorld(DEFAULT_SEED),
  stepper: new FixedStepper(),
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
