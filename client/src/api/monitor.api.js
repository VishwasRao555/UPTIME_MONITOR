import api, { HEALTH_URL } from './axios';

/**
 * Health lives at /health, outside the /api base, so it is derived from the
 * API base rather than requested as a bare relative path. In dev the two are
 * the same thing (Vite proxies both). Deployed they are not: this app is
 * served from Vercel and the API from Railway, so a relative '/health' would
 * ask Vercel about its own health, get the SPA's index.html back with a 200,
 * and light up the navbar's "API online" indicator while the actual backend
 * was unreachable.
 */
export const getHealth = () =>
  fetch(HEALTH_URL, { credentials: 'include' }).then((r) =>
    r.ok ? r.json() : Promise.reject(r)
  );

export const listMonitors = () => api.get('/monitors').then((r) => r.data);
export const getOverview = () => api.get('/overview').then((r) => r.data);
export const checkNow = (id) => api.post(`/monitors/${id}/check`).then((r) => r.data);
export const getMonitor = (id) => api.get(`/monitors/${id}`).then((r) => r.data);
export const createMonitor = (payload) =>
  api.post('/monitors', payload).then((r) => r.data);
export const updateMonitor = (id, patch) =>
  api.patch(`/monitors/${id}`, patch).then((r) => r.data);
export const deleteMonitor = (id) => api.delete(`/monitors/${id}`);
export const getResults = (id, range = '24h') =>
  api.get(`/monitors/${id}/results`, { params: { range } }).then((r) => r.data);
export const getIncidents = (id) =>
  api.get(`/monitors/${id}/incidents`).then((r) => r.data);
