import rulesData from '../data/rules.json';
import type { DamageType, TargetLayer, TargetingMode, TowerDef, TowerTier } from '../data/schema';
import towersData from '../data/towers.json';
import { TICK_DT, TICK_HZ, TILE_M } from './constants';
import { hitDamage } from './damage';
import { builtNow, sellValue, type BuiltAt } from './economy';
import { gameHeight } from './height';
import { isWet, MOBS, mobPos, slowMob, targetLayer, type Mob } from './mobs';
import { isOver } from './phase';
import { Slot } from './slots';
import type { World } from './world';

export type TowerType = keyof typeof towersData;

/** The tower table, typed by its schema (src/data/schema.ts). */
export const TOWERS = towersData as Record<TowerType, TowerDef>;

export interface Tower {
  id: number;
  type: TowerType;
  tx: number;
  ty: number;
  /** Upgrade tier, 0-based index into the type's `tiers` (shown to the player as tier 1, 2…). */
  tier: number;
  targeting: TargetingMode;
  /** Seconds until the next shot is ready (≤ 0 = ready). */
  cooldown: number;
  /** Height the tower stands at (gameplay metres; 0 on a street corner). Sets its range (DESIGN §7). */
  heightM: number;
  /** Most recent shot, for tracers and sprays: where it was aimed (tile coordinates), and at a flier? */
  lastShot: { tick: number; x: number; y: number; air: boolean } | null;
  /** Tesla: the mobs the last lightning chain passed through, target first (tile coordinates). */
  lastChain: { x: number; y: number; air: boolean }[];
  built: BuiltAt;
  /** Everything paid for it (build + upgrades); selling refunds a share of this. */
  spent: number;
  kills: number;
}

/**
 * A shell in flight (Mortar, Flak). It lands on a fixed point, so a target that keeps moving can
 * dodge it, and splashes only the layers its tower can hit.
 */
export interface Shell {
  towerId: number;
  towerType: TowerType;
  targets: TargetLayer[];
  fromX: number;
  fromY: number;
  /** Impact point (tile coordinates). */
  x: number;
  y: number;
  firedTick: number;
  landTick: number;
  damage: number;
  damageType: DamageType;
  splashTiles: number;
}

export function towerTier(t: Pick<Tower, 'type' | 'tier'>): TowerTier {
  return TOWERS[t.type].tiers[t.tier]!;
}

/** Why a tower can't go on (tx, ty), or null if it can. Each type has its own slots (DESIGN §4.1, §7). */
export function towerSiteError(
  world: World,
  tx: number,
  ty: number,
  type?: TowerType,
): string | null {
  const map = world.map;
  const slots = world.slots;
  if (!map || !slots) return 'no map';
  if (isOver(world.phase)) return 'the run is over';
  if (tx < 0 || ty < 0 || tx >= map.width || ty >= map.height) return 'off the map';
  const i = ty * map.width + tx;
  const slot = slots.towerSlot[i];
  if (slot === Slot.None) return 'not a tower spot (roof pads and corners only)';
  if (world.towerAt[i] !== 0) return 'already has a tower';
  if (type) {
    const def = TOWERS[type];
    const kind = slot === Slot.Pad ? 'pad' : 'corner';
    if (!def.slots.includes(kind)) {
      return `${def.name} goes on ${def.slots[0] === 'pad' ? 'roof pads' : 'street corners'} only`;
    }
  }
  return null;
}

/**
 * The free spot for a `type` tower nearest to (tx, ty), within `radiusTiles` (Chebyshev square,
 * nearest by straight-line distance, ties to the lower tile index), or null. Used to snap placement
 * to the spot the player is pointing near.
 */
export function nearestTowerSite(
  world: World,
  tx: number,
  ty: number,
  type: TowerType,
  radiusTiles: number,
): [number, number] | null {
  const map = world.map;
  if (!map || !world.slots) return null;
  let best: [number, number] | null = null;
  let bestD = Infinity;
  for (let y = ty - radiusTiles; y <= ty + radiusTiles; y++) {
    for (let x = tx - radiusTiles; x <= tx + radiusTiles; x++) {
      if (x < 0 || y < 0 || x >= map.width || y >= map.height) continue;
      if (world.slots.towerSlot[y * map.width + x] === Slot.None) continue;
      if (towerSiteError(world, x, y, type)) continue;
      const d = Math.hypot(x - tx, y - ty);
      if (d < bestD) {
        best = [x, y];
        bestD = d;
      }
    }
  }
  return best;
}

/** Gameplay height of a tower spot: the roof for a pad, street level for a corner. */
export function siteHeight(world: World, i: number): number {
  return world.slots?.towerSlot[i] === Slot.Pad ? gameHeight(world.map?.heightsM?.[i] ?? 0) : 0;
}

/**
 * Range in metres (DESIGN §7): base range × (1 + heightFactor × height), capped. The minimum range
 * is the larger of the type's own (Mortar) and one that grows with height (raised towers can't
 * shoot straight down); street-level towers without a fixed minimum have none.
 */
export function towerRange(
  type: TowerType,
  heightM: number,
  tier = 0,
): { minM: number; maxM: number } {
  const def = TOWERS[type];
  const stats = def.tiers[tier]!;
  const mul = Math.min(def.rangeMaxMul, 1 + def.rangeHeightFactor * heightM);
  return {
    minM: Math.max(stats.minRangeM ?? 0, def.minRangePerHeight * heightM),
    maxM: stats.rangeM * mul,
  };
}

export function placeTower(
  world: World,
  tx: number,
  ty: number,
  type: TowerType = 'mgNest',
): Tower | string {
  const err = towerSiteError(world, tx, ty, type);
  if (err) return err;
  const def = TOWERS[type];
  const cost = def.tiers[0]!.cost;
  if (world.cash < cost) return `needs $${cost}`;
  world.cash -= cost;
  const t: Tower = {
    id: world.nextTowerId++,
    type,
    tx,
    ty,
    tier: 0,
    targeting: def.targeting,
    heightM: siteHeight(world, ty * world.map!.width + tx),
    cooldown: 0,
    lastShot: null,
    lastChain: [],
    built: builtNow(world),
    spent: cost,
    kills: 0,
  };
  world.towers.push(t);
  world.towerAt[ty * world.map!.width + tx] = t.id;
  return t;
}

/** Cost of the next upgrade tier, or null at the top tier. */
export function upgradeCost(t: Tower): number | null {
  return TOWERS[t.type].tiers[t.tier + 1]?.cost ?? null;
}

/** Upgrade a tower one tier (any phase while the run is on). */
export function upgradeTower(world: World, id: number): string | null {
  if (isOver(world.phase)) return 'the run is over';
  const t = world.towers.find((x) => x.id === id);
  if (!t) return 'no tower here';
  const cost = upgradeCost(t);
  if (cost === null) return 'already at the top tier';
  if (world.cash < cost) return `needs $${cost}`;
  world.cash -= cost;
  t.spent += cost;
  t.tier++;
  return null;
}

export function setTargeting(world: World, id: number, mode: TargetingMode): string | null {
  const t = world.towers.find((x) => x.id === id);
  if (!t) return 'no tower here';
  t.targeting = mode;
  return null;
}

export function towerSellValue(world: World, t: Tower): number {
  return sellValue(world, t.spent, t.built);
}

/** Sell a tower (any phase): 100% if built this prep, else 70%. */
export function sellTower(world: World, id: number): string | null {
  if (isOver(world.phase)) return 'the run is over';
  const t = world.towers.find((x) => x.id === id);
  if (!t) return 'no tower here';
  world.cash += towerSellValue(world, t);
  world.towers = world.towers.filter((x) => x.id !== id);
  world.towerAt[t.ty * world.map!.width + t.tx] = 0;
  return null;
}

/** Can this tower hit this mob now? (Layer rules: DESIGN §5.4–5.5, §7; buried diggers never.) */
function canTarget(world: World, def: TowerDef, m: Mob): boolean {
  const layer = targetLayer(world, m);
  return layer !== null && def.targets.includes(layer);
}

/**
 * Mobs a tower can reach right now: alive, between its minimum and maximum range, and on a layer it
 * can hit. A pulse reaches everything on or under the ground, buried diggers included.
 */
function inRange(world: World, t: Tower): Mob[] {
  const def = TOWERS[t.type];
  const r = towerRange(t.type, t.heightM, t.tier);
  const maxTiles = r.maxM / TILE_M;
  const minTiles = r.minM / TILE_M;
  return world.mobs.filter((m) => {
    if (m.hp <= 0) return false;
    if (def.attack === 'pulse' ? MOBS[m.type].layer === 'air' : !canTarget(world, def, m)) {
      return false;
    }
    const [x, y] = mobPos(m);
    const d = Math.hypot(x - t.tx, y - t.ty);
    return d <= maxTiles && d >= minTiles;
  });
}

/**
 * Pick a target by the tower's mode (DESIGN §7). "First" = furthest along its route, i.e. the lowest
 * remaining flow-field cost; "last" the opposite; "strongest"/"weakest" by current HP; "closest" by
 * distance. Ties go to the older mob (lower id) so it's deterministic.
 */
export function acquireTarget(world: World, t: Tower, candidates: Mob[]): Mob | null {
  const width = world.map!.width;
  const remaining = (m: Mob) => {
    const field = MOBS[m.type].layer === 'ground' ? world.field! : world.freeField!;
    return field[m.toY * width + m.toX]! + (1 - m.t);
  };
  const key: Record<TargetingMode, (m: Mob) => number> = {
    first: remaining,
    last: (m) => -remaining(m),
    strongest: (m) => -m.hp,
    weakest: (m) => m.hp,
    closest: (m) => {
      const [x, y] = mobPos(m);
      return Math.hypot(x - t.tx, y - t.ty);
    },
  };
  const score = key[t.targeting];
  let best: Mob | null = null;
  let bestKey = Infinity;
  for (const m of candidates) {
    const k = score(m);
    if (k < bestKey || (k === bestKey && best && m.id < best.id)) {
      best = m;
      bestKey = k;
    }
  }
  return best;
}

/** Apply one hit to a mob, after armor. Credits the kill to `tower` if this hit killed it. */
function hit(world: World, m: Mob, raw: number, type: DamageType, tower: Tower | undefined) {
  if (m.hp <= 0) return;
  m.hp -= hitDamage(raw, type, MOBS[m.type].armor);
  m.lastHitTick = world.tick;
  if (m.hp <= 0 && tower) tower.kills++;
}

/** Fire one shot at `target`, by the tower's attack (schema.ts ATTACKS). */
function fire(world: World, t: Tower, target: Mob, candidates: Mob[]): void {
  const def = TOWERS[t.type];
  const stats = towerTier(t);
  const [x, y] = mobPos(target);
  t.lastShot = { tick: world.tick, x, y, air: MOBS[target.type].layer === 'air' };
  switch (def.attack) {
    case 'hit':
      hit(world, target, stats.damage, def.damageType, t);
      return;
    case 'shell':
      world.shells.push({
        towerId: t.id,
        towerType: t.type,
        targets: def.targets,
        fromX: t.tx,
        fromY: t.ty,
        x,
        y,
        firedTick: world.tick,
        landTick: world.tick + Math.max(1, Math.round(stats.shellS! * TICK_HZ)),
        damage: stats.damage,
        damageType: def.damageType,
        splashTiles: stats.splashM! / TILE_M,
      });
      return;
    case 'cone': {
      // Everything in range inside the cone aimed at the target is hit, slowed and wetted.
      const aim = Math.atan2(y - t.ty, x - t.tx);
      const half = ((stats.coneDeg! / 2) * Math.PI) / 180;
      const slowTicks = Math.round(stats.slowS! * TICK_HZ);
      const wetTicks = Math.round((stats.wetS ?? 0) * TICK_HZ);
      for (const m of candidates) {
        const [mx, my] = mobPos(m);
        const off = Math.abs(angleDiff(Math.atan2(my - t.ty, mx - t.tx), aim));
        if (m !== target && off > half) continue;
        slowMob(world, m, stats.slowMul!, slowTicks);
        m.wetUntilTick = Math.max(m.wetUntilTick, world.tick + wetTicks);
        hit(world, m, stats.damage, def.damageType, t);
      }
      return;
    }
    case 'chain':
      chain(world, t, target);
      return;
    case 'pulse':
      pulse(world, t, candidates);
      return;
  }
}

/**
 * Tesla (DESIGN §7): lightning hits the target, then jumps to the nearest mob it hasn't hit within
 * jump reach, `chains` times, losing `chainFalloff` of its damage per jump. A wet target (Cryo) adds
 * `wetExtraChains` jumps. Ties go to the lower id.
 */
function chain(world: World, t: Tower, target: Mob): void {
  const def = TOWERS[t.type];
  const stats = towerTier(t);
  const jumps = stats.chains! + (isWet(world, target) ? rulesData.wetExtraChains : 0);
  const reach = stats.chainRangeM! / TILE_M;
  const struck = new Set<Mob>([target]);
  let at = target;
  let dmg = stats.damage;
  hit(world, target, dmg, def.damageType, t);
  const point = (m: Mob) => {
    const [px, py] = mobPos(m);
    return { x: px, y: py, air: MOBS[m.type].layer === 'air' };
  };
  t.lastChain = [point(target)];
  for (let j = 0; j < jumps; j++) {
    const [ax, ay] = mobPos(at);
    let next: Mob | null = null;
    let nextD = Infinity;
    for (const m of world.mobs) {
      if (struck.has(m) || m.hp <= 0 || !canTarget(world, def, m)) continue;
      const [mx, my] = mobPos(m);
      const d = Math.hypot(mx - ax, my - ay);
      if (d <= reach && (d < nextD || (d === nextD && next && m.id < next.id))) {
        next = m;
        nextD = d;
      }
    }
    if (!next) break;
    dmg *= stats.chainFalloff!;
    hit(world, next, dmg, def.damageType, t);
    struck.add(next);
    t.lastChain.push(point(next));
    at = next;
  }
}

/**
 * Seismic Pulse (DESIGN §5.5, §7): everything on or under the ground in range takes the damage;
 * buried diggers are forced up for `revealS` (towers can hit them) and diggers are stunned.
 */
function pulse(world: World, t: Tower, candidates: Mob[]): void {
  const def = TOWERS[t.type];
  const stats = towerTier(t);
  const revealTicks = Math.round(stats.revealS! * TICK_HZ);
  const stunTicks = Math.round(stats.stunS! * TICK_HZ);
  for (const m of candidates) {
    if (MOBS[m.type].layer === 'digger') {
      m.surfacedUntilTick = Math.max(m.surfacedUntilTick, world.tick + revealTicks);
      m.stunUntilTick = Math.max(m.stunUntilTick, world.tick + stunTicks);
    }
    hit(world, m, stats.damage, def.damageType, t);
  }
  const r = towerRange(t.type, t.heightM, t.tier);
  world.fx.pulses.push({ tick: world.tick, x: t.tx, y: t.ty, radiusM: r.maxM, source: t.type });
}

function angleDiff(a: number, b: number): number {
  const d = (a - b) % (2 * Math.PI);
  return d > Math.PI ? d - 2 * Math.PI : d < -Math.PI ? d + 2 * Math.PI : d;
}

/** Shells that land this tick damage every mob they can hit within their splash radius. */
function landShells(world: World): void {
  const flying = [];
  for (const s of world.shells) {
    if (s.landTick > world.tick) {
      flying.push(s);
      continue;
    }
    const tower = world.towers.find((t) => t.id === s.towerId);
    for (const m of world.mobs) {
      const layer = targetLayer(world, m);
      if (layer === null || !s.targets.includes(layer)) continue;
      const [x, y] = mobPos(m);
      if (Math.hypot(x - s.x, y - s.y) <= s.splashTiles)
        hit(world, m, s.damage, s.damageType, tower);
    }
    world.fx.splashes.push({
      tick: world.tick,
      x: s.x,
      y: s.y,
      radiusM: s.splashTiles * TILE_M,
      source: s.towerType,
    });
  }
  world.shells = flying;
}

/** Land shells, let every tower fire, then remove the dead and pay bounties. */
export function fireTowers(world: World): void {
  if (!world.map || !world.field) return;
  landShells(world);
  for (const t of world.towers) {
    const stats = towerTier(t);
    t.cooldown -= TICK_DT;
    while (t.cooldown <= 0) {
      const candidates = inRange(world, t);
      const target = acquireTarget(world, t, candidates);
      if (!target) {
        t.cooldown = 0; // stay ready
        break;
      }
      fire(world, t, target, candidates);
      t.cooldown += 1 / stats.shotsPerS;
    }
  }
  const alive: Mob[] = [];
  for (const m of world.mobs) {
    if (m.hp > 0) {
      alive.push(m);
    } else {
      world.cash += MOBS[m.type].bounty;
      world.stats.kills++;
      const [x, y] = mobPos(m);
      world.fx.kills.push({ tick: world.tick, x, y });
    }
  }
  world.mobs = alive;
}
