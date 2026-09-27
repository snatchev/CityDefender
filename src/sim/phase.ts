import rulesData from '../data/rules.json';
import { TICK_HZ } from './constants';
import { queueWave, type MobType } from './mobs';
import type { World } from './world';

/**
 * Run phases (DESIGN §3.1): PREP (countdown, build) → ASSAULT (waves spawn, towers fire) →
 * DEBRIEF (short pause, clear bonus) → PREP … until the last wave is cleared (won) or City Hall
 * Integrity hits 0 (lost). 'idle' = no run started (sandbox and tests).
 */
export type Phase = 'idle' | 'prep' | 'assault' | 'debrief' | 'won' | 'lost';

export interface WaveGroup {
  /** Index into `world.map.spawns`. */
  spawnIndex: number;
  type: MobType;
  count: number;
  /** HP multiplier for this wave (HP grows faster than income; DESIGN §3.3). */
  hpMul: number;
  intervalS: number;
}

export interface WaveDef {
  groups: WaveGroup[];
}

export function startRun(world: World, waves: WaveDef[]): void {
  world.waves = waves;
  world.wave = 0;
  enterPrep(world);
}

function enterPrep(world: World): void {
  world.phase = 'prep';
  world.phaseTicks = Math.round(rulesData.prepSeconds * TICK_HZ);
}

/** End prep and send the current wave. Calling it early pays a bonus for the prep time skipped. */
export function startWave(world: World): void {
  if (world.phase !== 'prep') return;
  const bonus = Math.floor((world.phaseTicks / TICK_HZ) * rulesData.earlyCallBonusPerS);
  world.cash += bonus;
  world.stats.earlyBonus += bonus;
  for (const g of world.waves[world.wave]!.groups) {
    queueWave(world, g.count, g.spawnIndex, g.type, g.hpMul, g.intervalS);
  }
  world.phase = 'assault';
  world.phaseTicks = 0;
}

export function waveClearBonus(waveIndex: number): number {
  return rulesData.waveClearBonusBase + rulesData.waveClearBonusPerWave * (waveIndex + 1);
}

/** Advance the phase machine by one tick (after mobs and towers have moved). */
export function tickPhase(world: World): void {
  if (world.phase === 'idle' || world.phase === 'won' || world.phase === 'lost') return;
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
          world.phase = 'debrief';
          world.phaseTicks = Math.round(rulesData.debriefSeconds * TICK_HZ);
        }
      }
      break;
    case 'debrief':
      if (--world.phaseTicks <= 0) {
        world.wave++;
        enterPrep(world);
      }
      break;
  }
}
