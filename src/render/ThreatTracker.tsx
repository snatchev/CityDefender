import { useFrame } from '@react-three/fiber';
import { useRef } from 'react';
import { game } from '../game';
import { TICK_HZ } from '../sim/constants';
import { MOBS, type EliteType, type MobType } from '../sim/mobs';
import { stationsOpeningNextWave } from '../sim/phase';
import { clearCutscenes, playCutscene } from '../ui/cinema';
import { threatMemory, useThreats, type Threat } from '../ui/threats';
import { queueBurst } from './StationBursts';

/** How often the board is recomputed (s). */
const UPDATE_S = 0.12;
/** The burst plays this long (sim time) before a station's first bugs come out. */
const BURST_LEAD_S = 0.5;
/** For the last this many seconds before a station breaks open, its card flashes harder. */
const URGENT_S = 5;

/**
 * Keeps the threat board (ui/threats.ts) current, and stages each breach (branch down-the-street,
 * D054, D057). Never touches the sim; it reads it:
 *
 * - The stations' schedule: once a wave is sent, each station breaks open `breachLeadS` later.
 *   Until then its card counts down (DANGER, flashing harder near the end).
 * - Just before a station's first bugs come out, its burst plays (StationBursts.tsx): always,
 *   wherever the camera is.
 * - New bugs standing on a station tile came out of it. If they bring a boss, an elite group or a
 *   kind of bug the run hasn't met in an earlier wave, an introduction is queued
 *   (Director.tsx): the camera cuts to it and the game freezes for its title card.
 */
export function ThreatTracker() {
  const clock = useRef(0);
  const last = useRef('');

  useFrame((_, delta) => {
    clock.current -= delta;
    if (clock.current > 0) return;
    clock.current = UPDATE_S;
    const w = game.world;
    const city = game.city;
    const map = w.map;
    if (!map || !city) return;
    const m = threatMemory;
    if (m.run !== w.fx) clearCutscenes();
    if (m.wave !== w.wave || m.run !== w.fx) {
      m.reset(w.wave, w.fx);
      // Bugs already out (e.g. a restored save) belong to no station's breach.
      m.lastMobId = w.mobs.reduce((max, b) => Math.max(max, b.id), w.nextMobId - 1);
    }

    // Kinds of bug met in earlier waves need no introduction.
    const met = new Set(w.waves.slice(0, w.wave).flatMap((wave) => wave.groups.map((g) => g.type)));
    const introduce = (key: string, play: () => void) => {
      if (m.shown.has(key)) return;
      m.shown.add(key);
      play();
    };

    // New bugs: which station did they come out of, and is there anyone to introduce?
    const spawnAt = new Map<number, number>();
    map.spawns.forEach(([tx, ty], i) => spawnAt.set(ty * map.width + tx, i));
    for (const b of w.mobs) {
      if (b.id <= m.lastMobId) continue;
      const station = spawnAt.get(b.fromY * map.width + b.fromX);
      if (station === undefined) continue; // born elsewhere (a Brood Mother's brood)
      m.mobStation.set(b.id, station);
      m.opened.add(station);
      if (!m.burst.has(station)) {
        m.burst.add(station); // missed the countdown (e.g. bugs queued from the dev hook)
        queueBurst(station);
      }
      const type = b.type;
      if (MOBS[type].boss)
        introduce(`boss:${station}:${type}`, () =>
          playCutscene({ kind: 'boss', station, mob: type }),
        );
      else if (b.elite) {
        const elite = b.elite;
        introduce(`elite:${station}:${type}:${elite}`, () =>
          playCutscene({ kind: 'elite', station, mob: type, elite }),
        );
      } else if (!met.has(type))
        introduce(`new:${type}`, () => playCutscene({ kind: 'new', station, mob: type }));
    }
    m.lastMobId = Math.max(m.lastMobId, w.nextMobId - 1);

    // Stations still sealed: seconds until their first bugs; the burst just before.
    const opensIn = new Map<number, number>();
    for (const s of w.spawners) {
      if (m.opened.has(s.spawnIndex)) continue;
      const t = Math.max(0, (s.nextTick - w.tick) / TICK_HZ);
      opensIn.set(s.spawnIndex, Math.min(t, opensIn.get(s.spawnIndex) ?? Infinity));
    }
    for (const [station, t] of opensIn) {
      if (t <= BURST_LEAD_S && !m.burst.has(station)) {
        m.burst.add(station);
        queueBurst(station);
      }
    }

    // Who's out, from where.
    const alive = new Map<number, number>();
    const bossOut = new Map<number, MobType>();
    const eliteOut = new Map<number, { type: MobType; elite: EliteType }>();
    for (const b of w.mobs) {
      const s = m.mobStation.get(b.id);
      if (s === undefined) continue;
      alive.set(s, (alive.get(s) ?? 0) + 1);
      if (MOBS[b.type].boss) bossOut.set(s, b.type);
      else if (b.elite) eliteOut.set(s, { type: b.type, elite: b.elite });
    }
    const coming = new Set(w.spawners.filter((s) => s.remaining > 0).map((s) => s.spawnIndex));

    const shown = w.phase === 'prep' || w.phase === 'assault';
    const groups = shown ? (w.waves[w.wave]?.groups ?? []) : [];
    const byStation = new Map<number, Threat['groups']>();
    for (const g of groups) {
      const list = byStation.get(g.spawnIndex) ?? [];
      const same = list.find((x) => x.type === g.type && x.elite === (g.elite ?? null));
      if (same) same.count += g.count;
      else
        list.push({
          type: g.type as MobType,
          count: g.count,
          elite: (g.elite ?? null) as EliteType | null,
        });
      byStation.set(g.spawnIndex, list);
    }
    const threats: Threat[] = [...byStation].map(([station, list]) => {
      const sealed = opensIn.get(station);
      const boss = bossOut.get(station) ?? null;
      const elite = eliteOut.get(station) ?? null;
      const n = alive.get(station) ?? 0;
      const state: Threat['state'] =
        w.phase === 'prep'
          ? 'incoming'
          : sealed !== undefined
            ? 'danger'
            : boss
              ? 'boss'
              : elite
                ? 'elite'
                : n > 0 || coming.has(station)
                  ? 'engaged'
                  : 'clear';
      return {
        station,
        name: city.spawns[station]?.name ?? '?',
        state,
        groups: list,
        alive: n,
        breachIn: sealed !== undefined ? Math.ceil(sealed) : null,
        urgent: sealed !== undefined && sealed <= URGENT_S,
        boss,
        elite,
      };
    });
    const nextBreaches = shown
      ? stationsOpeningNextWave(w).map((i) => city.spawns[i]?.name ?? '?')
      : [];
    const key = JSON.stringify([threats, nextBreaches]);
    if (key !== last.current) {
      last.current = key;
      useThreats.setState({ threats, nextBreaches });
    }
  });

  return null;
}
