import axios from 'axios';

// Base instance. In dev the Vite proxy forwards /api to the backend, so the
// default of '/api' works without any env config.
const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api',
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
