// Canvas renderer for the night sky, the rising shell and the burst.
// No React in here: Stage.js hands it one engine frame per animation frame.
import { GROWTH } from './curve.js';
import { cents, tierOf } from './format.js';

const TAU = Math.PI * 2;
const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
const rand = (a, b) => a + Math.random() * (b - a);
const easeOut = (p) => 1 - (1 - p) * (1 - p);
const rgba = (c, a) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;

export const RGB = {
  sr: [255, 84, 112],
  na: [255, 194, 71],
  cu: [60, 200, 255],
  mg: [247, 249, 255],
  ba: [75, 227, 160],
  warm: [255, 170, 80],
};

// Star colours of each burst: the rarer the metal, the rarer the colour.
const STAR_SETS = {
  sr: [[255, 84, 112], [255, 128, 84], [255, 196, 160]],
  na: [[255, 194, 71], [255, 226, 140], [255, 150, 60], [255, 255, 255]],
  cu: [[60, 200, 255], [140, 232, 255], [96, 140, 255], [255, 255, 255]],
  mg: [[247, 249, 255], [255, 226, 140], [160, 210, 255], [255, 255, 255]],
};

// Seeded, so the skyline and the stars keep their shape across resizes.
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

// A soft round sprite, drawn with additive blending wherever something glows.
function makeGlow(rgb) {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, rgba(rgb, 1));
  grad.addColorStop(0.18, rgba(rgb, 0.65));
  grad.addColorStop(0.5, rgba(rgb, 0.16));
  grad.addColorStop(1, rgba(rgb, 0));
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  return c;
}

function pill(ctx, x, y, w, h) {
  const r = h / 2;
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export class Sky {
  constructor(canvas, { reduced = false } = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.reduced = reduced;
    this.W = 0;
    this.H = 0;
    this.dpr = 1;
    this.fontUI = getComputedStyle(canvas).getPropertyValue('--font-ui').trim() || 'system-ui, sans-serif';

    this.glow = {};
    for (const k of Object.keys(RGB)) this.glow[k] = makeGlow(RGB[k]);

    this.sparks = []; // tiny round embers: trail, fuse, glitter
    this.flares = []; // the stars of a burst, drawn as streaks
    this.rings = [];
    this.marks = []; // cash-out pins on the curve
    this.later = []; // delayed secondary breaks
    this.stars = [];
    this.ground = null;
    this.climb = 0;
    this.last = 0;
    this.phase = 'boot';
    this.roundId = 0;
    this.head = { x: 0, y: 0 };
    this.shake = { t0: -1e9, amp: 0 };
    this.flash = null;
    this.carry = 0;
    this.fuseCarry = 0;
  }

  resize(w, h, dpr) {
    this.W = w;
    this.H = h;
    this.dpr = dpr;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    const small = w < 560;
    this.x0 = small ? 42 : 80;
    this.groundY = h - (small ? 36 : 48);
    this.y0 = this.groundY - 10;
    this.xA = w * 0.8;
    this.yA = Math.max(small ? 76 : 92, h * (small ? 0.3 : 0.27));
    this.makeStars();
    this.makeGround();
    this.makeGradients();
  }

  makeStars() {
    const rng = mulberry(7);
    const n = clamp(Math.round((this.W * this.H) / 5200), 60, 220);
    this.stars = Array.from({ length: n }, () => ({
      x: rng(),
      y: rng(),
      z: 0.25 + rng() * 0.75,
      r: rng() < 0.12 ? 2 : 1,
      a: 0.25 + rng() * 0.65,
      sp: 0.6 + rng() * 2.2,
      ph: rng() * TAU,
    }));
  }

  makeGround() {
    const rng = mulberry(21);
    const { W, groundY } = this;
    const far = [];
    for (let x = 0; x <= W + 16; x += 16) {
      far.push(groundY - 28 - 18 * Math.sin(x * 0.011 + 1) - 12 * Math.sin(x * 0.027 + 4));
    }
    const near = [];
    for (let x = -10; x < W + 40; ) {
      const w = 22 + rng() * 46;
      near.push({ x, w, h: 8 + rng() * 34, roof: rng() < 0.4 ? 8 + rng() * 10 : 0 });
      x += w + 2 + rng() * 8;
    }
    const lights = [];
    const names = ['na', 'sr', 'cu', 'ba', 'mg'];
    const span = 150;
    for (let px = 0, row = 0; px < W + span; px += span, row++) {
      for (let k = 1; k < 7; k++) {
        const t = k / 7;
        lights.push({
          x: px + t * span,
          y: groundY - 54 + Math.sin(t * Math.PI) * 14,
          c: names[(k + row) % names.length],
          ph: rng() * TAU,
        });
      }
    }
    this.ground = { far, near, lights };
  }

  makeGradients() {
    const { ctx, W, H } = this;
    const sky = ctx.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, '#05071f');
    sky.addColorStop(0.55, '#0d1040');
    sky.addColorStop(0.84, '#23155a');
    sky.addColorStop(1, '#4a1b64');
    this.skyGrad = sky;
    const vig = ctx.createRadialGradient(W / 2, H * 0.55, Math.min(W, H) * 0.35, W / 2, H * 0.55, Math.max(W, H) * 0.8);
    vig.addColorStop(0, 'rgba(5,7,31,0)');
    vig.addColorStop(1, 'rgba(5,7,31,0.55)');
    this.vignette = vig;
  }

  // The curve is always fitted to a box. The box grows from the launch pad to an anchor in the
  // upper right, then stays put while the curve steepens: the camera follows the shell.
  box(f) {
    const t = Math.max(1e-4, f.t);
    const prog = easeOut(clamp(t / 9, 0, 1));
    return {
      t,
      bx: this.x0 + (this.xA - this.x0) * prog,
      by: this.y0 - (this.y0 - this.yA) * prog,
      span: Math.max(0, f.m - 1),
    };
  }

  // Screen position of the curve at flight time s, where the multiplier was m.
  at(f, box, s, m) {
    const x = this.x0 + (box.bx - this.x0) * (s / box.t);
    const u = box.span > 1e-6 ? (Math.min(m, f.m) - 1) / box.span : s / box.t;
    return [x, this.y0 - (this.y0 - box.by) * clamp(u, 0, 1.2)];
  }

  // ---- frame ----------------------------------------------------------------

  draw(f, now) {
    const { ctx, W, H, dpr } = this;
    if (!W || !H) return;
    const dt = this.last ? clamp((now - this.last) / 1000, 0.001, 0.05) : 0.016;
    this.last = now;
    if (f.phase !== this.phase || f.roundId !== this.roundId) this.onPhase(f, now);

    if (this.later.length) {
      let w = 0;
      for (const job of this.later) {
        if (now >= job.at) job.fn();
        else this.later[w++] = job;
      }
      this.later.length = w;
    }

    const idle = f.phase === 'waiting' || f.phase === 'boot';
    const target = idle ? 0 : Math.log(Math.max(1, f.m));
    this.climb += (target - this.climb) * (1 - Math.exp(-dt * (idle ? 2.4 : 14)));
    const tier = tierOf(f.m);

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;

    let sx = 0;
    let sy = 0;
    const st = (now - this.shake.t0) / 1000;
    if (!this.reduced && st >= 0 && st < 0.55) {
      const a = this.shake.amp * (1 - st / 0.55) ** 2;
      sx = (Math.random() - 0.5) * 2 * a;
      sy = (Math.random() - 0.5) * 2 * a;
    }
    ctx.translate(sx, sy);

    ctx.fillStyle = this.skyGrad;
    ctx.fillRect(-40, -40, W + 80, H + 80);
    this.drawStars(now);

    if (f.phase === 'flying') {
      // The shell lights the sky around it.
      const R = Math.max(W, H) * 0.55;
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.2;
      ctx.drawImage(this.glow[tier], this.head.x - R, this.head.y - R, R * 2, R * 2);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    }

    this.drawGround(now);
    this.drawAxis(f);
    this.drawCurve(f, now, dt, tier);
    this.drawFuse(f, dt);
    this.drawParticles(dt);
    this.drawRings(now);
    this.drawMarks(f, now);
    this.drawFlash(now);

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = this.vignette;
    ctx.fillRect(0, 0, W, H);
  }

  onPhase(f, now) {
    const prev = this.phase;
    this.phase = f.phase;
    this.roundId = f.roundId;
    if (f.phase === 'waiting') {
      this.sparks.length = 0;
      this.flares.length = 0;
      this.rings.length = 0;
      this.marks.length = 0;
      this.later.length = 0;
      this.flash = null;
    } else if (f.phase === 'flying') {
      this.launchFountain();
    } else if (f.phase === 'burst' && prev === 'flying' && (f.since ?? 0) < 1200) {
      this.spawnBurst(f, now);
    }
  }

  // ---- scenery --------------------------------------------------------------

  drawStars(now) {
    const { ctx, W, H } = this;
    ctx.fillStyle = '#dfe6ff';
    for (const s of this.stars) {
      const y = (((s.y * H + this.climb * 34 * s.z) % H) + H) % H;
      ctx.globalAlpha = s.a * (this.reduced ? 1 : 0.7 + 0.3 * Math.sin(now * 0.001 * s.sp + s.ph));
      ctx.fillRect(s.x * W, y, s.r, s.r);
    }
    ctx.globalAlpha = 1;
  }

  // The festival ground: hills, stalls, string lights and the mortar tube. It sinks away as the shell climbs.
  drawGround(now) {
    const { ctx, W, H, groundY, x0, y0 } = this;
    const off = this.climb * 150;
    if (off > 280) return;
    const g = this.ground;
    ctx.save();
    ctx.translate(0, off);

    const haze = ctx.createLinearGradient(0, groundY - 120, 0, groundY);
    haze.addColorStop(0, 'rgba(190,70,140,0)');
    haze.addColorStop(1, 'rgba(190,70,140,0.3)');
    ctx.fillStyle = haze;
    ctx.fillRect(0, groundY - 120, W, 120);

    ctx.fillStyle = '#15184d';
    ctx.beginPath();
    ctx.moveTo(0, H + 80);
    for (let i = 0; i < g.far.length; i++) ctx.lineTo(i * 16, g.far[i]);
    ctx.lineTo(W + 16, H + 80);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = '#0a0c2c';
    for (const b of g.near) {
      ctx.fillRect(b.x, groundY - b.h, b.w, b.h + 90);
      if (b.roof) {
        ctx.beginPath();
        ctx.moveTo(b.x - 3, groundY - b.h);
        ctx.lineTo(b.x + b.w / 2, groundY - b.h - b.roof);
        ctx.lineTo(b.x + b.w + 3, groundY - b.h);
        ctx.closePath();
        ctx.fill();
      }
    }
    ctx.fillRect(0, groundY, W, H - groundY + 90);

    ctx.fillStyle = '#1d2275';
    ctx.fillRect(x0 - 9, y0 + 2, 18, 24);
    ctx.fillStyle = '#3a42b8';
    ctx.fillRect(x0 - 11, y0, 22, 4);

    ctx.globalCompositeOperation = 'lighter';
    for (const l of g.lights) {
      ctx.globalAlpha = this.reduced ? 0.8 : 0.55 + 0.45 * Math.sin(now * 0.003 + l.ph);
      ctx.drawImage(this.glow[l.c], l.x - 9, l.y - 9, 18, 18);
    }
    ctx.restore();
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  // Multiplier guides. They sink towards the baseline as the view zooms out, which shows the scale.
  drawAxis(f) {
    if (f.phase !== 'flying' && f.phase !== 'burst') return;
    const { ctx, W, x0, y0 } = this;
    const box = this.box(f);
    if (box.span < 0.3) return;
    const values = [1.5, 2, 3, 5, 10, 20, 30, 50, 100, 200, 300, 500, 1000, 2000, 5000, 10000];
    ctx.font = `600 11px ${this.fontUI}`;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    ctx.lineWidth = 1;
    let prevY = y0;
    for (const v of values) {
      if (v >= f.m * 0.96) break;
      const y = y0 - (y0 - box.by) * ((v - 1) / box.span);
      if (prevY - y < 34) continue;
      prevY = y;
      ctx.strokeStyle = 'rgba(160,170,255,0.07)';
      ctx.beginPath();
      ctx.moveTo(x0 - 6, y);
      ctx.lineTo(W, y);
      ctx.stroke();
      ctx.fillStyle = 'rgba(170,180,240,0.55)';
      ctx.fillText(`${v}×`, 12, y);
    }
  }

  drawCurve(f, now, dt, tier) {
    const { ctx, x0, y0 } = this;
    const flying = f.phase === 'flying';
    const burst = f.phase === 'burst';

    if (!flying && !burst) {
      // The shell waits on the pad.
      const pulse = this.reduced ? 1 : 0.85 + 0.15 * Math.sin(now * 0.006);
      this.head.x = x0;
      this.head.y = y0 - 8;
      const r = 30 * pulse;
      ctx.globalCompositeOperation = 'lighter';
      ctx.drawImage(this.glow.warm, x0 - r, y0 - 8 - r, r * 2, r * 2);
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(x0, y0 - 8, 2.6, 0, TAU);
      ctx.fill();
      return;
    }

    const box = this.box(f);
    const rgb = RGB[tier];
    const fade = burst ? clamp(1 - f.since / 2200, 0.25, 1) : 1;
    const N = clamp(Math.round(box.t * 16), 8, 150);
    const pts = [];
    for (let i = 0; i <= N; i++) {
      // Denser near the head, where the curve is steep.
      const s = box.t * (1 - (1 - i / N) ** 1.6);
      const [x, y] = this.at(f, box, s, Math.exp(GROWTH * s));
      pts.push(x, y);
    }
    const hx = pts[pts.length - 2];
    const hy = pts[pts.length - 1];
    this.head.x = hx;
    this.head.y = hy;
    const back = Math.max(0, pts.length - 14);
    const ang = Math.atan2(hy - pts[back + 1], hx - pts[back]);

    ctx.globalAlpha = fade;

    ctx.beginPath();
    ctx.moveTo(x0, y0);
    for (let i = 0; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]);
    ctx.lineTo(hx, y0);
    ctx.closePath();
    const fill = ctx.createLinearGradient(0, Math.min(hy, y0 - 1), 0, y0);
    fill.addColorStop(0, rgba(rgb, 0.34));
    fill.addColorStop(1, rgba(rgb, 0.02));
    ctx.fillStyle = fill;
    ctx.fill();

    const path = new Path2D();
    path.moveTo(pts[0], pts[1]);
    for (let i = 2; i < pts.length; i += 2) path.lineTo(pts[i], pts[i + 1]);
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = rgba(rgb, 0.12);
    ctx.lineWidth = 14;
    ctx.stroke(path);
    ctx.strokeStyle = rgba(rgb, 0.28);
    ctx.lineWidth = 6;
    ctx.stroke(path);
    ctx.globalCompositeOperation = 'source-over';
    if (hx - x0 > 2) {
      const line = ctx.createLinearGradient(x0, 0, hx, 0);
      line.addColorStop(0, rgba(rgb, 0.35));
      line.addColorStop(1, 'rgba(255,255,255,0.95)');
      ctx.strokeStyle = line;
    } else {
      ctx.strokeStyle = '#fff';
    }
    ctx.lineWidth = 2.4;
    ctx.stroke(path);
    ctx.globalAlpha = 1;

    if (flying) {
      const pulse = this.reduced ? 1 : 0.92 + 0.08 * Math.sin(now * 0.025);
      const R = 54 * pulse;
      ctx.globalCompositeOperation = 'lighter';
      ctx.drawImage(this.glow[tier], hx - R, hy - R, R * 2, R * 2);
      ctx.drawImage(this.glow.mg, hx - 18, hy - 18, 36, 36);
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(hx, hy, 3.4, 0, TAU);
      ctx.fill();
      this.emitSparks(hx, hy, ang, dt, tier);
    }
  }

  // While waiting, a fuse burns along the ground towards the mortar. It is the countdown.
  drawFuse(f, dt) {
    if (f.phase !== 'waiting') return;
    const { ctx, W, x0, y0 } = this;
    const xs = x0 + 16;
    const xe = W - 34;
    const p = clamp(1 - f.left / f.total, 0, 1);
    const xb = xe - (xe - xs) * p;
    const yAt = (x) => y0 + 24 + Math.sin(x * 0.03) * 2.5;
    const trace = (from, to) => {
      ctx.beginPath();
      for (let x = from; x <= to; x += 5) {
        if (x === from) ctx.moveTo(x, yAt(x));
        else ctx.lineTo(x, yAt(x));
      }
      ctx.stroke();
    };

    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineWidth = 2.4;
    ctx.strokeStyle = 'rgba(238,214,168,0.8)';
    ctx.setLineDash([3, 5]);
    trace(xs, xb);
    ctx.strokeStyle = 'rgba(150,140,190,0.22)';
    ctx.setLineDash([1, 7]);
    trace(xb, xe);
    ctx.restore();

    const yb = yAt(xb);
    ctx.globalCompositeOperation = 'lighter';
    ctx.drawImage(this.glow.warm, xb - 20, yb - 20, 40, 40);
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = '#fff';
    ctx.fillRect(xb - 1.5, yb - 1.5, 3, 3);

    this.fuseCarry += (this.reduced ? 20 : 70) * dt;
    while (this.fuseCarry >= 1) {
      this.fuseCarry -= 1;
      const a = rand(-Math.PI * 0.95, -Math.PI * 0.05);
      const sp = rand(30, 120);
      this.sparks.push({
        x: xb,
        y: yb,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        life: 0,
        max: rand(0.3, 0.8),
        size: rand(1, 2),
        c: [255, rand(160, 230) | 0, rand(60, 120) | 0],
        g: 160,
        drag: 1.5,
      });
    }
  }

  // ---- particles ------------------------------------------------------------

  emitSparks(x, y, ang, dt, tier) {
    this.carry += (this.reduced ? 30 : 110) * dt;
    while (this.carry >= 1) {
      this.carry -= 1;
      const dir = ang + Math.PI + rand(-0.6, 0.6);
      const sp = rand(30, 150);
      this.sparks.push({
        x: x + rand(-2, 2),
        y: y + rand(-2, 2),
        vx: Math.cos(dir) * sp,
        vy: Math.sin(dir) * sp,
        life: 0,
        max: rand(0.35, 0.9),
        size: rand(0.8, 2.1),
        c: Math.random() < 0.7 ? [255, rand(150, 220) | 0, rand(60, 120) | 0] : RGB[tier],
        g: 90,
        drag: 2.2,
      });
    }
    if (this.sparks.length > 1400) this.sparks.splice(0, this.sparks.length - 1400);
  }

  launchFountain() {
    const { x0, y0 } = this;
    const n = this.reduced ? 14 : 44;
    for (let i = 0; i < n; i++) {
      const a = -Math.PI / 2 + rand(-0.7, 0.7);
      const sp = rand(60, 260);
      this.sparks.push({
        x: x0,
        y: y0 - 4,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        life: 0,
        max: rand(0.4, 1),
        size: rand(1, 2.4),
        c: [255, rand(170, 230) | 0, rand(70, 130) | 0],
        g: 280,
        drag: 1.4,
      });
    }
  }

  addFlare(x, y, ang, speed, life, c, g, tail) {
    this.flares.push({
      x,
      y,
      vx: Math.cos(ang) * speed,
      vy: Math.sin(ang) * speed,
      life: 0,
      max: life,
      c,
      g,
      tail,
      w: rand(1.2, 2.2),
    });
  }

  // A burst is a sphere of stars seen from the side: speeds follow the sphere's projection,
  // which is what gives a firework its dense rim. Bigger bursts for rarer multipliers.
  spawnBurst(f, now) {
    const { x, y } = this.head;
    const tier = tierOf(f.m);
    const scale = this.reduced ? 0.45 : 1;

    if (f.m <= 1.01) {
      // A dud: a fizzle, no bang.
      for (let i = 0; i < 22; i++) this.addFlare(x, y, rand(0, TAU), rand(30, 120), rand(0.5, 1.1), [255, 150, 90], 0, false);
      this.shake = { t0: now, amp: 2 };
      return;
    }

    const base = Math.min(this.W, this.H * 1.25);
    const R = base * { sr: 0.2, na: 0.3, cu: 0.38, mg: 0.46 }[tier];
    const count = Math.round({ sr: 90, na: 170, cu: 240, mg: 340 }[tier] * scale);
    const palette = STAR_SETS[tier];
    const drag = 2.5;

    for (let i = 0; i < count; i++) {
      const u = rand(-1, 1);
      const speed = R * drag * Math.sqrt(1 - u * u) * rand(0.9, 1.05);
      const life = rand(1.6, 2.6) + (tier === 'mg' ? 0.8 : 0);
      this.addFlare(x, y, rand(0, TAU), speed, life, palette[(Math.random() * palette.length) | 0], 60, tier === 'cu' || tier === 'mg' || Math.random() < 0.25);
    }
    if (tier !== 'sr') {
      const inner = Math.round(60 * scale);
      for (let i = 0; i < inner; i++) {
        this.addFlare(x, y, rand(0, TAU), R * drag * 0.42 * rand(0.8, 1), rand(1.2, 1.9), [255, 255, 255], 40, false);
      }
    }

    this.rings.push({ x, y, t0: now, R: R * 1.1, c: RGB[tier] });
    this.flash = { t0: now, x, y, tier };
    this.shake = { t0: now, amp: { sr: 3, na: 6, cu: 9, mg: 13 }[tier] };

    if (tier !== 'sr') {
      const breaks = tier === 'na' ? 3 : 6;
      for (let i = 0; i < breaks; i++) {
        this.later.push({
          at: now + 260 + i * rand(120, 240),
          fn: () => {
            const cx = x + rand(-R * 0.6, R * 0.6);
            const cy = y + rand(-R * 0.5, R * 0.5);
            const color = palette[(Math.random() * palette.length) | 0];
            for (let k = 0; k < Math.round(26 * scale); k++) {
              this.addFlare(cx, cy, rand(0, TAU), R * 0.55 * rand(0.5, 1.1), rand(0.7, 1.3), color, 50, false);
            }
          },
        });
      }
    }
  }

  drawParticles(dt) {
    const { ctx } = this;
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';

    const flares = this.flares;
    let w = 0;
    for (let i = 0; i < flares.length; i++) {
      const p = flares[i];
      p.life += dt;
      if (p.life >= p.max) continue;
      const k = Math.exp(-2.5 * dt);
      p.vx *= k;
      p.vy = p.vy * k + p.g * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      const a = Math.min(1, (1 - p.life / p.max) * 1.5);
      ctx.strokeStyle = rgba(p.c, a);
      ctx.lineWidth = p.w * (0.6 + 0.4 * a);
      ctx.beginPath();
      ctx.moveTo(p.x - p.vx * 0.05, p.y - p.vy * 0.05);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
      if (p.tail && !this.reduced && Math.random() < dt * 16) {
        this.sparks.push({ x: p.x, y: p.y, vx: rand(-12, 12), vy: rand(-8, 14), life: 0, max: rand(0.5, 1.1), size: 1.4, c: p.c, g: 40, drag: 1.2 });
      }
      flares[w++] = p;
    }
    flares.length = w;

    const sparks = this.sparks;
    w = 0;
    for (let i = 0; i < sparks.length; i++) {
      const p = sparks[i];
      p.life += dt;
      if (p.life >= p.max) continue;
      const k = Math.exp(-p.drag * dt);
      p.vx *= k;
      p.vy = p.vy * k + p.g * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      const a = 1 - p.life / p.max;
      ctx.fillStyle = rgba(p.c, a * a);
      ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
      sparks[w++] = p;
    }
    sparks.length = w;
    ctx.globalCompositeOperation = 'source-over';
  }

  drawRings(now) {
    const { ctx } = this;
    ctx.globalCompositeOperation = 'lighter';
    let w = 0;
    for (const r of this.rings) {
      const p = (now - r.t0) / 900;
      if (p >= 1) continue;
      this.rings[w++] = r;
      ctx.strokeStyle = rgba(r.c, 0.55 * (1 - p));
      ctx.lineWidth = 3 * (1 - p) + 0.5;
      ctx.beginPath();
      ctx.arc(r.x, r.y, r.R * (1 - (1 - p) ** 3), 0, TAU);
      ctx.stroke();
    }
    this.rings.length = w;
    ctx.globalCompositeOperation = 'source-over';
  }

  drawFlash(now) {
    const fl = this.flash;
    if (!fl) return;
    const p = (now - fl.t0) / 420;
    if (p >= 1) {
      this.flash = null;
      return;
    }
    const { ctx, W, H } = this;
    const a = (1 - p) ** 2 * (this.reduced ? 0.18 : 0.42);
    const grad = ctx.createRadialGradient(fl.x, fl.y, 0, fl.x, fl.y, Math.max(W, H) * 0.9);
    grad.addColorStop(0, `rgba(255,255,255,${a})`);
    grad.addColorStop(0.25, rgba(RGB[fl.tier], a * 0.5));
    grad.addColorStop(1, rgba(RGB[fl.tier], 0));
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = grad;
    ctx.fillRect(-40, -40, W + 80, H + 80);
    ctx.globalCompositeOperation = 'source-over';
  }

  // ---- cash-out pins --------------------------------------------------------

  addMark(e) {
    this.marks.push({ t: e.t, m: e.mult, at: performance.now(), text: `+${cents(e.payout)}` });
  }

  drawMarks(f, now) {
    if (f.phase !== 'flying' && f.phase !== 'burst') {
      this.marks.length = 0;
      return;
    }
    const { ctx, W } = this;
    const box = this.box(f);
    let w = 0;
    for (const k of this.marks) {
      const age = (now - k.at) / 1000;
      if (age > 3.2) continue;
      this.marks[w++] = k;
      const [x, y] = this.at(f, box, Math.min(k.t, box.t), k.m);
      ctx.globalAlpha = clamp(1 - Math.max(0, age - 2.2), 0, 1);
      ctx.strokeStyle = '#4be3a0';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x, y, 7 + Math.min(age, 0.4) * 10, 0, TAU);
      ctx.stroke();
      ctx.fillStyle = '#4be3a0';
      ctx.beginPath();
      ctx.arc(x, y, 3, 0, TAU);
      ctx.fill();

      ctx.font = `800 14px ${this.fontUI}`;
      const tw = ctx.measureText(k.text).width;
      const bx = clamp(x - tw / 2 - 8, 6, W - tw - 22);
      const by = y - 40;
      pill(ctx, bx, by, tw + 16, 24);
      ctx.fillStyle = 'rgba(8,12,44,0.86)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(75,227,160,0.8)';
      ctx.lineWidth = 1.2;
      ctx.stroke();
      ctx.fillStyle = '#4be3a0';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(k.text, bx + 8, by + 12.5);
    }
    this.marks.length = w;
    ctx.globalAlpha = 1;
  }
}
