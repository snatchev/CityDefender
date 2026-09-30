import { useEffect, useState } from 'react';
import { chooseGrant, discardSave, game, resumeRun, savedRun, setTimeScale } from '../game';
import { useHud } from './store';

/** Council Grant (DESIGN §10.6): every few waves the run waits for the player to pick one of three. */
export function GrantPicker() {
  const offer = useHud((s) => s.grantOffer);
  const phase = useHud((s) => s.phase);
  if (phase !== 'grant' || !offer) return null;
  return (
    <div className="end-screen" role="dialog" aria-modal="true" aria-labelledby="grant-title">
      <div className="hud-panel grant-card">
        <h1 id="grant-title">Council Grant</h1>
        <div className="grant-choices">
          {offer.map((g) => (
            <button key={g.id} type="button" className="grant" onClick={() => chooseGrant(g.id)}>
              <strong>{g.name}</strong>
              <span>{g.text}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * On a fresh load with a saved run, offer to continue it or start fresh. The game waits (paused)
 * until the player decides; choosing a new run forgets the save.
 */
export function ResumePrompt() {
  const city = useHud((s) => s.city);
  const phase = useHud((s) => s.phase);
  const [decided, setDecided] = useState(false);
  const [offer, setOffer] = useState<ReturnType<typeof savedRun>>(null);
  useEffect(() => {
    // Wait for the city to load and its first run to start before deciding.
    if (!city || decided || phase === 'idle') return;
    const found = savedRun();
    const fresh = game.world.phase === 'prep' && game.world.wave === 0;
    if (found && fresh) {
      setOffer(found);
      setTimeScale(0);
    } else {
      setDecided(true);
    }
  }, [city, decided, phase]);
  if (!offer || decided) return null;
  const done = () => {
    setDecided(true);
    setTimeScale(1);
  };
  return (
    <div className="end-screen" role="dialog" aria-modal="true" aria-labelledby="resume-title">
      <div className="hud-panel end-card">
        <h1 id="resume-title">Run in progress</h1>
        <p>
          Wave {offer.wave + 1} · City Hall {offer.integrity} · ${offer.cash}
        </p>
        <div className="resume-actions">
          <button
            type="button"
            className="start-wave"
            autoFocus
            onClick={() => {
              resumeRun();
              done();
            }}
          >
            Continue
          </button>
          <button
            type="button"
            className="secondary"
            onClick={() => {
              discardSave();
              done();
            }}
          >
            New run
          </button>
        </div>
      </div>
    </div>
  );
}
