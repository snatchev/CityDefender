import { useFrame } from '@react-three/fiber';
import { useRef } from 'react';
import { game } from '../game';
import { MOBS, type EliteType, type MobType } from '../sim/mobs';
import { stationsOpeningNextWave } from '../sim/phase';
import { threatMemory, useThreats, type Threat } from '../ui/threats';
import { queueBurst } from './StationBursts';

/** How often the board is recomputed (s). */
const UPDATE_S = 0.12;

/**
 * Keeps the threat board (ui/threats.ts) current (branch down-the-street, D054). Watches the bugs
 * the sim spawns: a new bug standing on a station tile came out of that station, so this learns
 * when each station starts spawning (and fires its burst), when a boss or an elite group comes out,
 * and how many bugs from each station are still alive. Never touches the sim.
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
    if (m.wave !== w.wave || m.run !== w.fx) {
      m.reset(w.wave, w.fx);
      // Bugs already out (e.g. a restored save) belong to no station's breach.
      m.lastMobId = w.mobs.reduce((max, b) => Math.max(max, b.id), w.nextMobId - 1);
    }

    // New bugs: which station did they come out of?
    const spawnAt = new Map<number, number>();
    map.spawns.forEach(([tx, ty], i) => spawnAt.set(ty * map.width + tx, i));
    for (const b of w.mobs) {
      if (b.id <= m.lastMobId) continue;
      const station = spawnAt.get(b.fromY * map.width + b.fromX);
      if (station === undefined) continue; // born elsewhere (a Brood Mother's brood)
      m.mobStation.set(b.id, station);
      if (!m.started.has(station)) {
        m.started.add(station);
        queueBurst(station);
      }
      if (MOBS[b.type].boss && !m.shown.has(`boss:${station}:${b.type}`))
        m.bossOut.set(station, b.type);
      if (b.elite && !m.shown.has(`elite:${station}:${b.type}:${b.elite}`))
        m.eliteOut.set(station, { type: b.type, elite: b.elite });
    }
    m.lastMobId = Math.max(m.lastMobId, w.nextMobId - 1);

    const alive = new Map<number, number>();
    for (const b of w.mobs) {
      const s = m.mobStation.get(b.id);
      if (s !== undefined) alive.set(s, (alive.get(s) ?? 0) + 1);
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
      const started = m.started.has(station);
      const boss = m.bossOut.get(station) ?? null;
      const elite = m.eliteOut.get(station) ?? null;
      const n = alive.get(station) ?? 0;
      const state: Threat['state'] = !started
        ? 'incoming'
        : boss
          ? 'boss'
          : elite
            ? 'elite'
            : !m.breachSeen.has(station)
              ? 'danger'
              : n > 0 || coming.has(station)
                ? 'engaged'
                : 'clear';
      return {
        station,
        name: city.spawns[station]?.name ?? '?',
        state,
        groups: list,
        alive: n,
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
