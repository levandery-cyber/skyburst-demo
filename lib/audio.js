// A tiny Web Audio synth, no sample files. The context is created lazily after the first user gesture.

const LEVEL = 0.5;

let ctx = null;
let master = null;
let noise = null;
let whistle = null;
let muted = true;
let gesture = false; // browsers refuse audio until the person has touched the page

function ensure() {
  if (ctx || !gesture || typeof window === 'undefined') return ctx;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = muted ? 0 : LEVEL;
  master.connect(ctx.destination);
  const len = ctx.sampleRate * 2;
  noise = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = noise.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  return ctx;
}

function tone({ f0, f1 = f0, type = 'sine', at = 0, dur = 0.15, gain = 0.2 }) {
  const c = ensure();
  if (!c || muted) return;
  const t = c.currentTime + at;
  const osc = c.createOscillator();
  const amp = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(f0, t);
  if (f1 !== f0) osc.frequency.exponentialRampToValueAtTime(f1, t + dur);
  amp.gain.setValueAtTime(0.0001, t);
  amp.gain.exponentialRampToValueAtTime(gain, t + 0.01);
  amp.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(amp).connect(master);
  osc.start(t);
  osc.stop(t + dur + 0.05);
}

function hiss({ at = 0, dur = 0.4, gain = 0.2, from = 800, to = 800, type = 'lowpass', q = 0.7 }) {
  const c = ensure();
  if (!c || muted) return;
  const t = c.currentTime + at;
  const src = c.createBufferSource();
  src.buffer = noise;
  src.loop = true;
  const filter = c.createBiquadFilter();
  filter.type = type;
  filter.Q.value = q;
  filter.frequency.setValueAtTime(from, t);
  filter.frequency.exponentialRampToValueAtTime(Math.max(20, to), t + dur);
  const amp = c.createGain();
  amp.gain.setValueAtTime(gain, t);
  amp.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(filter).connect(amp).connect(master);
  src.start(t, Math.random());
  src.stop(t + dur + 0.05);
}

export const sfx = {
  unlock() {
    gesture = true;
    const c = ensure();
    if (c && c.state === 'suspended') c.resume();
  },

  setMuted(m) {
    muted = m;
    if (!m) this.unlock();
    if (ctx) master.gain.setTargetAtTime(m ? 0 : LEVEL, ctx.currentTime, 0.03);
  },

  bet() {
    tone({ f0: 520, f1: 760, dur: 0.08, gain: 0.12, type: 'triangle' });
  },

  cancel() {
    tone({ f0: 420, f1: 260, dur: 0.1, gain: 0.1, type: 'triangle' });
  },

  launch() {
    hiss({ dur: 0.7, gain: 0.25, from: 400, to: 3200, type: 'bandpass', q: 1.2 });
    tone({ f0: 90, f1: 50, dur: 0.25, gain: 0.35 });
  },

  cash() {
    tone({ f0: 880, dur: 0.18, gain: 0.18 });
    tone({ f0: 1318, at: 0.09, dur: 0.26, gain: 0.16 });
    hiss({ at: 0.05, dur: 0.18, gain: 0.05, from: 6000, to: 9000, type: 'highpass' });
  },

  // The rising whistle of the shell. Its pitch follows the multiplier.
  flightStart() {
    const c = ensure();
    if (!c || whistle) return;
    const a = c.createOscillator();
    const b = c.createOscillator();
    const amp = c.createGain();
    a.type = 'sine';
    b.type = 'triangle';
    a.frequency.value = 420;
    b.frequency.value = 424;
    amp.gain.value = 0;
    a.connect(amp);
    b.connect(amp);
    amp.connect(master);
    a.start();
    b.start();
    amp.gain.setTargetAtTime(0.035, c.currentTime, 0.1);
    whistle = { a, b, amp };
  },

  flightUpdate(m) {
    if (!whistle || !ctx) return;
    const f = Math.min(2200, 420 + 300 * Math.log(Math.max(1, m)));
    const t = ctx.currentTime;
    whistle.a.frequency.setTargetAtTime(f, t, 0.05);
    whistle.b.frequency.setTargetAtTime(f * 1.01, t, 0.05);
  },

  flightStop() {
    if (!whistle || !ctx) return;
    const w = whistle;
    whistle = null;
    w.amp.gain.setTargetAtTime(0, ctx.currentTime, 0.04);
    setTimeout(() => {
      try {
        w.a.stop();
        w.b.stop();
      } catch {
        // already stopped
      }
    }, 300);
  },

  burst(tier, dud) {
    if (dud) {
      hiss({ dur: 0.5, gain: 0.22, from: 3000, to: 200, type: 'lowpass' });
      return;
    }
    const big = { sr: 0.8, na: 1, cu: 1.1, mg: 1.25 }[tier] ?? 1;
    hiss({ dur: 1.3 * big, gain: 0.55 * big, from: 2600, to: 120, type: 'lowpass' });
    tone({ f0: 130, f1: 38, dur: 0.6, gain: 0.5 * big });
    const crackles = { sr: 6, na: 16, cu: 26, mg: 34 }[tier] ?? 12;
    for (let i = 0; i < crackles; i++) {
      hiss({
        at: 0.25 + Math.random() * 1.3,
        dur: 0.02 + Math.random() * 0.03,
        gain: 0.05 + Math.random() * 0.07,
        from: 4500,
        to: 6500,
        type: 'highpass',
        q: 0.5,
      });
    }
  },
};
