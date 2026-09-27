/** Small inline SVG icons for the HUD (no image assets). `currentColor` follows the CSS colour. */

export function SawhorseIcon() {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true">
      <rect x="3" y="9" width="26" height="6" rx="1" fill="currentColor" />
      <path
        d="M5 9 L3 15 M9 9 L7 15 M13 9 L11 15 M17 9 L15 15 M21 9 L19 15 M25 9 L23 15"
        stroke="#1b1d22"
        strokeWidth="2"
      />
      <path
        d="M7 15 L4 28 M25 15 L28 28 M7 15 L10 28 M25 15 L22 28"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function MgNestIcon() {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true">
      <rect x="7" y="18" width="18" height="10" rx="2" fill="currentColor" />
      <circle cx="16" cy="16" r="6" fill="currentColor" />
      <rect x="16" y="13" width="14" height="3" rx="1.5" fill="currentColor" />
    </svg>
  );
}

export function SpeedIcon({ scale }: { scale: number }) {
  if (scale === 0) {
    return (
      <svg viewBox="0 0 32 32" aria-hidden="true">
        <rect x="8" y="7" width="6" height="18" rx="1.5" fill="currentColor" />
        <rect x="18" y="7" width="6" height="18" rx="1.5" fill="currentColor" />
      </svg>
    );
  }
  const w = 22 / scale;
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true">
      {Array.from({ length: scale }, (_, k) => (
        <path
          key={k}
          d={`M${5 + k * w} 7 L${5 + k * w + w} 16 L${5 + k * w} 25 Z`}
          fill="currentColor"
        />
      ))}
    </svg>
  );
}

export function GearIcon() {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true">
      <path
        fill="currentColor"
        d="M13.5 3h5l.8 3.4 2.4 1 3-1.8 3.5 3.5-1.8 3 1 2.4 3.4.8v5l-3.4.8-1 2.4 1.8 3-3.5 3.5-3-1.8-2.4 1-.8 3.4h-5l-.8-3.4-2.4-1-3 1.8-3.5-3.5 1.8-3-1-2.4L3 18.5v-5l3.4-.8 1-2.4-1.8-3 3.5-3.5 3 1.8 2.4-1zM16 11a5 5 0 1 0 0 10 5 5 0 0 0 0-10z"
      />
    </svg>
  );
}
