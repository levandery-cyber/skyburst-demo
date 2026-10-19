import { cents } from '../lib/format';
import { Coin, Help, Mark, Speaker, SpeakerOff } from './Icons';

export default function Header({ snap, engine, onHelp }) {
  return (
    <header className="top">
      <div className="brand">
        <Mark size={30} />
        <span className="brand__name">Skyburst</span>
        <span className="brand__tag">Cash out before the shell breaks</span>
      </div>

      <div className="top__right">
        <div className="balance" title="Demo credits. Not real money.">
          <Coin />
          <span className="balance__num">{cents(snap.balance)}</span>
        </div>
        <button
          type="button"
          className="icon-btn"
          aria-pressed={snap.sound}
          aria-label={snap.sound ? 'Mute sound' : 'Turn sound on'}
          onClick={() => engine.setSound(!snap.sound)}
        >
          {snap.sound ? <Speaker /> : <SpeakerOff />}
        </button>
        <button type="button" className="icon-btn" aria-label="How to play" onClick={onHelp}>
          <Help />
        </button>
      </div>
    </header>
  );
}
