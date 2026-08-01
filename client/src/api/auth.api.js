import api from './axios';

/**
 * Auth endpoints.
 *
 * No function here returns a token, and none takes one. The server sets an
 * httpOnly cookie that JavaScript cannot read, which is the whole point —
 * an XSS bug on this page has nothing to steal. `me()` is therefore the only
 * way the client can find out whether it is signed in.
 */

export const signup = (payload) => api.post('/auth/signup', payload).then((r) => r.data.user);

export const login = (payload) => api.post('/auth/login', payload).then((r) => r.data.user);

export const logout = () => api.post('/auth/logout');

/** Ends every session on every device, not just this one. */
export const logoutEverywhere = () => api.post('/auth/logout-all');

export const me = () => api.get('/auth/me').then((r) => r.data.user);

/** Update notification preferences; returns the refreshed user. */
export const updatePreferences = (patch) =>
  api.patch('/auth/preferences', patch).then((r) => r.data.user);

/** Map a failed request to something a person can act on. */
export function authErrorMessage(err) {
  const status = err.response?.status;

  // The API's own message always wins — it knows more than we do.
  const fromApi = err.response?.data?.error || err.response?.data?.message;
  if (fromApi) return fromApi;

  if (status === 401) return 'That email and password do not match.';
  if (status === 409) return 'An account with that email already exists.';
  if (status === 429) return 'Too many attempts. Wait 15 minutes and try again.';
  if (status >= 500) return 'The server had a problem. Try again in a moment.';
  if (err.code === 'ERR_NETWORK') {
    return 'Cannot reach the server. Check that the API is running.';
  }
  return 'Something went wrong. Try again.';
}
