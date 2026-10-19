'use client';

import { useEffect, useRef, useState } from 'react';
import { cents } from '../lib/format';
import Orb from './Orb';
import { Send } from './Icons';

function RainCard({ rain, engine }) {
  const left = rain.total - rain.claimed.length;
  return (
    <div className={`rain${rain.open ? ' rain--open' : ''}`}>
      <div className="rain__head">
        <strong>Sky shower</strong>
        <span>{rain.mine ? 'You caught one' : rain.open ? `${left} left` : 'Over'}</span>
      </div>
      <p className="rain__text">
        {rain.total} shells of {cents(rain.value)} credits up for grabs.
      </p>
      {rain.claimed.length ? (
        <ul className="rain__who">
          {rain.claimed.map((c) => (
            <li key={c.name} className={c.mine ? 'rain__chip rain__chip--mine' : 'rain__chip'}>
              <Orb name={c.name} hue={c.hue} />
              {c.name}
            </li>
          ))}
        </ul>
      ) : null}
      {rain.open && !rain.mine ? (
        <button type="button" className="rain__claim" onClick={() => engine.claimRain()}>
          Claim {cents(rain.value)}
        </button>
      ) : null}
    </div>
  );
}

export default function Chat({ engine, snap }) {
  const [text, setText] = useState('');
  const list = useRef(null);
  const stick = useRef(true);

  useEffect(() => {
    const el = list.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [snap.chat]);

  const onScroll = () => {
    const el = list.current;
    stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 48;
  };

  const submit = (e) => {
    e.preventDefault();
    engine.sendChat(text);
    setText('');
    stick.current = true;
  };

  return (
    <section className="chat" aria-label="Chat">
      <h2 className="chat__title">Chat</h2>
      {snap.rain ? <RainCard rain={snap.rain} engine={engine} /> : null}
      <ul className="chat__list" ref={list} onScroll={onScroll}>
        {snap.chat.map((m) => (
          <li key={m.id} className={m.mine ? 'msg msg--mine' : 'msg'}>
            <span className="msg__name" style={{ color: `hsl(${m.hue} 85% 74%)` }}>
              {m.name}
            </span>{' '}
            <span className="msg__text">{m.text}</span>
          </li>
        ))}
      </ul>
      <form className="chat__form" onSubmit={submit}>
        <input
          className="chat__input"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Say something nice"
          maxLength={140}
          aria-label="Message"
        />
        <button type="submit" className="chat__send" aria-label="Send message" disabled={!text.trim()}>
          <Send />
        </button>
      </form>
    </section>
  );
}
