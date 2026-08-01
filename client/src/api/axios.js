import axios from 'axios';

/**
 * Where the API lives.
 *
 * In dev this is unset and the Vite proxy forwards /api to localhost:5000, so
 * the relative default works with no config. In production it must be the full
 * Railway URL including /api, because the frontend is served from Vercel and a
 * relative path would resolve against Vercel instead:
 *
 *   VITE_API_URL=https://<your-app>.up.railway.app/api
 *
 * Vite inlines this at build time, not at runtime — changing it in the Vercel
 * dashboard requires a redeploy to take effect.
 */
const API_BASE = (import.meta.env.VITE_API_URL || '/api').replace(/\/$/, '');

/**
 * /health sits beside /api rather than under it, so it is the API base with the
 * final path segment swapped. Derived rather than configured, so there is no
 * second environment variable to keep in sync with the first.
 */
export const HEALTH_URL = API_BASE.replace(/\/api$/, '') + '/health';

const api = axios.create({
  baseURL: API_BASE,
  // The auth cookie is httpOnly, so JavaScript cannot attach it by hand — the
  // browser only sends it when the request opts in to credentials.
  withCredentials: true,
});

/** Broadcast when the server rejects our session, so AuthContext can react. */
export const UNAUTHORIZED_EVENT = 'sentinel:unauthorized';

api.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error.response?.status;
    const url = error.config?.url || '';

    // A 401 from /auth/me or /auth/login is an answer, not a session
    // expiring — announcing it would bounce someone off the login page at
    // the exact moment they are trying to use it.
    const isAuthProbe = url.startsWith('/auth/');

    if (status === 401 && !isAuthProbe) {
      window.dispatchEvent(new CustomEvent(UNAUTHORIZED_EVENT));
    }
    return Promise.reject(error);
  }
);

export default api;
