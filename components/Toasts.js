'use client';

import { useEffect, useState } from 'react';

// Short messages over the stage: cash-outs, rejected bets, the sky shower.
export default function Toasts({ engine }) {
  const [items, setItems] = useState([]);

  useEffect(
    () =>
      engine.on('toast', (t) => {
        setItems((list) => [...list.slice(-2), t]);
        setTimeout(() => setItems((list) => list.filter((x) => x.id !== t.id)), 3400);
      }),
    [engine],
  );

  return (
    <div className="toasts" role="status" aria-live="polite">
      {items.map((t) => (
        <div key={t.id} className={`toast toast--${t.kind}`}>
          <span>{t.text}</span>
          {t.amount ? <strong className="toast__amount">{t.amount}</strong> : null}
        </div>
      ))}
    </div>
  );
}
