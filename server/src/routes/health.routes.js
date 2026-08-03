'use strict';

const express = require('express');
const mongoose = require('mongoose');

const router = express.Router();

/**
 * Readiness probe for Railway (and anyone else).
 *
 * Returns 200 only once Mongo is connected. The HTTP server binds before the
 * DB connect starts (server.js), so during Atlas wake-up Railway sees 503s
 * rather than connection-refused — and keeps probing until we are actually
 * ready to serve, or the healthcheck timeout elapses.
 *
 * The navbar also uses this endpoint (`r.ok`), so a 503 while starting keeps
 * the UI honest instead of flashing "API online" before the database is up.
 */
router.get('/', (_req, res) => {
  const dbUp = mongoose.connection.readyState === 1;
  res.status(dbUp ? 200 : 503).json({
    status: dbUp ? 'ok' : 'starting',
    db: dbUp ? 'connected' : 'disconnected',
    uptimeSeconds: Math.round(process.uptime()),
  });
});

module.exports = router;
