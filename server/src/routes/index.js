'use strict';

const express = require('express');
const monitorRoutes = require('./monitor.routes');
const authRoutes = require('./auth.routes');
const { requireAuth } = require('../middleware/auth.middleware');
const c = require('../controllers/monitor.controller');

const router = express.Router();

// Public: the only way in.
router.use('/auth', authRoutes);

/**
 * Everything below this line requires a session. The gate sits here rather
 * than on each route so that adding a route cannot accidentally add a public
 * one — new endpoints are private unless someone deliberately mounts them
 * above this line.
 */
router.use(requireAuth);

router.get('/overview', c.overview);
router.use('/monitors', monitorRoutes);

module.exports = router;
