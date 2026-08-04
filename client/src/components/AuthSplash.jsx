import BrandLogo from './BrandLogo';

/**
 * Shown for the one round-trip it takes to ask the server whether our cookie
 * is still good. Brief, but it must exist: rendering the dashboard first and
 * yanking it away — or flashing the login page at someone who is signed in —
 * is worse than a moment of honest waiting.
 */
export default function AuthSplash() {
  return (
    <div className="auth-splash" role="status" aria-live="polite">
      <div className="splash-mark">
        <BrandLogo size={52} />
        <span className="splash-ring" aria-hidden="true" />
        <span className="splash-ring delay" aria-hidden="true" />
      </div>
      <p className="splash-text">Checking your session…</p>
    </div>
  );
}
