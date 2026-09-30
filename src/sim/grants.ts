import rulesData from '../data/rules.json';
import type { GrantDef, TowerSlot } from '../data/schema';
import type { World } from './world';

/**
 * Standing modifiers from Council Grants (DESIGN §10.6). Grants are city content (grants.json);
 * their effects land here, and the sim reads these wherever the matching number is used.
 */
export interface Mods {
  /** Price multipliers by tower / barricade type (build and upgrades). */
  towerCostMul: Record<string, number>;
  barricadeCostMul: Record<string, number>;
  /** Fire-rate multipliers by tower type. */
  fireRateMul: Record<string, number>;
  /** Range multiplier by the spot a tower stands on. */
  rangeMul: Record<TowerSlot, number>;
  wetDurationMul: number;
  bountyMul: number;
  interestCapAdd: number;
  prepSecondsAdd: number;
  trapDamageMul: number;
}

export function freshMods(): Mods {
  return {
    towerCostMul: {},
    barricadeCostMul: {},
    fireRateMul: {},
    rangeMul: { pad: 1, corner: 1 },
    wetDurationMul: 1,
    bountyMul: 1,
    interestCapAdd: 0,
    prepSecondsAdd: 0,
    trapDamageMul: 1,
  };
}

/** A price after grants, rounded to whole dollars. */
export function modPrice(base: number, mul: number | undefined): number {
  return Math.round(base * (mul ?? 1));
}

/** True when the wave just cleared (0-based index) earns a grant: every `grantEveryWaves`, not the last. */
export function grantDue(world: World): boolean {
  const n = world.wave + 1;
  return (
    world.grantPool.length > 0 &&
    n % rulesData.grantEveryWaves === 0 &&
    world.wave < world.waves.length - 1
  );
}

/** Offer `grantChoices` grants the player doesn't have yet, drawn with the seeded RNG. */
export function offerGrants(world: World): string[] {
  const pool = world.grantPool.filter((g) => !world.grantsTaken.includes(g.id)).map((g) => g.id);
  const offer: string[] = [];
  while (offer.length < rulesData.grantChoices && pool.length > 0) {
    offer.push(pool.splice(world.rng.int(0, pool.length - 1), 1)[0]!);
  }
  return offer;
}

/** Apply a grant's effects (one-offs like cash now; the rest into `world.mods`). */
export function applyGrant(world: World, grant: GrantDef): void {
  const m = world.mods;
  for (const e of grant.effects) {
    switch (e.type) {
      case 'barricadeCostMul':
        m.barricadeCostMul[e.barricade] = (m.barricadeCostMul[e.barricade] ?? 1) * e.mul;
        break;
      case 'towerCostMul':
        m.towerCostMul[e.tower] = (m.towerCostMul[e.tower] ?? 1) * e.mul;
        break;
      case 'fireRateMul':
        m.fireRateMul[e.tower] = (m.fireRateMul[e.tower] ?? 1) * e.mul;
        break;
      case 'rangeMul':
        m.rangeMul[e.slot] *= e.mul;
        break;
      case 'wetDurationMul':
        m.wetDurationMul *= e.mul;
        break;
      case 'bountyMul':
        m.bountyMul *= e.mul;
        break;
      case 'interestCapAdd':
        m.interestCapAdd += e.add;
        break;
      case 'prepSecondsAdd':
        m.prepSecondsAdd += e.add;
        break;
      case 'trapDamageMul':
        m.trapDamageMul *= e.mul;
        break;
      case 'cash':
        world.cash += e.add;
        break;
      case 'integrity':
        world.integrity = Math.min(rulesData.startIntegrity, world.integrity + e.add);
        break;
    }
  }
  world.grantsTaken.push(grant.id);
}
