import { useState } from 'react';
import { createMonitor, updateMonitor } from '../api/monitor.api';

const blank = {
  name: '',
  url: '',
  method: 'GET',
  intervalSeconds: 60,
  expectedStatus: 200,
  timeoutMs: 10000,
};

/** Create or edit a monitor. Pass `monitor` to switch into edit mode. */
export default function MonitorForm({ onClose, onSaved, monitor }) {
  const editing = Boolean(monitor);
  const [form, setForm] = useState(
    editing
      ? {
          name: monitor.name,
          url: monitor.url,
          method: monitor.method,
          intervalSeconds: monitor.intervalSeconds,
          expectedStatus: monitor.expectedStatus,
          timeoutMs: monitor.timeoutMs,
        }
      : blank
  );
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  async function submit(e) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const payload = {
      ...form,
      intervalSeconds: Number(form.intervalSeconds),
      expectedStatus: Number(form.expectedStatus),
      timeoutMs: Number(form.timeoutMs),
    };
    try {
      if (editing) await updateMonitor(monitor._id, payload);
      else await createMonitor(payload);
      onSaved();
      onClose();
    } catch (err) {
      setError(err.response?.data?.error || 'Something went wrong. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>{editing ? 'Edit monitor' : 'New monitor'}</h2>
        <p className="sub">
          {editing
            ? 'Update how this endpoint is probed.'
            : 'Sentinel checks it on the interval you set and alerts on state change.'}
        </p>
        {error && <div className="error-banner" role="alert">{error}</div>}
        <form className="form" onSubmit={submit}>
          <div className="form-row">
            <label htmlFor="name">Name <span className="req" aria-hidden="true">*</span></label>
            <input id="name" value={form.name} onChange={set('name')} placeholder="Marketing site" required autoFocus />
          </div>
          <div className="form-row">
            <label htmlFor="url">URL <span className="req" aria-hidden="true">*</span></label>
            <input id="url" type="url" inputMode="url" value={form.url} onChange={set('url')} placeholder="https://example.com" required />
          </div>
          <div className="form-grid">
            <div className="form-row">
              <label htmlFor="method">Method</label>
              <select id="method" value={form.method} onChange={set('method')}>
                <option>GET</option>
                <option>HEAD</option>
                <option>POST</option>
              </select>
            </div>
            <div className="form-row">
              <label htmlFor="interval">Interval (seconds)</label>
              <input id="interval" type="number" min="30" value={form.intervalSeconds} onChange={set('intervalSeconds')} />
              <span className="hint">How often to probe. Minimum 30s.</span>
            </div>
            <div className="form-row">
              <label htmlFor="status">Expected status</label>
              <input id="status" type="number" min="100" max="599" value={form.expectedStatus} onChange={set('expectedStatus')} />
            </div>
            <div className="form-row">
              <label htmlFor="timeout">Timeout (ms)</label>
              <input id="timeout" type="number" min="1000" max="60000" value={form.timeoutMs} onChange={set('timeoutMs')} />
            </div>
          </div>
          <div className="form-actions">
            <button type="button" className="btn ghost" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn primary" disabled={saving}>
              {saving ? 'Saving…' : editing ? 'Save changes' : 'Add monitor'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
