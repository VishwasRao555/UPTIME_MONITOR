import { useState } from 'react';
import { validateAll } from '../utils/validate';
import { authErrorMessage } from '../api/auth.api';

/**
 * Form state for the auth screens.
 *
 * The validation timing is the point. Validating on every keystroke scolds
 * people while they are still typing, so a field is only judged once they
 * leave it (`blur`) or try to submit. After a field has failed, it re-checks
 * on every keystroke so the error clears the instant it is fixed rather than
 * lingering until the next blur.
 *
 * On a failed submit, focus moves to the first invalid input — otherwise a
 * keyboard or screen-reader user is told something is wrong with no way to
 * find it. Field ids must match the form keys for that lookup to work.
 */
export default function useAuthForm({ initial, rules, onSubmit }) {
  const [form, setForm] = useState(initial);
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [apiError, setApiError] = useState(null);

  const set = (field) => (e) => {
    const { value } = e.target;
    setForm((prev) => ({ ...prev, [field]: value }));
    // Only re-validate a field that is already showing an error.
    setErrors((prev) => {
      if (!prev[field]) return prev;
      const message = rules[field](value);
      const next = { ...prev };
      if (message) next[field] = message;
      else delete next[field];
      return next;
    });
  };

  const blur = (field) => (e) => {
    const message = rules[field](e.target.value);
    setErrors((prev) => {
      const next = { ...prev };
      if (message) next[field] = message;
      else delete next[field];
      return next;
    });
  };

  async function submit(e) {
    e.preventDefault();
    setApiError(null);

    const found = validateAll(rules, form);
    setErrors(found);

    const firstInvalid = Object.keys(rules).find((field) => found[field]);
    if (firstInvalid) {
      document.getElementById(firstInvalid)?.focus();
      return;
    }

    setSubmitting(true);
    try {
      await onSubmit(form);
    } catch (err) {
      setApiError(authErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  return { form, errors, submitting, apiError, set, blur, submit };
}
