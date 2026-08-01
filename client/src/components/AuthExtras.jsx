import { CircleNotch, GoogleLogo, WarningCircle } from '@phosphor-icons/react';

/**
 * The pieces both auth pages render identically. Kept here so the two pages
 * stay readable as what they actually are: a field list and a submit handler.
 */

/** Submit button that owns its own busy state. */
export function SubmitButton({ busy, busyLabel, children }) {
  return (
    <button
      type="submit"
      className={`btn primary auth-cta ${busy ? 'is-busy' : ''}`}
      disabled={busy}
      aria-busy={busy}
    >
      {busy ? (
        <>
          <CircleNotch size={17} weight="bold" className="spinning" />
          {busyLabel}
        </>
      ) : (
        children
      )}
    </button>
  );
}

/** Form-level failure — the field-level ones live under their inputs. */
export function FormError({ message }) {
  if (!message) return null;
  return (
    <div className="error-banner auth-error" role="alert">
      <WarningCircle size={18} weight="bold" />
      <span>{message}</span>
    </div>
  );
}

/**
 * Google is the only third-party option, so it gets a full-width button rather
 * than a row of circles — a lone circle reads as "one of several, the rest
 * missing", while a labelled button reads as a deliberate single choice.
 *
 * Disabled rather than hidden: hiding it would also hide that the option is
 * planned, while a disabled control with an explanatory title says "not yet"
 * honestly. Point it at the OAuth redirect when the server grows the routes.
 */
export function SocialRow({ verb }) {
  return (
    <>
      <div className="auth-divider"><span>or {verb} with</span></div>
      <button
        type="button"
        className="btn google-btn"
        disabled
        title="Google sign-in is not enabled on this server yet"
      >
        <GoogleLogo size={19} weight="bold" />
        Continue with Google
      </button>
    </>
  );
}
