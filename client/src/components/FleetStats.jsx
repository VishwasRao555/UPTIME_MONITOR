import { PulseIcon, CheckCircle, WarningOctagon, Timer, ShieldCheck } from '@phosphor-icons/react';
import { formatUptime, formatMs } from '../utils/format';

function Stat({ icon, label, value, cls }) {
  return (
    <div className="stat">
      <div className="k">{icon}{label}</div>
      <div className={`v ${cls || ''}`}>{value}</div>
    </div>
  );
}

/** The dark fleet summary bar that sits at the base of the hero. */
export default function FleetStats({ overview }) {
  const o = overview || {};
  return (
    <div className="stats-bar">
      <Stat icon={<PulseIcon size={14} weight="bold" />} label="Monitors" value={o.total ?? 0} cls="accent" />
      <Stat icon={<CheckCircle size={14} weight="bold" />} label="Up" value={o.up ?? 0} cls="up" />
      <Stat icon={<WarningOctagon size={14} weight="bold" />} label="Down" value={o.down ?? 0} cls="down" />
      <Stat icon={<Timer size={14} weight="bold" />} label="Avg response" value={formatMs(o.avgResponseMs)} />
      <Stat icon={<ShieldCheck size={14} weight="bold" />} label="Uptime 24h" value={formatUptime(o.overallUptime24h)} cls="accent" />
    </div>
  );
}
