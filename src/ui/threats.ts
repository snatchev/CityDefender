import { create } from 'zustand';
import { switchTrack } from '../planning';
import { ELITES, MOBS, type EliteType, type MobType } from '../sim/mobs';

/**
 * The threat board (D054, D057): one card per station sending bugs this
 * wave. Kept up to date by render/ThreatTracker.tsx, which reads the stations' schedule and
 * watches new bugs come out of them (render side: the sim doesn't know about any of this).
 *
 * - incoming: in this wave's script, the wave not sent yet
 * - danger: the wave is sent and the station breaks open in `breachIn` seconds (`urgent` near the end)
 * - boss / elite: a boss, or an elite group, from here is out
 * - engaged: bugs from here are out, or still coming
 * - clear: everything from it is dead
 */
export type ThreatState = 'incoming' | 'danger' | 'boss' | 'elite' | 'engaged' | 'clear';

export interface Threat {
  station: number;
  name: string;
  state: ThreatState;
  /** This wave's bugs from the station, by type (and elite affix). */
  groups: { type: MobType; count: number; elite: EliteType | null }[];
  /** Bugs from here still alive. */
  alive: number;
  /** Whole seconds until the station breaks open (danger only). */
  breachIn: number | null;
  /** The last few seconds before it does: the card flashes harder. */
  urgent: boolean;
  /** A boss, or elite group, from here that is still alive. */
  boss: MobType | null;
  elite: { type: MobType; elite: EliteType } | null;
}

interface ThreatsState {
  threats: Threat[];
  /** Stations opening next wave (the breach telegraph). */
  nextBreaches: string[];
}

export const useThreats = create<ThreatsState>(() => ({ threats: [], nextBreaches: [] }));

/** Per-wave memory: what came out where, and what has burst and been introduced. */
export const threatMemory = {
  /** Wave index and the run's fx object (a new one means a restart) the memory belongs to. */
  wave: -1,
  run: null as object | null,
  lastMobId: -1,
  mobStation: new Map<number, number>(),
  /** Stations whose burst has played, and that bugs have come out of. */
  burst: new Set<number>(),
  opened: new Set<number>(),
  /** Introductions queued this wave (`boss:station:type`, `elite:station:type:affix`, `new:type`). */
  shown: new Set<string>(),
  reset(wave: number, run: object): void {
    this.wave = wave;
    this.run = run;
    this.mobStation.clear();
    this.burst.clear();
    this.opened.clear();
    this.shown.clear();
  },
};

/** A click on a station's card: put the camera on its track, near the station. */
export function engageThreat(station: number): void {
  switchTrack(station, { kind: 'start' });
}

/** Display name of a mob type, plural when `count` isn't 1, with its elite affix. */
export function mobLabel(type: MobType, elite: EliteType | null, count = 1): string {
  const name = MOBS[type].name;
  const plural = count === 1 ? name : name.endsWith('y') ? `${name.slice(0, -1)}ies` : `${name}s`;
  return elite ? `${ELITES[elite].name} ${plural}` : plural;
}
