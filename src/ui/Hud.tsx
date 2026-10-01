import { useEffect, useState } from 'react';
import rulesData from '../data/rules.json';
import { callWave, game } from '../game';
import { TOWERS } from '../sim/towers';
import { TARGETING_MODES, type TargetingMode } from '../data/schema';
import {
  repairSelectedWall,
  restartRun,
  selectTool,
  selectTower,
  selectWall,
  sellSelectedWall,
  sellTowerById,
  toggleTactical,
  setSelectedTargeting,
  upgradeSelected,
  upgradeSelectedWall,
} from '../planning';
import { GrantPicker, ResumePrompt } from './RunDialogs';
import { towerColor } from '../render/Towers';
import { BuildBar } from './BuildBar';
import { GearIcon } from './icons';
import { Minimap } from './Minimap';
import { usePlan } from './planStore';
import { SpeedButton, TacticalButton } from './SpeedButton';
import { ThreatBoard } from './ThreatBoard';
import { CinemaOverlay } from './CinemaOverlay';
import './cinema.css';
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
      <div className="hud-left">
        <StatusPanel />
        <ThreatBoard />
      </div>
      <div className="hud-top-right">
        {map && <Minimap map={map} />}
        <div className="hud-button-row">
          <SpeedButton />
          <TacticalButton />
        </div>
      </div>
      <SelectedTowerCard />
      <SelectedWallCard />
      <BuildBar />
      <GrantPicker />
      <ResumePrompt />
      <Toasts />
      <DebugMenu />
      <CinemaOverlay />
    </>
  );
}

/**
 * Esc puts the build tool down, then closes the tower card.
 * T toggles the tactical view, M the map debug view.
 */
function useHotkeys() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
      if (e.code === 'Escape') {
        if (usePlan.getState().tool) selectTool(null);
        else {
          selectTower(null);
          selectWall(null);
        }
      }
      if (e.code === 'KeyM') usePlan.setState((p) => ({ debugMap: !p.debugMap }));
      if (e.code === 'KeyT' && !e.ctrlKey && !e.metaKey && !e.altKey) toggleTactical();
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
  const interest = useHud((s) => s.lastInterest);
  const text =
    phase === 'prep'
      ? `Prep ${secs}s`
      : phase === 'assault'
        ? 'Assault'
        : phase === 'debrief'
          ? `Cleared${interest > 0 ? ` · +$${interest} interest` : ''}`
          : phase === 'grant'
            ? 'Council Grant'
            : phase === 'won'
              ? 'Held'
              : phase === 'lost'
                ? 'Fallen'
                : '…';
  return <span className={`phase-chip ${phase}`}>{text}</span>;
}

function SelectedTowerCard() {
  const sel = usePlan((p) => p.selected);
  const cash = useHud((s) => s.cash);
  if (!sel) return null;
  return (
    <section className="hud-panel tower-card" aria-label="Selected tower">
      <div className="tower-card-title" style={{ color: towerColor(sel.type) }}>
        {sel.name}
      </div>
      <dl>
        <div>
          <dt>Tier</dt>
          <dd>
            {sel.tier} of {sel.tiers}
            {sel.branchName ? ` · ${sel.branchName}` : ''}
          </dd>
        </div>
        <div>
          <dt>
            <label htmlFor="targeting">Targets</label>
          </dt>
          <dd>
            <select
              id="targeting"
              value={sel.targeting}
              onChange={(e) => setSelectedTargeting(e.target.value as TargetingMode)}
            >
              {TARGETING_MODES.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </dd>
        </div>
        <div>
          <dt>Hits</dt>
          <dd>{TOWERS[sel.type].targets.join(' + ')}</dd>
        </div>
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
      {sel.upgrades.length > 1 && (
        <div className="branch-choices" role="group" aria-label="Tier 3">
          {sel.upgrades.map((u) => (
            <button
              key={u.branch}
              type="button"
              className="branch"
              disabled={cash < u.cost}
              onClick={() => upgradeSelected(u.branch)}
            >
              <strong>{u.name}</strong>
              <span>{u.blurb}</span>
              <em>${u.cost}</em>
            </button>
          ))}
        </div>
      )}
      <div className="tower-card-actions">
        {sel.upgrades.length === 1 && (
          <button
            type="button"
            className="upgrade"
            disabled={cash < sel.upgrades[0]!.cost}
            onClick={() => upgradeSelected()}
          >
            Upgrade ${sel.upgrades[0]!.cost}
          </button>
        )}
        <button type="button" className="sell" onClick={() => sellTowerById(sel.id)}>
          Sell ${sel.sellValue}
        </button>
        <button type="button" aria-label="Close" onClick={() => selectTower(null)}>
          ✕
        </button>
      </div>
    </section>
  );
}

/** Selected wall (click a barricade with no tool): HP, repair (prep or wave), upgrade and sell (prep). */
function SelectedWallCard() {
  const wall = usePlan((p) => p.selectedWall);
  const cash = useHud((s) => s.cash);
  if (!wall) return null;
  return (
    <section className="hud-panel tower-card" aria-label="Selected barricade">
      <div className="tower-card-title" style={{ color: '#f2c14e' }}>
        {wall.name}
      </div>
      <dl>
        <div>
          <dt>HP</dt>
          <dd>
            {wall.hp} / {wall.maxHp}
          </dd>
        </div>
      </dl>
      <div className="tower-card-actions">
        {wall.repairCost > 0 && (
          <button
            type="button"
            className="upgrade"
            disabled={cash < wall.repairCost}
            onClick={() => repairSelectedWall()}
          >
            Repair ${wall.repairCost}
          </button>
        )}
        {wall.upgrade && wall.canEdit && (
          <button
            type="button"
            className="upgrade"
            disabled={cash < wall.upgrade.cost}
            onClick={() => upgradeSelectedWall()}
          >
            {wall.upgrade.name} ${wall.upgrade.cost}
          </button>
        )}
        {wall.canEdit && (
          <button type="button" className="sell" onClick={() => sellSelectedWall()}>
            Sell ${wall.sellValue}
          </button>
        )}
        <button type="button" aria-label="Close" onClick={() => selectWall(null)}>
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
