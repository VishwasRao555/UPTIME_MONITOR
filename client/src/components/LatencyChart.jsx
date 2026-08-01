import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts';

export default function LatencyChart({ results }) {
  const data = results
    .filter((r) => r.responseTimeMs != null)
    .map((r) => ({
      time: new Date(r.checkedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      ms: r.responseTimeMs,
    }));

  if (data.length === 0) {
    return <p className="muted">No latency data yet. The first check is on its way.</p>;
  }

  return (
    <ResponsiveContainer width="100%" height={260}>
      <AreaChart data={data} margin={{ top: 8, right: 12, bottom: 4, left: -12 }}>
        <defs>
          <linearGradient id="lat" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#e6b52e" stopOpacity={0.55} />
            <stop offset="100%" stopColor="#e6b52e" stopOpacity={0.03} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#e7dfc9" vertical={false} />
        <XAxis dataKey="time" stroke="#6f6a5c" fontSize={11} minTickGap={44} tickLine={false} />
        <YAxis stroke="#6f6a5c" fontSize={11} unit="ms" tickLine={false} axisLine={false} />
        <Tooltip
          contentStyle={{ background: '#111', border: 'none', borderRadius: 10, color: '#fff' }}
          labelStyle={{ color: '#f5c842' }}
          cursor={{ stroke: '#111', strokeWidth: 1 }}
        />
        <Area type="monotone" dataKey="ms" stroke="#111" strokeWidth={2} fill="url(#lat)" />
      </AreaChart>
    </ResponsiveContainer>
  );
}
