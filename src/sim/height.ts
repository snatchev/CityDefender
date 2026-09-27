import mapData from '../data/map.json';

/**
 * Gameplay height from real height (DESIGN §4, D029): a square-root curve that keeps the skyline's
 * ordering but stops skyscrapers from dominating tower range. Buildings are *drawn* at real height.
 */
export function gameHeight(realM: number): number {
  return realM > 0 ? mapData.heightCompressionK * Math.sqrt(realM) : 0;
}
