import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { Plus, MagnifyingGlass, X, ArrowsClockwise, FunnelSimple } from '@phosphor-icons/react';
import { listMonitors, getOverview } from '../api/monitor.api';
import MonitorCard from '../components/MonitorCard';
import MonitorForm from '../components/MonitorForm';
import FleetStats from '../components/FleetStats';
import LiveIndicator from '../components/LiveIndicator';
import { useToast } from '../context/ToastContext';
import { statusLabel } from '../utils/format';

const FILTERS = ['ALL', 'UP', 'DOWN', 'PAUSED'];
const REFRESH_MS = 10000;

const SORTS = {
  recent: { label: 'Newest', fn: (a, b) => new Date(b.createdAt) - new Date(a.createdAt) },
  name: { label: 'Name A–Z', fn: (a, b) => a.name.localeCompare(b.name) },
  uptime: { label: 'Uptime', fn: (a, b) => (b.uptime24h ?? -1) - (a.uptime24h ?? -1) },
  response: { label: 'Slowest', fn: (a, b) => (b.lastResponseMs ?? -1) - (a.lastResponseMs ?? -1) },
};

export default function Dashboard() {
  const toast = useToast();
  const [monitors, setMonitors] = useState([]);
  const [overview, setOverview] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [filter, setFilter] = useState('ALL');
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState('recent');
  const [updatedAt, setUpdatedAt] = useState(null);
  const searchRef = useRef(null);

  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      const [m, o] = await Promise.all([listMonitors(), getOverview()]);
      setMonitors(m);
      setOverview(o);
      setUpdatedAt(Date.now());
      setError(null);
    } catch (err) {
      // "Is the server running on port 5000?" was true when the API only ever
      // ran on localhost. Deployed, the API is on its own host and that advice
      // sends people to look at the wrong machine — so say what actually
      // happened instead of guessing at a cause that no longer applies.
      setError(
        err?.response
          ? 'The API returned an error. Retry, or check the server logs.'
          : 'Cannot reach the API. It may be offline, or still starting up.'
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, REFRESH_MS);
    return () => clearInterval(id);
  }, [load]);

  // Keyboard shortcuts: "n" opens the form, "/" focuses search.
  useEffect(() => {
    const onKey = (e) => {
      const typing = /^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName);
      if (e.key === '/' && !typing) {
        e.preventDefault();
        searchRef.current?.focus();
      } else if ((e.key === 'n' || e.key === 'N') && !typing && !showForm) {
        e.preventDefault();
        setShowForm(true);
      } else if (e.key === 'Escape' && document.activeElement === searchRef.current) {
        setQuery('');
        searchRef.current?.blur();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [showForm]);

  const counts = useMemo(() => {
    const c = { ALL: monitors.length, UP: 0, DOWN: 0, PAUSED: 0 };
    for (const m of monitors) {
      const label = statusLabel(m);
      if (c[label] != null) c[label] += 1;
    }
    return c;
  }, [monitors]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return monitors
      .filter((m) => filter === 'ALL' || statusLabel(m) === filter)
      .filter((m) => !q || m.name.toLowerCase().includes(q) || m.url.toLowerCase().includes(q))
      .sort(SORTS[sort].fn);
  }, [monitors, filter, query, sort]);

  return (
    <div className="container dash">
      <header className="hero">
        <div className="hero-top">
          <div className="hero-copy">
            <span className="eyebrow">Real-time endpoint diagnostics</span>
            <h1 className="display">Protect your uptime.</h1>
            <p className="lede">
              Sentinel probes your endpoints on a schedule, catches outages after a
              debounced failure streak, and logs every incident. No noise.
            </p>
          </div>
          <button className="btn on-dark hero-cta" onClick={() => setShowForm(true)}>
            <Plus size={16} weight="bold" /> New monitor
          </button>
        </div>
        <FleetStats overview={overview} />
      </header>

      {error && (
        <div className="error-banner" role="alert">
          <span>{error}</span>
          <button className="btn ghost sm" onClick={load}>
            <ArrowsClockwise size={14} weight="bold" /> Retry
          </button>
        </div>
      )}

      <div className="toolbar">
        <div className="filters" role="tablist" aria-label="Filter monitors by status">
          {FILTERS.map((f) => (
            <button
              key={f}
              role="tab"
              aria-selected={filter === f}
              className={`filter-chip ${filter === f ? 'active' : ''}`}
              onClick={() => setFilter(f)}
            >
              {f} <span className="chip-count">{counts[f] ?? 0}</span>
            </button>
          ))}
        </div>

        <div className="toolbar-controls">
          <div className="search">
            <MagnifyingGlass size={16} weight="bold" className="search-icon" />
            <input
              ref={searchRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search name or URL…"
              aria-label="Search monitors"
            />
            {query && (
              <button className="search-clear" onClick={() => setQuery('')} aria-label="Clear search">
                <X size={14} weight="bold" />
              </button>
            )}
          </div>

          <div className="select-wrap" title="Sort monitors">
            <FunnelSimple size={15} weight="bold" className="select-icon" />
            <select value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Sort monitors">
              {Object.entries(SORTS).map(([k, v]) => (
                <option key={k} value={k}>{v.label}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div className="list-meta">
        <span className="muted result-count">
          {loading ? 'Loading…' : `${visible.length} of ${monitors.length} monitor${monitors.length === 1 ? '' : 's'}`}
        </span>
        <LiveIndicator updatedAt={updatedAt} refreshing={refreshing} onRefresh={load} />
      </div>

      {loading ? (
        <div className="grid">
          {Array.from({ length: 3 }).map((_, i) => <div key={i} className="skeleton sk-card" />)}
        </div>
      ) : monitors.length === 0 ? (
        <div className="empty-fill">
          <div className="empty">
            <MagnifyingGlass className="icon" size={40} weight="bold" />
            <h3>No monitors yet</h3>
            <p>Add your first endpoint and Sentinel starts watching it immediately.</p>
            <button className="btn primary" onClick={() => setShowForm(true)}>
              <Plus size={16} weight="bold" /> Add your first monitor
            </button>
          </div>
        </div>
      ) : visible.length === 0 ? (
        <div className="empty-fill">
          <div className="empty">
            <h3>No matches</h3>
            <p>
              {query
                ? `Nothing matches “${query}”${filter !== 'ALL' ? ` in ${filter.toLowerCase()}` : ''}.`
                : `No monitors are ${filter.toLowerCase()} right now.`}
            </p>
            {(query || filter !== 'ALL') && (
              <button className="btn ghost" onClick={() => { setQuery(''); setFilter('ALL'); }}>
                Clear filters
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="grid">
          {visible.map((m) => (
            <MonitorCard key={m._id} monitor={m} onChanged={load} />
          ))}
        </div>
      )}

      {showForm && (
        <MonitorForm
          onClose={() => setShowForm(false)}
          onSaved={() => { toast.success('Monitor created'); load(); }}
        />
      )}
    </div>
  );
}
