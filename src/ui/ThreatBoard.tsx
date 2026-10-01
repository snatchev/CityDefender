import { useEffect } from 'react';
import { MOBS } from '../sim/mobs';
import { usePlan } from './planStore';
import { engageThreat, mobLabel, useThreats, type Threat } from './threats';

/** The marquee word on cards that need a look. */
const ALARM: Partial<Record<Threat['state'], string>> = {
  danger: 'DANGER',
  elite: 'ELITE',
  boss: 'BOSS',
};

const LABEL: Record<Threat['state'], string> = {
  incoming: 'Incoming',
  danger: 'Breach!',
  elite: 'Elite!',
  boss: 'Boss!',
  engaged: 'Engaged',
  clear: 'Clear',
};

/**
 * The threat board (branch down-the-street, D054): every station sending bugs this wave, and the
 * way to switch the camera between their tracks. Cards that need a look flash (DANGER when a
 * station starts spawning, ELITE / BOSS when one comes out); clicking one plays its cutscene, then
 * leaves the camera on that track. 1–9 do the same as clicking the card. The track the camera is
 * on is marked.
 */
export function ThreatBoard() {
  const threats = useThreats((s) => s.threats);
  const next = useThreats((s) => s.nextBreaches);
  const track = usePlan((p) => p.focus?.station);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || e.target instanceof HTMLInputElement) return;
      const n = Number(e.key);
      const t = useThreats.getState().threats[n - 1];
      if (Number.isInteger(n) && n >= 1 && t) engageThreat(t.station);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  if (threats.length === 0 && next.length === 0) return null;
  return (
    <section className="threat-board" aria-label="Threats">
      {threats.map((t, i) => (
        <ThreatCard key={t.station} t={t} index={i} tracking={t.station === track} />
      ))}
      {next.map((name) => (
        <div key={name} className="threat-next">
          Tremors under <strong>{name}</strong>
        </div>
      ))}
    </section>
  );
}

function ThreatCard({ t, index, tracking }: { t: Threat; index: number; tracking: boolean }) {
  const alarm = ALARM[t.state];
  const headline =
    t.state === 'boss' && t.boss
      ? MOBS[t.boss].name
      : t.state === 'elite' && t.elite
        ? mobLabel(t.elite.type, t.elite.elite, 2)
        : null;
  return (
    <button
      type="button"
      className={`threat-card ${t.state}${tracking ? ' tracking' : ''}`}
      onClick={() => engageThreat(t.station)}
      aria-label={`${t.name}: ${LABEL[t.state]}${headline ? `, ${headline}` : ''}`}
    >
      {alarm && (
        <span className="threat-marquee" aria-hidden="true">
          <span>{`${alarm} · `.repeat(8)}</span>
          <span>{`${alarm} · `.repeat(8)}</span>
        </span>
      )}
      <span className="threat-key" aria-hidden="true">
        {index + 1}
      </span>
      <span className="threat-body">
        <span className="threat-top">
          <span className="threat-name">{t.name}</span>
          <span className="threat-state">
            {tracking && t.state !== 'boss' && t.state !== 'elite' && t.state !== 'danger'
              ? 'Tracking'
              : LABEL[t.state]}
          </span>
        </span>
        {headline && <span className="threat-headline">{headline}</span>}
        <span className="threat-mobs">
          {t.groups.map((g) => `${g.count}× ${mobLabel(g.type, g.elite, g.count)}`).join(' · ')}
          {t.alive > 0 ? ` — ${t.alive} out` : ''}
        </span>
      </span>
    </button>
  );
}
