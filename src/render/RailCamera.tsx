import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import { MathUtils, Spherical, Vector3 } from 'three';
import { cameraBridge, type CameraView } from '../cameraBridge';
import { focusRoute } from '../planning';
import { usePlan, type TrackAt } from '../ui/planStore';
import { indexToWorld, tileToWorld, type TileFrame } from './coords';
import { angleDelta, headingAt, makeTrack, nearestS, pointAt, type Track } from './track';
import { orbitControls } from './view';

/** The point the camera orbits rides this high above the street (m). */
export const TRACK_Y_M = 2;
/** The camera turns with the street over this stretch either side (m), so corners turn it gently. */
const HEADING_WINDOW_M = 45;
/** W/S travel speed: this share of the camera distance per second, clamped (m/s). */
const MOVE_PER_DIST = 0.8;
const MOVE_MPS = [40, 500] as const;
/** How quickly the camera catches up with the requested spot on the track (1/s). */
const SMOOTH_PER_S = 8;
const ROTATE_RAD_PER_S = 1.6;
/** 'start' lands this far down the track from the station (looking back at it); 'goal' this far short of City Hall. */
const START_AFTER_STATION_M = 40;
const START_BEFORE_GOAL_M = 90;
/** Camera distance and pitch kept within these when landing on a track. */
const DIST_M = [120, 600] as const;
const PITCH_DEG = [15, 70] as const;
const DEFAULT_VIEW = { distM: 240, pitchDeg: 30 };
const FLY_S = 0.9;

type Action = 'toStation' | 'toGoal' | 'left' | 'right';
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
};

/** The rail's state, readable by cutscenes (Director.tsx) to hand the camera back. */
export const rail = {
  track: null as Track | null,
  /** Where the camera is along the track (m from the station), and where it's heading. */
  s: 0,
  sGoal: 0,
  /** The track heading the camera's yaw was last turned to follow (radians). */
  heading: 0,
};

const UP = new Vector3(0, 1, 0);

function typingInto(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))
  );
}

/**
 * The rail camera (branch down-the-street, D054). The point the camera orbits is pinned to the
 * active track, the route the bugs crawl from one station to City Hall. W/↑ glides toward the
 * station, S/↓ toward City Hall; A/D, ←/→ and Q/E turn the camera around that point; the mouse
 * orbits and zooms; nothing pans. The camera turns with the street, so what's ahead stays ahead.
 * Switching tracks (the threat board, the minimap) glides the camera across. The
 * rail stands still while a glide or a cutscene drives the camera.
 */
export function RailCamera({ frame, width }: { frame: TileFrame; width: number }) {
  const camera = useThree((s) => s.camera);
  const controls = orbitControls(useThree((s) => s.controls));
  const routes = usePlan((p) => p.routes);
  const focus = usePlan((p) => p.focus);
  const held = useRef(new Set<Action>());
  const released = useRef(new Set<Action>());

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
    rail.track = track;
    rail.s = rail.sGoal = s;
    rail.heading = headingAt(track, s, HEADING_WINDOW_M);
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
      yawDeg: view?.yawDeg ?? MathUtils.radToDeg(rail.heading),
    };
    if (fly) {
      cameraBridge.flyTo?.([x, TRACK_Y_M, z], v, FLY_S);
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
  const seq = focus?.seq;
  useEffect(() => {
    if (!focus || !controls) return;
    const track =
      tracks.get(focus.station) ?? (rail.track?.station === focus.station ? rail.track : null);
    if (track) land(track, resolve(track, focus.at), focus.fly);
    // Only on a new request; `tracks` changing (walls rerouting) is handled below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seq, controls]);

  // First track: the first station sending bugs, near City Hall, looking up the street. Placed, not
  // flown (nothing to take control from yet).
  useEffect(() => {
    if (focus || tracks.size === 0) return;
    const first = routes[0]!.station;
    focusRoute(first, { kind: 'goal' }, false);
  }, [focus, tracks, routes]);

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
    rail.heading = headingAt(next, rail.s, HEADING_WINDOW_M);
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
      else focusRoute(best.station, { kind: 'tile', tx, ty });
    };
    return () => {
      cameraBridge.focusTile = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tracks, frame, controls]);

  const tmp = useMemo(() => ({ v: new Vector3(), offset: new Vector3() }), []);
  useFrame((_, delta) => {
    const track = rail.track;
    if (!controls || !track) return;
    if (cameraBridge.flying || cameraBridge.cinematic) {
      // Something else is driving; follow its heading so we don't snap when it hands back.
      rail.heading = headingAt(track, rail.s, HEADING_WINDOW_M);
      return;
    }
    const dt = Math.min(delta, 0.1);
    const keys = held.current;
    const dist = camera.position.distanceTo(controls.target);
    const speed = MathUtils.clamp(dist * MOVE_PER_DIST, MOVE_MPS[0], MOVE_MPS[1]);
    const along = (keys.has('toGoal') ? 1 : 0) - (keys.has('toStation') ? 1 : 0);
    rail.sGoal = MathUtils.clamp(rail.sGoal + along * speed * dt, 0, track.length);
    rail.s += (rail.sGoal - rail.s) * (1 - Math.exp(-SMOOTH_PER_S * dt));

    // Ride the track: move the orbit point, and the camera with it.
    const [x, z] = pointAt(track, rail.s);
    tmp.v.set(x, TRACK_Y_M, z).sub(controls.target);
    controls.target.add(tmp.v);
    camera.position.add(tmp.v);

    // Turn with the street, plus the player's own turning.
    const h = headingAt(track, rail.s, HEADING_WINDOW_M);
    const turn = (keys.has('left') ? 1 : 0) - (keys.has('right') ? 1 : 0);
    const angle = angleDelta(rail.heading, h) + turn * ROTATE_RAD_PER_S * dt;
    rail.heading = h;
    if (angle !== 0) {
      tmp.offset.subVectors(camera.position, controls.target).applyAxisAngle(UP, angle);
      camera.position.copy(controls.target).add(tmp.offset);
    }
    controls.update();
    for (const k of released.current) keys.delete(k);
    released.current.clear();
  });

  return null;
}
