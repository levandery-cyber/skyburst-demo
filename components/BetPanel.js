'use client';

import { useEffect, useRef, useState } from 'react';
import { CFG, floor2, payoutFor } from '../lib/engine';
import { cents, parseCredits } from '../lib/format';
import { Minus, Plus } from './Icons';

const QUICK = [5, 10, 25, 100];

// The cash-out amount ticks every frame, so it bypasses React state.
function LiveAmount({ engine, amount }) {
  const ref = useRef(null);
  useEffect(() => {
    let raf = 0;
    const loop = () => {
      const f = engine.frame();
      if (ref.current) ref.current.textContent = cents(payoutFor(amount, floor2(f.m)));
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [engine, amount]);
  return <span ref={ref}>{cents(amount)}</span>;
}

function Switch({ checked, disabled, onChange, label }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      className="switch"
      onClick={() => onChange(!checked)}
    >
      <span className="switch__thumb" />
    </button>
  );
}

// What the big button says and does, from the state of the bet and of the round.
function viewOf(slot, phase, balance) {
  const b = slot.bet;
  if (b?.status === 'flying') return { kind: 'cash', label: 'Cash out', live: true };
  if (b?.status === 'placed') return { kind: 'cancel', label: 'Cancel bet', sub: `${cents(b.amount)} placed` };
  if (b?.status === 'queued') return { kind: 'cancel', label: 'Cancel bet', sub: 'Starts next round' };
  if (balance < CFG.minBet) return { kind: 'refill', label: 'Refill credits', sub: 'Your demo balance is empty' };
  return { kind: 'bet', label: phase === 'waiting' ? 'Place bet' : 'Bet next round', sub: cents(slot.amount) };
}

export default function BetPanel({ id, engine, snap }) {
  const slot = snap.slots[id];
  const bet = slot.bet;
  const locked = !!bet && (bet.status === 'placed' || bet.status === 'queued' || bet.status === 'flying');
  const view = viewOf(slot, snap.phase, snap.balance);
  const [amountText, setAmountText] = useState(null);
  const [atText, setAtText] = useState(null);

  const commitAmount = () => {
    if (amountText === null) return;
    const v = parseCredits(amountText);
    if (!Number.isNaN(v)) engine.setAmount(id, v);
    setAmountText(null);
  };
  const commitAt = () => {
    if (atText === null) return;
    const v = Number.parseFloat(atText.replace(',', '.'));
    if (Number.isFinite(v)) engine.setAuto(id, { at: v });
    setAtText(null);
  };
  const blurOnEnter = (e) => {
    if (e.key === 'Enter') e.currentTarget.blur();
  };

  let result = null;
  if (bet?.status === 'won') result = { kind: 'win', text: `Won ${cents(bet.payout)} at ${bet.mult.toFixed(2)}×` };
  if (bet?.status === 'lost') result = { kind: 'loss', text: `Burst. Lost ${cents(bet.amount)}` };

  return (
    <section className={`ticket ticket--${view.kind}`} aria-label={`Bet ${id.toUpperCase()}`}>
      <div className="ticket__main">
        <div className="ticket__row">
          <span className="ticket__tag" aria-hidden="true">
            {id.toUpperCase()}
          </span>
          <div className="stepper">
            <button type="button" className="stepper__btn" disabled={locked} onClick={() => engine.bump(id, -1)} aria-label="Lower the bet">
              <Minus />
            </button>
            <input
              className="stepper__input"
              inputMode="decimal"
              aria-label="Bet amount"
              disabled={locked}
              value={amountText ?? (slot.amount / 100).toFixed(2)}
              onChange={(e) => setAmountText(e.target.value)}
              onFocus={(e) => e.currentTarget.select()}
              onBlur={commitAmount}
              onKeyDown={blurOnEnter}
            />
            <button type="button" className="stepper__btn" disabled={locked} onClick={() => engine.bump(id, 1)} aria-label="Raise the bet">
              <Plus />
            </button>
          </div>
        </div>

        <div className="quick">
          {QUICK.map((q) => (
            <button key={q} type="button" className="quick__btn" disabled={locked} onClick={() => engine.setAmount(id, q * 100)}>
              {q}
            </button>
          ))}
        </div>

        <div className="opts">
          <div className="opt">
            <Switch label="Auto cash out" checked={slot.autoCash} disabled={locked} onChange={(v) => engine.setAuto(id, { autoCash: v })} />
            <span className="opt__label">Auto cash out</span>
            <label className="mini">
              <input
                inputMode="decimal"
                aria-label="Auto cash out multiplier"
                disabled={locked}
                value={atText ?? slot.at.toFixed(2)}
                onChange={(e) => setAtText(e.target.value)}
                onFocus={(e) => e.currentTarget.select()}
                onBlur={commitAt}
                onKeyDown={blurOnEnter}
              />
              <span>×</span>
            </label>
          </div>
          <div className="opt">
            <Switch label="Rebet every round" checked={slot.rebet} disabled={locked} onChange={(v) => engine.setAuto(id, { rebet: v })} />
            <span className="opt__label">Rebet every round</span>
          </div>
        </div>
      </div>

      <div className="ticket__go">
        {result ? <p className={`result result--${result.kind}`}>{result.text}</p> : null}
        <button
          type="button"
          className={`go go--${view.kind}`}
          onClick={() => (view.kind === 'refill' ? engine.refill() : engine.primary(id))}
        >
          <span className="go__label">{view.label}</span>
          <span className="go__sub">{view.live ? <LiveAmount engine={engine} amount={bet.amount} /> : view.sub}</span>
        </button>
      </div>
    </section>
  );
}
