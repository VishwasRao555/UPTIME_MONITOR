import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import * as authApi from '../api/auth.api';
import { UNAUTHORIZED_EVENT } from '../api/axios';

const AuthContext = createContext(null);

/**
 * The client's single source of truth for "who am I".
 *
 * Because the token lives in an httpOnly cookie, the client genuinely cannot
 * inspect its own credentials — it has to ask. So the app boots in a `loading`
 * state, asks `/auth/me` once, and only then decides whether to render the
 * dashboard or bounce to the login page. Rendering anything before that answer
 * arrives would flash the wrong screen.
 *
 * status: 'loading' → the probe is in flight
 *         'authed'  → `user` is populated
 *         'anon'    → no valid session
 */
export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [status, setStatus] = useState('loading');

  useEffect(() => {
    let alive = true;

    authApi
      .me()
      .then((me) => {
        if (!alive) return;
        setUser(me);
        setStatus('authed');
      })
      .catch(() => {
        if (!alive) return;
        // A 401 here is the normal "not signed in" answer, not an error.
        setUser(null);
        setStatus('anon');
      });

    return () => { alive = false; };
  }, []);

  // The server can reject a session at any time — an expired token, or another
  // device calling logout-all. The axios interceptor announces it; we drop the
  // user, and the route guard takes it from there.
  useEffect(() => {
    const onUnauthorized = () => {
      setUser(null);
      setStatus('anon');
    };
    window.addEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
  }, []);

  const signIn = useCallback(async (credentials) => {
    const me = await authApi.login(credentials);
    setUser(me);
    setStatus('authed');
    return me;
  }, []);

  const register = useCallback(async (payload) => {
    const me = await authApi.signup(payload);
    setUser(me);
    setStatus('authed');
    return me;
  }, []);

  /** Turn outage emails to this account's address on or off. */
  const setEmailAlerts = useCallback(async (on) => {
    const updated = await authApi.updatePreferences({ emailAlerts: on });
    setUser(updated);
    return updated;
  }, []);

  const signOut = useCallback(async (everywhere = false) => {
    try {
      await (everywhere ? authApi.logoutEverywhere() : authApi.logout());
    } finally {
      // Drop the local session even if the request failed — leaving someone
      // looking signed in after they asked to leave is the worse outcome.
      setUser(null);
      setStatus('anon');
    }
  }, []);

  return (
    <AuthContext.Provider value={{ user, status, signIn, register, signOut, setEmailAlerts }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
