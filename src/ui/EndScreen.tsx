import { restart } from '../game';
import { refreshPlanning } from '../planning';
import { useHud } from './store';

/** Win/lose overlay with the run's numbers and "Play again" (DESIGN §3.2). */
export function EndScreen() {
  const phase = useHud((s) => s.phase);
  const wave = useHud((s) => s.wave);
  const waveCount = useHud((s) => s.waveCount);
  const integrity = useHud((s) => s.integrity);
  const kills = useHud((s) => s.kills);
  const leaked = useHud((s) => s.leaked);
  const cash = useHud((s) => s.cash);
  if (phase !== 'won' && phase !== 'lost') return null;
  const won = phase === 'won';

  return (
    <div className="end-screen" role="dialog" aria-modal="true" aria-labelledby="end-title">
      <div className="end-card">
        <h1 id="end-title">{won ? 'City Hall held!' : 'City Hall has fallen'}</h1>
        <p>
          {won
            ? `All ${waveCount} waves repelled with ${integrity} Integrity left.`
            : `The swarm broke through on wave ${wave} of ${waveCount}.`}
        </p>
        <dl className="hud-stats">
          <dt>Bugs killed</dt>
          <dd>{kills}</dd>
          <dt>Reached City Hall</dt>
          <dd>{leaked}</dd>
          <dt>Cash left</dt>
          <dd>${cash}</dd>
        </dl>
        <button
          type="button"
          className="hud-go"
          autoFocus
          onClick={() => {
            restart();
            refreshPlanning(true);
          }}
        >
          Play again
        </button>
      </div>
    </div>
  );
}
