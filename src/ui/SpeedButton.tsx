import { setTimeScale } from '../game';
import { toggleTactical } from '../planning';
import { SpeedIcon, TacticalIcon } from './icons';
import { usePlan } from './planStore';
import { useHud } from './store';

/** Pause → 1× → 2× → 3× → pause. */
const CYCLE = [0, 1, 2, 3] as const;
const LABEL: Record<number, string> = { 0: 'Paused', 1: '1×', 2: '2×', 3: '3×' };

/** One big button that cycles the game speed (under the minimap). */
export function SpeedButton() {
  const scale = useHud((s) => s.timeScale);
  const next = CYCLE[(CYCLE.indexOf(scale as (typeof CYCLE)[number]) + 1) % CYCLE.length]!;
  return (
    <button
      type="button"
      className={`speed-button${scale === 0 ? ' paused' : ''}`}
      aria-label={`Game speed: ${LABEL[scale] ?? scale}. Change to ${LABEL[next]}`}
      onClick={() => setTimeScale(next)}
    >
      <SpeedIcon scale={scale} />
      <span>{LABEL[scale] ?? `${scale}×`}</span>
    </button>
  );
}

/** Tactical view toggle (D050), beside the speed button; T does the same. */
export function TacticalButton() {
  const on = usePlan((p) => p.tactical);
  return (
    <button
      type="button"
      className={`tactical-button${on ? ' on' : ''}`}
      aria-pressed={on}
      aria-label="Tactical view"
      title="Tactical view (T)"
      onClick={toggleTactical}
    >
      <TacticalIcon />
    </button>
  );
}
