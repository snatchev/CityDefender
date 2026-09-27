import { z } from 'zod';

/**
 * Schemas for the balance tables in src/data (DESIGN §6–8). The tables are imported as plain JSON
 * everywhere; these schemas check them in `schema.test.ts`, and the sim imports only the inferred
 * types (type-only imports, so zod never ships in the game bundle).
 */

/** Damage types (DESIGN §7). Armor reduces every type except `pierce` (see sim/damage.ts). */
export const DAMAGE_TYPES = ['kinetic', 'explosive', 'pierce', 'cryo'] as const;
export type DamageType = (typeof DAMAGE_TYPES)[number];

/** Which mob in range a tower shoots (DESIGN §7). */
export const TARGETING_MODES = ['first', 'last', 'strongest', 'weakest', 'closest'] as const;
export type TargetingMode = (typeof TARGETING_MODES)[number];

/** Tower spots (DESIGN §4.1). */
export const TOWER_SLOTS = ['pad', 'corner'] as const;
export type TowerSlot = (typeof TOWER_SLOTS)[number];

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
    /** Explosive: splash radius around the impact point. */
    splashM: positive.optional(),
    /** Explosive: shell flight time; the shell lands where the target was when it fired. */
    shellS: positive.optional(),
    /** Cryo: full cone angle, aimed at the target. */
    coneDeg: positive.max(180).optional(),
    /** Cryo: speed multiplier while slowed, and how long the slow lasts. */
    slowMul: positive.max(1).optional(),
    slowS: positive.optional(),
  })
  .strict();
export type TowerTier = z.infer<typeof towerTierSchema>;

export const towerSchema = z
  .object({
    name: z.string().min(1),
    /** One-line role for the build bar card. */
    role: z.string().min(1),
    slots: z.array(z.enum(TOWER_SLOTS)).min(1),
    damageType: z.enum(DAMAGE_TYPES),
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
    const need = (keys: (keyof TowerTier)[]) =>
      t.tiers.forEach((tier, i) => {
        for (const k of keys) {
          if (tier[k] === undefined) {
            ctx.addIssue({
              code: 'custom',
              path: ['tiers', i, k],
              message: `${t.damageType} needs ${k}`,
            });
          }
        }
      });
    if (t.damageType === 'explosive') need(['splashM', 'shellS']);
    if (t.damageType === 'cryo') need(['coneDeg', 'slowMul', 'slowS']);
  });
export type TowerDef = z.infer<typeof towerSchema>;

export const mobSchema = z
  .object({
    name: z.string().min(1),
    hp: positive,
    speedMps: positive,
    /** Flat damage reduction per hit (DESIGN §6). */
    armor: nonNegative,
    goalDamage: nonNegative,
    barricadeDps: nonNegative,
    bounty: z.number().int().nonnegative(),
  })
  .strict();
export type MobDef = z.infer<typeof mobSchema>;

export const barricadeSchema = z
  .object({
    name: z.string().min(1),
    tier: z.number().int().positive(),
    hp: positive,
    cost: z.number().int().positive(),
    /** Upgrade in place to this type, paying the cost difference (DESIGN §8). */
    upgradeTo: z.string().optional(),
  })
  .strict();
export type BarricadeDef = z.infer<typeof barricadeSchema>;

export const barricadesSchema = z.record(z.string(), barricadeSchema).superRefine((all, ctx) => {
  for (const [key, b] of Object.entries(all)) {
    if (b.upgradeTo === undefined) continue;
    const next = all[b.upgradeTo];
    if (!next) {
      ctx.addIssue({ code: 'custom', path: [key, 'upgradeTo'], message: `unknown ${b.upgradeTo}` });
    } else if (next.tier <= b.tier || next.cost <= b.cost || next.hp <= b.hp) {
      ctx.addIssue({
        code: 'custom',
        path: [key],
        message: 'an upgrade must be a higher tier, cost more and hold more',
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
