'use strict';

const env = require('../config/env');

/**
 * The auth cookie's flags, in exactly one place.
 *
 * Spreading these across the handlers that set and clear the cookie is how you
 * end up with a logout that leaves a valid token behind, because `path` or
 * `sameSite` drifted between the two calls — a browser only replaces a cookie
 * when the attributes match.
 *
 *  httpOnly  JavaScript cannot read it, so an XSS bug cannot walk off with a
 *            30-day token. This is the reason we use a cookie at all.
 *  sameSite  'lax' stops other origins from driving authenticated requests,
 *            which covers CSRF for an API that never mutates state via GET.
 *  secure    HTTPS-only in production; off on localhost, which has no TLS.
 */
const COOKIE_NAME = 'sentinel_token';

const baseOptions = () => ({
  httpOnly: true,
  sameSite: 'lax',
  secure: env.COOKIE_SECURE,
  path: '/',
});

/**
 * @param {boolean} remember — "Keep me signed in".
 *
 * When true the cookie carries a Max-Age and survives closing the browser.
 * When false it is a *session cookie*: no Max-Age, so the browser drops it
 * when it quits. The JWT still expires on its own schedule either way; this
 * only decides how long the browser is willing to hold onto it, which is what
 * makes the checkbox mean something on a shared machine.
 */
function setAuthCookie(res, token, remember = true) {
  res.cookie(COOKIE_NAME, token, {
    ...baseOptions(),
    ...(remember ? { maxAge: env.JWT_EXPIRES_DAYS * 24 * 60 * 60 * 1000 } : {}),
  });
}

/** Clearing must use the same attributes that were used to set it. */
function clearAuthCookie(res) {
  res.clearCookie(COOKIE_NAME, baseOptions());
}

const readAuthCookie = (req) => req.cookies?.[COOKIE_NAME];

module.exports = { COOKIE_NAME, setAuthCookie, clearAuthCookie, readAuthCookie };
