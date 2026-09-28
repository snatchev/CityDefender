import { describe, expect, it } from 'vitest';
import { parseAsciiMap } from './asciiMap';
import { placeBarricade, type BarricadeType } from './barricades';
import { TICK_HZ } from './constants';
import { queueWave, type SpawnGroup } from './mobs';
import { TOWERS, type Tower, type TowerType } from './towers';
import { createWorld, tickWorld } from './world';

/**
 * Acceptance for Passes 7–8 (IMPLEMENTATION_PLAN): each bug beats a defence that holds against the
 * others and loses to its listed counter (DESIGN §6–7). A straight 60-tile street runs from a
 * station (x = 0) to the goal (x = 60); towers stand beside it at street level, placed directly
 * (this is about combat, not placement rules).
 */
const W = 61;
const CORRIDOR = ['#'.repeat(W), 'S' + '.'.repeat(W - 2) + 'G', '#'.repeat(W)].join('\n');

interface Setup {
  towers: [TowerType, number][]; // type, x beside the street
  wall?: [BarricadeType, number]; // wall type, x on the street
}

function play(setup: Setup, wave: Omit<SpawnGroup, 'spawnIndex'>) {
  const w = createWorld(7, parseAsciiMap(CORRIDOR));
  w.cash = 100_000;
  let spent = 0;
  for (const [type, x] of setup.towers) {
    const def = TOWERS[type];
    const tower: Tower = {
      id: w.nextTowerId++,
      type,
      tx: x,
      ty: 0,
      tier: 0,
      targeting: def.targeting,
      cooldown: 0,
      heightM: 0,
      lastShot: null,
      lastChain: [],
      built: { wave: 0, planning: true },
      spent: def.tiers[0]!.cost,
      kills: 0,
    };
    w.towers.push(tower);
    spent += tower.spent;
  }
  if (setup.wall) {
    const b = placeBarricade(w, setup.wall[1], 1, setup.wall[0]);
    if (typeof b === 'string') throw new Error(b);
  }
  queueWave(w, { ...wave, spawnIndex: 0 });
  for (let i = 0; i < 900 * TICK_HZ && (w.mobs.length > 0 || w.spawners.length > 0); i++) {
    tickWorld(w);
  }
  const { kills, leaked, barricadesDestroyed: wallsLost } = w.stats;
  return { kills, leaked, wallsLost, per100: (kills / spent) * 100 };
}

const SWARM = { type: 'skitterling', count: 40, hpMul: 3, intervalS: 0.25 } as const;
const BEETLES = { type: 'beetle', count: 16, hpMul: 1, intervalS: 4 } as const;
const WASPS = { type: 'wasp', count: 30, hpMul: 1, intervalS: 0.3 } as const;
const GRUBS = { type: 'grub', count: 12, hpMul: 1, intervalS: 2 } as const;
const SPITTERS = { type: 'spitter', count: 8, hpMul: 1, intervalS: 3 } as const;

describe('Pass 7 matchups (kills per $100, one tower alone)', () => {
  const solo = (type: TowerType, wave: Omit<SpawnGroup, 'spawnIndex'>) =>
    play({ towers: [[type, 30]] }, wave).per100;

  it('the Mortar beats a tight swarm, per dollar, clearly better than the MG Nest', () => {
    expect(solo('mortar', SWARM)).toBeGreaterThan(solo('mgNest', SWARM) * 1.5);
  });

  it('the Railgun beats Carapace Beetles, per dollar, better than the MG Nest and the Mortar', () => {
    const rail = solo('railgun', BEETLES);
    expect(rail).toBeGreaterThan(solo('mgNest', BEETLES) * 1.5);
    expect(rail).toBeGreaterThan(solo('mortar', BEETLES) * 1.5);
  });

  it('armor blunts the MG Nest: it kills beetles at under a quarter of its swarm rate', () => {
    expect(solo('mgNest', BEETLES)).toBeLessThan(solo('mgNest', SWARM) / 4);
  });
});

describe('Pass 8 matchups', () => {
  it('Wasp Drones fly over walls and ground-only towers, and fall to Flak', () => {
    // A wall plus Mortar and Cryo: a swarm dies at the wall, every wasp gets through.
    const ground: Setup = {
      towers: [
        ['mortar', 34],
        ['cryo', 40],
      ],
      wall: ['jersey', 42],
    };
    expect(play(ground, SWARM).leaked).toBe(0);
    expect(play(ground, WASPS).leaked).toBe(WASPS.count);
    // One Flak Battery stops most of them.
    expect(play({ towers: [['flak', 40]] }, WASPS).leaked).toBeLessThan(WASPS.count / 4);
  });

  it('Tunneler Grubs slip past towers underground, and a Seismic Pulse digs them out', () => {
    // Two MG Nests (fine against a swarm) only get shots at grubs crossing a manhole.
    const guns: Setup = {
      towers: [
        ['mgNest', 28],
        ['mgNest', 32],
      ],
    };
    const withoutPulse = play(guns, GRUBS);
    expect(withoutPulse.leaked).toBeGreaterThan(GRUBS.count / 2);
    const withPulse = play({ towers: [...guns.towers, ['seismic', 30]] }, GRUBS);
    expect(withPulse.leaked).toBeLessThan(withoutPulse.leaked / 2);
  });

  it('Acid Spitters melt a wall from outside its short-range guards; a Railgun outranges them', () => {
    // A Jersey Barrier with a Cryo Sprayer and a Tesla Coil right behind it: a swarm dies at it.
    const guarded: Setup = {
      towers: [
        ['cryo', 43],
        ['tesla', 43],
      ],
      wall: ['jersey', 42],
    };
    const swarm = play(guarded, { ...SWARM, hpMul: 1.5 });
    expect(swarm.wallsLost).toBe(0);
    expect(swarm.leaked).toBe(0);
    // Spitters stop out of the guards' reach and melt the wall.
    expect(play(guarded, SPITTERS).wallsLost).toBe(1);
    // A Railgun behind the wall reaches them where they stand: the wall holds.
    const railed: Setup = { ...guarded, towers: [...guarded.towers, ['railgun', 46]] };
    expect(play(railed, SPITTERS).wallsLost).toBe(0);
  });

  it('a Tesla chain jumps once more off a wet target', () => {
    // Same swarm, Tesla alone vs Tesla + Cryo: more kills with the Cryo wetting the pack.
    const tesla = play({ towers: [['tesla', 30]] }, SWARM).kills;
    const wet = play(
      {
        towers: [
          ['tesla', 30],
          ['cryo', 30],
        ],
      },
      SWARM,
    ).kills;
    expect(wet).toBeGreaterThan(tesla);
  });
});
