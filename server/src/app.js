'use strict';

const path = require('path');
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const env = require('./config/env');
const apiRoutes = require('./routes');
const healthRoutes = require('./routes/health.routes');
const errorHandler = require('./middleware/errorHandler');
const AppError = require('./utils/AppError');

const app = express();

// Rate limiting and Secure cookies both depend on knowing the real client IP.
// Off unless explicitly enabled: trusting these headers from an untrusted
// source lets a client claim any IP it likes and slip the rate limiter.
if (env.TRUST_PROXY) app.set('trust proxy', 1);

app.use(helmet());

/**
 * `credentials: true` is what lets the browser send the auth cookie on a
 * cross-origin request — the client runs on :5173, the API on :5000. It also
 * means the origin list must stay exact: with credentials enabled a wildcard
 * origin is rejected by every browser, which is the spec protecting us from
 * handing cookies to any site that asks.
 */
app.use(
  cors({
    origin: env.CORS_ORIGIN.split(',').map((o) => o.trim()),
    credentials: true,
  })
);

app.use(cookieParser());
// A body big enough to matter is a body worth rejecting.
app.use(express.json({ limit: '100kb' }));

app.use('/health', healthRoutes);
app.use('/api', apiRoutes);

/**
 * Serves the built React app from the same origin as the API in production.
 *
 * This is what makes a single free web service possible at all: the auth
 * cookie is SameSite=Lax (see authCookie.js), which browsers simply drop on
 * cross-site XHR/fetch requests. Two different domains — a static frontend
 * host plus a separate API host — would make login appear to succeed and
 * then silently fail on every request after, with nothing in the network
 * tab to explain why. One origin sidesteps the problem instead of requiring
 * a cookie policy change.
 */
if (env.NODE_ENV === 'production') {
  const clientDist = path.join(__dirname, '../../client/dist');
  app.use(express.static(clientDist));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api') || req.path.startsWith('/health')) return next();
    res.sendFile(path.join(clientDist, 'index.html'));
  });
}

// Unknown route → 404 through the normal error channel.
app.use((req, _res, next) => next(new AppError(`Not found: ${req.method} ${req.path}`, 404)));
app.use(errorHandler);

module.exports = app;
