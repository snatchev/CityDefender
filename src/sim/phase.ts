import rulesData from '../data/rules.json';
import type { GrantDef } from '../data/schema';
import { repairBarricades } from './barricades';
import { TICK_HZ } from './constants';
import { applyGrant, grantDue, offerGrants } from './grants';
import { queueWave, type SpawnGroup } from './mobs';
import type { World } from './world';

/**
 * Run phases (DESIGN §3.1): PREP (countdown, build) → ASSAULT (waves spawn, towers fire) →
 * DEBRIEF (short pause, clear bonus and interest) → [GRANT every few waves: pick 1 of 3 Council
 * Grants] → PREP … until the last wave is cleared (won) or City Hall Integrity hits 0 (lost).
 * 'idle' = no run started (sandbox and tests).
 */
export type Phase = 'idle' | 'prep' | 'assault' | 'debrief' | 'grant' | 'won' | 'lost';

/** Planning time: prep, or the no-run sandbox. Barricades can be edited; builds count as "this prep". */
export function isPlanning(phase: Phase): boolean {
  return phase === 'prep' || phase === 'idle';
}

/** The run has ended; the sim is frozen and nothing can be built or sold. */
export function isOver(phase: Phase): boolean {
  return phase === 'won' || phase === 'lost';
}

export interface WaveDef {
  groups: SpawnGroup[];
}

/** Start a run on `waves`, with this city's Council Grants to draw from (empty: no grants). */
export function startRun(world: World, waves: WaveDef[], grantPool: GrantDef[] = []): void {
  world.waves = waves;
  world.grantPool = grantPool;
  world.wave = 0;
  enterPrep(world);
}

function enterPrep(world: World): void {
  world.phase = 'prep';
  world.phaseTicks = Math.round((rulesData.prepSeconds + world.mods.prepSecondsAdd) * TICK_HZ);
  repairBarricades(world); // self-repairing walls (Blast Wall) are back to full
}

/** End prep and send the current wave. Calling it early pays a bonus for the prep time skipped. */
export function startWave(world: World): void {
  if (world.phase !== 'prep') return;
  const bonus = Math.floor((world.phaseTicks / TICK_HZ) * rulesData.earlyCallBonusPerS);
  world.cash += bonus;
  world.stats.earlyBonus += bonus;
  for (const g of world.waves[world.wave]!.groups) queueWave(world, g);
  world.phase = 'assault';
  world.phaseTicks = 0;
}

export function waveClearBonus(waveIndex: number): number {
  return rulesData.waveClearBonusBase + rulesData.waveClearBonusPerWave * (waveIndex + 1);
}

/** Interest on banked cash (DESIGN §3.3): `interestRate` of it, capped (grants can raise the cap). */
export function interestOn(world: World): number {
  const cap = rulesData.interestCap + world.mods.interestCapAdd;
  return Math.min(cap, Math.floor(world.cash * rulesData.interestRate));
}

/**
 * Stations that open next wave for the first time: the breach telegraph (DESIGN §3.1 "Tremors under
 * 15th St"), so the player gets one wave's warning.
 */
export function stationsOpeningNextWave(world: World): number[] {
  const next = world.waves[world.wave + 1];
  if (!next) return [];
  const seen = new Set(
    world.waves.slice(0, world.wave + 1).flatMap((w) => w.groups.map((g) => g.spawnIndex)),
  );
  return [...new Set(next.groups.map((g) => g.spawnIndex))].filter((s) => !seen.has(s));
}

/** Take one of the offered Council Grants and move on to the next prep. */
export function pickGrant(world: World, id: string): string | null {
  if (world.phase !== 'grant' || !world.grantOffer?.includes(id)) return 'not on offer';
  applyGrant(
    world,
    world.grantPool.find((g) => g.id === id)!,
  );
  world.grantOffer = null;
  world.wave++;
  enterPrep(world);
  return null;
}

/** Advance the phase machine by one tick (after mobs and towers have moved). */
export function tickPhase(world: World): void {
  if (world.phase === 'idle' || world.phase === 'grant' || isOver(world.phase)) return;
  if (world.integrity <= 0) {
    world.phase = 'lost';
    return;
  }
  switch (world.phase) {
    case 'prep':
      if (--world.phaseTicks <= 0) startWave(world);
      break;
    case 'assault':
      if (world.spawners.length === 0 && world.mobs.length === 0) {
        world.cash += waveClearBonus(world.wave);
        if (world.wave >= world.waves.length - 1) {
          world.phase = 'won';
        } else {
          const interest = interestOn(world);
          world.cash += interest;
          world.stats.interest += interest;
          world.stats.lastInterest = interest;
          world.phase = 'debrief';
          world.phaseTicks = Math.round(rulesData.debriefSeconds * TICK_HZ);
        }
      }
      break;
    case 'debrief':
      if (--world.phaseTicks <= 0) {
        if (grantDue(world)) {
          world.grantOffer = offerGrants(world);
          world.phase = 'grant'; // waits for pickGrant
        } else {
          world.wave++;
          enterPrep(world);
        }
      }
      break;
  }
}
