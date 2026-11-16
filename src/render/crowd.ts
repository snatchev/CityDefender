/**
 * Crowd separation, drawing only: the sim's bugs are points and many share a tile, so their models
 * would pass through each other. Each frame every bug is pushed out of the bugs it overlaps, from where the
 * sim puts it, and springs back toward its own spot when it has room. The push is soft and kept per
 * bug between frames, so nothing jitters or pops, and a new bug eases into place.
 *
 * Rules: bugs separate only within their layer (crawlers, fliers; buried diggers take no part); the
 * push is shared by size (a boss parts a swarm, a swarm barely moves a boss); sideways pushes count
 * less than pushes along the bug's way, so a crowd strings out along the street rather than
 * stacking; a bug is never drawn on a tile it can't stand on (a building, an unbroken barricade)
 * nor more than MAX_OFFSET_M from its sim position. Where a crowd is too dense to fit under those
 * limits, bugs overlap a little rather than break them.
 *
 * Plain TypeScript, no three.js: unit-tested in crowd.test.ts.
 */

/** Rate (1/s of sim time) at which a bug moves out of an overlap: 1 − e^(−rate·dt) of it per frame. */
export const PUSH_RATE = 10;
/** Rate (1/s) at which a bug's offset relaxes back toward its own spot. */
export const RETURN_RATE = 1.2;
/** A bug is never drawn further than this from its sim position (m): about a tile and a half. */
export const MAX_OFFSET_M = 12;
/** Weight of the sideways part of a push (across the bug's heading) against the part along it. */
export const ACROSS_WEIGHT = 0.5;
/** Spatial hash cell size (m). */
const CELL_M = 8;
/** Bugs with a footprint above this (m) are handled outside the grid (bosses). */
const BIG_R_M = 6;

/** One bug as the crowd sees it this frame. */
export interface CrowdAgent {
  id: number;
  /** Where the sim (plus the bug's fixed spread) puts it (m). */
  x: number;
  z: number;
  /** Body footprint radius (m, drawn size). */
  r: number;
  /** Separation layer: bugs only push bugs in the same layer; null takes no part. */
  layer: number | null;
  /** Unit heading (where it walks), or 0, 0 if standing. */
  hx: number;
  hz: number;
  /** Written by `step`: this bug's offset from (x, z) this frame. */
  ox: number;
  oz: number;
}

interface Offset {
  ox: number;
  oz: number;
  seen: number;
}

/**
 * Persistent per-bug offsets. `step` advances them by one frame; `offset(id)` reads the result.
 * `canStand(x, z, agent)` says whether a bug may be drawn at a point.
 */
export class Crowd {
  private offsets = new Map<number, Offset>();
  private frame = 0;
  // Scratch, grown as needed (no per-frame allocation in steady state).
  private px = new Float64Array(0);
  private pz = new Float64Array(0);
  private dx = new Float64Array(0);
  private dz = new Float64Array(0);
  private cells = new Map<number, number[]>();
  private big: number[] = [];
  private refs: Offset[] = [];

  /** Forget everything (a new run). */
  reset(): void {
    this.offsets.clear();
  }

  offset(id: number): [number, number] {
    const o = this.offsets.get(id);
    return o ? [o.ox, o.oz] : [0, 0];
  }

  step<A extends CrowdAgent>(
    agents: readonly A[],
    dt: number,
    canStand: (x: number, z: number, a: A) => boolean,
    /** Drawn size scale (zoom): the grid and the big-bug threshold grow with the bodies. */
    scale = 1,
  ): void {
    const n = agents.length;
    const bigR = BIG_R_M * scale;
    const f = ++this.frame;
    if (this.px.length < n) {
      const size = Math.max(n, this.px.length * 2, 64);
      this.px = new Float64Array(size);
      this.pz = new Float64Array(size);
      this.dx = new Float64Array(size);
      this.dz = new Float64Array(size);
    }
    const { px, pz, dx, dz, cells } = this;
    for (const list of cells.values()) list.length = 0;
    const big = this.big;
    const refs = this.refs;
    refs.length = n;
    big.length = 0;
    let maxR = 0;
    for (let i = 0; i < n; i++) {
      const a = agents[i]!;
      let o = this.offsets.get(a.id);
      if (!o) this.offsets.set(a.id, (o = { ox: 0, oz: 0, seen: f }));
      refs[i] = o;
      o.seen = f;
      px[i] = a.x + o.ox;
      pz[i] = a.z + o.oz;
      dx[i] = 0;
      dz[i] = 0;
      if (a.layer !== null && a.r <= bigR && a.r > maxR) maxR = a.r;
    }
    // Cells at least one body across, so neighbours are always within the 3 × 3 cells around.
    const cell = Math.max(CELL_M * scale, 2 * maxR);
    for (let i = 0; i < n; i++) {
      const a = agents[i]!;
      if (a.layer === null) continue;
      // Big bugs (bosses) are few: every bug is tested against them directly, which keeps the grid
      // search for everyone else to the 3 × 3 cells around them.
      if (a.r > bigR) {
        big.push(i);
        continue;
      }
      const key = cellKey(Math.floor(px[i]! / cell), Math.floor(pz[i]! / cell), a.layer);
      let list = cells.get(key);
      if (!list) cells.set(key, (list = []));
      list.push(i);
    }

    // Overlaps: each pair once, the correction shared by mass (radius cubed: a body's volume).
    const pair = (i: number, j: number) => {
      const a = agents[i]!;
      const b = agents[j]!;
      let ux = px[j]! - px[i]!;
      let uz = pz[j]! - pz[i]!;
      const rr = a.r + b.r;
      const d2 = ux * ux + uz * uz;
      if (d2 >= rr * rr) return;
      const d = Math.sqrt(d2);
      const overlap = rr - d;
      if (d < 1e-6) {
        // Exactly on top of each other: part them in a direction fixed by their ids.
        const ang = hashAngle(Math.min(a.id, b.id) * 7919 + Math.max(a.id, b.id));
        ux = Math.cos(ang);
        uz = Math.sin(ang);
      } else {
        ux /= d;
        uz /= d;
      }
      const ma = a.r * a.r * a.r;
      const mb = b.r * b.r * b.r;
      const ka = (overlap * mb) / (ma + mb);
      const kb = (overlap * ma) / (ma + mb);
      dx[i] = dx[i]! - ux * ka;
      dz[i] = dz[i]! - uz * ka;
      dx[j] = dx[j]! + ux * kb;
      dz[j] = dz[j]! + uz * kb;
    };
    for (let i = 0; i < n; i++) {
      const a = agents[i]!;
      if (a.layer === null || a.r > bigR) continue;
      const cx = Math.floor(px[i]! / cell);
      const cz = Math.floor(pz[i]! / cell);
      for (let gx = cx - 1; gx <= cx + 1; gx++) {
        for (let gz = cz - 1; gz <= cz + 1; gz++) {
          const list = cells.get(cellKey(gx, gz, a.layer));
          if (!list) continue;
          for (let k = 0; k < list.length; k++) {
            const j = list[k]!;
            if (j > i) pair(i, j);
          }
        }
      }
    }
    for (let k = 0; k < big.length; k++) {
      const i = big[k]!;
      const layer = agents[i]!.layer;
      for (let j = 0; j < n; j++) {
        if (j === i || agents[j]!.layer !== layer) continue;
        // Big against big once (j > i); big against everyone else always.
        if (agents[j]!.r > bigR && j < i) continue;
        pair(i, j);
      }
    }

    const push = 1 - Math.exp(-PUSH_RATE * dt);
    const back = Math.exp(-RETURN_RATE * dt);
    for (let i = 0; i < n; i++) {
      const a = agents[i]!;
      const o = refs[i]!;
      let mx = dx[i]!;
      let mz = dz[i]!;
      if (a.hx !== 0 || a.hz !== 0) {
        // Damp the sideways part: prefer stringing out along the street.
        const along = mx * a.hx + mz * a.hz;
        const ax = a.hx * along;
        const az = a.hz * along;
        mx = ax + (mx - ax) * ACROSS_WEIGHT;
        mz = az + (mz - az) * ACROSS_WEIGHT;
      }
      let nx = o.ox * back + mx * push;
      let nz = o.oz * back + mz * push;
      const len = Math.sqrt(nx * nx + nz * nz);
      if (len > MAX_OFFSET_M) {
        nx *= MAX_OFFSET_M / len;
        nz *= MAX_OFFSET_M / len;
      }
      if (a.layer === null) {
        // Under the street: no crowding; relax home.
        o.ox = o.ox * back;
        o.oz = o.oz * back;
        continue;
      }
      // Stay where a bug can stand: take the move, else slide along one axis, else hold, else
      // (the sim position moved on and left the offset over a wall) shrink back toward home.
      if (canStand(a.x + nx, a.z + nz, a)) {
        o.ox = nx;
        o.oz = nz;
      } else if (canStand(a.x + nx, a.z + o.oz, a)) {
        o.ox = nx;
      } else if (canStand(a.x + o.ox, a.z + nz, a)) {
        o.oz = nz;
      } else {
        for (let k = 0; k < 4 && !canStand(a.x + o.ox, a.z + o.oz, a); k++) {
          o.ox *= 0.5;
          o.oz *= 0.5;
        }
        if (!canStand(a.x + o.ox, a.z + o.oz, a)) {
          o.ox = 0;
          o.oz = 0;
        }
      }
    }

    for (let i = 0; i < n; i++) {
      const a = agents[i]!;
      const o = refs[i]!;
      a.ox = o.ox;
      a.oz = o.oz;
    }

    // Forget bugs gone for a while (dead, leaked).
    if (f % 60 === 0) {
      for (const [id, o] of this.offsets) if (f - o.seen > 60) this.offsets.delete(id);
    }
  }
}

function cellKey(gx: number, gz: number, layer: number): number {
  // Maps are a few hundred cells across; this packs (gx, gz, layer) into one safe integer.
  return ((gx + 4096) * 8192 + (gz + 4096)) * 4 + layer;
}

function hashAngle(n: number): number {
  const s = Math.sin(n * 12.9898) * 43758.5453;
  return (s - Math.floor(s)) * Math.PI * 2;
}
