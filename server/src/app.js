'use strict';

const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const env = require('./config/env');
const logger = require('./config/logger');
const apiRoutes = require('./routes');
const healthRoutes = require('./routes/health.routes');
const errorHandler = require('./middleware/errorHandler');
const AppError = require('./utils/AppError');

const app = express();

// Rate limiting and Secure cookies both depend on knowing the real client IP.
// Off unless explicitly enabled: trusting these headers from an untrusted
// source lets a client claim any IP it likes and slip the rate limiter.
//
// On Railway this needs to be on (TRUST_PROXY=true). Traffic arrives through
// Railway's edge proxy, so with it off every request appears to come from the
// same address and the login rate limiter throttles the entire user base as
// though it were one attacker.
if (env.TRUST_PROXY) app.set('trust proxy', 1);

app.use(helmet());

/**
 * `credentials: true` is what lets the browser send the auth cookie on a
 * cross-origin request — locally the client runs on :5173 and the API on :5000;
 * deployed, the client is on Vercel and the API on Railway. It also means the
 * origin list must stay exact: with credentials enabled a wildcard origin is
 * rejected by every browser, which is the spec protecting us from handing
 * cookies to any site that asks.
 *
 * The rejection path is logged deliberately. A missing origin fails entirely in
 * the browser — the request is blocked before the response is readable, the
 * server sees a perfectly normal 200, and the only clue is a console message
 * that names CORS without naming the URL that has to be allow-listed. On a
 * two-host deployment that is the single likeliest thing to go wrong (a Vercel
 * preview URL, or a trailing slash in CORS_ORIGIN), so the server says which
 * origin it turned away and what it would have accepted.
 */
const allowedOrigins = env.CORS_ORIGIN.split(',')
  .map((o) => o.trim().replace(/\/$/, ''))
  .filter(Boolean);

app.use(
  cors({
    origin(origin, callback) {
      // No Origin header: same-origin navigations, curl, health checkers.
      // Nothing to enforce, and rejecting them would break the Railway probe.
      if (!origin) return callback(null, true);
      if (allowedOrigins.includes(origin)) return callback(null, true);

      logger.warn(
        { origin, allowed: allowedOrigins },
        'Blocked a cross-origin request: add this origin to CORS_ORIGIN (comma-separated, no trailing slash)'
      );
      return callback(null, false);
    },
    credentials: true,
  })
);

app.use(cookieParser());
// A body big enough to matter is a body worth rejecting.
app.use(express.json({ limit: '100kb' }));

app.use('/health', healthRoutes);
app.use('/api', apiRoutes);

/**
 * There is deliberately no static-file serving here.
 *
 * An earlier version served `client/dist` from this process so that frontend
 * and API shared one origin, which let the auth cookie stay SameSite=Lax. The
 * frontend now deploys to Vercel and this service only speaks JSON, so that
 * block would be serving a directory Railway never builds — an `express.static`
 * over a path that does not exist, plus a catch-all `res.sendFile` that would
 * answer every unmatched URL with an ENOENT instead of a clean 404.
 *
 * The cost of splitting them is the cross-site cookie, which is handled where
 * it belongs: COOKIE_SAMESITE in config/env.js and utils/authCookie.js.
 */

// Unknown route → 404 through the normal error channel.
app.use((req, _res, next) => next(new AppError(`Not found: ${req.method} ${req.path}`, 404)));
app.use(errorHandler);

module.exports = app;
