'use strict';

const cron = require('node-cron');
const env = require('../config/env');
const logger = require('../config/logger');
const Monitor = require('../models/Monitor');
const { runDueChecks } = require('./checkRunner');

let running = false;

/**
 * Says out loud what the scheduler can actually see.
 *
 * A monitor the scheduler is skipping looks exactly like a monitor that is
 * fine: no log line, no error, nothing on the dashboard but a status that
 * never changes. That silence is what made "it only works when I press Check
 * now" so hard to pin down — the one fact that would have explained it,
 * "nothing is active", was never written down anywhere. It is now, at every
 * boot, whether or not anything is wrong.
 */
async function logFleetSummary() {
  try {
    const [total, active] = await Promise.all([
      Monitor.countDocuments({}),
      Monitor.countDocuments({ isActive: true }),
    ]);
    const paused = total - active;

    logger.info({ total, active, paused }, 'Monitors visible to the scheduler');

    if (total > 0 && active === 0) {
      logger.warn(
        { paused },
        'Every monitor is paused — the scheduler has nothing to check, so no ' +
          'status will ever change and no alert will ever fire. Press Resume in ' +
          'the UI, or run: npm run doctor'
      );
    }
  } catch (err) {
    // Diagnostics must never be the reason the scheduler fails to start.
    logger.error({ err: err.message }, 'Could not summarise monitors');
  }
}

/** Starts the in-process scheduler. Every CHECK_TICK_SECONDS it dispatches
 * all due checks. A re-entrancy guard skips a tick if the previous one is
 * still in flight, so a slow batch cannot pile up. */
function startScheduler() {
  const expr = `*/${env.CHECK_TICK_SECONDS} * * * * *`; // seconds field

  // Held so shutdown can wait for a tick that is already mid-flight. Stopping
  // the cron only stops *new* ticks; without this the process goes on to close
  // the database underneath a batch of checks still running, which surfaces as
  // "Operation interrupted because client was closed" on every restart — an
  // alarming error for what is really an orderly exit.
  let inFlight = null;

  const task = cron.schedule(expr, async () => {
    if (running) {
      logger.warn('Previous tick still running — skipping this one');
      return;
    }
    running = true;
    inFlight = (async () => {
      try {
        await runDueChecks();
      } catch (err) {
        // NFR-1: a failure here must never crash the scheduler.
        logger.error({ err: err.message }, 'Scheduler tick error');
      } finally {
        running = false;
      }
    })();
    await inFlight;
  });

  /** Stop taking new ticks, then let the current one finish. */
  task.drain = async () => {
    task.stop();
    await inFlight;
  };

  logger.info({ everySeconds: env.CHECK_TICK_SECONDS }, 'Scheduler started');
  logFleetSummary();
  return task;
}

module.exports = { startScheduler, logFleetSummary };
