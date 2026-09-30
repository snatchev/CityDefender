import rulesData from '../data/rules.json';
import type {
  DamageType,
  TargetLayer,
  TargetingMode,
  TowerBranch,
  TowerDef,
  TowerTier,
} from '../data/schema';
import towersData from '../data/towers.json';
import { TICK_DT, TICK_HZ, TILE_M } from './constants';
import { hitDamage } from './damage';
import { builtNow, sellValue, type BuiltAt } from './economy';
import { gameHeight } from './height';
import { modPrice } from './grants';
import { isWet, mobArmor, MOBS, mobPos, slowMob, targetLayer, type Mob } from './mobs';
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
  /**
   * Upgrade tier, 0-based index into the type's `tiers` (shown to the player as tier 1, 2…); one past
   * the last tier means tier 3, the chosen `branch`.
   */
  tier: number;
  /** Tier-3 specialisation (DESIGN §7), once chosen. */
  branch: string | null;
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
  /** Incendiary: the splash area burns afterwards. */
  burn: { dps: number; s: number } | null;
}

/** Burning ground left by an Incendiary shell: hurts ground mobs inside it (ignores armor). */
export interface Fire {
  towerId: number;
  x: number;
  y: number;
  radiusTiles: number;
  dps: number;
  untilTick: number;
}

/** A tower's current stats: its tier, or its tier-3 branch. */
export function towerTier(t: { type: TowerType; tier: number; branch?: string | null }): TowerTier {
  const def = TOWERS[t.type];
  if (t.tier < def.tiers.length) return def.tiers[t.tier]!;
  return def.branches!.find((b) => b.id === t.branch)!;
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
  stats: TowerTier = TOWERS[type].tiers[0]!,
  rangeMul = 1,
): { minM: number; maxM: number } {
  const def = TOWERS[type];
  const mul = Math.min(def.rangeMaxMul, 1 + def.rangeHeightFactor * heightM);
  return {
    minM: Math.max(stats.minRangeM ?? 0, def.minRangePerHeight * heightM),
    maxM: stats.rangeM * mul * rangeMul,
  };
}

/** Range multiplier from grants for a tower spot (roof pad or street corner). */
export function siteRangeMul(world: World, i: number): number {
  return world.mods.rangeMul[world.slots?.towerSlot[i] === Slot.Pad ? 'pad' : 'corner'];
}

/** A placed tower's range, with its tier or branch and any grant. */
export function towerRangeOf(world: World, t: Tower): { minM: number; maxM: number } {
  return towerRange(
    t.type,
    t.heightM,
    towerTier(t),
    siteRangeMul(world, t.ty * world.map!.width + t.tx),
  );
}

/** Build price of a tower type after grants. */
export function towerPrice(world: World, type: TowerType): number {
  return modPrice(TOWERS[type].tiers[0]!.cost, world.mods.towerCostMul[type]);
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
  const cost = towerPrice(world, type);
  if (world.cash < cost) return `needs $${cost}`;
  world.cash -= cost;
  const t: Tower = {
    id: world.nextTowerId++,
    type,
    tx,
    ty,
    tier: 0,
    branch: null,
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

export interface UpgradeOption {
  /** Null for a plain next tier; the branch id for a tier-3 specialisation. */
  branch: string | null;
  name: string;
  blurb: string | null;
  cost: number;
}

/**
 * What this tower can upgrade to next (after grants): the next tier, or at the last tier each of
 * its tier-3 branches (DESIGN §7), or nothing once it has one.
 */
export function upgradeOptions(world: World, t: Tower): UpgradeOption[] {
  const def = TOWERS[t.type];
  const price = (cost: number) => modPrice(cost, world.mods.towerCostMul[t.type]);
  const next = def.tiers[t.tier + 1];
  if (next)
    return [{ branch: null, name: `Tier ${t.tier + 2}`, blurb: null, cost: price(next.cost) }];
  if (t.tier === def.tiers.length - 1 && def.branches) {
    return def.branches.map((b: TowerBranch) => ({
      branch: b.id,
      name: b.name,
      blurb: b.blurb,
      cost: price(b.cost),
    }));
  }
  return [];
}

/** Upgrade a tower (any phase while the run is on); at the last tier, `branch` picks tier 3. */
export function upgradeTower(
  world: World,
  id: number,
  branch: string | null = null,
): string | null {
  if (isOver(world.phase)) return 'the run is over';
  const t = world.towers.find((x) => x.id === id);
  if (!t) return 'no tower here';
  const option = upgradeOptions(world, t).find((o) => o.branch === branch);
  if (!option) return branch ? 'no such branch' : 'already at the top tier';
  if (world.cash < option.cost) return `needs $${option.cost}`;
  world.cash -= option.cost;
  t.spent += option.cost;
  t.tier++;
  t.branch = branch;
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
  const r = towerRangeOf(world, t);
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

/**
 * Apply one hit to a mob: a mark (Railgun Spotter) adds its bonus, then armor. Credits the kill to
 * `tower` if this hit killed it.
 */
function hit(world: World, m: Mob, raw: number, type: DamageType, tower: Tower | undefined) {
  if (m.hp <= 0) return;
  const marked = world.tick < m.markUntilTick ? m.markBonus : 0;
  m.hp -= hitDamage(raw * (1 + marked), type, mobArmor(m));
  m.lastHitTick = world.tick;
  if (m.hp <= 0 && tower) tower.kills++;
}

/** Fire one shot at `target`, by the tower's attack (schema.ts ATTACKS). */
function fire(world: World, t: Tower, target: Mob, candidates: Mob[]): void {
  const def = TOWERS[t.type];
  const stats = towerTier(t);
  const [x, y] = mobPos(target);
  const damageType = stats.damageType ?? def.damageType;
  t.lastShot = { tick: world.tick, x, y, air: MOBS[target.type].layer === 'air' };
  switch (def.attack) {
    case 'hit':
      hit(world, target, stats.damage, damageType, t);
      if (stats.special === 'mark') {
        target.markUntilTick = world.tick + Math.round(stats.markS! * TICK_HZ);
        target.markBonus = stats.markBonus!;
      }
      if (stats.special === 'pierceLine') pierceLine(world, t, target, candidates, stats.damage);
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
        damageType,
        splashTiles: stats.splashM! / TILE_M,
        burn: stats.special === 'burn' ? { dps: stats.burnDps!, s: stats.burnS! } : null,
      });
      return;
    case 'cone': {
      // Everything in range inside the cone aimed at the target is hit, slowed and wetted.
      const aim = Math.atan2(y - t.ty, x - t.tx);
      const half = ((stats.coneDeg! / 2) * Math.PI) / 180;
      const slowTicks = Math.round(stats.slowS! * TICK_HZ);
      const wetTicks = Math.round((stats.wetS ?? 0) * world.mods.wetDurationMul * TICK_HZ);
      for (const m of candidates) {
        const [mx, my] = mobPos(m);
        const off = Math.abs(angleDiff(Math.atan2(my - t.ty, mx - t.tx), aim));
        if (m !== target && off > half) continue;
        slowMob(world, m, stats.slowMul!, slowTicks);
        m.wetUntilTick = Math.max(m.wetUntilTick, world.tick + wetTicks);
        hit(world, m, stats.damage, damageType, t);
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
  const r = towerRangeOf(world, t);
  world.fx.pulses.push({ tick: world.tick, x: t.tx, y: t.ty, radiusM: r.maxM, source: t.type });
}

/**
 * Railgun Penetrator: the shot carries on through its target, hitting every mob it can target within
 * half a tile of the line from the tower through the target, out to its range.
 */
function pierceLine(world: World, t: Tower, target: Mob, candidates: Mob[], damage: number): void {
  const [tx, ty] = mobPos(target);
  const dx = tx - t.tx;
  const dy = ty - t.ty;
  const len = Math.hypot(dx, dy);
  if (len === 0) return;
  const reach = towerRangeOf(world, t).maxM / TILE_M;
  const damageType = towerTier(t).damageType ?? TOWERS[t.type].damageType;
  for (const m of candidates) {
    if (m === target) continue;
    const [mx, my] = mobPos(m);
    const along = ((mx - t.tx) * dx + (my - t.ty) * dy) / len;
    if (along <= 0 || along > reach) continue;
    const off = Math.abs((mx - t.tx) * dy - (my - t.ty) * dx) / len;
    if (off <= 0.5) hit(world, m, damage, damageType, t);
  }
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
      if (Math.hypot(x - s.x, y - s.y) <= s.splashTiles) {
        hit(world, m, s.damage, s.damageType, tower);
      }
    }
    if (s.burn) {
      world.fires.push({
        towerId: s.towerId,
        x: s.x,
        y: s.y,
        radiusTiles: s.splashTiles,
        dps: s.burn.dps,
        untilTick: world.tick + Math.round(s.burn.s * TICK_HZ),
      });
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

/** Land shells, then let every tower fire (clearing the dead is `sweepDead`, after other damage). */
export function fireTowers(world: World): void {
  if (!world.map || !world.field) return;
  landShells(world);
  for (const t of world.towers) {
    const stats = towerTier(t);
    const rate = stats.shotsPerS * (world.mods.fireRateMul[t.type] ?? 1);
    t.cooldown -= TICK_DT;
    while (t.cooldown <= 0) {
      const candidates = inRange(world, t);
      const target = acquireTarget(world, t, candidates);
      if (!target) {
        t.cooldown = 0; // stay ready
        break;
      }
      fire(world, t, target, candidates);
      t.cooldown += 1 / rate;
    }
  }
}

/** Burning ground (Incendiary) hurts every ground mob inside it, ignoring armor, until it burns out. */
export function tickFires(world: World): void {
  if (world.fires.length === 0) return;
  world.fires = world.fires.filter((f) => f.untilTick > world.tick);
  for (const f of world.fires) {
    const tower = world.towers.find((t) => t.id === f.towerId);
    for (const m of world.mobs) {
      if (m.hp <= 0 || targetLayer(world, m) !== 'ground') continue;
      const [x, y] = mobPos(m);
      if (Math.hypot(x - f.x, y - f.y) > f.radiusTiles) continue;
      m.hp -= f.dps * TICK_DT;
      if (m.hp <= 0 && tower) tower.kills++;
    }
  }
}

/** Remove the dead and pay their bounties (after grants), recording kills for effects and score. */
export function sweepDead(world: World): void {
  const alive: Mob[] = [];
  for (const m of world.mobs) {
    if (m.hp > 0) {
      alive.push(m);
    } else {
      const bounty = Math.round(MOBS[m.type].bounty * world.mods.bountyMul);
      world.cash += bounty;
      world.stats.bounty += bounty;
      world.stats.kills++;
      const [x, y] = mobPos(m);
      world.fx.kills.push({ tick: world.tick, x, y });
    }
  }
  world.mobs = alive;
}
