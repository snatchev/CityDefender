import rulesData from '../data/rules.json';
import type { DamageType } from '../data/schema';

/**
 * Damage one hit deals after armor (DESIGN §6–7). Armor is a flat reduction per hit, so it shreds
 * many small hits (MG chip damage) and barely dents big ones. `pierce` ignores armor. A hit always
 * keeps at least `armorMinDamageFraction` of its raw damage, so nothing is completely immune.
 */
export function hitDamage(raw: number, type: DamageType, armor: number): number {
  if (raw <= 0) return 0;
  if (type === 'pierce' || armor <= 0) return raw;
  return Math.max(raw * rulesData.armorMinDamageFraction, raw - armor);
}
