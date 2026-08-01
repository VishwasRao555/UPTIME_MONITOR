import api from './axios';

// Health lives at /health (outside the /api base), so hit it directly.
export const getHealth = () =>
  fetch('/health').then((r) => (r.ok ? r.json() : Promise.reject(r)));

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
