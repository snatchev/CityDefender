import { restartRun } from '../planning';
import { useHud } from './store';

/** Win/lose overlay with stars, score and the run's numbers, and "Play again" (DESIGN §3.2). */
export function EndScreen() {
  const s = useHud();
  if (s.phase !== 'won' && s.phase !== 'lost') return null;
  const won = s.phase === 'won';

  return (
    <div className="end-screen" role="dialog" aria-modal="true" aria-labelledby="end-title">
      <div className="hud-panel end-card">
        <h1 id="end-title">{won ? 'City Hall held!' : 'City Hall has fallen'}</h1>
        {won && (
          <div className="stars" aria-label={`${s.stars} of 3 stars`}>
            {[1, 2, 3].map((k) => (
              <span key={k} className={k <= s.stars ? 'on' : ''}>
                ★
              </span>
            ))}
          </div>
        )}
        <p>
          {won
            ? `All ${s.waveCount} waves repelled with ${s.integrity} Integrity left.`
            : `The swarm broke through on wave ${s.wave} of ${s.waveCount}.`}
        </p>
        <dl className="end-stats">
          {(
            [
              ['Score', s.score.toLocaleString()],
              ['Bugs killed', s.kills],
              ['Reached City Hall', s.leaked],
              ['Barricades lost', s.barricadesLost],
              ['Interest earned', `$${s.interestTotal}`],
              ['Cash left', `$${s.cash}`],
            ] as const
          ).map(([label, value]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
        <button type="button" className="start-wave" autoFocus onClick={() => restartRun()}>
          Play again
        </button>
      </div>
    </div>
  );
}
