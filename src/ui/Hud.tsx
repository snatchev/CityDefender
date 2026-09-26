import { restart, setTimeScale } from '../game';
import { useHud } from './store';

const SPEEDS = [
  { label: 'Pause', scale: 0 },
  { label: '1×', scale: 1 },
  { label: '2×', scale: 2 },
  { label: '3×', scale: 3 },
] as const;

export function Hud() {
  const tick = useHud((s) => s.tick);
  const simTime = useHud((s) => s.simTime);
  const seed = useHud((s) => s.seed);
  const timeScale = useHud((s) => s.timeScale);
  const renderer = useHud((s) => s.renderer);
  const errors = useHud((s) => s.errors);
  const city = useHud((s) => s.city);

  return (
    <div className="hud">
      <div className="hud-title">City Defender</div>
      <div className="hud-sub">Pass 1 · map v0</div>
      <dl className="hud-stats">
        <dt>City</dt>
        <dd>{city ? city.title : 'loading…'}</dd>
        <dt>Map</dt>
        <dd>{city ? `${city.width}×${city.height} tiles` : '–'}</dd>
        <dt>Stations</dt>
        <dd>{city ? city.spawns : '–'}</dd>
        <dt>Sim time</dt>
        <dd>{simTime.toFixed(0)} s</dd>
        <dt>Tick</dt>
        <dd>{tick}</dd>
        <dt>Seed</dt>
        <dd>{seed}</dd>
        <dt>Renderer</dt>
        <dd>{renderer ?? 'starting…'}</dd>
      </dl>
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
