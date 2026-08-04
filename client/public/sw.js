/* UPTIME_MONITOR service worker.
 * Minimal by design: it exists so notifications are shown via the SW
 * registration (more reliable than page-scoped Notification, and it keeps
 * working while the tab is backgrounded). Clicking a notification focuses or
 * opens the dashboard. No push server — notifications are triggered by the
 * running app, which is enough for "alert me while the browser is open". */

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if ('focus' in client) return client.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow(url);
      return undefined;
    })
  );
});
