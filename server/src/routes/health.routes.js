'use strict';

const express = require('express');
const mongoose = require('mongoose');

const router = express.Router();

/** Liveness endpoint for the service itself. Reports DB connectivity. */
router.get('/', (_req, res) => {
  const dbUp = mongoose.connection.readyState === 1;
  res.status(dbUp ? 200 : 503).json({
    status: dbUp ? 'ok' : 'degraded',
    db: dbUp ? 'connected' : 'disconnected',
    uptimeSeconds: Math.round(process.uptime()),
  });
});

module.exports = router;
