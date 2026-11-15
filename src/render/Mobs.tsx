import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import {
  AdditiveBlending,
  Color,
  CustomBlending,
  DynamicDrawUsage,
  GreaterDepth,
  InstancedBufferAttribute,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  OneMinusSrcAlphaFactor,
  SphereGeometry,
  SrcAlphaFactor,
  type InstancedMesh,
} from 'three';
import { game, renderAlpha } from '../game';
import { TICK_DT, TILE_M } from '../sim/constants';
import { isWalkable, type TileType } from '../sim/map';
import { isBuried, mobSpeedMps, type Mob, type MobType } from '../sim/mobs';
import { tileToWorld, type TileFrame } from './coords';
import { Crowd, type CrowdAgent } from './crowd';
import { nightAmount } from './daylight';
import { hasModel, instancedGeometry, model, modelPath } from './models/library';
import { setMotionClock, withPartMotion, MOTION } from './models/partMotion';
import { viewDistance, zoomScale } from './view';

/** Upper bound on mobs of one type drawn at once (instance buffer size). */
const MAX_MOBS = 2048;
/** Hit flash: the bug turns (nearly) white for a tick. */
const HIT_COLOR = new Color('#ffffff');
const HIT_AMOUNT = 0.85;
/** Tint while slowed by Cryo. */
const SLOW_COLOR = new Color('#9fe8ff');
const SLOW_AMOUNT = 0.45;
const HALO_SCALE = 2;
/**
 * The halo is for reading bugs from far away; up close it would bury their shapes. Its opacity
 * ramps from HALO_OPACITY_NEAR at zoom scale 1 to HALO_OPACITY at HALO_FULL_ZOOM and beyond.
 */
const HALO_OPACITY = 0.22;
const HALO_OPACITY_NEAR = 0.03;
const HALO_FULL_ZOOM = 2.5;
const XRAY_OPACITY = 0.75;
/**
 * Draw order among opaque objects: the x-ray goes after the city (renderOrder 0) but before every
 * bug body, so it tests only against what hides a bug, never against the bug's own overlapping
 * parts (the models' legs and heads overlap their bodies) or other bugs.
 */
const XRAY_ORDER = 1;
const BODY_ORDER = 2;
/** Mobs are spread up to this far from the tile centre line so a swarm doesn't render as one ball. */
const SPREAD_M = 2.5;
/** A buried digger shows as a low mound of churned earth moving along the street. */
const BURIED_COLOR = new Color('#6b4f36');
const BURIED_SQUASH = 0.25;
const BURIED_WIDEN = 1.3;
/** Fliers bob up and down this much (m) a few times a second. */
const BOB_M = 1.2;
const BOB_HZ = 1.6;
/**
 * A flier's body centre sits this far (m, × zoom) above its flying height, level with where shots
 * at fliers aim (Shots.tsx aims at FLIER_AIM_Y_M plus its ground aim height).
 */
const FLIER_LIFT_M = 2.5;
/** Self-lit share of a bug's own colours, so bugs pop against the muted city; more at night. */
const SELF_LIT_DAY = 0.3;
const SELF_LIT_NIGHT = 0.45;
/** Multiplier on the models' emission (eyes, sacs, seams): brighter at night. */
const GLOW_DAY = 0.6;
const GLOW_NIGHT = 1.6;
/** One stride (a full cycle of both tripods) covers this fraction of the bug's length. */
const STRIDE_OF_LENGTH = 0.5;
/** A bug moving slower than this (m/s of drawn motion) is standing: its legs settle. */
const STAND_MPS = 0.5;
/** How fast the gait eases between standing and walking (1/s of sim time). */
const GAIT_RATE = 6;
/** Forget walk state of mobs not seen for this many frames (dead or gone). */
const FORGET_FRAMES = 30;

interface MobLook {
  /** Halo radius (m at zoom 1). */
  radiusM: number;
  /**
   * Body footprint radius for crowd separation (m at zoom 1): roughly the body, not the legs, so
   * legs of neighbours may interleave but bodies don't pass through each other.
   */
  footprintM: number;
  /** Flat colour for the part hidden behind buildings (x-ray silhouette). */
  xray: string;
  /** Fliers: height above the street (DESIGN §5.4 "at roof height"). */
  altitudeM?: number;
}

/**
 * How each mob type looks (DESIGN §6, §11). The shapes and colours are the models in
 * public/models/bugs (D060): acid-green skitterlings, gold beetles, magenta wasps in the air,
 * salmon grubs (a dirt mound while buried), teal spitters, and the two bosses.
 */
const LOOKS: Record<MobType, MobLook> = {
  skitterling: { radiusM: 3.5, footprintM: 3.4, xray: '#c6ff4d' },
  beetle: { radiusM: 5.5, footprintM: 5.5, xray: '#ffe07a' },
  wasp: { radiusM: 3, footprintM: 3.2, xray: '#ff9aea', altitudeM: 26 },
  grub: { radiusM: 4.5, footprintM: 4, xray: '#ffb49c' },
  spitter: { radiusM: 4, footprintM: 3.6, xray: '#8cffe6' },
  matriarch: { radiusM: 12, footprintM: 12, xray: '#ffd27a' },
  broodMother: { radiusM: 16, footprintM: 15, xray: '#ff9cc6' },
};

/** Halo colours that mark something special about a mob: an elite affix, or a Spotter's mark. */
const ELITE_HALO = new Color('#ff3355');
const MARK_HALO = new Color('#b18cff');

/** Model measurements a mob type is drawn and targeted by (m at zoom 1, model space). */
interface MobShape {
  /** Height of the body's centre above the model origin. */
  centreY: number;
  /** Height of the top of the model above its origin. */
  topY: number;
  strideM: number;
  bobM: number;
  /** Halo colour: the model's main colour. */
  color: Color;
}

const shapes = new Map<MobType, MobShape>();

/** Measurements from the type's model (or from its halo radius if the model is missing). */
function mobShape(type: MobType): MobShape {
  let s = shapes.get(type);
  if (s) return s;
  const look = LOOKS[type];
  const flier = look.altitudeM !== undefined;
  if (hasModel(modelPath('bugs', type))) {
    const b = model('bugs', type).baked;
    const height = b.max[1] - b.min[1];
    s = {
      centreY: flier ? 0 : (b.min[1] + b.max[1]) / 2,
      topY: b.max[1],
      strideM: (b.max[2] - b.min[2]) * STRIDE_OF_LENGTH,
      bobM: height * MOTION.BOB_FRACTION,
      color: mainColor(b.color),
    };
  } else {
    const r = look.radiusM;
    s = { centreY: flier ? 0 : r * 0.6, topY: r * 1.2, strideM: r, bobM: 0, color: new Color() };
  }
  shapes.set(type, s);
  return s;
}

/** The colour covering most of the model's vertices: its type colour (README "Style"). */
function mainColor(colors: Float32Array): Color {
  const count = new Map<string, number>();
  for (let i = 0; i < colors.length; i += 3) {
    const k = `${colors[i]},${colors[i + 1]},${colors[i + 2]}`;
    count.set(k, (count.get(k) ?? 0) + 1);
  }
  const best = [...count.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? '1,1,1';
  const [r, g, b] = best.split(',').map(Number) as [number, number, number];
  return new Color(r, g, b);
}

export function mobRadiusM(type: MobType): number {
  return LOOKS[type].radiusM;
}

/** Height of a flier's body centre this frame (its flying height, bob and lift). */
function flierY(m: Mob, altitudeM: number, zoom: number): number {
  const bob = Math.sin((performance.now() / 1000) * BOB_HZ * 2 * Math.PI + m.id) * BOB_M;
  return altitudeM + bob + FLIER_LIFT_M * zoom;
}

/** Height of a mob's body centre above the street this frame (fliers fly, the rest stand). */
export function mobCentreY(m: Mob, zoom: number): number {
  const look = LOOKS[m.type];
  const s = mobShape(m.type);
  if (look.altitudeM === undefined) return s.centreY * zoom;
  return flierY(m, look.altitudeM, zoom);
}

/** Height of the top of a mob above the street this frame (HP bars sit above it). */
export function mobTopY(m: Mob, zoom: number): number {
  const look = LOOKS[m.type];
  const s = mobShape(m.type);
  if (look.altitudeM === undefined) return s.topY * zoom;
  return flierY(m, look.altitudeM, zoom) + s.topY * zoom;
}

/** Height a flier's shots are aimed at (no bob: shots are drawn from sim data, not per mob). */
export const FLIER_AIM_Y_M = 26;

/** All mobs, one layer per type (types whose model failed to load are left out). */
export function Mobs({ frame }: { frame: TileFrame }) {
  useFrame(() => setMotionClock((game.world.tick + renderAlpha()) * TICK_DT));
  return (
    <>
      {(Object.keys(LOOKS) as MobType[])
        .filter((type) => hasModel(modelPath('bugs', type)))
        .map((type) => (
          <MobLayer key={type} type={type} frame={frame} />
        ))}
    </>
  );
}

/** Render-only walking state of one mob. */
interface Walk {
  x: number;
  z: number;
  /** Strides covered (cycles), starting at a random point. */
  walk: number;
  /** 0 standing … 1 walking. */
  gait: number;
  seed: number;
  /** Frame it was last drawn, and the sim time then. */
  seen: number;
  t: number;
}

/**
 * One mob type, drawn as three InstancedMeshes that share one matrix per mob:
 * - the body: the type's model, lit plus a self-lit share of its own colours, its emissive parts
 *   glowing (brighter at night), flashing white when hit and ice-blue while slowed;
 * - a soft additive halo around it (a cheap glow until real bloom);
 * - an x-ray silhouette: the same animated model in a flat colour, drawn only where something is in
 *   front of it (depth test "greater"), so bugs stay visible behind buildings. It draws before the
 *   bodies (XRAY_ORDER) so a bug's own parts don't count as something in front.
 * The legs, wings, jaws and so on move in the vertex shader (models/partMotion.ts) from per-bug
 * `aAnim` (walk, gait, seed, busy) and `aTint`. Reads `game.world.mobs` every frame (never React
 * state) and interpolates each mob by the fraction of a tick the stepper has banked.
 */
function MobLayer({ type, frame }: { type: MobType; frame: TileFrame }) {
  const look = LOOKS[type];
  const body = useRef<InstancedMesh>(null);
  const halo = useRef<InstancedMesh>(null);
  const xray = useRef<InstancedMesh>(null);
  const dummy = useRef(new Object3D());
  const walks = useRef(new Map<number, Walk>());
  const frameNo = useRef(0);
  const shape = mobShape(type);
  const res = useMemo(() => {
    const geometry = instancedGeometry(model('bugs', type));
    const anim = new InstancedBufferAttribute(new Float32Array(MAX_MOBS * 4), 4);
    const tint = new InstancedBufferAttribute(new Float32Array(MAX_MOBS * 4), 4);
    anim.setUsage(DynamicDrawUsage);
    tint.setUsage(DynamicDrawUsage);
    geometry.setAttribute('aAnim', anim);
    geometry.setAttribute('aTint', tint);
    const lit = withPartMotion(new MeshStandardMaterial({ vertexColors: true, roughness: 0.5 }), {
      animated: true,
      tint: true,
      glow: true,
      selfLit: SELF_LIT_DAY,
      glowScale: GLOW_DAY,
      bobM: shape.bobM,
    });
    const flat = withPartMotion(
      new MeshBasicMaterial({
        color: look.xray,
        // Blended but in the opaque list (see XRAY_ORDER): custom blending without `transparent`.
        blending: CustomBlending,
        blendSrc: SrcAlphaFactor,
        blendDst: OneMinusSrcAlphaFactor,
        opacity: XRAY_OPACITY,
        depthFunc: GreaterDepth,
        depthWrite: false,
      }),
      { animated: true, bobM: shape.bobM },
    );
    const sphere = new SphereGeometry(look.radiusM, 16, 12);
    return { geometry, anim, tint, lit, flat, sphere };
  }, [type, look, shape]);
  useEffect(
    () => () => {
      res.geometry.dispose();
      res.sphere.dispose();
      res.lit.material.dispose();
      res.flat.material.dispose();
    },
    [res],
  );

  useFrame(({ camera, controls }) => {
    const b = body.current;
    const h = halo.current;
    const x = xray.current;
    if (!b || !h || !x) return;
    const o = dummy.current;
    const world = game.world;
    const alpha = renderAlpha();
    const simNow = (world.tick + alpha) * TICK_DT;
    const zoom = zoomScale(viewDistance(camera, controls));
    crowdState.zoom = zoom;
    const haloK = Math.min(1, (zoom - 1) / (HALO_FULL_ZOOM - 1));
    (h.material as MeshBasicMaterial).opacity =
      HALO_OPACITY_NEAR + (HALO_OPACITY - HALO_OPACITY_NEAR) * haloK;
    const night = nightAmount();
    res.lit.uniforms.uSelfLit.value = SELF_LIT_DAY + (SELF_LIT_NIGHT - SELF_LIT_DAY) * night;
    res.lit.uniforms.uGlow.value = GLOW_DAY + (GLOW_NIGHT - GLOW_DAY) * night;
    const fno = ++frameNo.current;
    const walksMap = walks.current;
    const anim = res.anim.array as Float32Array;
    const tint = res.tint.array as Float32Array;
    let n = 0;
    for (const m of world.mobs) {
      if (m.type !== type || n >= MAX_MOBS) continue;
      const [wx, wz] = mobWorldXZ(m, frame, alpha);
      const w = stepWalk(walksMap, m, wx, wz, simNow, zoom * shape.strideM, fno);
      anim[n * 4] = w.walk;
      anim[n * 4 + 1] = w.gait;
      anim[n * 4 + 2] = w.seed;
      anim[n * 4 + 3] = 1 - w.gait;
      const buried = isBuried(world, m);
      o.rotation.set(0, mobYaw(m, frame), 0);
      if (buried) {
        // A mound of earth: flat, wide, brown; no glow and no x-ray (it's under the street).
        o.position.set(wx, 0, wz);
        o.scale.set(zoom * BURIED_WIDEN, zoom * BURIED_SQUASH, zoom * BURIED_WIDEN);
        o.updateMatrix();
        b.setMatrixAt(n, o.matrix);
        setTint(tint, n, BURIED_COLOR, 1);
        o.scale.setScalar(0);
        o.updateMatrix();
        x.setMatrixAt(n, o.matrix);
        h.setMatrixAt(n, o.matrix);
        n++;
        continue;
      }
      const y = look.altitudeM === undefined ? 0 : flierY(m, look.altitudeM, zoom);
      o.position.set(wx, y, wz);
      o.scale.setScalar(zoom);
      o.updateMatrix();
      b.setMatrixAt(n, o.matrix);
      x.setMatrixAt(n, o.matrix);
      const slowed = world.tick < m.slowUntilTick;
      if (world.tick - m.lastHitTick <= 1) setTint(tint, n, HIT_COLOR, HIT_AMOUNT);
      else if (slowed) setTint(tint, n, SLOW_COLOR, SLOW_AMOUNT);
      else setTint(tint, n, HIT_COLOR, 0);
      o.position.y = y + shape.centreY * zoom;
      o.scale.setScalar(HALO_SCALE * zoom * (m.elite ? 1.3 : 1));
      o.updateMatrix();
      h.setMatrixAt(n, o.matrix);
      const marked = world.tick < m.markUntilTick;
      h.setColorAt(n, marked ? MARK_HALO : m.elite ? ELITE_HALO : shape.color);
      n++;
    }
    if (fno % FORGET_FRAMES === 0) {
      for (const [id, w] of walksMap) if (fno - w.seen > FORGET_FRAMES) walksMap.delete(id);
    }
    for (const mesh of [b, h, x]) {
      mesh.count = n;
      mesh.instanceMatrix.needsUpdate = true;
    }
    if (h.instanceColor) h.instanceColor.needsUpdate = true;
    res.anim.needsUpdate = true;
    res.tint.needsUpdate = true;
  });

  return (
    <>
      <instancedMesh
        name="mobBody"
        ref={body}
        args={[res.geometry, res.lit.material, MAX_MOBS]}
        frustumCulled={false}
        renderOrder={BODY_ORDER}
        receiveShadow
      />
      <instancedMesh
        name="mobHalo"
        ref={halo}
        args={[res.sphere, undefined, MAX_MOBS]}
        frustumCulled={false}
      >
        <meshBasicMaterial
          transparent
          opacity={HALO_OPACITY}
          blending={AdditiveBlending}
          depthWrite={false}
        />
      </instancedMesh>
      <instancedMesh
        name="mobXray"
        ref={xray}
        args={[res.geometry, res.flat.material, MAX_MOBS]}
        frustumCulled={false}
        renderOrder={XRAY_ORDER}
      />
    </>
  );
}

function setTint(a: Float32Array, i: number, c: Color, k: number): void {
  a[i * 4] = c.r;
  a[i * 4 + 1] = c.g;
  a[i * 4 + 2] = c.b;
  a[i * 4 + 3] = k;
}

/**
 * Advance a mob's walk by the distance it was drawn moving since the last frame, so steps follow
 * the ground covered: a slowed bug steps slowly, a stopped one stands (its gait eases to 0).
 * `strideM` is one full stride at the drawn size.
 */
function stepWalk(
  walks: Map<number, Walk>,
  m: Mob,
  x: number,
  z: number,
  simNow: number,
  strideM: number,
  frameNo: number,
): Walk {
  let w = walks.get(m.id);
  if (!w) {
    const seed = hash01(m.id);
    w = { x, z, walk: seed, gait: 1, seed, seen: frameNo, t: simNow };
    walks.set(m.id, w);
    return w;
  }
  const dt = simNow - w.t;
  if (dt > 0) {
    const d = Math.hypot(x - w.x, z - w.z);
    // A jump of more than a tile in one frame is a teleport (restart, reused id): no stride.
    if (d < TILE_M) w.walk += d / strideM;
    const moving = d / dt > STAND_MPS ? 1 : 0;
    w.gait += (moving - w.gait) * (1 - Math.exp(-GAIT_RATE * dt));
  }
  w.x = x;
  w.z = z;
  w.t = simNow;
  w.seen = frameNo;
  return w;
}

function hash01(id: number): number {
  const a = Math.sin(id * 91.3458 + 7.13) * 47453.5453;
  return a - Math.floor(a);
}

/** `mobBaseXZ` written into `out.x`, `out.z` (no allocation). */
function baseXZ(m: Mob, frame: TileFrame, alpha: number, out: { x: number; z: number }): void {
  const perTick = (mobSpeedMps(game.world, m) * TICK_DT) / TILE_M;
  const t = Math.min(1, m.t + perTick * alpha);
  const sa = Math.sin(m.id * 12.9898) * 43758.5453;
  const sb = Math.sin(m.id * 78.233) * 12345.6789;
  out.x =
    (m.fromX + (m.toX - m.fromX) * t + 0.5 - frame.cx) * TILE_M +
    (sa - Math.floor(sa) - 0.5) * 2 * SPREAD_M;
  out.z =
    (m.fromY + (m.toY - m.fromY) * t + 0.5 - frame.cy) * TILE_M +
    (sb - Math.floor(sb) - 0.5) * 2 * SPREAD_M;
}

/** Where the sim puts a mob this frame: interpolated along its step, plus its stable spread offset. */
function mobBaseXZ(m: Mob, frame: TileFrame, alpha: number): [number, number] {
  const perTick = (mobSpeedMps(game.world, m) * TICK_DT) / TILE_M;
  const t = Math.min(1, m.t + perTick * alpha);
  const [wx, wz] = tileToWorld(
    frame,
    m.fromX + (m.toX - m.fromX) * t,
    m.fromY + (m.toY - m.fromY) * t,
  );
  const [ox, oz] = spread(m.id);
  return [wx + ox, wz + oz];
}

/** Separation layers (crowd.ts): bugs only push bugs in the same one. */
const CRAWLERS = 0;
const FLIERS = 1;

interface MobAgent extends CrowdAgent {
  /** Tiles the bug may always be drawn on: the ones it is stepping between. */
  fromI: number;
  toI: number;
}

const crowd = new Crowd();
const crowdState = {
  /** Sim time of the last crowd step (s), or −1. */
  simNow: -1,
  world: null as unknown,
  /** Drawn zoom scale, set by the mob layers each frame. */
  zoom: 1,
  agents: [] as MobAgent[],
  /** Index into `agents` per mob id this frame. */
  index: new Map<number, number>(),
  /** CPU time of the last step (ms). */
  ms: 0,
};

/**
 * Step the crowd once per sim instant (lazily, from whichever caller asks first), so every renderer
 * that asks where a bug is drawn this frame gets the same separated position.
 */
function ensureCrowd(frame: TileFrame, alpha: number): void {
  const world = game.world;
  const simNow = (world.tick + alpha) * TICK_DT;
  const st = crowdState;
  if (st.world === world && simNow === st.simNow) return;
  const t0 = performance.now();
  if (st.world !== world || simNow < st.simNow) crowd.reset();
  const dt = st.world === world && st.simNow >= 0 ? simNow - st.simNow : 0;
  st.world = world;
  st.simNow = simNow;
  const map = world.map;
  const agents = st.agents;
  let n = 0;
  const width = map?.width ?? 0;
  const height = map?.height ?? 0;
  for (const m of world.mobs) {
    let a = agents[n];
    if (!a) {
      a = { id: 0, x: 0, z: 0, r: 0, layer: null, hx: 0, hz: 0, ox: 0, oz: 0, fromI: 0, toI: 0 };
      agents.push(a);
    }
    baseXZ(m, frame, alpha, a);
    a.id = m.id;
    a.r = LOOKS[m.type].footprintM * st.zoom;
    a.layer = isBuried(world, m) ? null : LOOKS[m.type].altitudeM !== undefined ? FLIERS : CRAWLERS;
    const hx = m.toX - m.fromX;
    const hz = m.toY - m.fromY;
    const hl = Math.sqrt(hx * hx + hz * hz);
    a.hx = hl > 0 ? hx / hl : 0;
    a.hz = hl > 0 ? hz / hl : 0;
    a.fromI = m.fromY * width + m.fromX;
    a.toI = m.toY * width + m.toX;
    a.ox = 0;
    a.oz = 0;
    n++;
  }
  agents.length = n;
  if (dt > 0) {
    crowd.step(
      agents,
      dt,
      (x, z, a) => {
        if (a.layer === FLIERS || !map) return true;
        // worldToTile, inlined (no allocation: this runs a few thousand times a frame).
        const tx = Math.floor(x / TILE_M + frame.cx);
        const ty = Math.floor(z / TILE_M + frame.cy);
        if (tx < 0 || ty < 0 || tx >= width || ty >= height) return false;
        const i = ty * width + tx;
        if (i === a.fromI || i === a.toI) return true;
        return isWalkable(map.tiles[i] as TileType) && !world.barricadeAt[i];
      },
      st.zoom,
    );
  } else {
    for (const a of agents) {
      const [ox, oz] = crowd.offset(a.id);
      a.ox = ox;
      a.oz = oz;
    }
  }
  st.index.clear();
  for (let i = 0; i < n; i++) st.index.set(agents[i]!.id, i);
  st.ms = performance.now() - t0;
}

/** Crowd separation stats for the dev hook: bugs and CPU ms of the last step. */
export function crowdStats(): { bugs: number; ms: number } {
  return { bugs: crowdState.agents.length, ms: crowdState.ms };
}

/**
 * Where a mob is drawn this frame: where the sim puts it, pushed out of the bugs it overlaps
 * (crowd.ts). Every renderer that draws at a bug (HP bars, shots, the camera) asks here.
 */
export function mobWorldXZ(m: Mob, frame: TileFrame, alpha: number): [number, number] {
  ensureCrowd(frame, alpha);
  const i = crowdState.index.get(m.id);
  const a = i === undefined ? undefined : crowdState.agents[i];
  return a ? [a.x + a.ox, a.z + a.oz] : mobBaseXZ(m, frame, alpha);
}

/** Heading (rotation about y) of a mob walking from its `from` tile to its `to` tile. */
function mobYaw(m: Mob, frame: TileFrame): number {
  if (m.fromX === m.toX && m.fromY === m.toY) return 0;
  const [ax, az] = tileToWorld(frame, m.fromX, m.fromY);
  const [bx, bz] = tileToWorld(frame, m.toX, m.toY);
  return Math.atan2(bx - ax, bz - az); // models face +z
}

/** Stable per-mob offset from its id (render only; the sim doesn't know about it). */
function spread(id: number): [number, number] {
  const a = Math.sin(id * 12.9898) * 43758.5453;
  const b = Math.sin(id * 78.233) * 12345.6789;
  return [(a - Math.floor(a) - 0.5) * 2 * SPREAD_M, (b - Math.floor(b) - 0.5) * 2 * SPREAD_M];
}
