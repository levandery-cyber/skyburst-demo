const nf = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Amounts travel as integer cents.
export const cents = (c) => nf.format((c || 0) / 100);

export const clamp = (x, lo, hi) => (x < lo ? lo : x > hi ? hi : x);

// Colours follow firework chemistry: strontium red, sodium gold, copper blue, magnesium white.
// The rarer the metal, the rarer the burst.
export const tierOf = (m) => (m >= 100 ? 'mg' : m >= 10 ? 'cu' : m >= 2 ? 'na' : 'sr');

// "12,5" and "12.5" both mean twelve and a half. Returns cents, or NaN.
export function parseCredits(text) {
  const n = Number.parseFloat(String(text).trim().replace(',', '.'));
  return Number.isFinite(n) ? Math.round(n * 100) : NaN;
}

export const timeLabel = (ts) =>
  new Date(ts).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

export const shorten = (hex, n = 8) => (hex && hex.length > n * 2 + 1 ? `${hex.slice(0, n)}…${hex.slice(-n)}` : hex || '');
