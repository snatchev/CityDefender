import { describe, expect, it } from 'vitest';
import barricadesData from './barricades.json';
import mobsData from './mobs.json';
import elitesData from './elites.json';
import grantsData from './grants.json';
import cinematicsData from './cinematics.json';
import {
  barricadesSchema,
  cinematicsSchema,
  eliteSchema,
  grantSchema,
  mobSchema,
  towerSchema,
  wavesSchema,
} from './schema';
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
  it('waves use known mob types and elites', () =>
    check(wavesSchema(Object.keys(mobsData), Object.keys(elitesData)), wavesData));
  it.each(Object.entries(elitesData))('elite %s is valid', (_, e) => check(eliteSchema, e));
  it('every boss and elite has a title card', () => {
    check(cinematicsSchema, cinematicsData);
    const bosses = Object.entries(mobsData).filter(([, m]) => 'boss' in m && m.boss);
    for (const [type] of bosses) expect(cinematicsData.bosses, type).toHaveProperty(type);
    for (const [type, m] of Object.entries(mobsData))
      if (!('boss' in m && m.boss)) expect(cinematicsData.mobs, type).toHaveProperty(type);
    for (const elite of Object.keys(elitesData))
      expect(cinematicsData.elites, elite).toHaveProperty(elite);
  });
  it('grants are valid, with unique ids per city', () => {
    for (const [city, grants] of Object.entries(grantsData)) {
      for (const g of grants) check(grantSchema, g);
      expect(new Set(grants.map((g) => g.id)).size, city).toBe(grants.length);
    }
  });
  it('bosses that brood birth a known mob type', () => {
    for (const m of Object.values(mobsData) as { broodType?: string }[]) {
      if (m.broodType) expect(Object.keys(mobsData)).toContain(m.broodType);
    }
  });

  it('rejects a mortar tier without a splash radius', () => {
    const bad = structuredClone(towersData.mortar) as { tiers: Record<string, unknown>[] };
    delete bad.tiers[1]!.splashM;
    expect(towerSchema.safeParse(bad).success).toBe(false);
  });
});
