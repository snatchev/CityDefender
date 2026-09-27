import rulesData from '../data/rules.json';
import { isPlanning } from './phase';
import type { World } from './world';

/** When something was built: its wave, and whether that was during planning (prep or sandbox). */
export interface BuiltAt {
  wave: number;
  planning: boolean;
}

export function builtNow(world: World): BuiltAt {
  return { wave: world.wave, planning: isPlanning(world.phase) };
}

/**
 * Sell value (DESIGN §3.1): anything built during the current prep comes back at 100% ("free undo"),
 * everything else at `sellRefund` (70%).
 */
export function sellValue(world: World, cost: number, built: BuiltAt): number {
  const freeUndo = isPlanning(world.phase) && built.planning && built.wave === world.wave;
  return freeUndo ? cost : Math.floor(cost * rulesData.sellRefund);
}
