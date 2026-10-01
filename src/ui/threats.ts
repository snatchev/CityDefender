import { create } from 'zustand';
import { focusRoute } from '../planning';
import { ELITES, MOBS, type EliteType, type MobType } from '../sim/mobs';
import { playCutscene } from './cinema';

/**
 * The threat board (branch down-the-street, D054): one card per station sending bugs this wave.
 * Kept up to date by render/ThreatTracker.tsx, which watches new bugs come out of the stations
 * (render side: the sim doesn't know about any of this).
 *
 * - incoming: in this wave's script, nothing out yet
 * - danger: bugs are coming out and the player hasn't looked yet
 * - elite / boss: an elite group or a boss came out and hasn't been introduced yet
 * - engaged: looked at, bugs still out or still coming
 * - clear: everything from it is dead
 */
export type ThreatState = 'incoming' | 'danger' | 'elite' | 'boss' | 'engaged' | 'clear';

export interface Threat {
  station: number;
  name: string;
  state: ThreatState;
  /** This wave's bugs from the station, by type (and elite affix). */
  groups: { type: MobType; count: number; elite: EliteType | null }[];
  /** Bugs from here still alive. */
  alive: number;
  /** The boss, or elite group, waiting to be introduced. */
  boss: MobType | null;
  elite: { type: MobType; elite: EliteType } | null;
}

interface ThreatsState {
  threats: Threat[];
  /** Stations opening next wave (the breach telegraph). */
  nextBreaches: string[];
}

export const useThreats = create<ThreatsState>(() => ({ threats: [], nextBreaches: [] }));

/** Per-wave memory: what came out where, and what the player has already been shown. */
export const threatMemory = {
  /** Wave index and the run's fx object (a new one means a restart) the memory belongs to. */
  wave: -1,
  run: null as object | null,
  lastMobId: -1,
  mobStation: new Map<number, number>(),
  started: new Set<number>(),
  /** Station → boss / elite group out and not introduced yet. */
  bossOut: new Map<number, MobType>(),
  eliteOut: new Map<number, { type: MobType; elite: EliteType }>(),
  shown: new Set<string>(),
  breachSeen: new Set<number>(),
  reset(wave: number, run: object): void {
    this.wave = wave;
    this.run = run;
    this.mobStation.clear();
    this.started.clear();
    this.bossOut.clear();
    this.eliteOut.clear();
    this.shown.clear();
    this.breachSeen.clear();
  },
};

/**
 * A click on a station's card: play whatever it has to show (a boss first, then an elite group,
 * then the breach) and leave the camera on its track; with nothing new, just glide over there.
 */
export function engageThreat(station: number): void {
  const t = useThreats.getState().threats.find((x) => x.station === station);
  if (!t) return;
  const m = threatMemory;
  if (t.boss) {
    m.bossOut.delete(station);
    m.shown.add(`boss:${station}:${t.boss}`);
    m.breachSeen.add(station);
    playCutscene({ kind: 'boss', station, mob: t.boss });
  } else if (t.elite) {
    m.eliteOut.delete(station);
    m.shown.add(`elite:${station}:${t.elite.type}:${t.elite.elite}`);
    m.breachSeen.add(station);
    playCutscene({ kind: 'elite', station, mob: t.elite.type, elite: t.elite.elite });
  } else if (t.state === 'danger') {
    m.breachSeen.add(station);
    playCutscene({ kind: 'breach', station });
  } else {
    focusRoute(station, { kind: 'start' });
  }
}

/** Display name of a mob type, plural when `count` isn't 1, with its elite affix. */
export function mobLabel(type: MobType, elite: EliteType | null, count = 1): string {
  const name = MOBS[type].name;
  const plural = count === 1 ? name : name.endsWith('y') ? `${name.slice(0, -1)}ies` : `${name}s`;
  return elite ? `${ELITES[elite].name} ${plural}` : plural;
}
