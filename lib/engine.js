// Game engine: round lifecycle, bets and the simulated table. Framework-free, so it runs in Node tests too.
//
// A round is  waiting -> flying -> burst -> waiting ...
// Money is integer cents. Times come from an injectable monotonic clock (ms).
import { multiplierAt, timeAt, floor2, payoutFor } from './curve.js';
import { crashFromHash, crashPoint, randomSeed, sha256 } from './fair.js';
import { makeBotRound, makeName, hueOf, idleLine, replyLine, reactionLine } from './bots.js';
import { loadSaved, saveState } from './storage.js';
import { cents, clamp } from './format.js';

export { multiplierAt, timeAt, floor2, payoutFor };

export const CFG = Object.freeze({
  waitMs: 6000,
  burstMs: 3800,
  minFlightMs: 500,
  fillMs: 3400,
  minBet: 100,
  maxBet: 50000,
  startBalance: 100000,
  startBet: 1000,
  minAuto: 1.01,
  maxAuto: 10000,
  historyLen: 40,
  chatLen: 60,
  rainValue: 500,
  rainSlots: 8,
});

const SLOTS = ['a', 'b'];
const ME = { name: 'You', hue: 268 };

const newSlot = () => ({ amount: CFG.startBet, autoCash: false, at: 2, rebet: false, bet: null });
const isLive = (b) => !!b && (b.status === 'placed' || b.status === 'queued' || b.status === 'flying');
const hex = (rng, n) => Array.from({ length: n }, () => Math.floor(rng() * 16).toString(16)).join('');

// What the server renders and what the UI shows before the engine boots.
export const INITIAL = Object.freeze({
  ready: false,
  phase: 'boot',
  roundId: 0,
  commit: '',
  nonce: 0,
  clientSeed: '',
  flyAt: 0,
  burstAt: 0,
  crash: null,
  serverSeed: null,
  balance: CFG.startBalance,
  sound: false,
  slots: Object.freeze({ a: newSlot(), b: newSlot() }),
  feed: [],
  feedCount: 0,
  inAir: 0,
  totalWin: 0,
  history: [],
  myBets: [],
  top: [],
  chat: [],
  rain: null,
});

export async function defaultRoundSource(nonce, clientSeed) {
  const serverSeed = randomSeed(16);
  const [commit, crash] = await Promise.all([sha256(serverSeed), crashPoint(serverSeed, clientSeed, nonce)]);
  return { serverSeed, commit, crash, clientSeed, nonce };
}

export class Engine {
  constructor(opts = {}) {
    this.now = opts.now || (() => performance.now());
    this.rng = opts.rng || Math.random;
    this.source = opts.roundSource || defaultRoundSource;
    this.persist = opts.storage !== false;

    this.s = { ...INITIAL, slots: { a: newSlot(), b: newSlot() } };
    this.snap = INITIAL;
    this.listeners = new Set();
    this.handlers = new Map();
    this.timer = 0;
    this.started = false;
    this.initPromise = null;
    this.dirty = false;
    this.feedDirty = false;
    this.lastEmit = -1e9;
    this.uid = 0;
    this.nonce = 0;

    this.round = null; // private: the live round, including the real burst height
    this.next = null; // the round after it, prefetched
    this.prefetching = false;
    this.bots = [];
    this.botIdx = 0;
    this.targets = [];
    this.ti = 0;
    this.waitStart = 0;
    this.feedMap = new Map();
    this.seq = 0;

    this.chatters = [];
    this.nextChatAt = 0;
    this.reactAt = 0;
    this.reactCrash = 0;
    this.replyAt = 0;
    this.lastSent = -1e9;
    this.nextRainAt = 0;
    this.nextClaimAt = 0;
    this.saveTimer = 0;

    this.subscribe = (fn) => {
      this.listeners.add(fn);
      return () => {
        this.listeners.delete(fn);
      };
    };
    this.getSnapshot = () => this.snap;
    this.getServerSnapshot = () => INITIAL;
  }

  // ---- events -------------------------------------------------------------

  on(type, fn) {
    if (!this.handlers.has(type)) this.handlers.set(type, new Set());
    this.handlers.get(type).add(fn);
    return () => {
      this.handlers.get(type)?.delete(fn);
    };
  }

  emitEvent(type, payload) {
    this.handlers.get(type)?.forEach((fn) => fn(payload));
  }

  toast(kind, text, amount) {
    this.emitEvent('toast', { id: ++this.uid, kind, text, amount });
  }

  // ---- lifecycle ----------------------------------------------------------

  // Safe to call twice (React strict mode mounts, unmounts and mounts again).
  start() {
    this.started = true;
    if (!this.initPromise) {
      this.initPromise = this.init().catch((e) => {
        console.error('[skyburst] init failed', e);
      });
    }
    this.initPromise.then(() => {
      if (this.started && !this.timer && this.s.ready) this.timer = setInterval(() => this.tick(), 100);
    });
  }

  stop() {
    this.started = false;
    clearInterval(this.timer);
    this.timer = 0;
  }

  async init() {
    const s = this.s;
    if (this.persist) this.applySaved(loadSaved());
    if (!s.clientSeed) s.clientSeed = randomSeed(6);

    this.chatters = Array.from({ length: 16 }, () => {
      const name = makeName(this.rng);
      return { name, hue: hueOf(name) };
    });
    this.warmup();

    this.next = await this.makeRound();
    const now = this.now();
    this.startWaiting(now);
    s.ready = true;
    this.nextChatAt = now + 1500;
    this.nextRainAt = now + 40000;
    this.commit(true);
  }

  async makeRound() {
    const nonce = this.nonce++;
    const r = await this.source(nonce, this.s.clientSeed);
    return { ...r, id: nonce + 1 };
  }

  queueRound() {
    if (this.prefetching || this.next) return;
    this.prefetching = true;
    this.makeRound()
      .then((r) => {
        this.next = r;
      })
      .catch((e) => console.error('[skyburst] round source failed', e))
      .finally(() => {
        this.prefetching = false;
      });
  }

  // Fills the history strip and the top list so the first screen is not empty.
  warmup() {
    const s = this.s;
    s.history = Array.from({ length: 24 }, (_, i) => ({
      id: -(i + 1),
      crash: crashFromHash(hex(this.rng, 16)),
      warm: true,
    }));
    for (let i = 0; i < 5; i++) {
      const crash = s.history[i].crash;
      for (const b of makeBotRound(this.rng, 0)) {
        if (b.target != null && b.target <= crash) {
          this.addTop({ name: b.name, hue: b.hue, amount: b.amount, mult: b.target, payout: payoutFor(b.amount, b.target), mine: false });
        }
      }
    }
  }

  applySaved(sv) {
    if (!sv || sv.v !== 1) return;
    const s = this.s;
    if (Number.isFinite(sv.balance) && sv.balance >= 0) s.balance = Math.round(sv.balance);
    for (const id of SLOTS) {
      const q = sv.slots?.[id];
      if (!q) continue;
      const slot = newSlot();
      if (Number.isFinite(q.amount)) slot.amount = clamp(Math.round(q.amount), CFG.minBet, CFG.maxBet);
      if (typeof q.autoCash === 'boolean') slot.autoCash = q.autoCash;
      if (typeof q.rebet === 'boolean') slot.rebet = q.rebet;
      if (Number.isFinite(q.at)) slot.at = clamp(q.at, CFG.minAuto, CFG.maxAuto);
      s.slots = { ...s.slots, [id]: slot };
    }
    if (Array.isArray(sv.myBets)) s.myBets = sv.myBets.filter((b) => b && Number.isFinite(b.amount)).slice(0, 50);
    if (Number.isFinite(sv.nonce)) this.nonce = sv.nonce;
    if (typeof sv.clientSeed === 'string' && sv.clientSeed) s.clientSeed = sv.clientSeed.slice(0, 32);
    if (typeof sv.sound === 'boolean') s.sound = sv.sound;
  }

  persistSoon() {
    if (!this.persist || this.saveTimer) return;
    this.saveTimer = setTimeout(() => {
      this.saveTimer = 0;
      this.persistNow();
    }, 350);
  }

  persistNow() {
    const s = this.s;
    // A bet that can still be cancelled counts as cancelled if the page is reloaded.
    let refund = 0;
    for (const id of SLOTS) {
      const b = s.slots[id].bet;
      if (b && (b.status === 'placed' || b.status === 'queued')) refund += b.amount;
    }
    const keep = ({ amount, autoCash, at, rebet }) => ({ amount, autoCash, at, rebet });
    saveState({
      v: 1,
      balance: s.balance + refund,
      slots: { a: keep(s.slots.a), b: keep(s.slots.b) },
      myBets: s.myBets,
      nonce: this.nonce,
      clientSeed: s.clientSeed,
      sound: s.sound,
    });
  }

  // ---- ticking ------------------------------------------------------------

  // Idempotent: called from both an interval and the render loop.
  tick(now = this.now()) {
    const s = this.s;
    if (!s.ready) return;
    try {
      if (s.phase === 'waiting') {
        this.revealBots(now);
        if (now >= s.flyAt) this.beginFlight(now);
      } else if (s.phase === 'flying') {
        this.tickFlying(now);
      } else if (s.phase === 'burst' && now - s.burstAt >= CFG.burstMs && this.next) {
        this.startWaiting(now);
      }
      this.tickChat(now);
      this.tickRain(now);
    } catch (e) {
      console.error('[skyburst] tick failed', e);
    }
    this.flush(now);
  }

  // What the canvas needs each animation frame. Pure: it derives everything from the clock.
  frame(now = this.now()) {
    const s = this.s;
    const r = this.round;
    if (!r || !s.ready) return { phase: 'boot', t: 0, m: 1, roundId: 0 };
    if (s.phase === 'waiting') {
      return { phase: 'waiting', t: 0, m: 1, left: Math.max(0, s.flyAt - now), total: CFG.waitMs, roundId: s.roundId };
    }
    if (s.phase === 'flying') {
      const el = Math.max(0, now - s.flyAt);
      return { phase: 'flying', t: el / 1000, m: Math.min(multiplierAt(el), r.crash), roundId: s.roundId };
    }
    return { phase: 'burst', t: r.flightMs / 1000, m: r.crash, since: now - s.burstAt, roundId: s.roundId };
  }

  // ---- round phases -------------------------------------------------------

  startWaiting(now) {
    const s = this.s;
    const r = this.next;
    this.next = null;
    this.queueRound();

    r.flightMs = Math.max(CFG.minFlightMs, timeAt(r.crash));
    this.round = r;
    s.phase = 'waiting';
    s.roundId = r.id;
    s.commit = r.commit;
    s.nonce = r.nonce;
    s.crash = null;
    s.serverSeed = null;
    s.flyAt = now + CFG.waitMs;
    s.burstAt = 0;
    s.totalWin = 0;

    this.waitStart = now;
    this.feedMap.clear();
    this.seq = 0;
    this.bots = makeBotRound(this.rng, CFG.fillMs);
    this.botIdx = 0;
    this.targets = [];
    this.ti = 0;

    for (const id of SLOTS) {
      const prev = s.slots[id].bet;
      let bet = prev;
      if (prev && (prev.status === 'won' || prev.status === 'lost')) bet = null;
      else if (prev && prev.status === 'queued') bet = { ...prev, status: 'placed' };
      if (bet !== prev) this.setSlot(id, { bet });
      if (bet) this.addPlayerBet(bet);
      else if (prev && s.slots[id].rebet) this.placeBet(id);
    }

    this.feedDirty = true;
    this.emitEvent('phase', { phase: 'waiting', roundId: r.id });
    this.commit(true);
  }

  // Bots place their bets over the first part of the countdown.
  revealBots(now) {
    const rel = now - this.waitStart;
    let added = false;
    while (this.botIdx < this.bots.length && this.bots[this.botIdx].placeAt <= rel) {
      const b = this.bots[this.botIdx++];
      this.feedMap.set(b.id, {
        id: b.id,
        name: b.name,
        hue: b.hue,
        amount: b.amount,
        status: 'placed',
        mult: null,
        payout: 0,
        mine: false,
        seq: this.seq++,
      });
      if (b.target != null) this.targets.push(b);
      added = true;
    }
    if (added) this.feedDirty = this.dirty = true;
  }

  beginFlight(now) {
    const s = this.s;
    this.revealBots(Infinity);
    this.targets.sort((x, y) => x.target - y.target);
    this.ti = 0;
    s.phase = 'flying';
    for (const id of SLOTS) {
      const b = s.slots[id].bet;
      if (b && b.status === 'placed') this.setSlot(id, { bet: { ...b, status: 'flying' } });
    }
    this.emitEvent('phase', { phase: 'flying', roundId: s.roundId });
    this.commit(true);
  }

  tickFlying(now) {
    const s = this.s;
    const r = this.round;
    const el = now - s.flyAt;
    const reach = Math.min(multiplierAt(Math.max(0, el)), r.crash);

    for (const id of SLOTS) {
      const b = s.slots[id].bet;
      if (b && b.status === 'flying' && b.autoAt != null && b.autoAt <= reach) this.winPlayer(id, b.autoAt, true);
    }
    this.settleBots(reach);
    if (el >= r.flightMs) this.burst(now);
  }

  settleBots(reach) {
    while (this.ti < this.targets.length && this.targets[this.ti].target <= reach) this.botWin(this.targets[this.ti++]);
  }

  botWin(b) {
    const row = this.feedMap.get(b.id);
    if (!row || row.status !== 'placed') return;
    const payout = payoutFor(b.amount, b.target);
    this.feedMap.set(b.id, { ...row, status: 'won', mult: b.target, payout });
    this.s.totalWin += payout;
    this.addTop({ name: b.name, hue: b.hue, amount: b.amount, mult: b.target, payout, mine: false });
    this.feedDirty = this.dirty = true;
  }

  burst(now) {
    const s = this.s;
    const r = this.round;

    this.settleBots(r.crash);
    for (const [id, row] of this.feedMap) {
      if (row.status === 'placed') this.feedMap.set(id, { ...row, status: 'lost' });
    }
    for (const id of SLOTS) {
      const b = s.slots[id].bet;
      if (b && b.status === 'flying') {
        const lost = { ...b, status: 'lost' };
        this.setSlot(id, { bet: lost });
        this.pushMyBet(lost);
        this.emitEvent('lose', { slot: id, amount: b.amount });
      }
    }

    s.phase = 'burst';
    s.burstAt = now;
    s.crash = r.crash;
    s.serverSeed = r.serverSeed;
    s.history = [
      { id: r.id, crash: r.crash, commit: r.commit, serverSeed: r.serverSeed, clientSeed: r.clientSeed, nonce: r.nonce },
      ...s.history,
    ].slice(0, CFG.historyLen);

    this.reactAt = now + 600 + this.rng() * 900;
    this.reactCrash = r.crash;
    this.feedDirty = true;
    this.emitEvent('burst', { crash: r.crash, roundId: r.id });
    this.persistSoon();
    this.commit(true);
  }

  // ---- player actions -----------------------------------------------------

  // One button, four meanings: cash out, cancel, or place a bet.
  primary(id) {
    const b = this.s.slots[id]?.bet;
    if (b && b.status === 'flying') return this.cashOut(id);
    if (b && (b.status === 'placed' || b.status === 'queued')) return this.cancelBet(id);
    return this.placeBet(id);
  }

  placeBet(id) {
    const s = this.s;
    if (!s.ready) return false;
    const slot = s.slots[id];
    if (isLive(slot.bet)) return false;
    const amount = clamp(slot.amount, CFG.minBet, CFG.maxBet);
    if (amount > s.balance) {
      this.toast('error', 'Not enough credits for that bet');
      return false;
    }
    s.balance -= amount;
    const status = s.phase === 'waiting' ? 'placed' : 'queued';
    const bet = {
      id: `me-${id}-${++this.uid}`,
      slot: id,
      amount,
      status,
      autoAt: slot.autoCash ? slot.at : null,
      mult: null,
      payout: 0,
    };
    this.setSlot(id, { bet });
    if (status === 'placed') this.addPlayerBet(bet);
    this.emitEvent('bet', { slot: id, amount, queued: status === 'queued' });
    this.persistSoon();
    this.commit(true);
    return true;
  }

  cancelBet(id) {
    const s = this.s;
    const b = s.slots[id].bet;
    if (!b) return false;
    const cancellable = b.status === 'queued' || (b.status === 'placed' && s.phase === 'waiting');
    if (!cancellable) return false;
    s.balance += b.amount;
    this.feedMap.delete(b.id);
    this.feedDirty = true;
    this.setSlot(id, { bet: null });
    this.emitEvent('cancel', { slot: id });
    this.persistSoon();
    this.commit(true);
    return true;
  }

  // Manual cash-out. The multiplier is read from the clock at the moment of the click.
  cashOut(id, now = this.now()) {
    const s = this.s;
    if (s.phase !== 'flying') return false;
    const bet = s.slots[id].bet;
    if (!bet || bet.status !== 'flying') return false;
    const el = now - s.flyAt;
    if (el >= timeAt(this.round.crash)) return false; // the shell already reached its burst height
    this.winPlayer(id, Math.max(1, floor2(multiplierAt(el))), false);
    return true;
  }

  winPlayer(id, m, auto) {
    const s = this.s;
    const bet = s.slots[id].bet;
    const payout = payoutFor(bet.amount, m);
    s.balance += payout;
    s.totalWin += payout;
    const done = { ...bet, status: 'won', mult: m, payout };
    this.setSlot(id, { bet: done });
    const row = this.feedMap.get(bet.id);
    if (row) this.feedMap.set(bet.id, { ...row, status: 'won', mult: m, payout });
    this.feedDirty = true;
    this.pushMyBet(done);
    this.addTop({ ...ME, amount: bet.amount, mult: m, payout, mine: true });
    this.emitEvent('cashout', { slot: id, mult: m, payout, amount: bet.amount, auto, t: timeAt(m) / 1000 });
    this.toast('win', `${auto ? 'Auto cash out' : 'Cashed out'} at ${m.toFixed(2)}×`, `+${cents(payout)}`);
    this.persistSoon();
    this.commit(true);
  }

  setAmount(id, value) {
    this.setSlot(id, { amount: clamp(Math.round(value), CFG.minBet, CFG.maxBet) });
    this.persistSoon();
    this.commit(true);
  }

  bump(id, dir) {
    const a = this.s.slots[id].amount;
    const step = a < 2000 ? 100 : a < 10000 ? 500 : a < 25000 ? 1000 : 2500;
    this.setAmount(id, dir > 0 ? a + step : a - step);
  }

  setAuto(id, patch) {
    const p = {};
    if ('autoCash' in patch) p.autoCash = !!patch.autoCash;
    if ('rebet' in patch) p.rebet = !!patch.rebet;
    if ('at' in patch) {
      const n = Number(patch.at);
      if (Number.isFinite(n)) p.at = clamp(Math.round(n * 100) / 100, CFG.minAuto, CFG.maxAuto);
    }
    this.setSlot(id, p);
    this.persistSoon();
    this.commit(true);
  }

  refill() {
    if (this.s.balance >= CFG.minBet) return;
    this.s.balance = CFG.startBalance;
    this.persistSoon();
    this.commit(true);
  }

  resetDemo() {
    const s = this.s;
    if (SLOTS.some((id) => isLive(s.slots[id].bet))) {
      this.toast('error', 'Finish or cancel your bets first');
      return false;
    }
    s.balance = CFG.startBalance;
    s.myBets = [];
    this.persistSoon();
    this.commit(true);
    return true;
  }

  setSound(on) {
    this.s.sound = !!on;
    this.persistSoon();
    this.commit(true);
  }

  setClientSeed(value) {
    this.s.clientSeed = String(value).trim().slice(0, 32);
    this.persistSoon();
    this.commit(true);
  }

  // ---- chat and the sky shower --------------------------------------------

  sendChat(text) {
    const t = String(text).trim().slice(0, 140);
    const now = this.now();
    if (!t || now - this.lastSent < 900) return;
    this.lastSent = now;
    this.pushChat({ ...ME, text: t, mine: true });
    if (this.rng() < 0.3) this.replyAt = now + 1500 + this.rng() * 2500;
    this.commit(true);
  }

  pushChat(msg) {
    this.s.chat = [...this.s.chat, { id: ++this.uid, ...msg }].slice(-CFG.chatLen);
    this.dirty = true;
  }

  chatter() {
    const u = this.chatters[Math.floor(this.rng() * this.chatters.length)];
    return { name: u.name, hue: u.hue };
  }

  tickChat(now) {
    if (this.reactAt && now >= this.reactAt) {
      this.reactAt = 0;
      const line = reactionLine(this.rng, this.reactCrash);
      if (line) this.pushChat({ ...this.chatter(), text: line });
    }
    if (this.replyAt && now >= this.replyAt) {
      this.replyAt = 0;
      this.pushChat({ ...this.chatter(), text: replyLine(this.rng) });
    }
    if (now >= this.nextChatAt) {
      this.nextChatAt = now + 2200 + this.rng() * 5800;
      this.pushChat({ ...this.chatter(), text: idleLine(this.rng) });
    }
  }

  // A promo that mimics the "rain" of free bets: a few shells of credits to claim from the chat.
  tickRain(now) {
    const s = this.s;
    if (!s.rain) {
      if (now >= this.nextRainAt) {
        s.rain = {
          id: ++this.uid,
          value: CFG.rainValue,
          total: CFG.rainSlots,
          claimed: [],
          mine: false,
          open: true,
          endsAt: now + 22000,
          closedAt: 0,
        };
        this.nextClaimAt = now + 1200;
        this.toast('info', 'Sky shower in the chat. Claim a shell before they are gone');
        this.dirty = true;
      }
      return;
    }
    const rain = s.rain;
    if (rain.open) {
      // Bots leave the last shell for the player.
      if (now >= this.nextClaimAt && rain.claimed.length < rain.total - 1) {
        this.nextClaimAt = now + 700 + this.rng() * 2300;
        const u = this.chatter();
        if (!rain.claimed.some((c) => c.name === u.name)) {
          s.rain = { ...rain, claimed: [...rain.claimed, u] };
          this.dirty = true;
        }
      }
      if (now >= s.rain.endsAt) {
        s.rain = { ...s.rain, open: false, closedAt: now };
        this.dirty = true;
      }
    } else if (now - rain.closedAt > 7000) {
      s.rain = null;
      this.nextRainAt = now + 90000 + this.rng() * 60000;
      this.dirty = true;
    }
  }

  claimRain() {
    const s = this.s;
    const rain = s.rain;
    if (!rain || !rain.open || rain.mine) return false;
    s.balance += rain.value;
    s.rain = { ...rain, mine: true, open: false, closedAt: this.now(), claimed: [...rain.claimed, { ...ME, mine: true }] };
    this.toast('win', 'Claimed from the sky shower', `+${cents(rain.value)}`);
    this.emitEvent('claim', {});
    this.persistSoon();
    this.commit(true);
    return true;
  }

  // ---- bookkeeping --------------------------------------------------------

  setSlot(id, patch) {
    const s = this.s;
    s.slots = { ...s.slots, [id]: { ...s.slots[id], ...patch } };
    this.dirty = true;
  }

  addPlayerBet(bet) {
    this.feedMap.set(bet.id, {
      id: bet.id,
      name: ME.name,
      hue: ME.hue,
      amount: bet.amount,
      status: 'placed',
      mult: null,
      payout: 0,
      mine: true,
      seq: -1,
    });
    this.feedDirty = this.dirty = true;
  }

  pushMyBet(b) {
    const s = this.s;
    s.myBets = [
      { id: b.id, roundId: s.roundId, at: Date.now(), amount: b.amount, mult: b.mult, payout: b.payout },
      ...s.myBets,
    ].slice(0, 50);
  }

  // Only notable wins make the top list: 150.00 or more, or 10x and up.
  addTop(e) {
    if (e.payout < 15000 && e.mult < 10) return;
    this.s.top = [...this.s.top, { ...e, id: ++this.uid }].sort((a, b) => b.payout - a.payout).slice(0, 30);
    this.dirty = true;
  }

  rebuildFeed() {
    const s = this.s;
    const rows = Array.from(this.feedMap.values()).sort(
      (a, b) => b.mine - a.mine || b.amount - a.amount || a.seq - b.seq,
    );
    let air = 0;
    for (const row of rows) if (row.status === 'placed') air++;
    s.feed = rows;
    s.feedCount = rows.length;
    s.inAir = air;
  }

  commit(force = false) {
    this.dirty = true;
    this.flush(this.now(), force);
  }

  // Snapshots are immutable and emitted at most about 9 times a second, unless something forces it.
  flush(now, force = false) {
    if (!this.dirty) return;
    if (!force && now - this.lastEmit < 110) return;
    this.lastEmit = now;
    this.dirty = false;
    if (this.feedDirty) {
      this.rebuildFeed();
      this.feedDirty = false;
    }
    this.snap = { ...this.s };
    this.listeners.forEach((fn) => fn());
  }
}

export const createEngine = (opts) => new Engine(opts);
