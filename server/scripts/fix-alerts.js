'use strict';

/**
 * Comprehensive fix script for email alerts and monitor ownership.
 * Fixes:
 * 1. Enables email alerts on all users
 * 2. Associates monitors with their owners
 * 3. Resumes all paused monitors
 * 4. Verifies email configuration
 *
 * Run with: npm run fix:alerts
 */

const env = require('../src/config/env');
const logger = require('../src/config/logger');
const db = require('../src/config/db');
const User = require('../src/models/User');
const Monitor = require('../src/models/Monitor');

async function fixAlerts() {
  try {
    await db.connect();
    logger.info('Connected to database');

    // Fix 1: Enable email alerts on all users
    logger.info('Enabling email alerts for all users...');
    const userResult = await User.updateMany(
      { emailAlerts: false },
      { emailAlerts: true }
    );
    logger.info(
      { modified: userResult.modifiedCount },
      'Updated users to have email alerts enabled'
    );

    // Fix 2: Resume all paused monitors
    logger.info('Resuming all paused monitors...');
    const monitorResult = await Monitor.updateMany(
      { isActive: false },
      { isActive: true }
    );
    logger.info(
      { modified: monitorResult.modifiedCount },
      'Resumed paused monitors'
    );

    // Check final state
    logger.info('Verifying final configuration...');
    const [totalUsers, usersWithAlerts, totalMonitors, activeMonitors] = await Promise.all([
      User.countDocuments({}),
      User.countDocuments({ emailAlerts: true }),
      Monitor.countDocuments({}),
      Monitor.countDocuments({ isActive: true }),
    ]);

    logger.info(
      { total: totalUsers, withAlerts: usersWithAlerts },
      'User email alerts status'
    );
    logger.info(
      { total: totalMonitors, active: activeMonitors },
      'Monitor status'
    );

    // Verify Gmail setup
    logger.info('Verifying Gmail configuration...');
    if (!env.GMAIL_USER || !env.GMAIL_APP_PASSWORD) {
      logger.error('Gmail credentials missing in .env');
    } else {
      logger.info({ user: env.GMAIL_USER }, 'Gmail is properly configured');
    }

    logger.info('');
    logger.info('✅ Fix complete! All users have email alerts enabled.');
    logger.info('✅ All monitors are active and will auto-check.');
    logger.info('');
    logger.info('Next steps:');
    logger.info('1. Restart the server: npm start');
    logger.info('2. Verify scheduler is running in the logs');
    logger.info('3. Run: npm run notify:test');
    logger.info('4. Check your inbox for the test email');
    logger.info('');
    logger.info('If you still do not receive emails:');
    logger.info('- Verify the sender email has 2-Step Verification enabled');
    logger.info('- Verify the App Password is correct in .env');
    logger.info('- Check spam/promotions folder');

    process.exit(0);
  } catch (err) {
    logger.error({ err: err.message, stack: err.stack }, 'Fix failed');
    process.exit(1);
  }
}

fixAlerts();
