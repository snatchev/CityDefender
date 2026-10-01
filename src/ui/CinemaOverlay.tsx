import { useEffect } from 'react';
import { skipCutscene, useCinema } from './cinema';

/**
 * What a cutscene shows on screen (branch down-the-street, D054): letterbox bars, the breach
 * banner with the incoming bugs flying in, and the boss / elite title card (Kirby and the Forgotten
 * Land style: colour bands sweep across a freeze frame, an epithet over a huge name, a factoid
 * underneath). Click anywhere, Esc or Space skips.
 */
export function CinemaOverlay() {
  const cut = useCinema((s) => s.cut);
  const card = useCinema((s) => s.card);

  useEffect(() => {
    if (!cut) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Escape' || e.code === 'Space') {
        e.preventDefault();
        e.stopImmediatePropagation();
        skipCutscene();
      }
    };
    window.addEventListener('keydown', onKey, { capture: true });
    document.body.classList.add('cinematic');
    return () => {
      window.removeEventListener('keydown', onKey, { capture: true });
      document.body.classList.remove('cinematic');
    };
  }, [cut]);

  if (!cut) return null;
  return (
    <div className="cinema" onClick={skipCutscene} role="presentation">
      <div className="cinema-bar top" />
      <div className="cinema-bar bottom" />
      {card?.kind === 'breach' && (
        <div className="breach-card">
          <div className="breach-head">
            <span className="breach-icon">⚠</span>
            <span className="breach-station">{card.station}</span>
            <span className="breach-word">breached</span>
          </div>
          <ul className="breach-lines">
            {card.lines.map((l, i) => (
              <li key={i} className={l.tone} style={{ animationDelay: `${0.25 + i * 0.14}s` }}>
                <span className="breach-count">×{l.count}</span>
                <span>{l.label}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {(card?.kind === 'boss' || card?.kind === 'elite') && (
        <div className={`intro-card ${card.kind}`}>
          <div className="intro-band one" />
          <div className="intro-band two" />
          <div className="intro-text">
            <div className="intro-tag">{card.kind === 'boss' ? 'Boss' : 'Elite'}</div>
            <div className="intro-epithet">{card.epithet}</div>
            <div className="intro-name">{card.name}</div>
            <div className="intro-fact">{card.factoid}</div>
          </div>
        </div>
      )}
      <div className="cinema-skip">Click or Space to skip</div>
    </div>
  );
}
