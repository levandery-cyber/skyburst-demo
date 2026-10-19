import { tierOf } from '../lib/format';

// Recent burst heights, newest first. Click one to open its fairness details.
export default function History({ items, onPick }) {
  return (
    <ol className="history" aria-label="Recent bursts">
      {items.slice(0, 30).map((h) => (
        <li key={h.id}>
          <button
            type="button"
            className={`chip chip--${tierOf(h.crash)}`}
            onClick={() => onPick(h)}
            title={h.warm ? 'Warm-up round' : `Round ${h.id}`}
          >
            {h.crash.toFixed(2)}×
          </button>
        </li>
      ))}
    </ol>
  );
}
