import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';

const NotificationContext = createContext(null);
const STORAGE_KEY = 'sentinel:notifications-enabled';
const DISMISS_KEY = 'sentinel:notif-prompt-dismissed';

const supported = typeof window !== 'undefined' && 'Notification' in window;

/** Owns everything notification-related: browser permission, a user mute
 *  toggle, the service-worker registration, and a single notify() entry point.
 *  Kept separate from the UI so any component can fire an alert. */
export function NotificationProvider({ children }) {
  const [permission, setPermission] = useState(supported ? Notification.permission : 'unsupported');
  const [enabled, setEnabled] = useState(
    () => supported && localStorage.getItem(STORAGE_KEY) !== 'false'
  );
  const [promptDismissed, setPromptDismissed] = useState(
    () => localStorage.getItem(DISMISS_KEY) === 'true'
  );
  const swReg = useRef(null);

  // Register the service worker once. Notifications route through it.
  useEffect(() => {
    if (!supported || !('serviceWorker' in navigator)) return;
    navigator.serviceWorker
      .register('/sw.js')
      .then((reg) => { swReg.current = reg; })
      .catch(() => { /* SW optional — we fall back to page Notification */ });
  }, []);

  useEffect(() => {
    if (supported) localStorage.setItem(STORAGE_KEY, String(enabled));
  }, [enabled]);

  const request = useCallback(async () => {
    if (!supported) return 'unsupported';
    let result = Notification.permission;
    if (result === 'default') result = await Notification.requestPermission();
    setPermission(result);
    if (result === 'granted') {
      setEnabled(true);
      // A confirming ping so the user sees it worked.
      show('Notifications enabled', {
        body: "You'll be alerted the moment a monitor goes down.",
        tag: 'sentinel-welcome',
      });
    }
    setPromptDismissed(true);
    localStorage.setItem(DISMISS_KEY, 'true');
    return result;
  }, []);

  const dismissPrompt = useCallback(() => {
    setPromptDismissed(true);
    localStorage.setItem(DISMISS_KEY, 'true');
  }, []);

  const show = useCallback((title, opts = {}) => {
    if (!supported || Notification.permission !== 'granted') return;
    const options = {
      body: opts.body,
      tag: opts.tag,
      icon: '/notify-icon.svg',
      badge: '/notify-icon.svg',
      data: { url: opts.url || '/' },
      requireInteraction: opts.requireInteraction ?? false,
      silent: false,
    };
    try {
      if (swReg.current) swReg.current.showNotification(title, options);
      else new Notification(title, options);
    } catch {
      /* some browsers throw for constructor use — ignore */
    }
  }, []);

  // Public notify() respects the user's mute toggle; internal show() does not.
  const notify = useCallback(
    (title, opts) => { if (enabled) show(title, opts); },
    [enabled, show]
  );

  const toggle = useCallback(async () => {
    if (permission !== 'granted') return request();
    setEnabled((e) => !e);
    return permission;
  }, [permission, request]);

  const value = {
    supported,
    permission,
    enabled: enabled && permission === 'granted',
    showPrompt: supported && permission === 'default' && !promptDismissed,
    request,
    dismissPrompt,
    notify,
    toggle,
  };

  return <NotificationContext.Provider value={value}>{children}</NotificationContext.Provider>;
}

export function useNotifications() {
  const ctx = useContext(NotificationContext);
  if (!ctx) throw new Error('useNotifications must be used within NotificationProvider');
  return ctx;
}
