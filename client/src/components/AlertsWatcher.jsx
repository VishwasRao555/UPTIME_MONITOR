import { useEffect, useRef } from 'react';
import { listMonitors } from '../api/monitor.api';
import { useNotifications } from '../context/NotificationContext';
import { useToast } from '../context/ToastContext';
import { statusLabel } from '../utils/format';
import { ALERT_POLL_MS } from '../config';

/** Renders nothing. Runs for the whole session (any route), diffing monitor
 *  state each poll and firing a system notification on the transitions that
 *  matter: a monitor going DOWN, a monitor recovering, and the API itself
 *  going unreachable (server crash / offline). The first poll only seeds a
 *  baseline so we never alert for states that were already true on load. */
export default function AlertsWatcher() {
  const { notify } = useNotifications();
  const toast = useToast();
  const prev = useRef(null); // Map<id, label>
  const apiOnline = useRef(true);

  useEffect(() => {
    let alive = true;

    const tick = async () => {
      let monitors;
      try {
        monitors = await listMonitors();
      } catch {
        // API unreachable → likely a server crash / down.
        if (apiOnline.current) {
          apiOnline.current = false;
          notify('Sentinel API is unreachable', {
            body: 'The monitoring server is not responding. It may have crashed or gone offline.',
            tag: 'sentinel-api-down',
            requireInteraction: true,
          });
          toast.error('API unreachable — the monitoring server may be down.');
        }
        return;
      }

      if (!alive) return;

      if (!apiOnline.current) {
        apiOnline.current = true;
        notify('Sentinel API is back online', { tag: 'sentinel-api-up' });
        toast.success('API reconnected.');
      }

      const next = new Map(monitors.map((m) => [m._id, statusLabel(m)]));

      // Seed baseline on the very first successful poll — no alerts.
      if (prev.current) {
        for (const m of monitors) {
          const before = prev.current.get(m._id);
          const now = next.get(m._id);
          if (!before || before === now) continue;
          if (now === 'DOWN') {
            notify(`🔴 ${m.name} is DOWN`, {
              body: `${m.url} failed its health check.`,
              tag: `down-${m._id}`,
              url: `/monitors/${m._id}`,
              requireInteraction: true,
            });
          } else if (before === 'DOWN' && now === 'UP') {
            notify(`🟢 ${m.name} recovered`, {
              body: `${m.url} is responding again.`,
              tag: `up-${m._id}`,
              url: `/monitors/${m._id}`,
            });
          }
        }
      }
      prev.current = next;
    };

    tick();
    const id = setInterval(tick, ALERT_POLL_MS);
    return () => { alive = false; clearInterval(id); };
  }, [notify, toast]);

  return null;
}
