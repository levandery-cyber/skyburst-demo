// Provably fair burst height.
//
//   hash = HMAC-SHA256(serverSeed, `${clientSeed}:${nonce}`)
//   u    = first 52 bits of hash / 2^52           (uniform in [0, 1))
//   burst = max(1, floor(97 / (1 - u)) / 100)
//
// P(burst >= x) = 0.97 / x for any x > 1, so every cash-out target returns 97% on average,
// and about 4% of rounds (1 - 0.97 / 1.01) burst at 1.00x. The server seed is committed to (published as a SHA-256
// hash) before the round and revealed after it. Web Crypto works in browsers and in Node 20+.

export const RTP = 97;
export const MAX_BURST = 10000;

const enc = new TextEncoder();

const toHex = (buf) => Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');

export function randomSeed(bytes = 16) {
  const a = new Uint8Array(bytes);
  crypto.getRandomValues(a);
  return toHex(a);
}

export async function sha256(text) {
  return toHex(await crypto.subtle.digest('SHA-256', enc.encode(text)));
}

export async function hmacSha256(key, message) {
  const k = await crypto.subtle.importKey('raw', enc.encode(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return toHex(await crypto.subtle.sign('HMAC', k, enc.encode(message)));
}

export function crashFromHash(hex) {
  const h = Number.parseInt(hex.slice(0, 13), 16);
  const u = h / 2 ** 52;
  const raw = Math.floor(RTP / (1 - u)) / 100;
  return Math.min(MAX_BURST, Math.max(1, raw));
}

export async function crashPoint(serverSeed, clientSeed, nonce) {
  return crashFromHash(await hmacSha256(serverSeed, `${clientSeed}:${nonce}`));
}

// Everything needed to re-check a finished round.
export async function verifyRound({ serverSeed, clientSeed, nonce, commit, crash }) {
  const [hash, point] = await Promise.all([sha256(serverSeed), crashPoint(serverSeed, clientSeed, nonce)]);
  return { hashOk: hash === commit, crashOk: point === crash, point, hash };
}
