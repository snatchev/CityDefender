import barricadesData from '../data/barricades.json';
import rulesData from '../data/rules.json';
import type { BarricadeDef } from '../data/schema';
import { builtNow, sellValue, type BuiltAt } from './economy';
import { flowField } from './flow';
import { Tile, tileAt, tileXY, type TileMap } from './map';
import { isPlanning } from './phase';
import type { World } from './world';

export type BarricadeType = keyof typeof barricadesData;

/** The barricade table, typed by its schema (src/data/schema.ts). */
export const BARRICADES = barricadesData as Record<BarricadeType, BarricadeDef>;

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
  built: BuiltAt;
}

export type Span = { tiles: number[]; axis: 'x' | 'y' };

/** Which quarter (by default) of its HP a barricade is in: full HP = top band, destroyed = 0. */
export function hpBand(hp: number, maxHp: number): number {
  return Math.max(0, Math.ceil((hp / maxHp) * rulesData.barricadeHpBands - 1e-9));
}

/**
 * The tiles a barricade clicked at (tx, ty) would cover: the run of street tiles across the street
 * at that spot. One barricade per street segment (block face, DESIGN §4.1), never on an
 * intersection or station, and the span must stay within its segment. Returns an error string if
 * the spot can't take a barricade.
 */
export function barricadeSpan(world: World, tx: number, ty: number): Span | string {
  const map = world.map;
  const slots = world.slots;
  if (!map || !slots) return 'no map';
  const street = (x: number, y: number) => tileAt(map, x, y) === Tile.Street;
  if (!street(tx, ty)) return 'not a street';
  const here = ty * map.width + tx;
  if (world.barricadeAt[here]! !== 0) return 'already barricaded';
  const seg = slots.segmentOf[here]!;
  if (seg < 0) {
    return slots.nodes[slots.nodeOf[here]!]?.station
      ? 'blocks a station'
      : 'intersections stay open';
  }
  if (world.barricades.some((b) => slots.segmentOf[b.tiles[0]!] === seg)) {
    return 'this block already has a barricade';
  }
  const run = (dx: number, dy: number) => {
    const out = [here];
    for (const s of [-1, 1]) {
      for (let x = tx + s * dx, y = ty + s * dy; street(x, y); x += s * dx, y += s * dy) {
        out.push(y * map.width + x);
      }
    }
    return out.sort((a, b) => a - b);
  };
  const span: Span =
    slots.segments[seg]!.axis === 'x'
      ? { tiles: run(1, 0), axis: 'x' }
      : { tiles: run(0, 1), axis: 'y' };
  if (span.tiles.length > rulesData.maxBarricadeSpanTiles) return 'too wide here';
  if (span.tiles.some((i) => slots.segmentOf[i] !== seg)) return 'too close to a crossing';
  return span;
}

/** Barricades go up and come down only while planning (DESIGN §3.1, D006). */
export function canEditBarricades(world: World): boolean {
  return isPlanning(world.phase);
}

export function placeBarricade(
  world: World,
  tx: number,
  ty: number,
  type: BarricadeType = 'sawhorse',
): Barricade | string {
  if (!canEditBarricades(world)) return 'barricades go up during prep only';
  const span = barricadeSpan(world, tx, ty);
  if (typeof span === 'string') return span;
  const cost = BARRICADES[type].cost;
  if (world.cash < cost) return `needs $${cost}`;
  world.cash -= cost;
  const maxHp = BARRICADES[type].hp;
  const b: Barricade = {
    id: world.nextBarricadeId++,
    type,
    tiles: span.tiles,
    axis: span.axis,
    hp: maxHp,
    maxHp,
    band: hpBand(maxHp, maxHp),
    built: builtNow(world),
  };
  world.barricades.push(b);
  for (const i of b.tiles) world.barricadeAt[i] = b.id;
  recomputeField(world);
  return b;
}

export function barricadeSellValue(world: World, b: Barricade): number {
  return sellValue(world, BARRICADES[b.type].cost, b.built);
}

/** What upgrading this barricade in place leads to and costs (the price difference), or null. */
export function barricadeUpgrade(b: Barricade): { type: BarricadeType; cost: number } | null {
  const next = BARRICADES[b.type].upgradeTo as BarricadeType | undefined;
  if (!next) return null;
  return { type: next, cost: BARRICADES[next].cost - BARRICADES[b.type].cost };
}

/**
 * Upgrade a barricade in place (prep only, DESIGN §8), paying the price difference. It gains the
 * HP difference, so damage it took stays taken.
 */
export function upgradeBarricade(world: World, id: number): string | null {
  if (!canEditBarricades(world)) return 'barricades change during prep only';
  const b = world.barricades.find((x) => x.id === id);
  if (!b) return 'no barricade here';
  const up = barricadeUpgrade(b);
  if (!up) return 'already the strongest barricade';
  if (world.cash < up.cost) return `needs $${up.cost}`;
  world.cash -= up.cost;
  const maxHp = BARRICADES[up.type].hp;
  b.hp += maxHp - b.maxHp;
  b.maxHp = maxHp;
  b.type = up.type;
  b.band = hpBand(b.hp, b.maxHp);
  recomputeField(world);
  return null;
}

/** Take a barricade down (prep only): 100% back if built this prep, else 70%. */
export function dismantleBarricade(world: World, id: number): string | null {
  if (!canEditBarricades(world)) return 'barricades come down during prep only';
  const b = world.barricades.find((x) => x.id === id);
  if (!b) return 'no barricade here';
  world.cash += barricadeSellValue(world, b);
  removeBarricade(world, id);
  return null;
}

/** Remove a barricade from the map (destroyed or dismantled). */
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
    const [x, y] = tileXY(world.map!, b.tiles[Math.floor(b.tiles.length / 2)]!);
    world.fx.barricadeBreaks.push({ tick: world.tick, x, y });
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
  const maxHp = BARRICADES[type].hp;
  const ghost: Barricade = {
    built: builtNow(world),
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
