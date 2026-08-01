/** A compact strip of the most recent checks: green = up, red = down, grey =
 * not enough history yet. Pads to a fixed slot count so every card lines up. */
export default function UptimeBar({ recent = [], slots = 20 }) {
  const pad = Math.max(0, slots - recent.length);
  const cells = [
    ...Array.from({ length: pad }, () => null),
    ...recent.slice(-slots),
  ];
  return (
    <div className="uptime-strip" title="Recent checks (oldest to newest)">
      {cells.map((c, i) => (
        <span
          key={i}
          className={`bar ${c == null ? '' : c.isUp ? 'up' : 'down'}`}
        />
      ))}
    </div>
  );
}
