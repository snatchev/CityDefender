import { useEffect } from 'react';
import { skipCutscene, useCinema, type IntroKind } from './cinema';

const TAG: Record<IntroKind, string> = { boss: 'Boss', elite: 'Elite', new: 'New threat' };

/**
 * What an introduction shows on screen (branch down-the-street, D054, D057): letterbox bars and
 * the title card (Kirby and the Forgotten Land style: colour bands sweep across a freeze frame, an
 * epithet over a huge name, a factoid underneath). Click anywhere, Esc or Space skips.
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
      {card && (
        <div className={`intro-card ${card.kind}`}>
          <div className="intro-band one" />
          <div className="intro-band two" />
          <div className="intro-text">
            <div className="intro-tag">{TAG[card.kind]}</div>
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
