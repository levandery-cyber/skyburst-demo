'use client';

import { memo, useState } from 'react';
import { cents, tierOf, timeLabel } from '../lib/format';
import Orb from './Orb';

const Row = memo(function Row({ r }) {
  const won = r.status === 'won';
  return (
    <li className={`row${won ? ' row--won' : ''}${r.mine ? ' row--mine' : ''}`}>
      <span className="row__who">
        <Orb name={r.name} hue={r.hue} />
        <span className="row__name">{r.name}</span>
      </span>
      <span className="row__num">{cents(r.amount)}</span>
      <span className="row__mult">{r.mult ? <span className={`chip chip--${tierOf(r.mult)}`}>{r.mult.toFixed(2)}×</span> : null}</span>
      <span className="row__num row__num--win">{r.payout ? cents(r.payout) : ''}</span>
    </li>
  );
});

function ColumnHead({ first = 'Player', last = 'Win' }) {
  return (
    <div className="colhead" aria-hidden="true">
      <span>{first}</span>
      <span>Bet</span>
      <span>Burst</span>
      <span>{last}</span>
    </div>
  );
}

function Live({ snap }) {
  const share = snap.feedCount ? (snap.inAir / snap.feedCount) * 100 : 0;
  return (
    <>
      <div className="feed__sum">
        <div>
          <p className="feed__big">
            <strong>{snap.inAir}</strong> of {snap.feedCount} still in the air
          </p>
          <div className="meter" aria-hidden="true">
            <span style={{ width: `${share}%` }} />
          </div>
        </div>
        <div className="feed__win">
          <span>Total win</span>
          <strong>{cents(snap.totalWin)}</strong>
        </div>
      </div>
      <ColumnHead />
      <ul className="rows">
        {snap.feed.map((r) => (
          <Row key={r.id} r={r} />
        ))}
      </ul>
    </>
  );
}

function Mine({ snap }) {
  const net = snap.myBets.reduce((sum, b) => sum + b.payout - b.amount, 0);
  if (!snap.myBets.length) {
    return <p className="empty">Your bets show up here. Place one before the next launch.</p>;
  }
  return (
    <>
      <div className="feed__sum">
        <p className="feed__big">Last {snap.myBets.length} bets</p>
        <div className="feed__win">
          <span>Result</span>
          <strong className={net < 0 ? 'neg' : 'pos'}>
            {net > 0 ? '+' : net < 0 ? '−' : ''}
            {cents(Math.abs(net))}
          </strong>
        </div>
      </div>
      <ColumnHead first="Time" />
      <ul className="rows">
        {snap.myBets.map((b) => (
          <li key={b.id} className={`row${b.payout ? ' row--won' : ''}`}>
            <span className="row__name row__name--dim">{timeLabel(b.at)}</span>
            <span className="row__num">{cents(b.amount)}</span>
            <span className="row__mult">{b.mult ? <span className={`chip chip--${tierOf(b.mult)}`}>{b.mult.toFixed(2)}×</span> : null}</span>
            <span className="row__num row__num--win">{b.payout ? cents(b.payout) : ''}</span>
          </li>
        ))}
      </ul>
    </>
  );
}

function Top({ snap }) {
  return (
    <>
      <div className="feed__sum">
        <p className="feed__big">Biggest wins this session</p>
      </div>
      <ColumnHead />
      <ul className="rows">
        {snap.top.map((t) => (
          <Row key={t.id} r={{ ...t, status: 'won' }} />
        ))}
      </ul>
    </>
  );
}

const TABS = [
  ['live', 'Live bets'],
  ['mine', 'My bets'],
  ['top', 'Top wins'],
];

export default function Feed({ snap }) {
  const [tab, setTab] = useState('live');
  return (
    <section className="feed" aria-label="Bets">
      <div className="tabs" role="tablist">
        {TABS.map(([key, label]) => (
          <button key={key} type="button" role="tab" aria-selected={tab === key} className="tab" onClick={() => setTab(key)}>
            {label}
          </button>
        ))}
      </div>
      <div className="feed__body" role="tabpanel">
        {tab === 'live' ? <Live snap={snap} /> : tab === 'mine' ? <Mine snap={snap} /> : <Top snap={snap} />}
      </div>
    </section>
  );
}
