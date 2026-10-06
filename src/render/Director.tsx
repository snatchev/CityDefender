import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import { MathUtils, Vector3, type Camera } from 'three';
import { cameraBridge } from '../cameraBridge';
import cinematicsData from '../data/cinematics.json';
import { game, renderAlpha, setTimeScale } from '../game';
import { focusRoute } from '../planning';
import { ELITES, MOBS } from '../sim/mobs';
import { endCutscene, useCinema, type Cutscene } from '../ui/cinema';
import { usePlan } from '../ui/planStore';
import { mobLabel, threatMemory } from '../ui/threats';
import { indexToWorld, tileToWorld, type TileFrame } from './coords';
import { mobWorldXZ } from './Mobs';
import { rail, TRACK_Y_M } from './RailCamera';
import { headingAt, makeTrack, nearestS, pointAt, type Track } from './track';

/** Where the camera is and what it looks at. */
interface Pose {
  pos: Vector3;
  look: Vector3;
}

/** A cutscene as keyframes (seconds) and timed events. */
interface Script {
  keys: { t: number; pose: Pose }[];
  events: { t: number; run: () => void }[];
  /** Where the rail picks up afterwards. */
  station: number;
  landS: number;
}

/** The view the rail is handed back with. */
const LAND = { distM: 100, pitchDeg: 14 };
/**
 * Introductions: a fast whip to a low shot, a freeze frame with the title card, then back. The
 * camera aims below the subject (`dropM`) so it sits in the top half, above the title card.
 */
const INTRO = { whipS: 0.55, returnS: 0.9, angleDeg: 14 };
const FRAMING = {
  boss: { distM: 48, upM: 9, dropM: 9 },
  elite: { distM: 42, upM: 16, dropM: 5 },
};
const BOSS_HOLD_S = 3.3;
const ELITE_HOLD_S = 2.6;
const NEW_HOLD_S = 2.6;
const HEADING_WINDOW_M = 30;

const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

/**
 * Plays introductions (branch down-the-street, D054, D057): a boss, an elite group or a new kind
 * of bug just out of a station. They start on their own, queued by render/ThreatTracker.tsx. While
 * one plays it owns the camera: the orbit controls are off and the rail waits
 * (`cameraBridge.cinematic`). The game freezes for the title card and its speed comes back
 * afterwards. Click, Esc or Space skips; either way the camera ends on the station's track, where
 * the rail takes over.
 */
export function Director({ frame, width }: { frame: TileFrame; width: number }) {
  const camera = useThree((s) => s.camera);
  const controls = useThree((s) => s.controls) as unknown as {
    enabled: boolean;
    target: Vector3;
    update(): void;
  } | null;
  const cut = useCinema((s) => s.cut);
  const skip = useCinema((s) => s.skip);
  const play = useRef<{
    script: Script;
    start: number;
    fired: number;
  } | null>(null);
  const tmp = useMemo(() => ({ look: new Vector3() }), []);

  const trackOf = (station: number): Track | null => {
    const r = usePlan.getState().routes.find((x) => x.station === station);
    return r
      ? makeTrack(
          station,
          r.tiles.map((i) => indexToWorld(frame, width, i)),
        )
      : null;
  };

  const finish = () => {
    const p = play.current;
    if (!p) return;
    // Unfreeze and take the card down if the script didn't get there (skipped).
    for (const e of p.script.events.slice(p.fired)) e.run();
    play.current = null;
    cameraBridge.cinematic = false;
    if (controls) controls.enabled = true;
    focusRoute(p.script.station, { kind: 's', s: p.script.landS }, false);
    endCutscene();
  };

  // Start a cutscene.
  useEffect(() => {
    if (!cut || !controls) return;
    const track = trackOf(cut.station);
    const script = buildScript(cut, camera, controls.target, track, frame);
    if (!script || !track) {
      endCutscene();
      return;
    }
    // The cutscene ends on this track: switch the rail now, so the see-through cutaway (which
    // follows it) already clears the view of the station and its street.
    rail.track = track;
    rail.s = rail.sGoal = script.landS;
    cameraBridge.cinematic = true;
    controls.enabled = false;
    play.current = { script, start: performance.now(), fired: 0 };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cut?.id]);

  // Skip.
  useEffect(() => {
    if (skip > 0) finish();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [skip]);

  useFrame(() => {
    const p = play.current;
    if (!p || !controls) return;
    const t = (performance.now() - p.start) / 1000;
    const { keys, events } = p.script;
    while (p.fired < events.length && events[p.fired]!.t <= t) events[p.fired++]!.run();
    const last = keys[keys.length - 1]!;
    if (t >= last.t) {
      camera.position.copy(last.pose.pos);
      camera.lookAt(last.pose.look);
      controls.target.copy(last.pose.look);
      finish();
      return;
    }
    let i = 1;
    while (i < keys.length - 1 && keys[i]!.t <= t) i++;
    const a = keys[i - 1]!;
    const b = keys[i]!;
    const k = ease(MathUtils.clamp((t - a.t) / Math.max(1e-6, b.t - a.t), 0, 1));
    camera.position.lerpVectors(a.pose.pos, b.pose.pos, k);
    tmp.look.lerpVectors(a.pose.look, b.pose.look, k);
    camera.lookAt(tmp.look);
    controls.target.copy(tmp.look);
  });

  return null;
}

/** A pose `distM` from `look` toward compass yaw (radians, atan2(dx, dz)), `upM` above it. */
function poseAround(look: Vector3, yaw: number, distM: number, upM: number): Pose {
  return {
    pos: new Vector3(look.x + Math.sin(yaw) * distM, look.y + upM, look.z + Math.cos(yaw) * distM),
    look: look.clone(),
  };
}

/** The rail's pose on `track` at `s`: what RailCamera will set when it takes over. */
function railPose(track: Track, s: number): Pose {
  const [x, z] = pointAt(track, s);
  const look = new Vector3(x, TRACK_Y_M, z);
  const yaw = headingAt(track, s, 45);
  const pitch = MathUtils.degToRad(LAND.pitchDeg);
  return poseAround(look, yaw, LAND.distM * Math.cos(pitch), LAND.distM * Math.sin(pitch));
}

function buildScript(
  cut: Cutscene,
  camera: Camera,
  target: Vector3,
  track: Track | null,
  frame: TileFrame,
): Script | null {
  const w = game.world;
  const spawn = w.map?.spawns[cut.station];
  if (!spawn || !track) return null;
  const [sx, sz] = tileToWorld(frame, spawn[0], spawn[1]);
  const from: Pose = { pos: camera.position.clone(), look: target.clone() };

  // Find it (one from this station, if still alive), else look at the station.
  const subject = w.mobs.find(
    (m) =>
      m.type === cut.mob &&
      (cut.kind === 'elite' ? m.elite === cut.elite : cut.kind === 'boss' || !m.elite) &&
      threatMemory.mobStation.get(m.id) === cut.station,
  );
  const [bx, bz] = subject ? mobWorldXZ(subject, frame, renderAlpha()) : [sx, sz];
  const fr = FRAMING[cut.kind === 'boss' ? 'boss' : 'elite'];
  const look = new Vector3(bx, 3 - fr.dropM, bz);
  const sAt = nearestS(track, bx, bz);
  // In front of it, on the City Hall side, looking back at it as it comes.
  const yaw = headingAt(track, sAt, HEADING_WINDOW_M) + MathUtils.degToRad(INTRO.angleDeg);
  const close = poseAround(look, yaw, fr.distM, fr.upM + fr.dropM);
  const hold = cut.kind === 'boss' ? BOSS_HOLD_S : cut.kind === 'elite' ? ELITE_HOLD_S : NEW_HOLD_S;
  const t1 = INTRO.whipS;
  const t2 = t1 + hold;
  type Intro = Record<string, { epithet: string; factoid: string }>;
  const intro =
    cut.kind === 'boss'
      ? (cinematicsData.bosses as Intro)[cut.mob]
      : cut.kind === 'elite'
        ? (cinematicsData.elites as Intro)[cut.elite ?? '']
        : (cinematicsData.mobs as Intro)[cut.mob];
  const name =
    cut.kind === 'elite' && cut.elite
      ? `${ELITES[cut.elite].name} ${mobLabel(cut.mob, null, 2)}`
      : MOBS[cut.mob].name;
  let prevScale = 1;
  return {
    station: cut.station,
    landS: sAt,
    keys: [
      { t: 0, pose: from },
      { t: t1, pose: close },
      // A barely-moving hold (a slow drift in) reads as a freeze frame, not a stuck camera.
      { t: t2, pose: poseAround(look, yaw, fr.distM * 0.9, (fr.upM + fr.dropM) * 0.95) },
      { t: t2 + INTRO.returnS, pose: railPose(track, sAt) },
    ],
    events: [
      {
        t: t1,
        run: () => {
          prevScale = game.stepper.timeScale;
          setTimeScale(0); // freeze frame
          useCinema.setState({
            card: {
              kind: cut.kind,
              epithet: intro?.epithet ?? '',
              name,
              factoid: intro?.factoid ?? '',
            },
          });
        },
      },
      {
        t: t2,
        run: () => {
          useCinema.setState({ card: null });
          setTimeScale(prevScale);
        },
      },
    ],
  };
}
