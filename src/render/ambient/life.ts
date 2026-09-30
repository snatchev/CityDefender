import { Tile, type TileMap } from '../../sim/map';
import type { MapSlots } from '../../sim/slots';
import { tileToWorld, uvToWorld, type TileFrame } from '../coords';

/**
 * Street life (D052): cars, pedestrians and trees that make the city feel lived in. Purely
 * decorative: it reads the map, the street graph, the walls and where the bugs are, and never
 * touches the sim. Cars drive the game's street graph (block faces between intersections) on the
 * right-hand lane, queue behind each other, turn at intersections and turn back at walls.
 * Pedestrians wander the sidewalk tiles along building fronts. Anything within a few tiles of a bug
 * flees: cars turn around and speed off, people run and soon duck into a building, coming back
 * later somewhere safe. Plain arrays, one pass per frame; the renderer copies the results into
 * instanced meshes.
 */

export const CAR_COUNT = 120;
export const PERSON_COUNT = 320;

const TILE = 8; // m, matches the sim's tile size
const CAR_SPEED_MPS = [6, 10] as const;
const CAR_PANIC_SPEED_MUL = 2.2;
const CAR_PANIC_S = 4;
const CAR_FLEE_M = 32;
/** Cars keep this far behind the car ahead in their lane (m), and stop at half of it. */
const CAR_GAP_M = 11;
/** How far into its lane a car drives from the street's centre line (m, clamped to the width). */
const LANE_OFFSET_M = [1.6, 4.5] as const;
const LANE_WIDTH_SHARE = 0.45;

const WALK_MPS = [1.0, 1.7] as const;
const RUN_MPS = 5;
const PERSON_FLEE_M = 28;
/** Running people duck into a building after this long, with this chance per step. */
const HIDE_AFTER_S = 1.5;
const HIDE_CHANCE = 0.4;
const HIDDEN_S = [10, 25] as const;
/** Come back somewhere at least this far from every bug (m). */
const RESPAWN_CLEAR_M = 110;
/** How far from a sidewalk tile's centre toward the building people walk (m), and their spread. */
const SIDEWALK_OFFSET_M = 2.6;
const WALK_SPREAD_M = 0.8;

const TREE_EVERY_TILES = 3;
const TREE_CHANCE = 0.55;
/** Trees stand at the kerb: less far toward the building than the walkers (m). */
const TREE_OFFSET_M = 0.6;

/** Bugs are bucketed in cells this big (m) for the flee checks. */
const BUG_CELL_M = 32;

export interface Tree {
  x: number;
  z: number;
  tile: number;
  scale: number;
  shade: number;
}

interface Lane {
  /** Along the street: tile y for a north–south street, tile x for east–west. */
  alongY: boolean;
  a0: number;
  a1: number;
  /** Lateral centre and half width (tile units). */
  centre: number;
  halfW: number;
  laneM: number;
  lowNode: number;
  highNode: number;
}

interface Car {
  seg: number;
  dir: 1 | -1;
  /** Position along the segment (tile units). */
  s: number;
  speed: number;
  panic: number;
  /** Crossing an intersection: straight from (fx, fz) to (tx, tz), then onto `seg` at `s`. */
  turn: { fx: number; fz: number; tx: number; tz: number; t: number; len: number } | null;
  x: number;
  z: number;
  yaw: number;
}

interface Person {
  from: number;
  to: number;
  t: number;
  speed: number;
  spread: number;
  fleeing: number;
  hidden: number;
  x: number;
  z: number;
  yaw: number;
  phase: number;
}

type Random = () => number;

export class StreetLife {
  readonly cars: Car[] = [];
  readonly people: Person[] = [];
  readonly trees: Tree[] = [];
  private lanes: Lane[] = [];
  private nodeSegs = new Map<number, number[]>();
  private sidewalk: Uint8Array;
  /** Unit vector from a sidewalk tile toward its building(s), (0, 0) where both sides are buildings. */
  private sideX: Float32Array;
  private sideZ: Float32Array;
  private sidewalkTiles: number[] = [];
  private bugs = new Map<number, number[]>();

  constructor(
    private map: TileMap,
    private slots: MapSlots,
    private frame: TileFrame,
    private random: Random,
  ) {
    const n = map.width * map.height;
    this.sidewalk = new Uint8Array(n);
    this.sideX = new Float32Array(n);
    this.sideZ = new Float32Array(n);
    this.buildSidewalks();
    this.buildLanes();
    this.placeTrees();
    for (let k = 0; k < CAR_COUNT; k++) this.spawnCar();
    for (let k = 0; k < PERSON_COUNT; k++) this.people.push(this.spawnPerson(null));
  }

  // ---- setup ----

  private isStreet(tx: number, ty: number): boolean {
    const { map } = this;
    return (
      tx >= 0 &&
      ty >= 0 &&
      tx < map.width &&
      ty < map.height &&
      map.tiles[ty * map.width + tx] === Tile.Street
    );
  }

  private buildSidewalks(): void {
    const { map } = this;
    for (let ty = 0; ty < map.height; ty++) {
      for (let tx = 0; tx < map.width; tx++) {
        if (!this.isStreet(tx, ty)) continue;
        let sx = 0;
        let sz = 0;
        for (const [dx, dy] of [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ] as const) {
          const nx = tx + dx;
          const ny = ty + dy;
          const inside = nx >= 0 && ny >= 0 && nx < map.width && ny < map.height;
          if (inside && !this.isStreet(nx, ny)) {
            sx += dx;
            sz += dy;
          }
        }
        if (sx === 0 && sz === 0 && !this.touchesBuilding(tx, ty)) continue;
        const i = ty * map.width + tx;
        const l = Math.hypot(sx, sz);
        this.sidewalk[i] = 1;
        this.sideX[i] = l > 0 ? sx / l : 0;
        this.sideZ[i] = l > 0 ? sz / l : 0;
        this.sidewalkTiles.push(i);
      }
    }
  }

  private touchesBuilding(tx: number, ty: number): boolean {
    return [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ].some(([dx, dy]) => {
      const nx = tx + dx!;
      const ny = ty + dy!;
      return (
        nx >= 0 && ny >= 0 && nx < this.map.width && ny < this.map.height && !this.isStreet(nx, ny)
      );
    });
  }

  private buildLanes(): void {
    const { slots, map } = this;
    for (const seg of slots.segments) {
      const alongY = seg.axis === 'x'; // a wall spans x across a north–south street
      let [a0, a1, l0, l1] = [Infinity, -Infinity, Infinity, -Infinity];
      for (const i of seg.tiles) {
        const tx = i % map.width;
        const ty = (i - tx) / map.width;
        const [a, l] = alongY ? [ty, tx] : [tx, ty];
        [a0, a1, l0, l1] = [
          Math.min(a0, a),
          Math.max(a1, a + 1),
          Math.min(l0, l),
          Math.max(l1, l + 1),
        ];
      }
      const centre = (l0 + l1) / 2;
      const halfW = (l1 - l0) / 2;
      const along = (a0 + a1) / 2;
      let lowNode = -1;
      let highNode = -1;
      for (const nodeId of seg.nodes) {
        const node = slots.nodes[nodeId]!;
        let c = 0;
        for (const i of node.tiles) {
          const tx = i % map.width;
          c += alongY ? (i - tx) / map.width : tx;
        }
        c /= node.tiles.length;
        if (c < along) lowNode = nodeId;
        else highNode = nodeId;
        const list = this.nodeSegs.get(nodeId);
        if (list) list.push(seg.id);
        else this.nodeSegs.set(nodeId, [seg.id]);
      }
      const laneM = Math.min(
        LANE_OFFSET_M[1],
        Math.max(LANE_OFFSET_M[0], halfW * TILE * LANE_WIDTH_SHARE),
      );
      this.lanes[seg.id] = { alongY, a0, a1, centre, halfW, laneM, lowNode, highNode };
    }
  }

  private placeTrees(): void {
    const { map, slots } = this;
    for (const seg of slots.segments) {
      seg.tiles.forEach((i) => {
        if (!this.sidewalk[i] || (this.sideX[i] === 0 && this.sideZ[i] === 0)) return;
        if (slots.towerSlot[i] || slots.manholeAt[i]) return;
        const tx = i % map.width;
        const ty = (i - tx) / map.width;
        const along = this.lanes[seg.id]!.alongY ? ty : tx;
        if (along % TREE_EVERY_TILES !== 0 || this.random() > TREE_CHANCE) return;
        const [cx, cz] = tileToWorld(this.frame, tx, ty);
        this.trees.push({
          x: cx + this.sideX[i]! * TREE_OFFSET_M,
          z: cz + this.sideZ[i]! * TREE_OFFSET_M,
          tile: i,
          scale: 0.8 + this.random() * 0.5,
          shade: 0.85 + this.random() * 0.3,
        });
      });
    }
  }

  // ---- cars ----

  private spawnCar(): void {
    const segs = this.lanes.filter((l) => l && l.a1 - l.a0 >= 3);
    if (segs.length === 0) return;
    const lane = segs[Math.floor(this.random() * segs.length)]!;
    const seg = this.lanes.indexOf(lane);
    const car: Car = {
      seg,
      dir: this.random() < 0.5 ? 1 : -1,
      s: lane.a0 + this.random() * (lane.a1 - lane.a0),
      speed: CAR_SPEED_MPS[0] + this.random() * (CAR_SPEED_MPS[1] - CAR_SPEED_MPS[0]),
      panic: 0,
      turn: null,
      x: 0,
      z: 0,
      yaw: 0,
    };
    this.placeCar(car);
    this.cars.push(car);
  }

  /** World position of a lane point: `s` along segment `seg`, in the lane for `dir`. */
  private lanePoint(seg: number, s: number, dir: 1 | -1): [number, number] {
    const l = this.lanes[seg]!;
    const off = l.laneM / TILE;
    // Right-hand traffic: heading south (+y) the right side is west (-x); heading east, south (+y).
    const u = l.alongY ? l.centre - dir * off : s;
    const v = l.alongY ? s : l.centre + dir * off;
    return uvToWorld(this.frame, u, v);
  }

  private placeCar(c: Car): void {
    const [x, z] = this.lanePoint(c.seg, c.s, c.dir);
    const l = this.lanes[c.seg]!;
    c.x = x;
    c.z = z;
    c.yaw = l.alongY ? (c.dir > 0 ? 0 : Math.PI) : c.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
  }

  private laneBlocked(seg: number, barricadeAt: Int32Array): boolean {
    return this.slots.segments[seg]!.tiles.some((i) => barricadeAt[i]);
  }

  private uTurn(c: Car): void {
    c.dir = c.dir > 0 ? -1 : 1;
  }

  private stepCar(c: Car, dt: number, barricadeAt: Int32Array, ahead: number): void {
    c.panic = Math.max(0, c.panic - dt);
    const bug = this.nearestBug(c.x, c.z, CAR_FLEE_M);
    if (bug && !c.turn) {
      const fx = Math.sin(c.yaw);
      const fz = Math.cos(c.yaw);
      if ((bug[0] - c.x) * fx + (bug[1] - c.z) * fz > 0 && c.panic === 0) this.uTurn(c);
      c.panic = CAR_PANIC_S;
    }
    let speed = c.speed * (c.panic > 0 ? CAR_PANIC_SPEED_MUL : 1);
    if (!c.turn && c.panic === 0) {
      if (ahead < CAR_GAP_M / 2) speed = 0;
      else if (ahead < CAR_GAP_M) speed *= (ahead - CAR_GAP_M / 2) / (CAR_GAP_M / 2);
    }
    const move = speed * dt;

    if (c.turn) {
      const tr = c.turn;
      tr.t += move / Math.max(tr.len, 0.01);
      const k = Math.min(1, tr.t);
      c.x = tr.fx + (tr.tx - tr.fx) * k;
      c.z = tr.fz + (tr.tz - tr.fz) * k;
      if (tr.len > 0.1) c.yaw = Math.atan2(tr.tx - tr.fx, tr.tz - tr.fz);
      if (k >= 1) {
        c.turn = null;
        this.placeCar(c);
      }
      return;
    }

    const l = this.lanes[c.seg]!;
    // A wall across the lane just ahead: turn back.
    const lookS = c.s + c.dir * 1.2;
    const lookTile = this.laneTile(l, lookS);
    if (lookTile >= 0 && barricadeAt[lookTile]) {
      this.uTurn(c);
      this.placeCar(c);
      return;
    }
    c.s += (c.dir * move) / TILE;
    const end = c.dir > 0 ? l.a1 : l.a0;
    if ((c.dir > 0 && c.s >= end) || (c.dir < 0 && c.s <= end)) {
      c.s = end;
      this.enterIntersection(c, barricadeAt);
    } else {
      this.placeCar(c);
    }
  }

  /** Tile index under the lane centre line at `s`, or -1. */
  private laneTile(l: Lane, s: number): number {
    const a = Math.floor(s);
    const b = Math.floor(l.centre);
    const [tx, ty] = l.alongY ? [b, a] : [a, b];
    return tx >= 0 && ty >= 0 && tx < this.map.width && ty < this.map.height
      ? ty * this.map.width + tx
      : -1;
  }

  private enterIntersection(c: Car, barricadeAt: Int32Array): void {
    const l = this.lanes[c.seg]!;
    const node = c.dir > 0 ? l.highNode : l.lowNode;
    const options =
      node < 0
        ? []
        : (this.nodeSegs.get(node) ?? []).filter(
            (s) => s !== c.seg && !this.laneBlocked(s, barricadeAt),
          );
    const [fx, fz] = this.lanePoint(c.seg, c.s, c.dir);
    if (options.length === 0) {
      // Dead end or walled in: turn around where we are.
      this.uTurn(c);
      this.placeCar(c);
      return;
    }
    const next = options[Math.floor(this.random() * options.length)]!;
    const nl = this.lanes[next]!;
    const dir: 1 | -1 = nl.lowNode === node ? 1 : -1;
    const s = dir > 0 ? nl.a0 : nl.a1;
    const [tx, tz] = this.lanePoint(next, s, dir);
    c.seg = next;
    c.dir = dir;
    c.s = s;
    c.turn = { fx, fz, tx, tz, t: 0, len: Math.hypot(tx - fx, tz - fz) };
  }

  // ---- people ----

  private walkPoint(tile: number, spread: number): [number, number] {
    const tx = tile % this.map.width;
    const ty = (tile - tx) / this.map.width;
    const [x, z] = tileToWorld(this.frame, tx, ty);
    const sx = this.sideX[tile]!;
    const sz = this.sideZ[tile]!;
    // Along the building front (perpendicular to the side vector) people spread out a little.
    return [x + sx * SIDEWALK_OFFSET_M - sz * spread, z + sz * SIDEWALK_OFFSET_M + sx * spread];
  }

  private spawnPerson(avoid: [number, number][] | null): Person {
    let tile = this.sidewalkTiles[Math.floor(this.random() * this.sidewalkTiles.length)]!;
    if (avoid) {
      for (let k = 0; k < 20; k++) {
        const [x, z] = this.walkPoint(tile, 0);
        if (avoid.every(([bx, bz]) => Math.hypot(bx - x, bz - z) > RESPAWN_CLEAR_M)) break;
        tile = this.sidewalkTiles[Math.floor(this.random() * this.sidewalkTiles.length)]!;
      }
    }
    const p: Person = {
      from: tile,
      to: tile,
      t: 1,
      speed: WALK_MPS[0] + this.random() * (WALK_MPS[1] - WALK_MPS[0]),
      spread: (this.random() * 2 - 1) * WALK_SPREAD_M,
      fleeing: 0,
      hidden: 0,
      x: 0,
      z: 0,
      yaw: 0,
      phase: this.random() * 10,
    };
    [p.x, p.z] = this.walkPoint(tile, p.spread);
    return p;
  }

  private nextTile(p: Person, bug: [number, number] | null): number {
    const { map } = this;
    const tx = p.to % map.width;
    const ty = (p.to - tx) / map.width;
    const px = p.from % map.width;
    const py = (p.from - px) / map.width;
    const [hx, hy] = [tx - px, ty - py];
    let best = p.from;
    let bestScore = -Infinity;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue;
        const nx = tx + dx;
        const ny = ty + dy;
        if (!this.isStreet(nx, ny)) continue;
        const i = ny * map.width + nx;
        if (!bug && !this.sidewalk[i]) continue;
        let score: number;
        if (bug) {
          const [x, z] = tileToWorld(this.frame, nx, ny);
          score = Math.hypot(x - bug[0], z - bug[1]) + this.random() * 6;
        } else {
          // Mostly keep going the same way; now and then turn; turning back is a last resort.
          const straight = dx * hx + dy * hy;
          score = (i === p.from ? -5 : 0) + straight * 2 + this.random() * 3;
        }
        if (score > bestScore) {
          bestScore = score;
          best = i;
        }
      }
    }
    return best;
  }

  private stepPerson(p: Person, dt: number, bugList: [number, number][]): void {
    if (p.hidden > 0) {
      p.hidden -= dt;
      if (p.hidden <= 0) Object.assign(p, this.spawnPerson(bugList));
      return;
    }
    p.phase += dt * (p.fleeing > 0 ? 12 : 6);
    const bug = this.nearestBug(p.x, p.z, PERSON_FLEE_M);
    if (bug) p.fleeing = Math.max(p.fleeing, 0.01);
    const speed = p.fleeing > 0 ? RUN_MPS : p.speed;
    const [ax, az] = this.walkPoint(p.from, p.spread);
    const [bx, bz] = this.walkPoint(p.to, p.spread);
    const len = Math.hypot(bx - ax, bz - az);
    p.t += len > 0.01 ? (speed * dt) / len : 1;
    if (p.t >= 1) {
      if (p.fleeing > 0) {
        p.fleeing += len / speed;
        if (!bug && p.fleeing > HIDE_AFTER_S + 2)
          p.fleeing = 0; // got away
        else if (p.fleeing > HIDE_AFTER_S && this.random() < HIDE_CHANCE) {
          p.hidden = HIDDEN_S[0] + this.random() * (HIDDEN_S[1] - HIDDEN_S[0]);
          return;
        }
      }
      const next = this.nextTile(p, bug);
      p.from = p.to;
      p.to = next;
      p.t = 0;
    }
    const k = Math.min(1, p.t);
    p.x = ax + (bx - ax) * k;
    p.z = az + (bz - az) * k;
    if (len > 0.01) p.yaw = Math.atan2(bx - ax, bz - az);
  }

  // ---- bugs ----

  /** Bucket bug positions (world x, z) for the flee checks; call once per update. */
  setBugs(bugs: readonly [number, number][]): void {
    this.bugs.clear();
    for (const b of bugs) {
      const k = this.cellKey(b[0], b[1]);
      const list = this.bugs.get(k);
      if (list) list.push(b[0], b[1]);
      else this.bugs.set(k, [b[0], b[1]]);
    }
  }

  private cellKey(x: number, z: number): number {
    return Math.floor(x / BUG_CELL_M) * 4096 + Math.floor(z / BUG_CELL_M);
  }

  private nearestBug(x: number, z: number, r: number): [number, number] | null {
    if (this.bugs.size === 0) return null;
    const cx = Math.floor(x / BUG_CELL_M);
    const cz = Math.floor(z / BUG_CELL_M);
    let best: [number, number] | null = null;
    let bestD = r;
    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 1; dz++) {
        const list = this.bugs.get((cx + dx) * 4096 + cz + dz);
        if (!list) continue;
        for (let k = 0; k < list.length; k += 2) {
          const d = Math.hypot(list[k]! - x, list[k + 1]! - z);
          if (d < bestD) {
            bestD = d;
            best = [list[k]!, list[k + 1]!];
          }
        }
      }
    }
    return best;
  }

  // ---- per frame ----

  update(dt: number, bugs: readonly [number, number][], barricadeAt: Int32Array): void {
    this.setBugs(bugs);
    // Distance to the next car ahead in the same lane, for queueing.
    const lanes = new Map<number, Car[]>();
    for (const c of this.cars) {
      if (c.turn) continue;
      const key = c.seg * 2 + (c.dir > 0 ? 1 : 0);
      const list = lanes.get(key);
      if (list) list.push(c);
      else lanes.set(key, [c]);
    }
    const ahead = new Map<Car, number>();
    for (const list of lanes.values()) {
      list.sort((a, b) => (a.s - b.s) * a.dir);
      for (let k = 0; k < list.length; k++) {
        const next = list[k + 1];
        ahead.set(list[k]!, next ? Math.abs(next.s - list[k]!.s) * TILE : Infinity);
      }
    }
    for (const c of this.cars) this.stepCar(c, dt, barricadeAt, ahead.get(c) ?? Infinity);
    const bugList = bugs as [number, number][];
    for (const p of this.people) this.stepPerson(p, dt, bugList);
  }

  /** Vertical bob of a walking or running person (m). */
  static bob(p: Person): number {
    return Math.abs(Math.sin(p.phase)) * (p.fleeing > 0 ? 0.15 : 0.06);
  }
}
