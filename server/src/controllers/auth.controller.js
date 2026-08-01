'use strict';

const { z } = require('zod');
const asyncHandler = require('../utils/asyncHandler');
const auth = require('../services/auth.service');
const { setAuthCookie, clearAuthCookie } = require('../utils/authCookie');

const password = z
  .string()
  .min(8, 'Use at least 8 characters.')
  .max(auth.MAX_PASSWORD_BYTES, `Password must be at most ${auth.MAX_PASSWORD_BYTES} characters.`);

const signupSchema = z.object({
  name: z.string().trim().min(2, 'Use at least 2 characters.').max(100),
  email: z.string().trim().toLowerCase().email('Enter a valid email address.'),
  password,
});

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email('Enter a valid email address.'),
  // Not `password` — an old account whose password predates a rule change must
  // still be able to sign in. Length rules belong on the way in, not the way back.
  password: z.string().min(1, 'Password is required.'),
  // "Keep me signed in". Default true so an API client that omits it behaves
  // the way it did before the checkbox existed.
  remember: z.boolean().default(true),
});

const preferencesSchema = z.object({
  emailAlerts: z.boolean(),
});

/** The token goes in the cookie and nowhere else — never in the response body,
 * which would put it back within reach of JavaScript and defeat httpOnly. */
const issue = (res, { user, token }, { status = 200, remember = true } = {}) => {
  setAuthCookie(res, token, remember);
  res.status(status).json({ user });
};

const signup = asyncHandler(async (req, res) => {
  issue(res, await auth.register(req.body), { status: 201 });
});

const login = asyncHandler(async (req, res) => {
  const { remember, ...credentials } = req.body;
  issue(res, await auth.login(credentials), { remember });
});

/** Update the signed-in user's notification preferences. */
const updatePreferences = asyncHandler(async (req, res) => {
  const user = await auth.setPreferences(req.user.id, req.body);
  res.json({ user });
});

/** Sign out this device. Other devices keep their sessions — use
 * /auth/logout-all to end those too. */
const logout = asyncHandler(async (_req, res) => {
  clearAuthCookie(res);
  res.status(204).end();
});

/** Sign out everywhere by invalidating every token issued to this user. */
const logoutAll = asyncHandler(async (req, res) => {
  await auth.revokeAllSessions(req.user.id);
  clearAuthCookie(res);
  res.status(204).end();
});

/** Who am I? The client's only way to learn whether the cookie is still good,
 * since it cannot read the cookie itself. */
const me = asyncHandler(async (req, res) => {
  res.json({ user: req.user });
});

module.exports = {
  signupSchema,
  loginSchema,
  preferencesSchema,
  signup,
  login,
  logout,
  logoutAll,
  me,
  updatePreferences,
};
