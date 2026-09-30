import { describe, expect, it } from 'vitest';
import rulesData from '../data/rules.json';
import type { GrantDef } from '../data/schema';
import { GRID } from './__fixtures__/maps';
import { parseAsciiMap } from './asciiMap';
import { barricadeCost, placeBarricade } from './barricades';
import { TICK_HZ } from './constants';
import { MOBS, spawnMobAt, tickBroodAndRegen } from './mobs';
import { interestOn, pickGrant, startRun, startWave, type WaveDef } from './phase';
import { restoreRun, saveRun } from './save';
import { placeTower, TOWERS, upgradeOptions, upgradeTower } from './towers';
import { createWorld, tickWorld, type World } from './world';

const skitters = (spawnIndex: number, count: number, hpMul = 1) => ({
  spawnIndex,
  type: 'skitterling' as const,
  count,
  hpMul,
  intervalS: 0.5,
});
const WAVES: WaveDef[] = [1, 2, 3, 4, 5, 6].map((n) => ({
  groups: [skitters(0, 4 + n, 1 + n / 4), skitters(3, 3 + n, 1 + n / 4)],
}));
const GRANTS: GrantDef[] = [
  { id: 'cash', name: 'Cash', text: '+$500', effects: [{ type: 'cash', add: 500 }] },
  {
    id: 'cheap',
    name: 'Cheap walls',
    text: 'Sawhorses half price',
    effects: [{ type: 'barricadeCostMul', barricade: 'sawhorse', mul: 0.5 }],
  },
  { id: 'hp', name: 'Repairs', text: '+10', effects: [{ type: 'integrity', add: 10 }] },
  {
    id: 'range',
    name: 'Range',
    text: '+10%',
    effects: [{ type: 'rangeMul', slot: 'corner', mul: 1.1 }],
  },
];

function spotsNearGoal(w: World, n: number): [number, number][] {
  const [gx, gy] = w.map!.goal[0]!;
  return w
    .slots!.corners.map((i) => [i % w.map!.width, Math.floor(i / w.map!.width)] as [number, number])
    .sort((a, b) => Math.hypot(a[0] - gx, a[1] - gy) - Math.hypot(b[0] - gx, b[1] - gy))
    .slice(0, n);
}

/** Play on until the run ends, always taking the first grant offered. */
function playOut(w: World): void {
  for (let i = 0; i < 1200 * TICK_HZ && w.phase !== 'won' && w.phase !== 'lost'; i++) {
    if (w.phase === 'grant') pickGrant(w, w.grantOffer![0]!);
    tickWorld(w);
  }
}

function newRun(seed: number): World {
  const w = createWorld(seed, parseAsciiMap(GRID));
  startRun(w, WAVES, GRANTS);
  for (const [x, y] of spotsNearGoal(w, 2)) placeTower(w, x, y, 'mgNest');
  return w;
}

describe('run structure (Pass 9)', () => {
  it('offers a grant after every fifth wave; picking one applies it and starts the next prep', () => {
    const w = newRun(5);
    for (let i = 0; i < 1200 * TICK_HZ && w.phase !== 'grant'; i++) tickWorld(w);
    expect(w.phase).toBe('grant');
    expect(w.wave).toBe(rulesData.grantEveryWaves - 1);
    expect(w.grantOffer).toHaveLength(rulesData.grantChoices);
    // A grant not on offer is refused; an offered one applies and moves to the next prep.
    expect(pickGrant(w, 'nope')).not.toBeNull();
    const choice = w.grantOffer!.includes('cheap') ? 'cheap' : w.grantOffer![0]!;
    const cash = w.cash;
    expect(pickGrant(w, choice)).toBeNull();
    expect(w.phase).toBe('prep');
    expect(w.wave).toBe(rulesData.grantEveryWaves);
    expect(w.grantsTaken).toEqual([choice]);
    if (choice === 'cash') expect(w.cash).toBe(cash + 500);
    if (choice === 'cheap') {
      expect(barricadeCost('sawhorse', 2, w.mods)).toBe(
        Math.round(barricadeCost('sawhorse', 2) / 2),
      );
    }
  });

  it('caps interest', () => {
    const w = newRun(1);
    w.cash = 100;
    expect(interestOn(w)).toBe(Math.floor(100 * rulesData.interestRate));
    w.cash = 1_000_000;
    expect(interestOn(w)).toBe(rulesData.interestCap);
  });

  it('a run saved at a prep and resumed plays out exactly as the original', () => {
    const a = newRun(9);
    startWave(a);
    for (let i = 0; i < 1200 * TICK_HZ && !(a.phase === 'prep' && a.wave === 2); i++) {
      if (a.phase === 'grant') pickGrant(a, a.grantOffer![0]!);
      tickWorld(a);
    }
    placeBarricade(a, 3, 1, 'jersey'); // something built in this prep, saved with it
    const save = saveRun(a, 'fixture')!;
    expect(save).not.toBeNull();
    const b = createWorld(123, parseAsciiMap(GRID)); // different seed and no towers: all from the save
    startRun(b, WAVES, GRANTS);
    expect(restoreRun(b, JSON.parse(JSON.stringify(save)), 'fixture')).toBeNull();
    playOut(a);
    playOut(b);
    const final = (w: World) => ({
      phase: w.phase,
      tick: w.tick,
      cash: w.cash,
      integrity: w.integrity,
      stats: w.stats,
    });
    expect(final(b)).toEqual(final(a));
    expect(restoreRun(b, save, 'another city')).not.toBeNull();
  });

  it('a Brood Mother births its brood at each quarter of HP lost, and the last batch when it dies', () => {
    const w = createWorld(1, parseAsciiMap(GRID));
    const def = MOBS.broodMother;
    const mother = spawnMobAt(w, 1, 1, 'broodMother');
    const brood = () => w.mobs.filter((m) => m.type === def.broodType).length;
    mother.hp = mother.maxHp * 0.7;
    tickBroodAndRegen(w);
    expect(brood()).toBe(def.broodCount);
    mother.hp = mother.maxHp * 0.2;
    tickBroodAndRegen(w);
    expect(brood()).toBe(3 * def.broodCount!);
    mother.hp = 0;
    tickBroodAndRegen(w);
    expect(brood()).toBe(4 * def.broodCount!);
    tickBroodAndRegen(w);
    expect(brood()).toBe(4 * def.broodCount!); // no more after the last share
  });

  it('tier 3 is a choice of branches; the Penetrator hits every bug along its line', () => {
    const w = createWorld(
      1,
      parseAsciiMap(['#'.repeat(21), 'S' + '.'.repeat(19) + 'G', '#'.repeat(21)].join('\n')),
    );
    w.cash = 100_000;
    // Placed directly, in line with the street (this is about the branch, not placement rules).
    w.towers.push({
      id: w.nextTowerId++,
      type: 'railgun',
      tx: 0,
      ty: 1,
      tier: 0,
      branch: null,
      targeting: 'first',
      cooldown: 0,
      heightM: 0,
      lastShot: null,
      lastChain: [],
      built: { wave: 0, planning: true },
      spent: 0,
      kills: 0,
    });
    const tower = w.towers[0]!;
    expect(upgradeTower(w, tower.id)).toBeNull(); // tier 2
    const options = upgradeOptions(w, tower);
    expect(options.map((o) => o.branch)).toEqual(TOWERS.railgun.branches!.map((b) => b.id));
    expect(upgradeTower(w, tower.id)).not.toBeNull(); // must pick a branch
    expect(upgradeTower(w, tower.id, 'penetrator')).toBeNull();
    expect(upgradeOptions(w, tower)).toEqual([]);
    // Three skitterlings in a row along the street: one Penetrator shot hits them all.
    for (const x of [4, 6, 8]) spawnMobAt(w, x, 1, 'skitterling', 100);
    tickWorld(w);
    expect(w.mobs.filter((m) => m.hp < m.maxHp)).toHaveLength(3);
  });
});
