import barricadesData from '../data/barricades.json';
import towersData from '../data/towers.json';
import { callWave, setTimeScale } from '../game';
import { useEffect } from 'react';
import { restartRun, selectTower, sellTowerById } from '../planning';
import { usePlan } from './planStore';
import { useHud } from './store';

const SPEEDS = [
  { label: 'Pause', scale: 0 },
  { label: '1×', scale: 1 },
  { label: '2×', scale: 2 },
  { label: '3×', scale: 3 },
] as const;

export function Hud() {
  const s = useHud();
  const routes = usePlan((p) => p.routes);
  const stationNames = s.city?.stations ?? [];

  return (
    <div className="hud">
      <div className="hud-title">City Defender</div>
      <div className="hud-sub">Pass 5 · MVP{s.city ? ` · ${s.city.title}` : ''}</div>

      <div className="hud-top">
        <div aria-label="City Hall integrity">
          City Hall <strong className="hud-big">{s.integrity}</strong>
        </div>
        <div aria-label="Cash">
          <strong className="hud-big hud-cash">${s.cash}</strong>
        </div>
      </div>

      <div className="hud-phase" aria-live="polite">
        <PhaseLine />
      </div>
      <WaveIntel />

      <dl className="hud-stats">
        <dt>Bugs on the streets</dt>
        <dd>{s.mobs}</dd>
        <dt>Killed / reached City Hall</dt>
        <dd>
          {s.kills} / {s.leaked}
        </dd>
        {routes.map((r) => (
          <FragmentRow
            key={r.station}
            label={`From ${stationNames[r.station] ?? '?'}`}
            value={`${Math.round(r.lengthM)} m${r.siege ? ', via barricade' : ''}`}
          />
        ))}
      </dl>

      <div className="hud-row" role="group" aria-label="Game speed">
        {SPEEDS.map((sp) => (
          <button
            key={sp.label}
            type="button"
            className={s.timeScale === sp.scale ? 'active' : undefined}
            aria-pressed={s.timeScale === sp.scale}
            onClick={() => setTimeScale(sp.scale)}
          >
            {sp.label}
          </button>
        ))}
        <button type="button" onClick={() => restartRun()}>
          Restart
        </button>
      </div>

      <SelectedTowerPanel />

      <p className="hud-hint">
        Street: Police Sawhorse ${barricadesData.sawhorse.cost} (prep only). Rooftop by a street:{' '}
        {towersData.mgNest.name} ${towersData.mgNest.cost}. Click a tower to select it; right-click
        sells (100% during the prep you built it in, else 70%).
      </p>
      <p className="hud-hint">Camera: WASD pan · Q/E rotate · scroll zoom · drag to pan/orbit.</p>
      {s.notice && <p className="hud-notice">{s.notice}</p>}
      <p className="hud-debug">
        {s.simTime.toFixed(0)} s · tick {s.tick} · seed {s.seed} · {s.renderer ?? 'starting…'}
      </p>
      {s.errors.length > 0 && (
        <ul className="hud-errors" role="alert">
          {s.errors.map((e, i) => (
            <li key={i}>{e}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Where this wave's bugs come from and how many (shown during prep and assault). */
function WaveIntel() {
  const intel = useHud((s) => s.waveIntel);
  const phase = useHud((s) => s.phase);
  const stations = useHud((s) => s.city?.stations);
  if ((phase !== 'prep' && phase !== 'assault') || intel.length === 0 || !stations) return null;
  return (
    <ul className="hud-intel" aria-label="Wave intel">
      {intel.map((g, i) => (
        <li key={i}>
          <span className="hud-intel-station">{stations[g.spawnIndex]}</span>
          <span>
            {g.count}× bugs{g.hpMul !== 1 ? `, HP ×${g.hpMul}` : ''}
          </span>
        </li>
      ))}
    </ul>
  );
}

function SelectedTowerPanel() {
  const sel = usePlan((p) => p.selected);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Escape') selectTower(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  if (!sel) return null;
  return (
    <div className="hud-selected" aria-label="Selected tower">
      <div>
        <b>{sel.name}</b> · {sel.kills} kills · range {sel.rangeM} m
      </div>
      <div className="hud-row">
        <button type="button" onClick={() => sellTowerById(sel.id)}>
          Sell ${sel.sellValue}
        </button>
        <button type="button" onClick={() => selectTower(null)}>
          Close (Esc)
        </button>
      </div>
    </div>
  );
}

function FragmentRow({ label, value }: { label: string; value: string }) {
  return (
    <>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </>
  );
}

function PhaseLine() {
  const phase = useHud((s) => s.phase);
  const wave = useHud((s) => s.wave);
  const waveCount = useHud((s) => s.waveCount);
  const secs = useHud((s) => s.phaseSeconds);
  const label = `Wave ${wave} / ${waveCount}`;
  switch (phase) {
    case 'prep':
      return (
        <>
          <span>
            {label} · <b>Prep</b> {secs}s
          </span>
          <button type="button" className="hud-go" onClick={callWave}>
            Start wave{secs > 0 ? ` (+$${secs})` : ''}
          </button>
        </>
      );
    case 'assault':
      return (
        <span>
          {label} · <b>Assault!</b>
        </span>
      );
    case 'debrief':
      return (
        <span>
          {label} · <b>Cleared.</b> Next wave in {secs}s
        </span>
      );
    case 'won':
      return <b>City Hall held!</b>;
    case 'lost':
      return <b>City Hall has fallen.</b>;
    default:
      return <span>Loading…</span>;
  }
}
