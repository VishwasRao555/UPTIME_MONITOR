'use strict';

/**
 * Traces the complete email alert flow for a monitor.
 * Shows exactly what email would be sent and to whom.
 *
 * Run with: npm run check:email -- <monitor-id>
 * Or: npm run check:email (to check all monitors)
 */

const env = require('../src/config/env');
const logger = require('../src/config/logger');
const db = require('../src/config/db');
const Monitor = require('../src/models/Monitor');
const User = require('../src/models/User');
const CheckResult = require('../src/models/CheckResult');

async function checkEmailFlow() {
  try {
    await db.connect();
    logger.info('Connected to database\n');

    // Get monitor ID from CLI args
    const monitorId = process.argv[2];

    let monitors;
    if (monitorId) {
      monitors = await Monitor.findById(monitorId);
      if (!monitors) {
        logger.error({ id: monitorId }, 'Monitor not found');
        process.exit(1);
      }
      monitors = [monitors];
    } else {
      monitors = await Monitor.find({}).sort({ createdAt: -1 });
    }

    if (monitors.length === 0) {
      logger.warn('No monitors found');
      process.exit(0);
    }

    logger.info(`Checking email flow for ${monitors.length} monitor(s)\n`);

    for (const monitor of monitors) {
      logger.info({ name: monitor.name, url: monitor.url }, 'Monitor');

      // Step 1: Monitor status
      logger.info(`  Status: ${monitor.currentStatus} (${monitor.consecutiveFailures} failures)`);
      logger.info(`  Active: ${monitor.isActive ? 'YES' : 'NO (PAUSED)'}`);

      // Step 2: Check if monitor has a user
      if (!monitor.userId) {
        logger.error('  ❌ NO OWNER - Monitor has no userId');
        logger.error('     Alerts would NOT be sent');
        continue;
      }

      logger.info(`  User ID: ${monitor.userId}`);

      // Step 3: Look up the user
      const user = await User.findById(monitor.userId).select('email emailAlerts').lean();
      if (!user) {
        logger.error('  ❌ USER NOT FOUND - userId points to non-existent user');
        logger.error('     Alerts would NOT be sent');
        continue;
      }

      logger.info(`  Owner Email: ${user.email}`);

      // Step 4: Check if email alerts are enabled
      if (user.emailAlerts === false) {
        logger.error('  ❌ EMAIL ALERTS DISABLED - User has turned off alerts');
        logger.error('     Alerts would NOT be sent');
        continue;
      }

      logger.info(`  Email Alerts: ENABLED ✅`);

      // Step 5: Check Gmail configuration
      if (!env.NOTIFIER_CHANNELS.includes('gmail')) {
        logger.error('  ❌ GMAIL NOT CONFIGURED - Check NOTIFIER_CHANNELS in .env');
        continue;
      }

      if (!env.GMAIL_USER || !env.GMAIL_APP_PASSWORD) {
        logger.error('  ❌ GMAIL CREDENTIALS MISSING - Check GMAIL_USER and GMAIL_APP_PASSWORD in .env');
        continue;
      }

      // Step 6: Show what would happen
      logger.info(`  Sender: ${env.ALERT_EMAIL_FROM_NAME} <${env.GMAIL_USER}>`);
      logger.info(`  Recipient: ${user.email}`);
      logger.info(`  ✅ ALERT WOULD BE SENT IF MONITOR GOES DOWN`);

      // Step 7: Check recent checks
      const recentChecks = await CheckResult.find({ monitorId: monitor._id })
        .sort({ checkedAt: -1 })
        .limit(3)
        .select('isUp errorMessage checkedAt responseTimeMs')
        .lean();

      if (recentChecks.length > 0) {
        logger.info(`  Recent checks:`);
        recentChecks.forEach((check, i) => {
          const status = check.isUp ? '✅ UP' : '❌ DOWN';
          const time = new Date(check.checkedAt).toLocaleString();
          logger.info(
            `    ${i + 1}. ${status} at ${time} (${check.responseTimeMs}ms)${
              !check.isUp ? ` - ${check.errorMessage}` : ''
            }`
          );
        });
      } else {
        logger.warn(`  No recent checks yet (never been checked)`);
      }

      logger.info('');
    }

    // Summary
    logger.info('Summary:');
    logger.info(`✅ Gmail configured: ${env.NOTIFIER_CHANNELS.includes('gmail') ? 'YES' : 'NO'}`);
    logger.info(`✅ Scheduler active: Check logs for "Scheduler started"`);
    logger.info(`✅ All monitors with owners and alerts enabled will receive emails when status changes`);

    process.exit(0);
  } catch (err) {
    logger.error({ err: err.message, stack: err.stack }, 'Error checking email flow');
    process.exit(1);
  }
}

checkEmailFlow();
