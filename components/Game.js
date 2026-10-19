'use client';

import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { createEngine } from '../lib/engine';
import { sfx } from '../lib/audio';
import { tierOf } from '../lib/format';
import Header from './Header';
import Stage from './Stage';
import BetPanel from './BetPanel';
import Feed from './Feed';
import Chat from './Chat';
import FairModal from './FairModal';
import HelpModal from './HelpModal';

function useSfx(engine, on) {
  useEffect(() => {
    // Browsers only allow audio after a gesture.
    const unlock = () => sfx.unlock();
    window.addEventListener('pointerdown', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });
    const offs = [
      engine.on('phase', (e) => {
        if (e.phase === 'flying') {
          sfx.launch();
          sfx.flightStart();
        }
      }),
      engine.on('burst', (e) => {
        sfx.flightStop();
        sfx.burst(tierOf(e.crash), e.crash <= 1.01);
      }),
      engine.on('cashout', () => sfx.cash()),
      engine.on('bet', () => sfx.bet()),
      engine.on('cancel', () => sfx.cancel()),
    ];
    return () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
      offs.forEach((off) => off());
      sfx.flightStop();
    };
  }, [engine]);

  useEffect(() => {
    sfx.setMuted(!on);
  }, [on]);
}

// Space or 1 acts on bet A, 2 on bet B.
function useHotkeys(engine) {
  useEffect(() => {
    const onKey = (e) => {
      if (e.metaKey || e.ctrlKey || e.altKey || e.repeat) return;
      const t = e.target;
      if (t instanceof HTMLElement) {
        if (t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName)) return;
        if (t.tagName === 'BUTTON' && e.code === 'Space') return; // let a focused button handle its own Space
      }
      if (document.querySelector('dialog[open]')) return;
      if (e.code === 'Space' || e.key === '1') {
        e.preventDefault();
        engine.primary('a');
      } else if (e.key === '2') {
        e.preventDefault();
        engine.primary('b');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [engine]);
}

export default function Game() {
  const [engine] = useState(() => createEngine());
  const snap = useSyncExternalStore(engine.subscribe, engine.getSnapshot, engine.getServerSnapshot);
  const [modal, setModal] = useState({ kind: null, round: null });

  useEffect(() => {
    engine.start();
    return () => engine.stop();
  }, [engine]);
  useEffect(() => {
    // Handy for poking at the engine from the console while developing. Never shipped.
    if (process.env.NODE_ENV !== 'production') window.__skyburst = engine;
  }, [engine]);
  useSfx(engine, snap.sound);
  useHotkeys(engine);

  const openFair = useCallback((round) => setModal({ kind: 'fair', round: round ?? null }), []);
  const openHelp = useCallback(() => setModal({ kind: 'help', round: null }), []);
  const close = useCallback(() => setModal({ kind: null, round: null }), []);

  return (
    <div className="app">
      <Header snap={snap} engine={engine} onHelp={openHelp} />

      <main className="main">
        <div className="play">
          <Stage engine={engine} snap={snap} onFair={openFair} />
          <div className="console">
            <BetPanel id="a" engine={engine} snap={snap} />
            <BetPanel id="b" engine={engine} snap={snap} />
          </div>
        </div>

        <aside className="side">
          <Feed snap={snap} />
          <Chat engine={engine} snap={snap} />
        </aside>
      </main>

      <footer className="foot">Demo only: virtual credits, no real money. Other players and the chat are simulated.</footer>

      <FairModal open={modal.kind === 'fair'} onClose={close} snap={snap} engine={engine} round={modal.round} />
      <HelpModal open={modal.kind === 'help'} onClose={close} engine={engine} />
    </div>
  );
}
