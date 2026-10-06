import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import { MathUtils, Spherical, Vector3 } from 'three';
import { cameraBridge, type CameraView } from '../cameraBridge';
import { switchTrack } from '../planning';
import { usePlan, type TrackAt } from '../ui/planStore';
import { indexToWorld, tileToWorld, type TileFrame } from './coords';
import { angleDelta, headingAt, makeTrack, nearestS, pointAt, type Track } from './track';
import { BASE_FOV_DEG, orbitControls } from './view';

/** The point the camera orbits rides this high above the street (m). */
export const TRACK_Y_M = 2;
/** The street's heading is measured over this stretch either side (m): where a landing faces. */
export const RAIL_HEADING_WINDOW_M = 45;
/** W/S travel speed: this share of the camera distance per second, clamped (m/s). */
const MOVE_PER_DIST = 0.8;
const MOVE_MPS = [40, 500] as const;
/** How quickly the camera catches up with the requested spot on the track (1/s). */
const SMOOTH_PER_S = 8;
const ROTATE_RAD_PER_S = 1.6;
/**
 * Balloon on a string: how much of the string's swing the camera follows each frame as the point
 * it orbits moves (1 = a taut string, which turns it about 50°/s when travelling side-on; less is
 * a lazier pull).
 */
const BALLOON_PULL = 0.35;
/** 'start' lands this far down the track from the station (looking back at it); 'goal' this far short of City Hall. */
const START_AFTER_STATION_M = 40;
const START_BEFORE_GOAL_M = 90;
/** Camera distance and pitch kept within these when landing on a track. */
const DIST_M = [50, 600] as const;
const PITCH_DEG = [6, 70] as const;
/** Street level: close and low, so the buildings either side rise like canyon walls (D058). */
const DEFAULT_VIEW = { distM: 90, pitchDeg: 12 };
/** Shift while moving: this much faster. */
const BOOST = 2.2;
/** While moving, the point the camera looks at runs this far ahead along the track (m). */
const LOOK_AHEAD_M = 30;
const LOOK_AHEAD_PER_S = 2.5;
/** Field of view widens by up to this at full speed (degrees; more with boost), settling at this rate. */
const FOV_KICK_DEG = 12;
const FOV_PER_S = 4;
/** The camera rolls into turns: this much per rad/s of turning, at most this much (degrees). */
const BANK_DEG_PER_RAD_S = 20;
const MAX_BANK_DEG = 7;
const BANK_PER_S = 5;
/**
 * The point the camera orbits glides toward its spot on the track at this rate (1/s), rather
 * than sitting on it: moving, it rounds sharp bends into a curve (radius about speed / rate);
 * standing, it settles exactly on the track.
 */
const CORNER_SMOOTH_PER_S = 3;
/** Switching tracks swings over the rooftops (D059): this long, and up this high per m travelled, within limits. */
const SWING_S = 1.3;
const SWING_ARC_PER_M = 0.35;
const SWING_ARC_M = [60, 220] as const;
const FLY_S = 0.9;

type Action = 'toStation' | 'toGoal' | 'left' | 'right' | 'boost';
/** By physical key (`KeyboardEvent.code`), so it works on any keyboard layout. */
const KEYS: Record<string, Action> = {
  KeyW: 'toStation',
  ArrowUp: 'toStation',
  KeyS: 'toGoal',
  ArrowDown: 'toGoal',
  KeyA: 'left',
  ArrowLeft: 'left',
  KeyQ: 'left',
  KeyD: 'right',
  ArrowRight: 'right',
  KeyE: 'right',
  ShiftLeft: 'boost',
  ShiftRight: 'boost',
};

/**
 * The rail's state: the active track (cutscenes switch it early so the see-through follows, the
 * see-through reads it) and, for the dev hook, where the camera is on it.
 */
export const rail = {
  track: null as Track | null,
  /** Where the camera is along the track (m from the station), and where it's heading. */
  s: 0,
  sGoal: 0,
  /** How far ahead of `s` the camera looks right now (m, signed along the track). */
  lead: 0,
  /** The camera's roll into the current turn (radians). */
  bank: 0,
};

/** How far to close a gap this frame when closing it at `perS` per second (frame-rate independent). */
function follow(perS: number, dt: number): number {
  return 1 - Math.exp(-perS * dt);
}

function typingInto(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))
  );
}

/**
 * The rail camera (D054, D056, D058, D059). The point the camera orbits rides the active track, the
 * route the bugs crawl from one station to City Hall. W/↑ glides toward the station, S/↓ toward
 * City Hall (Shift boosts); A/D, ←/→ and Q/E turn the camera around that point; the mouse orbits
 * and zooms; nothing pans.
 *
 * - Travelling drags the camera after the orbit point like a balloon on a string, so it swings
 *   round to trail behind the direction of travel and into corners. Sharp bends are rounded off.
 * - Action feel: street level by default (the buildings either side are canyon walls), a look
 *   ahead while moving, a wider field of view with speed, a roll into turns.
 * - Switching tracks (threat board, minimap) swings over the rooftops to the new one; asking for
 *   another spot on the same track glides there. The rail stands still while a flight or a
 *   cutscene drives the camera.
 */
export function RailCamera({ frame, width }: { frame: TileFrame; width: number }) {
  const camera = useThree((s) => s.camera);
  const controls = orbitControls(useThree((s) => s.controls));
  const routes = usePlan((p) => p.routes);
  const request = usePlan((p) => p.track);
  const held = useRef(new Set<Action>());
  const released = useRef(new Set<Action>());
  /** Speed effects and the rounded-off orbit target (see the frame loop). */
  const feel = useRef({ roll: 0, snap: true, target: new Vector3() });

  const tracks = useMemo(() => {
    const m = new Map<number, Track>();
    for (const r of routes)
      m.set(
        r.station,
        makeTrack(
          r.station,
          r.tiles.map((i) => indexToWorld(frame, width, i)),
        ),
      );
    return m;
  }, [routes, frame, width]);

  // Keys held down are read every frame; a quick tap still nudges (released keys act once more).
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      const a = KEYS[e.code];
      if (!a || e.ctrlKey || e.metaKey || e.altKey || typingInto(e.target)) return;
      held.current.add(a);
      released.current.delete(a);
      e.preventDefault();
    };
    const up = (e: KeyboardEvent) => {
      const a = KEYS[e.code];
      if (a) released.current.add(a);
    };
    const clear = () => {
      held.current.clear();
      released.current.clear();
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', clear);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', clear);
    };
  }, []);

  /** Put the camera on `track` at `s`, keeping its distance and pitch (within limits), facing the station. */
  const land = (track: Track, s: number, fly: boolean, view?: CameraView) => {
    if (!controls) return;
    // The very first landing ignores the scene's start-up camera and uses the default view.
    const first = rail.track === null;
    const switching = !first && rail.track?.station !== track.station;
    rail.track = track;
    rail.s = rail.sGoal = s;
    const heading = headingAt(track, s, RAIL_HEADING_WINDOW_M);
    const [x, z] = pointAt(track, s);
    const now = first
      ? new Spherical(DEFAULT_VIEW.distM, MathUtils.degToRad(90 - DEFAULT_VIEW.pitchDeg))
      : new Spherical().setFromVector3(camera.position.clone().sub(controls.target));
    const v = {
      distM: view?.distM ?? MathUtils.clamp(now.radius || DEFAULT_VIEW.distM, DIST_M[0], DIST_M[1]),
      pitchDeg:
        view?.pitchDeg ??
        MathUtils.clamp(
          90 - MathUtils.radToDeg(now.phi) || DEFAULT_VIEW.pitchDeg,
          PITCH_DEG[0],
          PITCH_DEG[1],
        ),
      // Yaw = the track heading: the camera sits on the City Hall side, looking up the street.
      yawDeg: view?.yawDeg ?? MathUtils.radToDeg(heading),
    };
    feel.current.snap = true; // the rounded-off target starts where the camera lands
    if (fly) {
      const arc = switching
        ? MathUtils.clamp(
            Math.hypot(x - controls.target.x, z - controls.target.z) * SWING_ARC_PER_M,
            SWING_ARC_M[0],
            SWING_ARC_M[1],
          )
        : 0;
      cameraBridge.flyTo?.([x, TRACK_Y_M, z], v, switching ? SWING_S : FLY_S, arc);
      return;
    }
    controls.target.set(x, TRACK_Y_M, z);
    camera.position
      .setFromSpherical(
        new Spherical(v.distM, MathUtils.degToRad(90 - v.pitchDeg), MathUtils.degToRad(v.yawDeg)),
      )
      .add(controls.target);
    controls.update();
  };

  const resolve = (track: Track, at: TrackAt): number => {
    switch (at.kind) {
      case 'start':
        return Math.min(START_AFTER_STATION_M, track.length);
      case 'goal':
        return Math.max(0, track.length - START_BEFORE_GOAL_M);
      case 'tile': {
        const [x, z] = tileToWorld(frame, at.tx, at.ty);
        return nearestS(track, x, z);
      }
      case 's':
        return MathUtils.clamp(at.s, 0, track.length);
    }
  };

  // A track request (threat board, minimap, cutscene end): move onto it.
  const seq = request?.seq;
  useEffect(() => {
    if (!request || !controls) return;
    const track =
      tracks.get(request.station) ?? (rail.track?.station === request.station ? rail.track : null);
    if (track) land(track, resolve(track, request.at), request.fly);
    // Only on a new request; `tracks` changing (walls rerouting) is handled below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seq, controls]);

  // First track: the first station sending bugs, near City Hall, looking up the street. Placed, not
  // flown (nothing to take control from yet).
  useEffect(() => {
    if (request || tracks.size === 0) return;
    const first = routes[0]!.station;
    switchTrack(first, { kind: 'goal' }, false);
  }, [request, tracks, routes]);

  // Walls reroute the current track: keep the camera where it is on the new line.
  useEffect(() => {
    const cur = rail.track;
    if (!cur || !controls) return;
    const next = tracks.get(cur.station);
    if (!next || next === cur) return;
    const t = controls.target;
    rail.track = next;
    rail.s = nearestS(next, t.x, t.z);
    rail.sGoal = nearestS(next, ...pointAt(cur, rail.sGoal));
  }, [tracks, controls]);

  // The minimap and the dev hook ask for tiles: the nearest track, at that tile.
  useEffect(() => {
    cameraBridge.focusTile = (tx, ty, view) => {
      const [x, z] = tileToWorld(frame, tx, ty);
      let best: Track | null = null;
      let bestD = Infinity;
      for (const t of tracks.values()) {
        const [px, pz] = pointAt(t, nearestS(t, x, z));
        const d = Math.hypot(px - x, pz - z);
        if (d < bestD) {
          bestD = d;
          best = t;
        }
      }
      if (!best) return;
      if (view) land(best, nearestS(best, x, z), false, view);
      else switchTrack(best.station, { kind: 'tile', tx, ty });
    };
    return () => {
      cameraBridge.focusTile = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tracks, frame, controls]);

  const tmp = useMemo(() => ({ v: new Vector3(), offset: new Vector3() }), []);
  useFrame((_, delta) => {
    const track = rail.track;
    if (!controls || !track || !('fov' in camera)) return;
    const f = feel.current;
    if (cameraBridge.flying || cameraBridge.cinematic) {
      // Something else is driving: drop the speed effects (a flight sets its own field of view)
      // and pick the orbit point up afresh when it hands back.
      rail.lead = f.roll = 0;
      f.snap = true;
      if (cameraBridge.cinematic && camera.fov !== BASE_FOV_DEG) {
        camera.fov = BASE_FOV_DEG;
        camera.updateProjectionMatrix();
      }
      return;
    }
    const dt = Math.min(delta, 0.1);
    const keys = held.current;
    const dist = camera.position.distanceTo(controls.target);
    const cruise = MathUtils.clamp(dist * MOVE_PER_DIST, MOVE_MPS[0], MOVE_MPS[1]);
    const boosting = keys.has('boost');
    const speed = cruise * (boosting ? BOOST : 1);
    const along = (keys.has('toGoal') ? 1 : 0) - (keys.has('toStation') ? 1 : 0);
    rail.sGoal = MathUtils.clamp(rail.sGoal + along * speed * dt, 0, track.length);
    const prevS = rail.s;
    rail.s += (rail.sGoal - rail.s) * follow(SMOOTH_PER_S, dt);
    const moving = Math.min(1, Math.abs(rail.s - prevS) / dt / cruise); // 1 at cruising speed
    // Look ahead in the direction of travel.
    rail.lead += (along * LOOK_AHEAD_M - rail.lead) * follow(LOOK_AHEAD_PER_S, dt);

    // Ride the track like a balloon on a string: the orbit point moves along the track and drags
    // the camera after it. The camera keeps its distance and height, but its bearing swings part
    // of the way toward where the string now points (from the new point back to where the camera
    // was), so moving along the street slowly turns it to trail behind the direction of travel,
    // and round a corner it swings into the new street. Standing still, nothing pulls.
    const [px, pz] = pointAt(track, MathUtils.clamp(rail.s + rail.lead, 0, track.length));
    if (f.snap) {
      f.target.set(px, TRACK_Y_M, pz);
      f.snap = false;
    } else f.target.lerp(tmp.v.set(px, TRACK_Y_M, pz), follow(CORNER_SMOOTH_PER_S, dt));
    const { x, z } = f.target;
    tmp.offset.subVectors(camera.position, controls.target);
    const yaw0 = Math.atan2(tmp.offset.x, tmp.offset.z);
    const reach = Math.hypot(tmp.offset.x, tmp.offset.z);
    let yaw = yaw0;
    controls.target.set(x, TRACK_Y_M, z);
    if (reach > 1) {
      const string = Math.atan2(camera.position.x - x, camera.position.z - z);
      yaw += angleDelta(yaw, string) * BALLOON_PULL;
    }
    // Plus the player's own turning.
    const turn = (keys.has('left') ? 1 : 0) - (keys.has('right') ? 1 : 0);
    yaw += turn * ROTATE_RAD_PER_S * dt;
    tmp.offset.set(Math.sin(yaw) * reach, tmp.offset.y, Math.cos(yaw) * reach);
    camera.position.copy(controls.target).add(tmp.offset);
    controls.update();

    // Sense of speed: a wider view while moving (wider still boosting), and a roll into turns.
    const fovGoal = BASE_FOV_DEG + FOV_KICK_DEG * moving * (boosting ? 1.6 : 1);
    const fov = camera.fov + (fovGoal - camera.fov) * follow(FOV_PER_S, dt);
    if (Math.abs(fov - camera.fov) > 1e-3) {
      camera.fov = fov;
      camera.updateProjectionMatrix();
    }
    const yawRate = angleDelta(yaw0, yaw) / dt;
    const bankGoal = MathUtils.degToRad(
      MathUtils.clamp(yawRate * BANK_DEG_PER_RAD_S, -MAX_BANK_DEG, MAX_BANK_DEG),
    );
    f.roll += (bankGoal - f.roll) * follow(BANK_PER_S, dt);
    if (Math.abs(f.roll) > 1e-4) {
      camera.rotateZ(f.roll);
      // Screen shake (drei CameraShake) rebuilds the rotation every frame from the one it saw at
      // the controls' last change: announce the banked one, or the roll is lost.
      controls.dispatchEvent({ type: 'change' });
    }
    rail.bank = f.roll;
    for (const k of released.current) keys.delete(k);
    released.current.clear();
  });

  return null;
}
