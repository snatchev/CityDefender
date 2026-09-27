import { describe, expect, it } from 'vitest';
import barricadesData from './barricades.json';
import mobsData from './mobs.json';
import { barricadesSchema, mobSchema, towerSchema, wavesSchema } from './schema';
import towersData from './towers.json';
import wavesData from './waves.json';

/** Throws with zod's readable report, so a bad table fails with the path to the bad value. */
function check(
  schema: { safeParse(v: unknown): { success: boolean; error?: unknown } },
  v: unknown,
) {
  const r = schema.safeParse(v);
  if (!r.success) throw new Error(String(r.error));
}

describe('balance tables', () => {
  it.each(Object.entries(towersData))('tower %s is valid', (_, t) => check(towerSchema, t));
  it.each(Object.entries(mobsData))('mob %s is valid', (_, m) => check(mobSchema, m));
  it('barricades are valid and upgrade paths make sense', () =>
    check(barricadesSchema, barricadesData));
  it('waves use known mob types', () => check(wavesSchema(Object.keys(mobsData)), wavesData));

  it('rejects a mortar tier without a splash radius', () => {
    const bad = structuredClone(towersData.mortar) as { tiers: Record<string, unknown>[] };
    delete bad.tiers[1]!.splashM;
    expect(towerSchema.safeParse(bad).success).toBe(false);
  });
});
