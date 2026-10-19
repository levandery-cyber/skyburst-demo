import test from 'node:test';
import assert from 'node:assert/strict';
import { crashFromHash, hmacSha256, sha256, randomSeed, crashPoint, verifyRound, MAX_BURST } from '../lib/fair.js';
import { multiplierAt, timeAt, floor2, payoutFor } from '../lib/curve.js';

// Small seeded PRNG so the Monte Carlo runs are reproducible.
function mulberry(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

test('SHA-256 and HMAC-SHA256 match published test vectors', async () => {
  assert.equal(await sha256('abc'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  assert.equal(
    await hmacSha256('key', 'The quick brown fox jumps over the lazy dog'),
    'f7bc83f430538424b13298e6aa6fb143ef4d59a14946175997479dbc2d1a3cd8',
  );
});

test('crashFromHash maps edge hashes sensibly', () => {
  assert.equal(crashFromHash('0'.repeat(64)), 1); // u = 0 -> 0.97x, clamped up to 1.00x
  assert.equal(crashFromHash('8' + '0'.repeat(63)), 1.94); // u = 0.5 -> 97 / 0.5 = 194
  assert.equal(crashFromHash('f'.repeat(64)), MAX_BURST);
});

test('RTP is about 97% for every cash-out target, and ~4% of rounds burst at 1.00x', () => {
  const rng = mulberry(2026);
  const N = 1_500_000;
  const targets = [1.2, 1.5, 2, 5, 10, 50];
  const paid = targets.map(() => 0);
  let instant = 0;
  for (let i = 0; i < N; i++) {
    const hi = Math.floor(rng() * 2 ** 26);
    const lo = Math.floor(rng() * 2 ** 26);
    const hex = (hi * 2 ** 26 + lo).toString(16).padStart(13, '0');
    const crash = crashFromHash(hex);
    if (crash === 1) instant++;
    targets.forEach((t, k) => {
      if (crash >= t) paid[k] += t;
    });
  }
  targets.forEach((t, k) => {
    const rtp = paid[k] / N;
    assert.ok(Math.abs(rtp - 0.97) < 0.02, `target ${t}x returned ${(rtp * 100).toFixed(2)}%`);
  });
  const expectedInstant = 1 - 0.97 / 1.01; // P(burst < 1.01)
  assert.ok(Math.abs(instant / N - expectedInstant) < 0.002, `instant bursts ${(instant / N) * 100}%`);
});

test('a round can be verified from its revealed seeds, and tampering is caught', async () => {
  const serverSeed = randomSeed(16);
  const clientSeed = 'demo-client';
  const nonce = 41;
  const commit = await sha256(serverSeed);
  const crash = await crashPoint(serverSeed, clientSeed, nonce);

  const ok = await verifyRound({ serverSeed, clientSeed, nonce, commit, crash });
  assert.deepEqual([ok.hashOk, ok.crashOk], [true, true]);

  const wrongSeed = await verifyRound({ serverSeed: randomSeed(16), clientSeed, nonce, commit, crash });
  assert.equal(wrongSeed.hashOk, false);

  const wrongCrash = await verifyRound({ serverSeed, clientSeed, nonce, commit, crash: crash + 0.01 });
  assert.equal(wrongCrash.crashOk, false);
});

test('curve helpers are consistent', () => {
  assert.equal(multiplierAt(0), 1);
  for (const m of [1.5, 2, 10, 137.5]) assert.ok(Math.abs(multiplierAt(timeAt(m)) - m) < 1e-9);
  assert.equal(floor2(2.999), 2.99);
  assert.equal(floor2(3), 3);
  assert.equal(payoutFor(333, 1.5), 499); // 499.5 rounds down to the cent
  assert.equal(payoutFor(1000, 2.48), 2480);
});
