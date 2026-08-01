import { useEffect, useState } from 'react';
import { ArrowsClockwise } from '@phosphor-icons/react';

/** Live status: a pulsing dot, a self-ticking "updated Ns ago" label, and a
 *  manual refresh control. Keeps the auto-polling visible instead of silent. */
export default function LiveIndicator({ updatedAt, refreshing, onRefresh }) {
  const [, tick] = useState(0);

  // Re-render every second so the relative label stays fresh.
  useEffect(() => {
    const id = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const label = (() => {
    if (!updatedAt) return 'Waiting…';
    const secs = Math.max(0, Math.round((Date.now() - updatedAt) / 1000));
    if (secs < 5) return 'Updated just now';
    if (secs < 60) return `Updated ${secs}s ago`;
    return `Updated ${Math.round(secs / 60)}m ago`;
  })();

  return (
    <div className="live-indicator">
      <span className={`live-dot ${refreshing ? 'busy' : ''}`} aria-hidden="true" />
      <span className="live-label">{label}</span>
      <button
        className={`icon-btn xs ${refreshing ? 'spin' : ''}`}
        onClick={onRefresh}
        disabled={refreshing}
        aria-label="Refresh now"
        title="Refresh now"
      >
        <ArrowsClockwise size={15} weight="bold" />
      </button>
    </div>
  );
}
