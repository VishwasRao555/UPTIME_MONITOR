import { useId, useState } from 'react';
import { Eye, EyeSlash } from '@phosphor-icons/react';

/** Four bands, so the meter reads as a scale rather than pass/fail. */
const BANDS = ['Too short', 'Weak', 'Fair', 'Strong'];

/** Length first, then variety — the two things that actually matter here. */
export function scorePassword(value) {
  if (!value || value.length < 8) return 0;
  let score = 1;
  if (value.length >= 12) score += 1;
  if (/[^A-Za-z0-9]/.test(value) || (/[A-Z]/.test(value) && /[0-9]/.test(value))) score += 1;
  return Math.min(score, 3);
}

/**
 * Password input with a show/hide toggle and, on signup, a strength meter.
 *
 * The toggle is a real button in the tab order with an aria-label that states
 * the action, not the state — a screen reader user needs to know what pressing
 * it will do. Strength is announced politely so it doesn't interrupt typing.
 */
export default function PasswordField({
  id,
  label,
  value,
  onChange,
  onBlur,
  error,
  autoComplete,
  showStrength = false,
  placeholder,
}) {
  const [visible, setVisible] = useState(false);
  const hintId = useId();
  const score = showStrength ? scorePassword(value) : 0;
  // Only describe the field by the meter when the meter is actually on screen —
  // aria-describedby pointing at a missing node reads as nothing at all.
  const showMeter = showStrength && Boolean(value) && !error;
  const describedBy = error ? `${id}-error` : showMeter ? hintId : undefined;

  return (
    <div className="form-row">
      <label htmlFor={id}>{label} <span className="req" aria-hidden="true">*</span></label>

      <div className={`input-wrap has-affix ${error ? 'has-error' : ''}`}>
        <input
          id={id}
          type={visible ? 'text' : 'password'}
          value={value}
          onChange={onChange}
          onBlur={onBlur}
          placeholder={placeholder}
          autoComplete={autoComplete}
          aria-invalid={Boolean(error)}
          aria-describedby={describedBy}
          required
        />
        <button
          type="button"
          className="input-affix"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? 'Hide password' : 'Show password'}
          title={visible ? 'Hide password' : 'Show password'}
        >
          {visible ? <EyeSlash size={18} weight="bold" /> : <Eye size={18} weight="bold" />}
        </button>
      </div>

      {showMeter && (
        <div className="pw-meter" id={hintId}>
          <div className="pw-bars" aria-hidden="true">
            {[0, 1, 2].map((i) => (
              <span key={i} className={`pw-bar ${i < score ? `on s${score}` : ''}`} />
            ))}
          </div>
          <span className="pw-label" aria-live="polite">{BANDS[score]}</span>
        </div>
      )}

      {error && <span className="field-error" id={`${id}-error`} role="alert">{error}</span>}
    </div>
  );
}
