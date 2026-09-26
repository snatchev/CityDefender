import barricadesData from '../data/barricades.json';
import rulesData from '../data/rules.json';
import { flowField } from './flow';
import { Tile, type TileMap } from './map';
import type { World } from './world';

export type BarricadeType = keyof typeof barricadesData;

/** A barricade: one tile thick, spanning the street's full width (DESIGN §5.2). */
export interface Barricade {
  id: number;
  type: BarricadeType;
  /** Tile indices it occupies. */
  tiles: number[];
  /** Axis the span runs along: 'x' = across a north–south street, 'y' = across an east–west one. */
  axis: 'x' | 'y';
  hp: number;
  maxHp: number;
  /** HP band (1..barricadeHpBands) the flow field was last computed with. */
  band: number;
}

export type Span = { tiles: number[]; axis: 'x' | 'y' };

/** Which quarter (by default) of its HP a barricade is in: full HP = top band, destroyed = 0. */
export function hpBand(hp: number, maxHp: number): number {
  return Math.max(0, Math.ceil((hp / maxHp) * rulesData.barricadeHpBands - 1e-9));
}

/**
 * The tiles a barricade clicked at (tx, ty) would cover: the run of street tiles across the street,
 * i.e. along whichever axis the contiguous street is shorter. Returns an error string when the click
 * isn't on a plain street, lands on a station or another barricade, or the span is too wide
 * (usually an intersection).
 */
export function barricadeSpan(world: World, tx: number, ty: number): Span | string {
  const map = world.map;
  if (!map) return 'no map';
  const street = (x: number, y: number) =>
    x >= 0 &&
    y >= 0 &&
    x < map.width &&
    y < map.height &&
    map.tiles[y * map.width + x] === Tile.Street;
  if (!street(tx, ty)) return 'not a street';
  const run = (dx: number, dy: number) => {
    const out = [ty * map.width + tx];
    for (const s of [-1, 1]) {
      for (let x = tx + s * dx, y = ty + s * dy; street(x, y); x += s * dx, y += s * dy) {
        out.push(y * map.width + x);
      }
    }
    return out.sort((a, b) => a - b);
  };
  const across = run(1, 0);
  const along = run(0, 1);
  const span: Span =
    across.length <= along.length ? { tiles: across, axis: 'x' } : { tiles: along, axis: 'y' };
  if (span.tiles.length > rulesData.maxBarricadeSpanTiles) return 'too wide (intersection?)';
  const spawns = new Set(map.spawns.map(([x, y]) => y * map.width + x));
  if (span.tiles.some((i) => spawns.has(i))) return 'blocks a station';
  if (span.tiles.some((i) => world.barricadeAt[i]! !== 0)) return 'already barricaded';
  return span;
}

export function placeBarricade(
  world: World,
  tx: number,
  ty: number,
  type: BarricadeType = 'sawhorse',
): Barricade | string {
  const span = barricadeSpan(world, tx, ty);
  if (typeof span === 'string') return span;
  const maxHp = barricadesData[type].hp;
  const b: Barricade = {
    id: world.nextBarricadeId++,
    type,
    tiles: span.tiles,
    axis: span.axis,
    hp: maxHp,
    maxHp,
    band: hpBand(maxHp, maxHp),
  };
  world.barricades.push(b);
  for (const i of b.tiles) world.barricadeAt[i] = b.id;
  recomputeField(world);
  return b;
}

export function removeBarricade(world: World, id: number): boolean {
  const b = world.barricades.find((x) => x.id === id);
  if (!b) return false;
  world.barricades = world.barricades.filter((x) => x.id !== id);
  for (const i of b.tiles) world.barricadeAt[i] = 0;
  recomputeField(world);
  return true;
}

/**
 * Damage a barricade. The flow field is recomputed only when the barricade is destroyed or its HP
 * crosses into a lower band, never on every hit, so a siege can't make the swarm oscillate.
 */
export function damageBarricade(world: World, b: Barricade, dmg: number): void {
  b.hp -= dmg;
  const band = hpBand(b.hp, b.maxHp);
  // Band 0 counts as destroyed, so float dust left after many small hits (1e-13 HP) can't linger.
  if (band === 0) {
    world.stats.barricadesDestroyed++;
    removeBarricade(world, b.id);
    return;
  }
  if (band !== b.band) {
    b.band = band;
    recomputeField(world);
  }
}

/** Extra path cost per tile from barricades, using each barricade's banded HP (siege rule, D003). */
export function barricadeCosts(map: TileMap, barricades: readonly Barricade[]): Float64Array {
  const extra = new Float64Array(map.width * map.height);
  for (const b of barricades) {
    const effectiveHp = (b.maxHp * b.band) / rulesData.barricadeHpBands;
    const cost = Math.round(rulesData.barricadeCostPerHp * effectiveHp);
    for (const i of b.tiles) extra[i] = cost;
  }
  return extra;
}

export function recomputeField(world: World): void {
  if (!world.map) return;
  world.extraCost = barricadeCosts(world.map, world.barricades);
  world.field = flowField(world.map, world.extraCost);
  world.fieldVersion++;
}

/** The flow field as it would be with a new full-HP barricade on `span` (for the placement preview). */
export function previewField(world: World, span: Span, type: BarricadeType = 'sawhorse') {
  const map = world.map!;
  const maxHp = barricadesData[type].hp;
  const ghost: Barricade = {
    id: -1,
    type,
    tiles: span.tiles,
    axis: span.axis,
    hp: maxHp,
    maxHp,
    band: hpBand(maxHp, maxHp),
  };
  const extraCost = barricadeCosts(map, [...world.barricades, ghost]);
  return { extraCost, field: flowField(map, extraCost) };
}
