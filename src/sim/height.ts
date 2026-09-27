import mapData from '../data/map.json';

/**
 * Display and gameplay height from real height (DESIGN §4): a square-root curve that keeps the
 * skyline's ordering but stops skyscrapers from walling off the camera or dominating tower range.
 */
export function gameHeight(realM: number): number {
  return realM > 0 ? mapData.heightCompressionK * Math.sqrt(realM) : 0;
}
