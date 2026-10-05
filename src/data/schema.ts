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
    /** Overrides the tower's damage type for this tier (AP Rounds pierce). */
    damageType: z.enum(DAMAGE_TYPES).optional(),
    /** Tier-3 special ability (see SPECIAL_NEEDS). */
    special: z.enum(['pierceLine', 'mark', 'burn']).optional(),
    /** mark: marked mobs take `markBonus` more damage from everything for `markS`. */
    markS: positive.optional(),
    markBonus: positive.optional(),
    /** burn: a shell leaves its splash area burning for `burnS` at `burnDps` (ground only). */
    burnDps: positive.optional(),
    burnS: positive.optional(),
  })
  .strict();
export type TowerTier = z.infer<typeof towerTierSchema>;

/**
 * Tier-3 specials (DESIGN §7 "tier 3 branches"): `pierceLine` hits every bug along the line from the
 * tower through its target; `mark` makes the target take extra damage for a while; `burn` leaves
 * burning ground where a shell lands.
 */
export const SPECIAL_NEEDS: Record<NonNullable<TowerTier['special']>, (keyof TowerTier)[]> = {
  pierceLine: [],
  mark: ['markS', 'markBonus'],
  burn: ['burnDps', 'burnS'],
};

/** A tier-3 branch: a named specialisation you pick instead of a single tier 3 (DESIGN §7). */
export const towerBranchSchema = towerTierSchema.extend({
  id: z.string().min(1),
  name: z.string().min(1),
  blurb: z.string().min(1),
});
export type TowerBranch = z.infer<typeof towerBranchSchema>;

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
    /** Tier-3 specialisations, chosen when upgrading past the last tier. */
    branches: z.array(towerBranchSchema).optional(),
  })
  .strict()
  .superRefine((t, ctx) => {
    const check = (tier: TowerTier, path: (string | number)[]) => {
      const needs = [
        ...ATTACK_NEEDS[t.attack],
        ...(tier.special ? SPECIAL_NEEDS[tier.special] : []),
      ];
      for (const k of needs) {
        if (tier[k] === undefined) {
          ctx.addIssue({
            code: 'custom',
            path: [...path, k],
            message: `${t.attack}/${tier.special ?? '-'} needs ${k}`,
          });
        }
      }
    };
    t.tiers.forEach((tier, i) => check(tier, ['tiers', i]));
    t.branches?.forEach((b, i) => check(b, ['branches', i]));
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
    /** Boss: announced, drawn big (DESIGN §9 mini-boss and finale). */
    boss: z.boolean().optional(),
    /** Brood Mother: births `broodCount` × `broodType` every `broodEvery` of its HP lost (DESIGN §6). */
    broodEvery: positive.max(1).optional(),
    broodCount: z.number().int().positive().optional(),
    broodType: z.string().optional(),
    /** HP multiplier for the brood it births (they'd be trivial at base HP in the finale). */
    broodHpMul: positive.optional(),
    /** Crushes walls of this tier or lower on contact instead of besieging them. */
    crushTier: z.number().int().positive().optional(),
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

/** Elite affixes (DESIGN §6): a spawn group can carry one; it changes each of its mobs. */
export const eliteSchema = z
  .object({
    name: z.string().min(1),
    hpMul: positive,
    armorAdd: nonNegative.optional(),
    speedMul: positive.optional(),
    /** Heals this fraction of max HP per second. */
    regenPerS: positive.optional(),
  })
  .strict();
export type EliteDef = z.infer<typeof eliteSchema>;

/**
 * Council Grant effects (DESIGN §10.6). The effect types are generic sim mechanics; which grants a
 * city offers, and what they're called, is that city's content in grants.json.
 */
export const grantEffectSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('barricadeCostMul'), barricade: z.string(), mul: positive }).strict(),
  z.object({ type: z.literal('towerCostMul'), tower: z.string(), mul: positive }).strict(),
  z.object({ type: z.literal('fireRateMul'), tower: z.string(), mul: positive }).strict(),
  z.object({ type: z.literal('rangeMul'), slot: z.enum(TOWER_SLOTS), mul: positive }).strict(),
  z.object({ type: z.literal('wetDurationMul'), mul: positive }).strict(),
  z.object({ type: z.literal('bountyMul'), mul: positive }).strict(),
  z.object({ type: z.literal('interestCapAdd'), add: z.number() }).strict(),
  z.object({ type: z.literal('cash'), add: z.number() }).strict(),
  z.object({ type: z.literal('integrity'), add: z.number() }).strict(),
  z.object({ type: z.literal('prepSecondsAdd'), add: z.number() }).strict(),
  z.object({ type: z.literal('trapDamageMul'), mul: positive }).strict(),
]);
export type GrantEffect = z.infer<typeof grantEffectSchema>;

export const grantSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    /** One line shown on the grant card. */
    text: z.string().min(1),
    effects: z.array(grantEffectSchema).min(1),
  })
  .strict();
export type GrantDef = z.infer<typeof grantSchema>;

/** waves.json: per city, a list of waves, each a list of spawn groups by station name. */
export function wavesSchema(mobTypes: string[], eliteTypes: string[] = []) {
  const group = z
    .object({
      station: z.string().min(1),
      type: z.string().refine((t) => mobTypes.includes(t), 'unknown mob type'),
      count: z.number().int().positive(),
      hpMul: positive,
      intervalS: positive,
      elite: z
        .string()
        .refine((e) => eliteTypes.includes(e), 'unknown elite affix')
        .optional(),
    })
    .strict();
  return z.record(z.string(), z.array(z.object({ groups: z.array(group).min(1) }).strict()).min(1));
}

/** A boss or elite title card (branch down-the-street, D054): epithet above the name, a factoid below. */
export const introSchema = z
  .object({ epithet: z.string().min(1), factoid: z.string().min(1) })
  .strict();
export type IntroDef = z.infer<typeof introSchema>;

/**
 * cinematics.json: title cards for bosses (by mob type), elites (by affix) and every other mob
 * type (shown the first time a run meets it).
 */
export const cinematicsSchema = z
  .object({
    bosses: z.record(z.string(), introSchema),
    elites: z.record(z.string(), introSchema),
    mobs: z.record(z.string(), introSchema),
  })
  .strict();
