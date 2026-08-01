'use strict';

const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const AppError = require('../utils/AppError');
const env = require('../config/env');
const logger = require('../config/logger');
const notifier = require('../notifiers');

/**
 * Everything the application knows about identity, behind five functions.
 *
 * Nothing outside this module imports bcrypt or jsonwebtoken, mentions a hash,
 * or knows what is inside a token. Controllers ask for a token; middleware
 * hands one back and gets a user. That is the entire interface — which is what
 * makes the algorithm swappable (argon2, rotating keys, a session store)
 * without a single call site changing.
 *
 * Every function returns the *public* user shape. There is no path through
 * this module that hands a password hash to a caller.
 */

const ROUNDS = 12;

/**
 * bcrypt silently ignores everything past 72 bytes, so "correct-horse…" and
 * the same string with a different 80th character would be the same password.
 * We reject rather than truncate: a cap the user is told about beats a
 * surprise nobody sees.
 */
const MAX_PASSWORD_BYTES = 72;

/**
 * A real bcrypt digest of a value nobody can supply, used to spend the same
 * ~100ms on a missing account as on a wrong password. Without it, response
 * timing tells an attacker which email addresses are registered.
 */
const DUMMY_HASH = bcrypt.hashSync('unmatchable-placeholder-password', ROUNDS);

const sign = (user) =>
  jwt.sign({ sub: user._id.toString(), v: user.tokenVersion }, env.JWT_SECRET, {
    expiresIn: `${env.JWT_EXPIRES_DAYS}d`,
  });

function assertPasswordFits(password) {
  if (Buffer.byteLength(password, 'utf8') > MAX_PASSWORD_BYTES) {
    throw new AppError(`Password must be at most ${MAX_PASSWORD_BYTES} bytes.`, 400);
  }
}

/** Create an account and sign the new user straight in. */
async function register({ name, email, password }) {
  assertPasswordFits(password);

  const normalized = email.trim().toLowerCase();

  // Check first for a clear message, but rely on the unique index for the
  // race: two simultaneous signups both pass this check, and only one wins.
  if (await User.exists({ email: normalized })) {
    throw new AppError('An account with that email already exists.', 409);
  }

  let user;
  try {
    user = await User.create({
      name: name.trim(),
      email: normalized,
      passwordHash: await bcrypt.hash(password, ROUNDS),
    });
  } catch (err) {
    if (err.code === 11000) {
      throw new AppError('An account with that email already exists.', 409);
    }
    throw err;
  }

  // Fire-and-forget: a slow or broken mailbox must never delay or fail
  // signup. See notifiers/index.js#sendWelcomeEmail for why this email
  // exists at all — it's the actual fix for the first real DOWN alert
  // landing in spam unnoticed.
  notifier
    .sendWelcomeEmail(user)
    .catch((err) => logger.error({ err: err.message }, 'Welcome email dispatch failed'));

  return { user: user.toPublic(), token: sign(user) };
}

/** Exchange credentials for a token. */
async function login({ email, password }) {
  const user = await User.findOne({ email: email.trim().toLowerCase() }).select('+passwordHash');

  // Always compare against something so the work is identical either way.
  const matches = await bcrypt.compare(password, user ? user.passwordHash : DUMMY_HASH);

  // One message for "no such account" and "wrong password" — telling them
  // apart is a free list of who has an account here.
  if (!user || !matches) throw new AppError('That email and password do not match.', 401);

  return { user: user.toPublic(), token: sign(user) };
}

/**
 * Resolve a token to the user who owns it, or throw 401.
 *
 * The database round-trip is the point: it is what lets `tokenVersion` revoke
 * a token that is still cryptographically valid, and what stops a deleted
 * user's token from outliving the account.
 */
async function userFromToken(token) {
  if (!token) throw new AppError('Authentication required.', 401);

  let payload;
  try {
    payload = jwt.verify(token, env.JWT_SECRET);
  } catch {
    // Expired, tampered, or signed with a key we no longer use — the caller
    // does not need to know which.
    throw new AppError('Your session has expired. Sign in again.', 401);
  }

  const user = await User.findById(payload.sub);
  if (!user || user.tokenVersion !== payload.v) {
    throw new AppError('Your session is no longer valid. Sign in again.', 401);
  }

  return user.toPublic();
}

/**
 * Invalidate every token ever issued to this user. Called on "sign out
 * everywhere" and on password change; a plain sign-out only clears the cookie,
 * since bumping the version would evict the user's other devices too.
 */
async function revokeAllSessions(userId) {
  await User.updateOne({ _id: userId }, { $inc: { tokenVersion: 1 } });
}

/** Update notification preferences and return the refreshed public user. */
async function setPreferences(userId, patch) {
  const user = await User.findByIdAndUpdate(userId, patch, { new: true, runValidators: true });
  if (!user) throw new AppError('Account not found.', 404);
  return user.toPublic();
}

module.exports = {
  register,
  login,
  userFromToken,
  revokeAllSessions,
  setPreferences,
  MAX_PASSWORD_BYTES,
};
