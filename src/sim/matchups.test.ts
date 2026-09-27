import { describe, expect, it } from 'vitest';
import { parseAsciiMap } from './asciiMap';
import { TICK_HZ } from './constants';
import { queueWave, type SpawnGroup } from './mobs';
import { TOWERS, type Tower, type TowerType } from './towers';
import { createWorld, tickWorld } from './world';

/**
 * Pass 7 acceptance (IMPLEMENTATION_PLAN): splash wins against swarms, the Railgun against Beetles.
 * One tower of a type stands beside a straight 60-tile street and faces one wave alone; we compare
 * kills per $100 spent, so a more expensive tower has to earn its price.
 */
const W = 61;
const CORRIDOR = ['#'.repeat(W), 'S' + '.'.repeat(W - 2) + 'G', '#'.repeat(W)].join('\n');

function killsPer100(type: TowerType, wave: Omit<SpawnGroup, 'spawnIndex'>): number {
  const w = createWorld(7, parseAsciiMap(CORRIDOR));
  const def = TOWERS[type];
  // Placed directly (street level, mid-corridor): this test is about combat, not placement rules.
  const tower: Tower = {
    id: w.nextTowerId++,
    type,
    tx: Math.floor(W / 2),
    ty: 0,
    tier: 0,
    targeting: def.targeting,
    cooldown: 0,
    heightM: 0,
    lastShot: null,
    built: { wave: 0, planning: true },
    spent: def.tiers[0]!.cost,
    kills: 0,
  };
  w.towers.push(tower);
  queueWave(w, { ...wave, spawnIndex: 0 });
  for (let i = 0; i < 600 * TICK_HZ && (w.mobs.length > 0 || w.spawners.length > 0); i++) {
    tickWorld(w);
  }
  return (w.stats.kills / tower.spent) * 100;
}

const SWARM = { type: 'skitterling', count: 40, hpMul: 3, intervalS: 0.25 } as const;
const BEETLES = { type: 'beetle', count: 16, hpMul: 1, intervalS: 4 } as const;

describe('matchups (DESIGN §6–7)', () => {
  it('the Mortar beats a tight swarm, per dollar, clearly better than the MG Nest', () => {
    const mortar = killsPer100('mortar', SWARM);
    const mg = killsPer100('mgNest', SWARM);
    expect(mortar).toBeGreaterThan(mg * 1.5);
  });

  it('the Railgun beats Carapace Beetles, per dollar, better than the MG Nest and the Mortar', () => {
    const rail = killsPer100('railgun', BEETLES);
    expect(rail).toBeGreaterThan(killsPer100('mgNest', BEETLES) * 1.5);
    expect(rail).toBeGreaterThan(killsPer100('mortar', BEETLES) * 1.5);
  });

  it('armor blunts the MG Nest: it kills beetles at under a quarter of its swarm rate', () => {
    expect(killsPer100('mgNest', BEETLES)).toBeLessThan(killsPer100('mgNest', SWARM) / 4);
  });
});
