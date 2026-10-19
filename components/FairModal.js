'use client';

import { useEffect, useState } from 'react';
import { verifyRound } from '../lib/fair';
import { shorten, tierOf } from '../lib/format';
import Modal from './Modal';
import { Check } from './Icons';

function Verdict({ result }) {
  if (result === undefined) return <span className="verdict">Checking</span>;
  if (result === null) return <span className="verdict verdict--bad">Could not check</span>;
  if (result.hashOk && result.crashOk) {
    return (
      <span className="verdict verdict--ok">
        <Check /> Matches
      </span>
    );
  }
  return <span className="verdict verdict--bad">Does not match</span>;
}

function Detail({ round, result }) {
  return (
    <div className="detail">
      <div className="detail__head">
        <strong>Round {round.id}</strong>
        <span className={`chip chip--${tierOf(round.crash)}`}>{round.crash.toFixed(2)}×</span>
        <Verdict result={result} />
      </div>
      <dl className="kv">
        <div>
          <dt>Server seed</dt>
          <dd>
            <code className="mono">{round.serverSeed}</code>
          </dd>
        </div>
        <div>
          <dt>SHA-256 of the seed, published before the round</dt>
          <dd>
            <code className="mono">{round.commit}</code>
          </dd>
        </div>
        <div>
          <dt>Client seed and nonce</dt>
          <dd>
            <code className="mono">
              {round.clientSeed}:{round.nonce}
            </code>
          </dd>
        </div>
      </dl>
    </div>
  );
}

export default function FairModal({ open, onClose, snap, engine, round }) {
  const [checks, setChecks] = useState({});
  const [focusCheck, setFocusCheck] = useState();
  const [seed, setSeed] = useState('');

  useEffect(() => {
    if (open) setSeed(snap.clientSeed);
    // Only reset the field when the dialog opens, not on every snapshot.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    let dead = false;
    const recent = snap.history.filter((h) => !h.warm).slice(0, 10);
    Promise.all(recent.map(async (r) => [r.id, await verifyRound(r).catch(() => null)])).then((pairs) => {
      if (!dead) setChecks(Object.fromEntries(pairs));
    });
    return () => {
      dead = true;
    };
  }, [open, snap.history]);

  useEffect(() => {
    setFocusCheck(undefined);
    if (!open || !round || round.warm) return undefined;
    let dead = false;
    verifyRound(round)
      .catch(() => null)
      .then((r) => {
        if (!dead) setFocusCheck(r);
      });
    return () => {
      dead = true;
    };
  }, [open, round]);

  const recent = snap.history.filter((h) => !h.warm).slice(0, 10);

  return (
    <Modal open={open} onClose={onClose} title="Fair play" wide>
      <p className="lead">
        Every burst height is fixed before its round starts. We publish a hash of a secret server seed up front, reveal the seed after the
        burst, and you can recompute the result yourself.
      </p>

      {round && !round.warm ? <Detail round={round} result={focusCheck} /> : null}
      {round?.warm ? (
        <p className="note">
          That is a warm-up round, generated when the page loaded to fill the history. It has no seeds to verify.
        </p>
      ) : null}

      <h3>This round</h3>
      <dl className="kv">
        <div>
          <dt>Round and nonce</dt>
          <dd>
            {snap.roundId || '–'} and {snap.nonce}
          </dd>
        </div>
        <div>
          <dt>SHA-256 of the server seed</dt>
          <dd>
            <code className="mono">{snap.commit || 'Warming up'}</code>
          </dd>
        </div>
      </dl>
      <div className="field">
        <label htmlFor="client-seed">Your client seed</label>
        <div className="field__row">
          <input id="client-seed" className="field__input mono" value={seed} onChange={(e) => setSeed(e.target.value)} maxLength={32} />
          <button
            type="button"
            className="btn"
            onClick={() => engine.setClientSeed(seed)}
            disabled={!seed.trim() || seed.trim() === snap.clientSeed}
          >
            Save seed
          </button>
        </div>
        <small>It applies from the second upcoming round, because the next one is already sealed.</small>
      </div>

      <h3>How the height is computed</h3>
      <pre className="formula">{`hash  = HMAC-SHA256(serverSeed, clientSeed:nonce)
u     = first 52 bits of hash / 2^52
burst = max(1, floor(97 / (1 - u)) / 100)`}</pre>
      <p>
        That returns 97% for every cash-out target, and about 4% of rounds burst at 1.00×.
      </p>

      <h3>Recent rounds</h3>
      {recent.length ? (
        <table className="table">
          <thead>
            <tr>
              <th>Round</th>
              <th>Burst</th>
              <th>Server seed</th>
              <th>Check</th>
            </tr>
          </thead>
          <tbody>
            {recent.map((r) => (
              <tr key={r.id}>
                <td>{r.id}</td>
                <td>
                  <span className={`chip chip--${tierOf(r.crash)}`}>{r.crash.toFixed(2)}×</span>
                </td>
                <td>
                  <code className="mono">{shorten(r.serverSeed, 6)}</code>
                </td>
                <td>
                  <Verdict result={checks[r.id]} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="note">Rounds you watch will be listed here, with their revealed seeds.</p>
      )}

      <p className="note">
        An honest limit: in this demo the seeds are generated in your own browser, so it shows the method, not a trust guarantee.
      </p>
    </Modal>
  );
}
