'use client';

import { useEffect, useRef } from 'react';
import { Sky } from '../lib/sky';
import { floor2 } from '../lib/curve';
import { tierOf } from '../lib/format';
import { sfx } from '../lib/audio';
import History from './History';
import Orb from './Orb';
import Toasts from './Toasts';
import { Shield } from './Icons';

function announce(snap) {
  if (snap.phase === 'waiting') return `Round ${snap.roundId} is open. Place your bets.`;
  if (snap.phase === 'flying') return `Round ${snap.roundId} has launched.`;
  if (snap.phase === 'burst' && snap.crash) return `Burst at ${snap.crash.toFixed(2)} times.`;
  return '';
}

// The canvas and the big number are driven straight from the animation frame, not through React state.
export default function Stage({ engine, snap, onFair }) {
  const root = useRef(null);
  const canvas = useRef(null);
  const num = useRef(null);
  const unit = useRef(null);

  useEffect(() => {
    const el = root.current;
    const sky = new Sky(canvas.current, { reduced: window.matchMedia('(prefers-reduced-motion: reduce)').matches });
    const fit = () => {
      const r = el.getBoundingClientRect();
      sky.resize(Math.max(1, Math.round(r.width)), Math.max(1, Math.round(r.height)), Math.min(2, window.devicePixelRatio || 1));
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    const offCash = engine.on('cashout', (e) => sky.addMark(e));

    let raf = 0;
    let phase = '';
    let tier = '';
    let text = '';
    const loop = () => {
      const now = engine.now();
      engine.tick(now);
      const f = engine.frame(now);
      sky.draw(f, now);

      if (f.phase !== phase) {
        phase = f.phase;
        el.dataset.phase = f.phase;
        unit.current.textContent = f.phase === 'waiting' ? 's' : '×';
      }
      const t = f.phase === 'waiting' || f.phase === 'boot' ? 'idle' : tierOf(f.m);
      if (t !== tier) {
        tier = t;
        el.dataset.tier = t;
      }
      const s = f.phase === 'waiting' ? (f.left / 1000).toFixed(1) : f.phase === 'boot' ? '' : floor2(f.m).toFixed(2);
      if (s !== text) {
        text = s;
        num.current.textContent = s;
      }
      if (f.phase === 'flying') sfx.flightUpdate(f.m);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      offCash();
    };
  }, [engine]);

  return (
    <section className="stage" ref={root} aria-label="Game stage">
      <canvas ref={canvas} aria-hidden="true" />

      <div className="stage__top">
        <History items={snap.history} onPick={onFair} />
        <button type="button" className="pill" onClick={() => onFair(null)}>
          <Shield />
          Fair play
        </button>
      </div>

      <div className="hud" aria-hidden="true">
        <span className="hud__kicker" />
        <div className="hud__mult">
          <span className="hud__num" ref={num} />
          <span className="hud__unit" ref={unit}>
            ×
          </span>
        </div>
        <span className="hud__sub" />
      </div>

      <Toasts engine={engine} />

      <div className="stage__foot">
        <span className="stage__round">{snap.roundId ? `Round ${snap.roundId}` : 'Warming up'}</span>
        {snap.phase !== 'boot' && snap.phase !== 'burst' ? (
          <span className="air">
            <span className="air__orbs" aria-hidden="true">
              <Orb name="n" hue={210} />
              <Orb name="k" hue={330} />
              <Orb name="o" hue={40} />
            </span>
            <strong>{snap.inAir}</strong> {snap.phase === 'waiting' ? 'bets placed' : 'in the air'}
          </span>
        ) : null}
      </div>

      <p className="sr-only" role="status" aria-live="polite">
        {announce(snap)}
      </p>
    </section>
  );
}
