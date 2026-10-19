'use client';

import Modal from './Modal';

const TIERS = [
  ['sr', 'Under 2×', 'Strontium red. The common burst.'],
  ['na', '2× to 10×', 'Sodium gold.'],
  ['cu', '10× to 100×', 'Copper blue, the hardest colour to make in a real shell.'],
  ['mg', '100× and up', 'Magnesium white. Rare.'],
];

export default function HelpModal({ open, onClose, engine }) {
  return (
    <Modal open={open} onClose={onClose} title="How Skyburst works">
      <ol className="steps">
        <li>
          <span>
            <strong>Place a bet before the fuse burns out.</strong> Two bets can run side by side.
          </span>
        </li>
        <li>
          <span>
            <strong>The shell climbs and the multiplier grows.</strong> Cash out at any moment to win your bet times the multiplier.
          </span>
        </li>
        <li>
          <span>
            <strong>At a random height it bursts.</strong> If you have not cashed out by then, the bet is lost.
          </span>
        </li>
      </ol>

      <h3>Shortcuts</h3>
      <p>
        <kbd>Space</kbd> or <kbd>1</kbd> acts on bet A, <kbd>2</kbd> on bet B. The same key places a bet, cancels it or cashes out.
      </p>
      <p>
        Auto cash out takes your win the moment the multiplier reaches the number you set. Rebet places the same bet again at the start of
        every round.
      </p>

      <h3>What the colours mean</h3>
      <ul className="legend">
        {TIERS.map(([tier, range, note]) => (
          <li key={tier}>
            <span className={`chip chip--${tier}`}>{range}</span>
            <span>{note}</span>
          </li>
        ))}
      </ul>

      <p className="note">
        Skyburst is a portfolio demo. Credits are virtual, nothing can be bought or withdrawn, and the other players and the chat are
        simulated.
      </p>
      <button
        type="button"
        className="btn btn--ghost"
        onClick={() => {
          if (engine.resetDemo()) onClose();
        }}
      >
        Reset demo balance
      </button>
    </Modal>
  );
}
