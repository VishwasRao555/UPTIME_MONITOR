import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  ArrowLeft, ArrowClockwise, Pencil, Trash, Pause, Play, Copy, Check,
} from '@phosphor-icons/react';
import {
  getMonitor, getResults, getIncidents, updateMonitor, deleteMonitor, checkNow,
} from '../api/monitor.api';
import StatusPill from '../components/StatusPill';
import LatencyChart from '../components/LatencyChart';
import MonitorForm from '../components/MonitorForm';
import { useToast } from '../context/ToastContext';
import { statusLabel, formatUptime, formatMs, formatDuration, formatRelative } from '../utils/format';

const RANGES = ['1h', '24h', '7d', '30d'];

function DetailStat({ label, value, cls }) {
  return (
    <div className="stat">
      <div className="k">{label}</div>
      <div className={`v tnum ${cls || ''}`}>{value}</div>
    </div>
  );
}

export default function MonitorDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const [monitor, setMonitor] = useState(null);
  const [results, setResults] = useState({ results: [], uptime: null });
  const [incidents, setIncidents] = useState([]);
  const [range, setRange] = useState('24h');
  const [error, setError] = useState(null);
  const [editing, setEditing] = useState(false);
  const [checking, setChecking] = useState(false);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    try {
      const [m, r, inc] = await Promise.all([
        getMonitor(id),
        getResults(id, range),
        getIncidents(id),
      ]);
      setMonitor(m);
      setResults(r);
      setIncidents(inc);
      setError(null);
    } catch {
      setError('Could not load this monitor.');
    }
  }, [id, range]);

  useEffect(() => {
    load();
    const t = setInterval(load, 10000);
    return () => clearInterval(t);
  }, [load]);

  async function togglePause() {
    try {
      await updateMonitor(id, { isActive: !monitor.isActive });
      toast.success(monitor.isActive ? 'Monitoring paused' : 'Monitoring resumed');
      load();
    } catch {
      toast.error('Could not update monitor');
    }
  }
  async function runCheck() {
    setChecking(true);
    try {
      await checkNow(id);
      toast.info('Check complete');
      await load();
    } catch {
      toast.error('Check failed');
    } finally {
      setChecking(false);
    }
  }
  async function remove() {
    if (!confirm('Delete this monitor and all its history? This cannot be undone.')) return;
    try {
      await deleteMonitor(id);
      toast.success('Monitor deleted');
      navigate('/');
    } catch {
      toast.error('Could not delete monitor');
    }
  }
  async function copyUrl() {
    try {
      await navigator.clipboard.writeText(monitor.url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error('Could not copy URL');
    }
  }

  if (error) {
    return (
      <div className="container">
        <div className="error-banner" role="alert">{error}</div>
        <Link to="/" className="back-link"><ArrowLeft size={15} weight="bold" /> All monitors</Link>
      </div>
    );
  }
  if (!monitor) {
    return (
      <div className="container">
        <div className="skeleton" style={{ height: 44, width: 240, marginBottom: 18 }} />
        <div className="skeleton sk-card" />
      </div>
    );
  }

  const lastResult = results.results[results.results.length - 1];

  return (
    <div className="container">
      <Link to="/" className="back-link"><ArrowLeft size={15} weight="bold" /> All monitors</Link>

      <div className="detail-head">
        <div className="detail-title">
          <div className="detail-title-row">
            <h1>{monitor.name}</h1>
            <StatusPill label={statusLabel(monitor)} />
          </div>
          <div className="detail-url">
            <a href={monitor.url} target="_blank" rel="noreferrer noopener" onClick={(e) => e.stopPropagation()}>
              {monitor.url}
            </a>
            <button className="icon-btn xs" onClick={copyUrl} title="Copy URL" aria-label="Copy URL">
              {copied ? <Check size={14} weight="bold" /> : <Copy size={14} weight="bold" />}
            </button>
          </div>
        </div>

        <div className="detail-actions">
          <button className={`btn ghost sm ${checking ? 'is-busy' : ''}`} onClick={runCheck} disabled={checking}>
            <ArrowClockwise size={15} weight="bold" className={checking ? 'spinning' : ''} />
            {checking ? 'Checking…' : 'Check now'}
          </button>
          <button className="btn ghost sm" onClick={() => setEditing(true)}>
            <Pencil size={15} weight="bold" /> Edit
          </button>
          <button className="btn ghost sm" onClick={togglePause}>
            {monitor.isActive ? <><Pause size={15} weight="bold" /> Pause</> : <><Play size={15} weight="bold" /> Resume</>}
          </button>
          <button className="btn danger sm" onClick={remove}><Trash size={15} weight="bold" /> Delete</button>
        </div>
      </div>

      <div className="detail-stats">
        <DetailStat label={`Uptime ${range}`} value={formatUptime(results.uptime)} cls="accent" />
        <DetailStat label="Last response" value={formatMs(lastResult?.responseTimeMs)} />
        <DetailStat label="Last status" value={lastResult?.statusCode ?? '—'} />
        <DetailStat label="Interval" value={`${monitor.intervalSeconds}s`} />
        <DetailStat label="Checks logged" value={results.results.length} />
        <DetailStat label="Last checked" value={formatRelative(monitor.lastCheckedAt)} />
      </div>

      <div className="section">
        <div className="section-head">
          <h3>Latency</h3>
          <div className="range-toggle" role="tablist" aria-label="Time range">
            {RANGES.map((r) => (
              <button
                key={r}
                role="tab"
                aria-selected={range === r}
                className={range === r ? 'active' : ''}
                onClick={() => setRange(r)}
              >
                {r}
              </button>
            ))}
          </div>
        </div>
        <LatencyChart results={results.results} />
      </div>

      <div className="section">
        <div className="section-head">
          <h3>Incidents</h3>
          {incidents.length > 0 && <span className="muted count-badge">{incidents.length}</span>}
        </div>
        {incidents.length === 0 ? (
          <div className="section-empty">
            <Check size={22} weight="bold" />
            <p className="muted">No incidents recorded. All clear.</p>
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Started</th><th>Resolved</th><th>Duration</th><th>Cause</th></tr>
              </thead>
              <tbody>
                {incidents.map((i) => (
                  <tr key={i._id}>
                    <td className="tnum">{new Date(i.startedAt).toLocaleString()}</td>
                    <td className="tnum">
                      {i.resolvedAt
                        ? new Date(i.resolvedAt).toLocaleString()
                        : <span className="ongoing">ongoing</span>}
                    </td>
                    <td className="tnum">{formatDuration(i.durationSeconds)}</td>
                    <td className="muted">{i.cause || 'n/a'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {editing && (
        <MonitorForm
          monitor={monitor}
          onClose={() => setEditing(false)}
          onSaved={() => { toast.success('Monitor updated'); load(); }}
        />
      )}
    </div>
  );
}
