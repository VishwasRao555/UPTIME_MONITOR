'use strict';

const express = require('express');
const rateLimit = require('express-rate-limit');
const validate = require('../middleware/validate.middleware');
const { requireAuth } = require('../middleware/auth.middleware');
const c = require('../controllers/auth.controller');

/**
 * Credential endpoints are the one place on this server where guessing pays,
 * so they get their own budget. bcrypt at 12 rounds also costs ~100ms of CPU
 * per attempt, which makes an unthrottled login a denial-of-service lever as
 * much as a password-guessing one.
 */
const credentialLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  // Successful sign-ins should not count toward the budget — the limit exists
  // to stop guessing, not to lock out someone who keeps getting it right.
  skipSuccessfulRequests: true,
  message: { error: 'Too many attempts. Wait 15 minutes and try again.' },
});

const router = express.Router();

router.post('/signup', credentialLimiter, validate(c.signupSchema), c.signup);
router.post('/login', credentialLimiter, validate(c.loginSchema), c.login);

// Clearing a cookie needs no session; it must work even from an expired one.
router.post('/logout', c.logout);

router.get('/me', requireAuth, c.me);
router.patch('/preferences', requireAuth, validate(c.preferencesSchema), c.updatePreferences);
router.post('/logout-all', requireAuth, c.logoutAll);

module.exports = router;
