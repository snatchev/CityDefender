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

export function JerseyIcon() {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true">
      <path d="M4 28 L9 14 L11 8 H21 L23 14 L28 28 Z" fill="currentColor" />
      <path d="M8 21 H24" stroke="#1b1d22" strokeWidth="2" />
    </svg>
  );
}

export function MortarIcon() {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true">
      <rect x="5" y="22" width="22" height="6" rx="2" fill="currentColor" />
      <rect
        x="12"
        y="5"
        width="8"
        height="19"
        rx="2"
        fill="currentColor"
        transform="rotate(30 16 22)"
      />
    </svg>
  );
}

export function CryoIcon() {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true">
      <path
        d="M16 3 V29 M4.7 9.5 L27.3 22.5 M4.7 22.5 L27.3 9.5"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
      <circle cx="16" cy="16" r="4.5" fill="currentColor" />
    </svg>
  );
}

export function RailgunIcon() {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true">
      <rect x="4" y="19" width="12" height="9" rx="2" fill="currentColor" />
      <rect x="10" y="10" width="20" height="3" rx="1" fill="currentColor" />
      <rect x="10" y="15" width="20" height="3" rx="1" fill="currentColor" />
      <rect x="8" y="9" width="6" height="12" rx="1.5" fill="currentColor" />
    </svg>
  );
}

export function BusWallIcon() {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true">
      <rect x="2" y="9" width="28" height="15" rx="3" fill="currentColor" />
      <rect x="5" y="12" width="5" height="5" rx="1" fill="#1b1d22" />
      <rect x="12" y="12" width="5" height="5" rx="1" fill="#1b1d22" />
      <rect x="19" y="12" width="5" height="5" rx="1" fill="#1b1d22" />
      <circle cx="8" cy="25" r="2.5" fill="currentColor" />
      <circle cx="24" cy="25" r="2.5" fill="currentColor" />
    </svg>
  );
}

export function BlastWallIcon() {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true">
      <rect x="3" y="6" width="26" height="22" rx="1.5" fill="currentColor" />
      <path
        d="M3 13 H29 M3 20 H29 M11 6 V13 M21 13 V20 M11 20 V28"
        stroke="#1b1d22"
        strokeWidth="1.6"
      />
    </svg>
  );
}

export function SpikeStripIcon() {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true">
      <rect x="2" y="20" width="28" height="5" rx="1" fill="currentColor" />
      <path
        d="M4 20 L7 12 L10 20 M10 20 L13 12 L16 20 M16 20 L19 12 L22 20 M22 20 L25 12 L28 20"
        fill="currentColor"
      />
    </svg>
  );
}

export function FlakIcon() {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true">
      <rect x="6" y="20" width="20" height="8" rx="2" fill="currentColor" />
      <rect
        x="9"
        y="4"
        width="4"
        height="17"
        rx="1.5"
        fill="currentColor"
        transform="rotate(-15 11 20)"
      />
      <rect
        x="19"
        y="4"
        width="4"
        height="17"
        rx="1.5"
        fill="currentColor"
        transform="rotate(15 21 20)"
      />
    </svg>
  );
}

export function TeslaIcon() {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true">
      <circle cx="16" cy="7" r="5" fill="currentColor" />
      <rect x="13" y="12" width="6" height="16" rx="2" fill="currentColor" />
      <path d="M9 16 H23 M9 21 H23" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}

export function SeismicIcon() {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true">
      <path
        d="M2 18 H8 L11 10 L15 26 L19 6 L22 18 H30"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinejoin="round"
      />
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
