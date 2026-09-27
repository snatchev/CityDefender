import { useEffect, useState } from 'react';
import rulesData from '../data/rules.json';
import { callWave, game } from '../game';
import { restartRun, selectTool, selectTower, sellTowerById } from '../planning';
import { BuildBar } from './BuildBar';
import { GearIcon } from './icons';
import { Minimap } from './Minimap';
import { usePlan } from './planStore';
import { SpeedButton } from './SpeedButton';
import { useHud } from './store';

/** Integrity below this shows in red (DESIGN §3.2 lives). */
const LOW_INTEGRITY = 25;
/** Feedback notices ("can't build here") disappear after this long. */
const NOTICE_MS = 2600;

/**
 * The in-game HUD: status (top left), minimap + speed (top right), build bar (bottom), selected
 * tower card, feedback toasts and the debug menu. No instructions anywhere (Stefan, 2026-09-27).
 */
export function Hud() {
  useHotkeys();
  const cityName = useHud((s) => s.city?.name);
  const map = cityName ? game.world.map : null;
  return (
    <>
      <StatusPanel />
      <div className="hud-top-right">
        {map && <Minimap map={map} />}
        <SpeedButton />
      </div>
      <SelectedTowerCard />
      <BuildBar />
      <Toasts />
      <DebugMenu />
    </>
  );
}

/** Esc puts the build tool down, then closes the tower card. M toggles the map debug view. */
function useHotkeys() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
      if (e.code === 'Escape') {
        if (usePlan.getState().tool) selectTool(null);
        else selectTower(null);
      }
      if (e.code === 'KeyM') usePlan.setState((p) => ({ debugMap: !p.debugMap }));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}

function StatusPanel() {
  const s = useHud();
  const integrityPct = Math.max(0, Math.min(1, s.integrity / rulesData.startIntegrity));
  return (
    <section className="hud-panel status" aria-label="Status">
      <div className="status-row">
        <span className="hud-label">City Hall</span>
        <strong
          // Re-keyed on every change so the CSS pulse replays on each hit.
          key={s.integrity}
          className={`hud-integrity${s.integrity < LOW_INTEGRITY ? ' low' : ''}`}
        >
          {s.integrity}
        </strong>
      </div>
      <div className="integrity-bar" aria-hidden="true">
        <div
          className={`integrity-fill${s.integrity < LOW_INTEGRITY ? ' low' : ''}`}
          style={{ width: `${integrityPct * 100}%` }}
        />
      </div>

      <div className="status-row">
        <span className="hud-label">Cash</span>
        <strong className="hud-cash">${s.cash}</strong>
      </div>

      <div className="wave-row" aria-live="polite">
        <span className="hud-label">
          Wave <b>{s.wave}</b>/{s.waveCount}
        </span>
        <PhaseChip phase={s.phase} secs={s.phaseSeconds} />
      </div>
      {s.phase === 'prep' && (
        <button type="button" className="start-wave" onClick={callWave}>
          Start wave{s.phaseSeconds > 0 ? ` +$${s.phaseSeconds}` : ''}
        </button>
      )}
      <WaveIntel />

      <div className="status-metrics">
        <Metric label="Bugs" value={s.mobs} />
        <Metric label="Kills" value={s.kills} />
        <Metric label="Leaked" value={s.leaked} warn={s.leaked > 0} />
      </div>
    </section>
  );
}

function Metric({ label, value, warn = false }: { label: string; value: number; warn?: boolean }) {
  return (
    <div className={`metric${warn ? ' warn' : ''}`}>
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}

function PhaseChip({ phase, secs }: { phase: string; secs: number }) {
  const text =
    phase === 'prep'
      ? `Prep ${secs}s`
      : phase === 'assault'
        ? 'Assault'
        : phase === 'debrief'
          ? `Cleared · ${secs}s`
          : phase === 'won'
            ? 'Held'
            : phase === 'lost'
              ? 'Fallen'
              : '…';
  return <span className={`phase-chip ${phase}`}>{text}</span>;
}

/** Where this wave's bugs come from and how many. */
function WaveIntel() {
  const intel = useHud((s) => s.waveIntel);
  const phase = useHud((s) => s.phase);
  const stations = useHud((s) => s.city?.stations);
  if ((phase !== 'prep' && phase !== 'assault') || intel.length === 0 || !stations) return null;
  return (
    <ul className="wave-intel" aria-label="Wave intel">
      {intel.map((g, i) => (
        <li key={i}>
          <span className="station-chip">{stations[g.spawnIndex]}</span>
          <span>
            {g.count}×{g.hpMul !== 1 ? ` · HP ×${g.hpMul}` : ''}
          </span>
        </li>
      ))}
    </ul>
  );
}

function SelectedTowerCard() {
  const sel = usePlan((p) => p.selected);
  if (!sel) return null;
  return (
    <section className="hud-panel tower-card" aria-label="Selected tower">
      <div className="tower-card-title">{sel.name}</div>
      <dl>
        <div>
          <dt>Kills</dt>
          <dd>{sel.kills}</dd>
        </div>
        <div>
          <dt>Range</dt>
          <dd>
            {Math.round(sel.rangeM)} m
            {sel.minRangeM > 0 ? ` (min ${Math.round(sel.minRangeM)})` : ''}
          </dd>
        </div>
        <div>
          <dt>Stands</dt>
          <dd>{sel.heightM > 0 ? `roof, ${Math.round(sel.heightM)} m` : 'street level'}</dd>
        </div>
      </dl>
      <div className="tower-card-actions">
        <button type="button" onClick={() => sellTowerById(sel.id)}>
          Sell ${sel.sellValue}
        </button>
        <button type="button" aria-label="Close" onClick={() => selectTower(null)}>
          ✕
        </button>
      </div>
    </section>
  );
}

/** Short-lived feedback ("can't build here") and runtime errors (kept on screen for screenshots). */
function Toasts() {
  const notice = useHud((s) => s.notice);
  const errors = useHud((s) => s.errors);
  const setNotice = useHud((s) => s.setNotice);
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), NOTICE_MS);
    return () => clearTimeout(t);
  }, [notice, setNotice]);
  return (
    <>
      {notice && (
        <div className="toast" role="status">
          {notice}
        </div>
      )}
      {errors.length > 0 && (
        <ul className="hud-errors" role="alert">
          {errors.map((e, i) => (
            <li key={i}>{e}</li>
          ))}
        </ul>
      )}
    </>
  );
}

/** Gear button (bottom left): sim clock, seed, renderer, FPS meter, map debug view, restart. */
function DebugMenu() {
  const [open, setOpen] = useState(false);
  const s = useHud();
  const debugMap = usePlan((p) => p.debugMap);
  return (
    <div className="debug-menu">
      {open && (
        <section className="hud-panel debug-panel" aria-label="Debug">
          <dl>
            <div>
              <dt>Sim time</dt>
              <dd>{s.simTime.toFixed(0)} s</dd>
            </div>
            <div>
              <dt>Tick</dt>
              <dd>{s.tick}</dd>
            </div>
            <div>
              <dt>Speed</dt>
              <dd>{s.timeScale}×</dd>
            </div>
            <div>
              <dt>Seed</dt>
              <dd>{s.seed}</dd>
            </div>
            <div>
              <dt>Renderer</dt>
              <dd>{s.renderer ?? '…'}</dd>
            </div>
          </dl>
          <label>
            <input
              type="checkbox"
              checked={s.showFps}
              onChange={(e) => s.setShowFps(e.target.checked)}
            />{' '}
            FPS meter
          </label>
          <label>
            <input
              type="checkbox"
              checked={debugMap}
              onChange={(e) => usePlan.setState({ debugMap: e.target.checked })}
            />{' '}
            Map debug view
          </label>
          <div className="debug-actions">
            <button type="button" onClick={() => restartRun()}>
              Restart
            </button>
            <button type="button" onClick={() => restartRun(Math.floor(Math.random() * 1e6))}>
              New seed
            </button>
          </div>
        </section>
      )}
      <button
        type="button"
        className="gear"
        aria-label="Debug menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <GearIcon />
      </button>
    </div>
  );
}
