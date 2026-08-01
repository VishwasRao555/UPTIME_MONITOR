'use strict';

/**
 * Detailed debugging script to trace exactly what happens during a monitor check.
 * Simulates the exact code path the scheduler uses.
 *
 * Run with: npm run debug:check -- <monitor-id>
 * Or: npm run debug:check (to find and check the first monitor)
 */

const env = require('../src/config/env');
const logger = require('../src/config/logger');
const db = require('../src/config/db');
const Monitor = require('../src/models/Monitor');
const User = require('../src/models/User');
const CheckResult = require('../src/models/CheckResult');
const { probe } = require('../src/services/checker.service');
const stateMachine = require('../src/services/stateMachine.service');

async function debugCheck() {
  try {
    await db.connect();
    logger.info('Connected to database\n');

    // Get monitor ID from CLI args
    let monitorId = process.argv[2];
    let monitor;

    if (monitorId) {
      monitor = await Monitor.findById(monitorId);
      if (!monitor) {
        logger.error({ id: monitorId }, 'Monitor not found');
        process.exit(1);
      }
    } else {
      // Find first active monitor
      monitor = await Monitor.findOne({ isActive: true });
      if (!monitor) {
        logger.warn('No active monitors found. Create one first or resume a paused monitor.');
        process.exit(0);
      }
    }

    logger.info({ name: monitor.name, url: monitor.url }, '📊 DEBUGGING MONITOR CHECK\n');

    // Step 1: Monitor state
    logger.info('=== CURRENT STATE ===');
    logger.info({
      status: monitor.currentStatus,
      failures: monitor.consecutiveFailures,
      active: monitor.isActive,
      userId: monitor.userId,
    }, 'Monitor state');

    // Step 2: Check if monitor has an owner
    logger.info('\n=== OWNERSHIP CHECK ===');
    if (!monitor.userId) {
      logger.error('❌ CRITICAL: Monitor has NO userId (not associated with user)');
      logger.error('   → Emails would NOT be sent');
      logger.error('   → Fix: Delete and recreate monitor from authenticated session');
      process.exit(1);
    }
    logger.info(`✅ Monitor has userId: ${monitor.userId}`);

    // Step 3: Look up the user
    logger.info('\n=== USER LOOKUP ===');
    const user = await User.findById(monitor.userId).select('email emailAlerts').lean();
    if (!user) {
      logger.error('❌ CRITICAL: User not found in database');
      logger.error(`   → userId ${monitor.userId} does not exist`);
      process.exit(1);
    }
    logger.info({ email: user.email, emailAlerts: user.emailAlerts }, 'User found');

    if (user.emailAlerts === false) {
      logger.error('❌ Email alerts are DISABLED for this user');
      logger.error('   → Run: npm run fix:alerts');
      process.exit(1);
    }
    logger.info('✅ Email alerts enabled for user');

    // Step 4: Perform the probe
    logger.info('\n=== PROBING WEBSITE ===');
    logger.info(`Checking: ${monitor.url}`);

    let probeResult;
    try {
      probeResult = await probe(monitor);
      logger.info(
        {
          isUp: probeResult.isUp,
          statusCode: probeResult.statusCode,
          responseTimeMs: probeResult.responseTimeMs,
          errorMessage: probeResult.errorMessage,
        },
        'Probe result'
      );
    } catch (err) {
      logger.error({ err: err.message }, 'Probe failed unexpectedly');
      process.exit(1);
    }

    // Step 5: Run state machine
    logger.info('\n=== STATE MACHINE ===');
    const machineInput = {
      currentStatus: monitor.currentStatus,
      consecutiveFailures: monitor.consecutiveFailures,
    };

    logger.info(machineInput, 'State machine input');
    logger.info({ threshold: env.FAILURE_THRESHOLD }, 'Threshold');

    const machineResult = stateMachine.evaluate(machineInput, probeResult, env.FAILURE_THRESHOLD);

    logger.info(machineResult, 'State machine output');

    // Step 6: Determine what happens
    logger.info('\n=== DECISION ===');
    if (machineResult.transition === 'DOWN') {
      logger.info('🔴 TRANSITION: UP → DOWN');
      logger.info(`✅ EMAIL WOULD BE SENT to ${user.email}`);
      logger.info('   Subject: "DOWN: ' + monitor.name + '"');
    } else if (machineResult.transition === 'RECOVERY') {
      logger.info('🟢 TRANSITION: DOWN → UP');
      logger.info(`✅ EMAIL WOULD BE SENT to ${user.email}`);
      logger.info('   Subject: "RECOVERY: ' + monitor.name + '"');
    } else {
      logger.info('⚪ NO TRANSITION');
      logger.info('   No email would be sent (status unchanged)');
      logger.info(`   Current: ${monitor.currentStatus} → Next: ${machineResult.nextStatus}`);
      logger.info(`   Failures: ${monitor.consecutiveFailures} → ${machineResult.nextConsecutiveFailures}`);
      if (!probeResult.isUp && machineResult.nextStatus === 'DOWN') {
        logger.warn(`   Note: Will reach DOWN in ${env.FAILURE_THRESHOLD - machineResult.nextConsecutiveFailures} more failures`);
      }
    }

    // Step 7: Summary
    logger.info('\n=== SUMMARY ===');
    logger.info('If this were a real scheduler tick:');
    logger.info(`1. Would save check result (isUp: ${probeResult.isUp})`);
    logger.info(`2. Would update monitor status to: ${machineResult.nextStatus}`);
    logger.info(`3. Would update failure count to: ${machineResult.nextConsecutiveFailures}`);
    if (machineResult.transition) {
      logger.info(`4. Would open/close incident`);
      logger.info(`5. Would send email to: ${user.email}`);
    } else {
      logger.info(`4. No incident or email (no status transition)`);
    }

    logger.info('\n=== NEXT STEPS ===');
    if (probeResult.isUp) {
      logger.info('Website is UP - continue waiting for it to go DOWN (or simulate failure)');
    } else {
      const failuresUntilDown = Math.max(0, env.FAILURE_THRESHOLD - machineResult.nextConsecutiveFailures);
      if (failuresUntilDown === 0) {
        logger.info('✅ Monitor is NOW DOWN - email should have been sent!');
        logger.info('   Check your inbox within 1-2 minutes');
        logger.info('   If not there, there may be a Gmail/SMTP issue');
      } else {
        logger.info(`Website is DOWN but need ${failuresUntilDown} more failures before DOWN alert`);
        logger.info(`Scheduler will check again in 30 seconds`);
      }
    }

    process.exit(0);
  } catch (err) {
    logger.error({ err: err.message, stack: err.stack }, 'Debug check failed');
    process.exit(1);
  }
}

debugCheck();
