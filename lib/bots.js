// Simulated players and chat. Nothing here talks to a server: it only makes the table feel alive.

const FIRST = [
  'nova', 'pixel', 'ghost', 'lucky', 'zen', 'turbo', 'neon', 'mango', 'orbit', 'frost',
  'velvet', 'ember', 'koi', 'storm', 'cedar', 'atlas', 'moss', 'pepper', 'comet', 'jade',
  'rift', 'sable', 'quartz', 'indigo', 'fable', 'tango', 'wisp', 'yeti', 'onyx', 'blitz',
  'mint', 'echo', 'flux', 'hazel', 'lumen', 'rook', 'sol', 'tide', 'vex', 'wren',
];
const LAST = [
  'fox', 'cat', 'owl', 'wolf', 'jay', 'ray', 'moth', 'lynx', 'crab', 'hawk',
  'bear', 'ibis', 'kite', 'seal', 'swan', 'toad', 'wasp', 'mole', 'pike', 'lark',
];

const pick = (rng, list) => list[Math.floor(rng() * list.length)];
const cap = (s) => s[0].toUpperCase() + s.slice(1);

export function hueOf(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) % 360;
  return h;
}

export function makeName(rng) {
  const a = pick(rng, FIRST);
  const r = rng();
  if (r < 0.34) return a + pick(rng, LAST);
  if (r < 0.7) return `${a}_${1 + Math.floor(rng() * 99)}`;
  if (r < 0.86) return `${a}${rng() < 0.5 ? 'x' : 'z'}${Math.floor(rng() * 10)}`;
  return cap(a) + cap(pick(rng, LAST));
}

// [cents, weight]: mostly small stakes, a few whales.
const AMOUNTS = [
  [100, 14], [200, 12], [300, 8], [500, 18], [1000, 18], [1500, 5],
  [2000, 8], [2500, 5], [5000, 6], [10000, 4], [20000, 1.4], [50000, 0.5],
];
const AMOUNT_TOTAL = AMOUNTS.reduce((sum, [, w]) => sum + w, 0);

function pickAmount(rng) {
  let r = rng() * AMOUNT_TOTAL;
  for (const [value, weight] of AMOUNTS) {
    r -= weight;
    if (r <= 0) return value;
  }
  return 500;
}

const round2 = (x) => Math.round(x * 100) / 100;

// The multiplier each bot cashes out at. Independent of the real burst, so results look natural.
function pickTarget(rng) {
  const r = rng();
  if (r < 0.12) return null; // rides it to the end
  if (r < 0.52) return round2(1.15 + rng() * 1.05);
  if (r < 0.78) return round2(2.2 + rng() * 2.8);
  if (r < 0.93) return round2(5 + rng() * 10);
  if (r < 0.985) return round2(15 + rng() * 60);
  return round2(75 + rng() * 425);
}

export function makeBotRound(rng, fillMs = 3400, count) {
  const n = count ?? 70 + Math.floor(rng() * 70);
  const used = new Set();
  const bots = [];
  for (let i = 0; i < n; i++) {
    let name = makeName(rng);
    for (let guard = 0; used.has(name) && guard < 6; guard++) name = makeName(rng);
    used.add(name);
    bots.push({
      id: `b${i}`,
      name,
      hue: hueOf(name),
      amount: pickAmount(rng),
      target: pickTarget(rng),
      placeAt: Math.floor(rng() ** 1.5 * fillMs),
    });
  }
  return bots.sort((a, b) => a.placeAt - b.placeAt);
}

const IDLE = [
  'gl everyone', 'lets go', 'fuse is lit', 'auto 1.5 and chill', 'who is holding for 10x?',
  'the burst animation is so clean', 'sound on, trust me', 'one more round', 'ok this is addictive',
  'patience, patience', 'greed is a bad advisor', 'easy plus', 'always the 1.0x when i go big lol',
  'hi from kyiv', 'warsaw checking in', 'hello from lisbon', 'berlin here', 'good evening all',
  'cashing out at 2 every time', 'rebet is a trap', 'two bets, two plans', 'no luck today', 'back at it',
];
const LOW = ['1.0x lol', 'dud again', 'instant burst, rip', 'that was fast', 'who bet on that one', 'blink and you miss it'];
const MID = ['nice one', 'out at 2.1, happy', 'meh', 'ok ok', 'could have waited', 'fair enough'];
const HIGH = ['10x!!!', 'woooow', 'huge one', 'i was out at 2 😭', 'that was beautiful', 'who rode it?'];
const MOON = ['100x??', 'ok that is insane', 'screenshot this', 'i left at 1.5, never again'];
const REPLY = ['lol', 'same', 'true', 'gl!', 'haha', '👍', 'facts'];

export const idleLine = (rng) => pick(rng, IDLE);
export const replyLine = (rng) => pick(rng, REPLY);

export function reactionLine(rng, crash) {
  if (rng() < 0.35) return null;
  if (crash >= 100) return pick(rng, MOON);
  if (crash >= 10) return pick(rng, HIGH);
  if (crash < 1.2) return pick(rng, LOW);
  return pick(rng, MID);
}
