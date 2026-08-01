import { Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route, Link, Navigate } from 'react-router-dom';
import { GhostIcon } from '@phosphor-icons/react';
import Dashboard from './pages/Dashboard';
import Docs from './pages/Docs';
import Login from './pages/Login';
import Signup from './pages/Signup';
import Navbar from './components/Navbar';
import Footer from './components/Footer';
import AlertsWatcher from './components/AlertsWatcher';
import NotificationPrompt from './components/NotificationPrompt';
import WelcomeAlerts from './components/WelcomeAlerts';
import AuthSplash from './components/AuthSplash';
import { ToastProvider } from './context/ToastContext';
import { NotificationProvider } from './context/NotificationContext';
import { AuthProvider, useAuth } from './context/AuthContext';

// Recharts is heavy and only used on the detail page — load it on demand so the
// dashboard's initial bundle stays lean.
const MonitorDetail = lazy(() => import('./pages/MonitorDetail'));

function NotFound() {
  return (
    <div className="container">
      <div className="empty">
        <GhostIcon className="icon" size={44} weight="bold" />
        <h3>Page not found</h3>
        <p>That route does not exist.</p>
        <Link className="btn primary" to="/">Back to dashboard</Link>
      </div>
    </div>
  );
}

/**
 * The signed-in application: fixed shell, plus the background workers that
 * only make sense once you are inside it. AlertsWatcher polls the API and
 * NotificationPrompt asks for permission — both are noise on a login screen,
 * so they live here rather than at the root.
 */
function AppShell() {
  return (
    <>
      <div className="app-shell">
        <Navbar />
        <main className="app-main">
          <Suspense fallback={<div className="container"><div className="skeleton sk-card" /></div>}>
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/docs" element={<Docs />} />
              <Route path="/monitors/:id" element={<MonitorDetail />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </Suspense>
        </main>
        <Footer />
      </div>
      <AlertsWatcher />
      <NotificationPrompt />
      <WelcomeAlerts />
    </>
  );
}

/**
 * No route below this renders without a verified session. The check is the
 * server's answer to /auth/me, not a client-side flag — the client cannot read
 * the httpOnly cookie, so it cannot fake its way past this. Even if it could,
 * every /api route enforces the same thing server-side; this guard exists to
 * show the right screen, not to be the security.
 */
function RequireAuth({ children }) {
  const { status } = useAuth();
  if (status === 'loading') return <AuthSplash />;
  if (status !== 'authed') return <Navigate to="/login" replace />;
  return children;
}

/** Someone already signed in has no use for the login page. */
function RedirectIfAuthed({ children }) {
  const { status } = useAuth();
  if (status === 'loading') return <AuthSplash />;
  if (status === 'authed') return <Navigate to="/" replace />;
  return children;
}

export default function App() {
  return (
    <ToastProvider>
      <BrowserRouter>
        <AuthProvider>
          <NotificationProvider>
            <Routes>
              {/* Auth owns the full viewport — no navbar, no footer. */}
              <Route path="/login" element={<RedirectIfAuthed><Login /></RedirectIfAuthed>} />
              <Route path="/signup" element={<RedirectIfAuthed><Signup /></RedirectIfAuthed>} />
              <Route path="*" element={<RequireAuth><AppShell /></RequireAuth>} />
            </Routes>
          </NotificationProvider>
        </AuthProvider>
      </BrowserRouter>
    </ToastProvider>
  );
}
