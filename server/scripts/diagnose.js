'use strict';

/**
 * Diagnostic script to identify why automatic monitoring is not working.
 * Run with: npm run diagnose
 */

const mongoose = require('mongoose');
const env = require('../src/config/env');
const logger = require('../src/config/logger');
const Monitor = require('../src/models/Monitor');
const User = require('../src/models/User');
const db = require('../src/config/db');

async function diagnose() {
  try {
    await db.connect();
    logger.info('Connected to database');

    // Check 1: Are there any monitors?
    const totalMonitors = await Monitor.countDocuments({});
    logger.info({ count: totalMonitors }, 'Total monitors in database');

    if (totalMonitors === 0) {
      logger.warn('No monitors found! Create a monitor first.');
      process.exit(0);
    }

    // Check 2: Are monitors active?
    const [activeCount, pausedCount] = await Promise.all([
      Monitor.countDocuments({ isActive: true }),
      Monitor.countDocuments({ isActive: false }),
    ]);

    logger.info({ active: activeCount, paused: pausedCount }, 'Monitor status breakdown');

    if (activeCount === 0) {
      logger.error('ISSUE FOUND: All monitors are paused! Resume them in the UI.');
      process.exit(1);
    }

    // Check 3: List active monitors with details
    const activeMonitors = await Monitor.find({ isActive: true }).select(
      'name url intervalSeconds lastCheckedAt currentStatus consecutiveFailures userId'
    );

    logger.info({ count: activeMonitors.length }, 'Active monitors');
    for (const m of activeMonitors) {
      const timeSinceCheck = m.lastCheckedAt
        ? `${Math.round((Date.now() - m.lastCheckedAt) / 1000)}s ago`
        : 'never';

      // Check if monitor has an owner and if they have email alerts enabled
      let ownerEmail = null;
      let emailAlertsEnabled = false;
      if (m.userId) {
        const owner = await User.findById(m.userId).select('email emailAlerts').lean();
        if (owner) {
          ownerEmail = owner.email;
          emailAlertsEnabled = owner.emailAlerts !== false;
        }
      }

      logger.info(
        {
          id: m._id.toString(),
          name: m.name,
          url: m.url,
          interval: m.intervalSeconds,
          lastChecked: timeSinceCheck,
          status: m.currentStatus,
          failures: m.consecutiveFailures,
          owner: ownerEmail || 'NO OWNER',
          emailAlerts: emailAlertsEnabled ? 'enabled' : 'disabled',
        },
        'Monitor details'
      );

      if (!m.userId) {
        logger.error({ name: m.name }, 'ISSUE: Monitor has no owner! Alerts will not be sent');
      } else if (!emailAlertsEnabled) {
        logger.error(
          { name: m.name, owner: ownerEmail },
          'ISSUE: Email alerts disabled for this monitor owner'
        );
      }
    }

    // Check 4: Verify scheduler configuration
    logger.info({ checkTickSeconds: env.CHECK_TICK_SECONDS }, 'Scheduler configuration');

    if (env.CHECK_TICK_SECONDS > 59 || env.CHECK_TICK_SECONDS < 1) {
      logger.error(
        { value: env.CHECK_TICK_SECONDS },
        'ISSUE FOUND: CHECK_TICK_SECONDS must be between 1 and 59'
      );
      process.exit(1);
    }

    // Check 5: Verify notification channels
    logger.info({ channels: env.NOTIFIER_CHANNELS }, 'Alert channels configured');

    if (env.NOTIFIER_CHANNELS.includes('gmail')) {
      if (!env.GMAIL_USER || !env.GMAIL_APP_PASSWORD) {
        logger.error('ISSUE FOUND: Gmail is enabled but credentials are missing');
        process.exit(1);
      }
      logger.info({ user: env.GMAIL_USER }, 'Gmail configuration found');

      // Check if user has email alerts enabled
      const users = await User.find({ email: env.GMAIL_USER }).select('emailAlerts email');
      if (users.length > 0) {
        const user = users[0];
        if (user.emailAlerts === false) {
          logger.error(
            { email: user.email },
            'ISSUE FOUND: Email alerts are DISABLED for your account'
          );
        } else {
          logger.info({ email: user.email }, 'Email alerts are enabled');
        }
      }
    }

    // Check 6: Look for recent check results
    const CheckResult = require('../src/models/CheckResult');
    const recentCount = await CheckResult.countDocuments({
      checkedAt: { $gte: new Date(Date.now() - 5 * 60000) }, // last 5 minutes
    });
    logger.info(
      { recentChecksLast5Min: recentCount },
      recentCount > 0 ? 'Scheduler appears to be running' : 'Scheduler may not be running'
    );

    logger.info('Diagnosis complete');
    process.exit(0);
  } catch (err) {
    logger.error({ err: err.message, stack: err.stack }, 'Diagnostic failed');
    process.exit(1);
  }
}

diagnose();
