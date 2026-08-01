/**
 * Field validators for the auth forms.
 *
 * Each returns an error string or null, so a form's error state is just
 * `Object.entries(rules).map(...)`. Messages name the fix, not the failure —
 * "Use at least 8 characters" beats "Invalid password".
 */

// Deliberately loose. Anything stricter rejects valid addresses; the real
// proof that an address works is the mail arriving at it.
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const required = (label) => (value) =>
  value.trim() ? null : `${label} is required.`;

export const email = (value) => {
  if (!value.trim()) return 'Email is required.';
  return EMAIL.test(value.trim()) ? null : 'Enter a valid email address.';
};

export const password = (value) => {
  if (!value) return 'Password is required.';
  return value.length >= 8 ? null : 'Use at least 8 characters.';
};

export const name = (value) => {
  if (!value.trim()) return 'Name is required.';
  return value.trim().length >= 2 ? null : 'Use at least 2 characters.';
};

/** Run a `{ field: validator }` map over the form; returns only real errors. */
export function validateAll(rules, form) {
  const errors = {};
  for (const [field, rule] of Object.entries(rules)) {
    const message = rule(form[field] ?? '');
    if (message) errors[field] = message;
  }
  return errors;
}
