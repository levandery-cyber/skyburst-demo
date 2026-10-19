const line = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round' };

const num = (x) => Number(x.toFixed(2));

// Ten rays in the five firework colours, so the logo is a tiny burst.
export function Mark({ size = 28 }) {
  const colors = ['#ff5470', '#ffc247', '#3cc8ff', '#f7f9ff', '#4be3a0'];
  return (
    <svg viewBox="0 0 32 32" width={size} height={size} aria-hidden="true">
      {Array.from({ length: 10 }, (_, i) => {
        const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
        const r2 = i % 2 ? 12 : 15;
        return (
          <line
            key={i}
            x1={num(16 + Math.cos(a) * 7)}
            y1={num(16 + Math.sin(a) * 7)}
            x2={num(16 + Math.cos(a) * r2)}
            y2={num(16 + Math.sin(a) * r2)}
            stroke={colors[i % 5]}
            strokeWidth="2.4"
            strokeLinecap="round"
          />
        );
      })}
      <circle cx="16" cy="16" r="3.2" fill="#fff" />
    </svg>
  );
}

export function Coin({ size = 20 }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
      <circle cx="12" cy="12" r="10" fill="#ffc247" />
      <circle cx="12" cy="12" r="7" fill="none" stroke="#b9791a" strokeWidth="1.4" />
      <path d="M12 7.5l1.2 3.3 3.3 1.2-3.3 1.2L12 16.5l-1.2-3.3L7.5 12l3.3-1.2z" fill="#b9791a" />
    </svg>
  );
}

export const Speaker = () => (
  <svg viewBox="0 0 24 24" width="20" height="20" {...line} aria-hidden="true">
    <path d="M4 9.5v5h3.5L12 18.5v-13L7.5 9.5H4z" />
    <path d="M15.5 9a4 4 0 0 1 0 6" />
    <path d="M18 6.5a8 8 0 0 1 0 11" />
  </svg>
);

export const SpeakerOff = () => (
  <svg viewBox="0 0 24 24" width="20" height="20" {...line} aria-hidden="true">
    <path d="M4 9.5v5h3.5L12 18.5v-13L7.5 9.5H4z" />
    <path d="M16 9.5l5 5M21 9.5l-5 5" />
  </svg>
);

export const Shield = () => (
  <svg viewBox="0 0 24 24" width="16" height="16" {...line} aria-hidden="true">
    <path d="M12 3l7 3v5.5c0 4.2-2.9 7.6-7 9.5-4.1-1.9-7-5.3-7-9.5V6l7-3z" />
    <path d="M9 12l2.2 2.2L15.5 10" />
  </svg>
);

export const Help = () => (
  <svg viewBox="0 0 24 24" width="20" height="20" {...line} aria-hidden="true">
    <circle cx="12" cy="12" r="9" />
    <path d="M9.6 9.4a2.5 2.5 0 1 1 3.5 2.3c-.7.3-1.1.9-1.1 1.6" />
    <circle cx="12" cy="16.6" r=".6" fill="currentColor" />
  </svg>
);

export const Plus = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" {...line} aria-hidden="true">
    <path d="M12 5v14M5 12h14" />
  </svg>
);

export const Minus = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" {...line} aria-hidden="true">
    <path d="M5 12h14" />
  </svg>
);

export const Close = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" {...line} aria-hidden="true">
    <path d="M6 6l12 12M18 6L6 18" />
  </svg>
);

export const Send = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" {...line} aria-hidden="true">
    <path d="M4 12l16-8-6 16-3-6.5L4 12z" />
  </svg>
);

export const Check = () => (
  <svg viewBox="0 0 24 24" width="14" height="14" {...line} strokeWidth="2.4" aria-hidden="true">
    <path d="M5 12.5l4.2 4.2L19 7" />
  </svg>
);
