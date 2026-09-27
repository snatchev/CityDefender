import { setTimeScale } from '../game';
import { SpeedIcon } from './icons';
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
