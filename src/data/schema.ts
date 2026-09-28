import { z } from 'zod';

/**
 * Schemas for the balance tables in src/data (DESIGN §6–8). The tables are imported as plain JSON
 * everywhere; these schemas check them in `schema.test.ts`, and the sim imports only the inferred
 * types (type-only imports, so zod never ships in the game bundle).
 */

/** Damage types (DESIGN §7). Armor reduces every type except `pierce` (see sim/damage.ts). */
export const DAMAGE_TYPES = ['kinetic', 'explosive', 'pierce', 'cryo', 'energy'] as const;
export type DamageType = (typeof DAMAGE_TYPES)[number];

/** Which mob in range a tower shoots (DESIGN §7). */
export const TARGETING_MODES = ['first', 'last', 'strongest', 'weakest', 'closest'] as const;
export type TargetingMode = (typeof TARGETING_MODES)[number];

/** Tower spots (DESIGN §4.1). */
export const TOWER_SLOTS = ['pad', 'corner'] as const;
export type TowerSlot = (typeof TOWER_SLOTS)[number];

/**
 * How a mob moves (DESIGN §5): crawlers on the streets through the barricade-weighted flow field;
 * fliers over the streets on a field without barricade costs; diggers the same way underground,
 * buried (untargetable) except at manholes and near the goal.
 */
export const MOB_LAYERS = ['ground', 'air', 'digger'] as const;
export type MobLayer = (typeof MOB_LAYERS)[number];

/** What a tower can hit. Buried diggers can only be reached by a `pulse` (Seismic Pulse). */
export const TARGET_LAYERS = ['ground', 'air'] as const;
export type TargetLayer = (typeof TARGET_LAYERS)[number];

/**
 * How a tower attacks (DESIGN §7):
 * - `hit`: instant hit on one target (MG, Railgun),
 * - `shell`: a shell that lands where the target was and splashes (Mortar, Flak),
 * - `cone`: everything in a cone aimed at the target is hit and slowed (Cryo),
 * - `chain`: lightning that jumps from the target to nearby mobs (Tesla),
 * - `pulse`: hits everything around the tower, reveals and stuns diggers (Seismic Pulse).
 */
export const ATTACKS = ['hit', 'shell', 'cone', 'chain', 'pulse'] as const;
export type Attack = (typeof ATTACKS)[number];

const positive = z.number().positive();
const nonNegative = z.number().nonnegative();

/** One upgrade tier: its full stats, and what it costs to reach (tier 1: the build cost). */
export const towerTierSchema = z
  .object({
    cost: z.number().int().positive(),
    rangeM: positive,
    /** Fixed minimum range (the Mortar can't lob at its own feet), on top of the height minimum. */
    minRangeM: nonNegative.optional(),
    damage: nonNegative,
    shotsPerS: positive,
    /** shell: splash radius around the impact point, and flight time. */
    splashM: positive.optional(),
    shellS: positive.optional(),
    /** cone: full cone angle, aimed at the target. */
    coneDeg: positive.max(180).optional(),
    /** cone: speed multiplier while slowed, and how long the slow lasts. */
    slowMul: positive.max(1).optional(),
    slowS: positive.optional(),
    /** cone: how long a hit mob stays Wet (Tesla chains one more jump off wet mobs). */
    wetS: positive.optional(),
    /** chain: jumps after the first target, jump reach, and damage kept per jump. */
    chains: z.number().int().nonnegative().optional(),
    chainRangeM: positive.optional(),
    chainFalloff: positive.max(1).optional(),
    /** pulse: how long a buried digger is forced up, and how long pulsed mobs are stunned. */
    revealS: positive.optional(),
    stunS: nonNegative.optional(),
  })
  .strict();
export type TowerTier = z.infer<typeof towerTierSchema>;

/** Tier fields each attack needs. */
const ATTACK_NEEDS: Record<Attack, (keyof TowerTier)[]> = {
  hit: [],
  shell: ['splashM', 'shellS'],
  cone: ['coneDeg', 'slowMul', 'slowS'],
  chain: ['chains', 'chainRangeM', 'chainFalloff'],
  pulse: ['revealS', 'stunS'],
};

export const towerSchema = z
  .object({
    name: z.string().min(1),
    /** One-line role for the build bar card. */
    role: z.string().min(1),
    slots: z.array(z.enum(TOWER_SLOTS)).min(1),
    attack: z.enum(ATTACKS),
    damageType: z.enum(DAMAGE_TYPES),
    /** Layers it can target (a pulse also reaches buried diggers). */
    targets: z.array(z.enum(TARGET_LAYERS)).min(1),
    /** Targeting mode a new tower starts with. */
    targeting: z.enum(TARGETING_MODES),
    /** Range × min(rangeMaxMul, 1 + rangeHeightFactor × game height) (DESIGN §7). */
    rangeHeightFactor: nonNegative,
    rangeMaxMul: z.number().min(1),
    minRangePerHeight: nonNegative,
    tiers: z.array(towerTierSchema).min(1),
  })
  .strict()
  .superRefine((t, ctx) => {
    t.tiers.forEach((tier, i) => {
      for (const k of ATTACK_NEEDS[t.attack]) {
        if (tier[k] === undefined) {
          ctx.addIssue({
            code: 'custom',
            path: ['tiers', i, k],
            message: `${t.attack} needs ${k}`,
          });
        }
      }
    });
  });
export type TowerDef = z.infer<typeof towerSchema>;

export const mobSchema = z
  .object({
    name: z.string().min(1),
    layer: z.enum(MOB_LAYERS),
    hp: positive,
    speedMps: positive,
    /** Flat damage reduction per hit (DESIGN §6). */
    armor: nonNegative,
    goalDamage: nonNegative,
    /** Damage to a barricade it besieges at contact (crawlers only). */
    barricadeDps: nonNegative,
    bounty: z.number().int().nonnegative(),
    /** Sapper: stops this far from a barricade on its route and spits at it (DESIGN §6). */
    spitRangeM: positive.optional(),
    spitDps: positive.optional(),
    /** Digger: how long it stays up after crossing a manhole, and within how many tiles of the goal it surfaces for good. */
    surfaceS: positive.optional(),
    surfaceNearGoalTiles: nonNegative.optional(),
  })
  .strict()
  .superRefine((m, ctx) => {
    if ((m.spitRangeM === undefined) !== (m.spitDps === undefined)) {
      ctx.addIssue({
        code: 'custom',
        path: ['spitDps'],
        message: 'spitters need spitRangeM and spitDps',
      });
    }
    if (
      m.layer === 'digger' &&
      (m.surfaceS === undefined || m.surfaceNearGoalTiles === undefined)
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['surfaceS'],
        message: 'diggers need surfaceS and surfaceNearGoalTiles',
      });
    }
  });
export type MobDef = z.infer<typeof mobSchema>;

/**
 * Barricades (DESIGN §8). A `wall` spans the street and is a path cost (siege rule); a `trap`
 * spans the street without blocking or rerouting and hurts crawlers crossing it. Cost is per tile of
 * span, so blocking a wide avenue costs more than a side street.
 */
export const barricadeSchema = z
  .object({
    name: z.string().min(1),
    kind: z.enum(['wall', 'trap']),
    tier: z.number().int().positive(),
    /** Wall: hit points. Trap: crossings it survives. */
    hp: positive,
    costPerTile: z.number().int().positive(),
    /** Upgrade in place to this type, paying the cost difference (DESIGN §8). */
    upgradeTo: z.string().optional(),
    /** Blast Wall: back to full HP at the start of every prep. */
    repairsBetweenWaves: z.boolean().optional(),
    /** Trap: damage to each crawler crossing it. */
    trapDamage: positive.optional(),
  })
  .strict();
export type BarricadeDef = z.infer<typeof barricadeSchema>;

export const barricadesSchema = z.record(z.string(), barricadeSchema).superRefine((all, ctx) => {
  for (const [key, b] of Object.entries(all)) {
    if (b.kind === 'trap' && b.trapDamage === undefined) {
      ctx.addIssue({ code: 'custom', path: [key, 'trapDamage'], message: 'traps need trapDamage' });
    }
    if (b.upgradeTo === undefined) continue;
    const next = all[b.upgradeTo];
    if (!next) {
      ctx.addIssue({ code: 'custom', path: [key, 'upgradeTo'], message: `unknown ${b.upgradeTo}` });
    } else if (
      next.kind !== b.kind ||
      next.tier <= b.tier ||
      next.costPerTile <= b.costPerTile ||
      next.hp <= b.hp
    ) {
      ctx.addIssue({
        code: 'custom',
        path: [key],
        message: 'an upgrade must be the same kind, a higher tier, cost more and hold more',
      });
    }
  }
});

/** waves.json: per city, a list of waves, each a list of spawn groups by station name. */
export function wavesSchema(mobTypes: string[]) {
  const group = z
    .object({
      station: z.string().min(1),
      type: z.string().refine((t) => mobTypes.includes(t), 'unknown mob type'),
      count: z.number().int().positive(),
      hpMul: positive,
      intervalS: positive,
    })
    .strict();
  return z.record(z.string(), z.array(z.object({ groups: z.array(group).min(1) }).strict()).min(1));
}
