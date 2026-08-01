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
      } catch (err) {
        if (!alive) return;

        /**
         * Only a request that never got an answer means the server is down.
         *
         * This used to treat every rejection as an outage, so an expired
         * session — a 401, which is the server answering promptly and
         * correctly — raised "the monitoring server may have crashed" at the
         * exact moment the user was being redirected to sign in again. An
         * alarming lie about your own infrastructure is worse than saying
         * nothing, and it teaches people to ignore the one notification that
         * is supposed to mean something.
         *
         * `err.response` exists only when the API replied. If it did, it is
         * alive by definition, whatever the status.
         */
        if (err?.response) return;

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
