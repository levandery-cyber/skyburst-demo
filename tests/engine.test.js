import test from 'node:test';
import assert from 'node:assert/strict';
import { Engine, CFG, floor2, payoutFor, timeAt } from '../lib/engine.js';
import { crashFromHash } from '../lib/fair.js';

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

const settle = () => new Promise((resolve) => setImmediate(resolve));

// An engine on a fake clock with scripted burst heights.
async function setup(crashes) {
  let i = 0;
  const clock = { t: 0 };
  const engine = new Engine({
    now: () => clock.t,
    rng: mulberry(7),
    storage: false,
    roundSource: async (nonce, clientSeed) => ({
      serverSeed: `seed-${nonce}`,
      commit: `commit-${nonce}`,
      crash: typeof crashes === 'function' ? crashes(nonce) : crashes[i++ % crashes.length],
      clientSeed,
      nonce,
    }),
  });
  await engine.init();
  await settle();
  const goTo = (t) => {
    // Tick the way the real loop does, in small steps.
    while (clock.t < t) {
      clock.t = Math.min(t, clock.t + 50);
      engine.tick(clock.t);
    }
  };
  return { engine, clock, goTo };
}

const bet = (engine, id = 'a') => engine.s.slots[id].bet;

test('boots into a waiting round with a committed hash and a warm history', async () => {
  const { engine } = await setup([2]);
  assert.equal(engine.s.phase, 'waiting');
  assert.equal(engine.s.commit, 'commit-0');
  assert.equal(engine.s.crash, null, 'the burst height stays hidden until the burst');
  assert.equal(engine.s.history.length, 24);
  assert.ok(engine.s.history.every((h) => h.warm));
});

test('manual cash-out pays bet x multiplier read from the clock', async () => {
  const { engine, clock, goTo } = await setup([5]);
  engine.setAmount('a', 1000);
  assert.ok(engine.placeBet('a'));
  assert.equal(engine.s.balance, CFG.startBalance - 1000);

  goTo(CFG.waitMs);
  assert.equal(engine.s.phase, 'flying');
  assert.equal(bet(engine).status, 'flying');

  clock.t = CFG.waitMs + 10_000;
  assert.ok(engine.cashOut('a', clock.t));
  const m = floor2(Math.exp(0.11 * 10));
  assert.equal(bet(engine).status, 'won');
  assert.equal(bet(engine).mult, m);
  assert.equal(engine.s.balance, CFG.startBalance - 1000 + payoutFor(1000, m));
  assert.equal(engine.s.myBets[0].payout, payoutFor(1000, m));
});

test('a bet that is not cashed out is lost when the shell bursts', async () => {
  const { engine, goTo } = await setup([1.5]);
  engine.placeBet('a');
  goTo(CFG.waitMs + timeAt(1.5) + 200);
  assert.equal(engine.s.phase, 'burst');
  assert.equal(engine.s.crash, 1.5);
  assert.equal(engine.s.serverSeed, 'seed-0');
  assert.equal(bet(engine).status, 'lost');
  assert.equal(engine.s.balance, CFG.startBalance - CFG.startBet);
  assert.equal(engine.s.history[0].crash, 1.5);
  assert.equal(engine.cashOut('a'), false);
});

test('an instant 1.00x burst cannot be cashed out', async () => {
  const { engine, clock, goTo } = await setup([1]);
  engine.placeBet('a');
  goTo(CFG.waitMs + 100);
  assert.equal(engine.s.phase, 'flying');
  assert.equal(engine.cashOut('a', clock.t), false);
  goTo(CFG.waitMs + CFG.minFlightMs + 50);
  assert.equal(engine.s.phase, 'burst');
  assert.equal(bet(engine).status, 'lost');
});

test('auto cash-out pays at the target even when the tick arrives late', async () => {
  const { engine, clock } = await setup([3.5]);
  engine.setAmount('a', 2000);
  engine.setAuto('a', { autoCash: true, at: 2 });
  engine.placeBet('a');
  clock.t = CFG.waitMs;
  engine.tick(clock.t);
  clock.t = CFG.waitMs + 60_000; // a hidden tab wakes up a minute later
  engine.tick(clock.t);
  assert.equal(bet(engine).status, 'won');
  assert.equal(bet(engine).mult, 2);
  assert.equal(engine.s.balance, CFG.startBalance - 2000 + 4000);
  assert.equal(engine.s.phase, 'burst');
});

test('auto cash-out at exactly the burst height still wins', async () => {
  const { engine, goTo } = await setup([2]);
  engine.setAuto('a', { autoCash: true, at: 2 });
  engine.placeBet('a');
  goTo(CFG.waitMs + timeAt(2) + 300);
  assert.equal(bet(engine).status, 'won');
});

test('auto cash-out above the burst height loses', async () => {
  const { engine, goTo } = await setup([1.8]);
  engine.setAuto('a', { autoCash: true, at: 2 });
  engine.placeBet('a');
  goTo(CFG.waitMs + timeAt(1.8) + 300);
  assert.equal(bet(engine).status, 'lost');
});

test('a bet placed mid-flight is queued for the next round, and can be cancelled for a refund', async () => {
  const { engine, goTo } = await setup([5, 5]);
  goTo(CFG.waitMs + 500);
  assert.equal(engine.s.phase, 'flying');

  assert.ok(engine.placeBet('a'));
  assert.equal(bet(engine).status, 'queued');
  assert.equal(engine.s.balance, CFG.startBalance - CFG.startBet);
  assert.equal(engine.s.feed.some((r) => r.mine), false, 'a queued bet is not on the table yet');

  assert.ok(engine.placeBet('b'));
  assert.ok(engine.cancelBet('b'));
  assert.equal(bet(engine, 'b'), null);
  assert.equal(engine.s.balance, CFG.startBalance - CFG.startBet);

  goTo(CFG.waitMs + timeAt(5) + CFG.burstMs + 300);
  assert.equal(engine.s.phase, 'waiting');
  assert.equal(engine.s.roundId, 2);
  assert.equal(bet(engine).status, 'placed');
  assert.equal(engine.s.feed.filter((r) => r.mine).length, 1);
});

test('cancelling during the countdown refunds and removes the row; flying bets cannot be cancelled', async () => {
  const { engine, goTo } = await setup([4]);
  engine.placeBet('a');
  assert.equal(engine.s.feed.filter((r) => r.mine).length, 1);
  assert.ok(engine.cancelBet('a'));
  assert.equal(engine.s.balance, CFG.startBalance);
  assert.equal(engine.s.feed.filter((r) => r.mine).length, 0);

  engine.placeBet('a');
  goTo(CFG.waitMs + 100);
  assert.equal(engine.cancelBet('a'), false);
});

test('rebet places the same bet again at the start of the next round', async () => {
  const { engine, goTo } = await setup([1.2, 3]);
  engine.setAuto('a', { rebet: true });
  engine.placeBet('a');
  goTo(CFG.waitMs + timeAt(1.2) + CFG.burstMs + 300);
  assert.equal(engine.s.roundId, 2);
  assert.equal(engine.s.phase, 'waiting');
  assert.equal(bet(engine).status, 'placed');
  assert.equal(engine.s.balance, CFG.startBalance - 2 * CFG.startBet);
});

test('refuses a bet larger than the balance and reports it', async () => {
  const { engine } = await setup([2]);
  const toasts = [];
  engine.on('toast', (t) => toasts.push(t));
  engine.s.balance = 500;
  engine.setAmount('a', 1000);
  assert.equal(engine.placeBet('a'), false);
  assert.equal(engine.s.balance, 500);
  assert.equal(toasts[0].kind, 'error');
});

test('the table fills with bots during the countdown and they resolve at the burst', async () => {
  const { engine, goTo } = await setup([4]);
  goTo(CFG.fillMs + 100);
  assert.ok(engine.s.feedCount >= 70, `only ${engine.s.feedCount} bets`);
  goTo(CFG.waitMs + timeAt(4) + 300);
  assert.equal(engine.s.phase, 'burst');
  assert.ok(engine.s.feed.every((r) => r.status !== 'placed'), 'every bet is settled after the burst');
  const winners = engine.s.feed.filter((r) => r.status === 'won');
  assert.ok(winners.length > 0 && winners.every((r) => r.mult <= 4));
});

test('balance is conserved over many rounds of automatic play', async () => {
  const rng = mulberry(99);
  const hexOf = () => Array.from({ length: 16 }, () => Math.floor(rng() * 16).toString(16)).join('');
  const { engine, clock, goTo } = await setup((nonce) => {
    void nonce;
    return crashFromHash(hexOf());
  });
  let staked = 0;
  let paid = 0;
  let wins = 0;
  let losses = 0;
  engine.on('bet', (e) => {
    staked += e.amount;
  });
  engine.on('cashout', (e) => {
    paid += e.payout;
    wins++;
  });
  engine.on('lose', () => {
    losses++;
  });

  engine.setAuto('a', { autoCash: true, at: 1.5, rebet: true });
  engine.setAuto('b', { autoCash: true, at: 3, rebet: true });
  engine.placeBet('a');
  engine.placeBet('b');

  const rounds = 120;
  while (engine.s.roundId <= rounds || engine.s.phase !== 'waiting') {
    goTo(clock.t + 1000);
    await settle();
    assert.ok(clock.t < 5_000_000, 'rounds stopped advancing');
  }

  assert.equal(engine.s.balance, CFG.startBalance - staked + paid, 'every cent is accounted for');
  assert.ok(Number.isInteger(engine.s.balance));
  assert.ok(wins > 0 && losses > 0, `wins ${wins}, losses ${losses}`);
  // Two bets in every finished round. The current round is only waiting, so nothing there has settled.
  assert.equal(wins + losses, 2 * (engine.s.roundId - 1));
});
