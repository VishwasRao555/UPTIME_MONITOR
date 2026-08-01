import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowClockwise, Pause, Play, CaretRight } from '@phosphor-icons/react';
import StatusPill from './StatusPill';
import UptimeBar from './UptimeBar';
import { checkNow, updateMonitor } from '../api/monitor.api';
import { useToast } from '../context/ToastContext';
import { statusLabel, formatUptime, formatMs, formatRelative } from '../utils/format';

export default function MonitorCard({ monitor, onChanged }) {
  const navigate = useNavigate();
  const toast = useToast();
  const [checking, setChecking] = useState(false);
  const [pausing, setPausing] = useState(false);

  const open = () => navigate(`/monitors/${monitor._id}`);

  async function runCheck(e) {
    e.stopPropagation();
    setChecking(true);
    try {
      await checkNow(monitor._id);
      toast.info(`Checked ${monitor.name}`);
      onChanged?.();
    } catch {
      toast.error(`Could not check ${monitor.name}`);
    } finally {
      setChecking(false);
    }
  }

  async function togglePause(e) {
    e.stopPropagation();
    setPausing(true);
    try {
      await updateMonitor(monitor._id, { isActive: !monitor.isActive });
      toast.success(
        monitor.isActive ? `Paused ${monitor.name}` : `Monitoring ${monitor.name} again`
      );
      onChanged?.();
    } catch {
      toast.error('Could not update monitor');
    } finally {
      setPausing(false);
    }
  }

  return (
    <div
      className="card"
      onClick={open}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && open()}
    >
      <div className="card-head">
        <div className="card-heading">
          <div className="card-title">{monitor.name}</div>
          <div className="card-url">{monitor.url}</div>
        </div>
        <StatusPill label={statusLabel(monitor)} />
      </div>

      <UptimeBar recent={monitor.recent} />

      <div className="card-metrics">
        <div className="metric">
          <div className="label">Uptime 24h</div>
          <div className="value tnum">{formatUptime(monitor.uptime24h)}</div>
        </div>
        <div className="metric">
          <div className="label">Response</div>
          <div className="value tnum">{formatMs(monitor.lastResponseMs)}</div>
        </div>
        <div className="metric">
          <div className="label">Every</div>
          <div className="value tnum">{monitor.intervalSeconds}s</div>
        </div>
      </div>

      <div className="card-foot">
        <div className="card-foot-meta">
          <span className="method-badge">{monitor.method}</span>
          <span className="ago">Checked {formatRelative(monitor.lastCheckedAt)}</span>
        </div>
        <div className="card-actions">
          <button
            className={`icon-btn ${checking ? 'spin' : ''}`}
            onClick={runCheck}
            disabled={checking}
            title="Check now"
            aria-label={`Check ${monitor.name} now`}
          >
            <ArrowClockwise size={17} weight="bold" />
          </button>
          <button
            className="icon-btn"
            onClick={togglePause}
            disabled={pausing}
            title={monitor.isActive ? 'Pause' : 'Resume monitoring'}
            aria-label={monitor.isActive ? `Pause ${monitor.name}` : `Resume monitoring ${monitor.name}`}
          >
            {monitor.isActive ? <Pause size={17} weight="bold" /> : <Play size={17} weight="bold" />}
          </button>
          <button
            className="icon-btn"
            onClick={(e) => { e.stopPropagation(); open(); }}
            title="Open details"
            aria-label={`Open ${monitor.name} details`}
          >
            <CaretRight size={17} weight="bold" />
          </button>
        </div>
      </div>
    </div>
  );
}
