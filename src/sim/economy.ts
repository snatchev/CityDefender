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

/**
 * End-of-run score and stars (DESIGN §3.2): score = bounty earned + Integrity × `scoreIntegrityMul`
 * + unspent cash (mutator multipliers come in Pass 11). Stars: ★ won, ★★ won with Integrity ≥ 50,
 * ★★★ won with Integrity untouched.
 */
export function runScore(world: World): { score: number; stars: number } {
  const score =
    world.stats.bounty + world.integrity * rulesData.scoreIntegrityMul + Math.max(0, world.cash);
  const won = world.phase === 'won';
  const stars = !won
    ? 0
    : world.integrity >= rulesData.startIntegrity
      ? 3
      : world.integrity >= 50
        ? 2
        : 1;
  return { score, stars };
}
