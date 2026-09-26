import { useState } from 'react';
import { restart, setTimeScale, spawnWave } from '../game';
import { useHud } from './store';

const SPEEDS = [
  { label: 'Pause', scale: 0 },
  { label: '1×', scale: 1 },
  { label: '2×', scale: 2 },
  { label: '3×', scale: 3 },
] as const;
/** Size of the debug wave sent by the HUD button (real waves come from waves.json in Pass 4). */
const DEBUG_WAVE = 20;

export function Hud() {
  const tick = useHud((s) => s.tick);
  const simTime = useHud((s) => s.simTime);
  const seed = useHud((s) => s.seed);
  const timeScale = useHud((s) => s.timeScale);
  const renderer = useHud((s) => s.renderer);
  const errors = useHud((s) => s.errors);
  const city = useHud((s) => s.city);
  const integrity = useHud((s) => s.integrity);
  const mobs = useHud((s) => s.mobs);
  const leaked = useHud((s) => s.leaked);
  const [station, setStation] = useState(0);

  return (
    <div className="hud">
      <div className="hud-title">City Defender</div>
      <div className="hud-sub">Pass 2 · one mob</div>
      <div className="hud-integrity" aria-label="City Hall integrity">
        City Hall <strong>{integrity}</strong>
      </div>
      <dl className="hud-stats">
        <dt>Bugs</dt>
        <dd>{mobs}</dd>
        <dt>Reached City Hall</dt>
        <dd>{leaked}</dd>
        <dt>City</dt>
        <dd>{city ? `${city.title}, ${city.width}×${city.height} tiles` : 'loading…'}</dd>
        <dt>Sim time</dt>
        <dd>{simTime.toFixed(0)} s</dd>
        <dt>Tick</dt>
        <dd>{tick}</dd>
        <dt>Seed</dt>
        <dd>{seed}</dd>
        <dt>Renderer</dt>
        <dd>{renderer ?? 'starting…'}</dd>
      </dl>
      {city && (
        <div className="hud-row hud-spawn">
          <select
            aria-label="Station"
            value={station}
            onChange={(e) => setStation(Number(e.target.value))}
          >
            {city.stations.map((name, i) => (
              <option key={name} value={i}>
                {name}
              </option>
            ))}
          </select>
          <button type="button" onClick={() => spawnWave(DEBUG_WAVE, station)}>
            Send {DEBUG_WAVE} bugs
          </button>
        </div>
      )}
      <div className="hud-row" role="group" aria-label="Game speed">
        {SPEEDS.map((s) => (
          <button
            key={s.label}
            type="button"
            className={timeScale === s.scale ? 'active' : undefined}
            aria-pressed={timeScale === s.scale}
            onClick={() => setTimeScale(s.scale)}
          >
            {s.label}
          </button>
        ))}
        <button type="button" onClick={() => restart()}>
          Restart
        </button>
      </div>
      {errors.length > 0 && (
        <ul className="hud-errors" role="alert">
          {errors.map((e, i) => (
            <li key={i}>{e}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
