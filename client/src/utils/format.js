export function statusLabel(monitor) {
  // PAUSED now only ever means the user pressed Pause — an outage keeps the
  // monitor running — so this reads exactly as it says.
  if (monitor && monitor.isActive === false) return 'PAUSED';
  return monitor?.currentStatus || 'PENDING';
}

export function pillClass(label) {
  return {
    UP: 'up',
    DOWN: 'down',
    PAUSED: 'paused',
    PENDING: 'pending',
  }[label] || 'pending';
}

export function formatUptime(pct) {
  if (pct == null) return 'n/a';
  return `${pct}%`;
}

export function formatMs(ms) {
  if (ms == null) return 'n/a';
  return `${ms}ms`;
}

export function formatRelative(dateStr) {
  if (!dateStr) return 'never';
  const secs = Math.round((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (secs < 60) return `${secs}s ago`;
  if (secs < 3600) return `${Math.round(secs / 60)}m ago`;
  if (secs < 86400) return `${Math.round(secs / 3600)}h ago`;
  return `${Math.round(secs / 86400)}d ago`;
}

export function formatDuration(seconds) {
  if (seconds == null) return 'ongoing';
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
  return `${Math.round(seconds / 3600)}h`;
}
