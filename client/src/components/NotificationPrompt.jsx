import { useEffect, useState } from 'react';
import { BellRinging, X, ShieldWarning } from '@phosphor-icons/react';
import { useNotifications } from '../context/NotificationContext';
import { shouldShowWelcome } from './WelcomeAlerts';

/** Animated, on-theme permission request. Slides up a few seconds after load
 *  (so it never fights the first paint), rings its bell to draw the eye, and
 *  asks once. Dismissal is remembered — it won't nag on every visit. */
export default function NotificationPrompt() {
  const { showPrompt, request, dismissPrompt } = useNotifications();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    if (!showPrompt) return;
    const t = setTimeout(() => setMounted(true), 2500);
    return () => clearTimeout(t);
  }, [showPrompt]);

  // A brand-new account gets WelcomeAlerts instead, which asks the same thing
  // plus email. Two popups stacked in the same corner is one too many.
  if (!showPrompt || !mounted || shouldShowWelcome()) return null;

  return (
    <div className="notif-prompt" role="dialog" aria-label="Enable downtime notifications">
      <button className="notif-prompt-close" onClick={dismissPrompt} aria-label="Dismiss">
        <X size={15} weight="bold" />
      </button>

      <div className="notif-bell" aria-hidden="true">
        <span className="notif-bell-ring" />
        <span className="notif-bell-ring delay" />
        <BellRinging size={30} weight="fill" />
      </div>

      <div className="notif-copy">
        <h4>Never miss an outage</h4>
        <p>
          Get a system alert the instant a monitor goes <strong>down</strong> or the
          API becomes unreachable — even while you're in another app.
        </p>
      </div>

      <div className="notif-actions">
        <button className="btn ghost sm" onClick={dismissPrompt}>Not now</button>
        <button className="btn primary sm" onClick={request}>
          <ShieldWarning size={15} weight="bold" /> Enable alerts
        </button>
      </div>
    </div>
  );
}
