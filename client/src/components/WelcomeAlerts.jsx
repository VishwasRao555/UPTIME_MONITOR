import { useEffect, useState } from 'react';
import { BellRinging, X, EnvelopeSimple, ShieldWarning, Check } from '@phosphor-icons/react';
import { useNotifications } from '../context/NotificationContext';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';

const SEEN_KEY = 'uptime_monitor:welcome-alerts-seen';

/**
 * Shown once, right after an account is created: the moment someone has
 * demonstrably decided they want to be told when things break.
 *
 * It covers both delivery routes in one ask — the browser permission (which
 * must be requested from a user gesture, so it needs a button either way) and
 * email to the address they just signed up with. Asking about them separately
 * would mean two interruptions for one decision.
 *
 * Deliberately not shown to returning users: `markWelcomeSeen` is called on
 * signup only, and the flag is remembered so a reload does not re-ask.
 */
export function shouldShowWelcome() {
  return localStorage.getItem(SEEN_KEY) === 'pending';
}

/** Called by the signup page — arms the popup for the next dashboard render. */
export function armWelcome() {
  localStorage.setItem(SEEN_KEY, 'pending');
}

export default function WelcomeAlerts() {
  const { supported, permission, request } = useNotifications();
  const { user, setEmailAlerts } = useAuth();
  const toast = useToast();

  const [open, setOpen] = useState(false);
  const [emailOn, setEmailOn] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (shouldShowWelcome()) {
      // A beat after the dashboard paints, so it arrives as a follow-up rather
      // than covering the thing they just signed up to see.
      const t = setTimeout(() => setOpen(true), 900);
      return () => clearTimeout(t);
    }
    return undefined;
  }, []);

  if (!open || !user) return null;

  const close = () => {
    localStorage.setItem(SEEN_KEY, 'done');
    setOpen(false);
  };

  async function enable() {
    setSaving(true);
    try {
      // Browser permission must be requested inside the click; awaiting
      // anything before it can cost the user gesture in some browsers.
      const browserResult = supported && permission === 'default' ? await request() : permission;

      if (emailOn !== user.emailAlerts) await setEmailAlerts(emailOn);

      const parts = [];
      if (emailOn) parts.push(`emails to ${user.email}`);
      if (browserResult === 'granted') parts.push('browser alerts');

      toast.success(parts.length ? `Alerts on — ${parts.join(' and ')}.` : 'Preferences saved.');
    } catch {
      toast.error('Could not save your alert preferences. Try the bell in the navbar.');
    } finally {
      setSaving(false);
      close();
    }
  }

  return (
    <div className="notif-prompt welcome-alerts" role="dialog" aria-labelledby="welcome-alerts-title">
      <button className="notif-prompt-close" onClick={close} aria-label="Dismiss">
        <X size={15} weight="bold" />
      </button>

      <div className="notif-bell" aria-hidden="true">
        <span className="notif-bell-ring" />
        <span className="notif-bell-ring delay" />
        <BellRinging size={30} weight="fill" />
      </div>

      <div className="notif-copy">
        <h4 id="welcome-alerts-title">Get told when it breaks</h4>
        <p>
          UPTIME_MONITOR can tap you the second an endpoint goes dark — even
          when this tab is closed.
        </p>
      </div>

      <div className="welcome-options">
        <label className="checkbox welcome-option">
          <input
            type="checkbox"
            checked={emailOn}
            onChange={(e) => setEmailOn(e.target.checked)}
          />
          <EnvelopeSimple size={16} weight="bold" />
          <span>
            Email me at <strong>{user.email}</strong>
          </span>
        </label>

        <div className="welcome-option static">
          <ShieldWarning size={16} weight="bold" />
          <span>
            {permission === 'granted'
              ? 'Browser alerts are already on'
              : permission === 'denied'
                ? 'Browser alerts are blocked in your browser settings'
                : 'Browser alerts — your browser will ask next'}
          </span>
        </div>
      </div>

      <div className="notif-actions">
        <button className="btn ghost sm" onClick={close} disabled={saving}>Not now</button>
        <button className="btn primary sm" onClick={enable} disabled={saving}>
          {saving ? 'Saving…' : <><Check size={15} weight="bold" /> Turn on alerts</>}
        </button>
      </div>
    </div>
  );
}
