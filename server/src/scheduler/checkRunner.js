'use strict';

const Monitor = require('../models/Monitor');
const User = require('../models/User');
const CheckResult = require('../models/CheckResult');
const env = require('../config/env');
const logger = require('../config/logger');
const { probe } = require('../services/checker.service');
const stateMachine = require('../services/stateMachine.service');
const incidents = require('../services/incident.service');
const notifier = require('../notifiers');
const { formatDuration } = require('../notifiers/templates');

/**
 * Which address should hear about this monitor: the account that owns it.
 *
 * Returns undefined when the owner has turned email alerts off or cannot be
 * found, which the email channels read as "no one to tell" — the other
 * channels still fire. Alerts follow ownership, so no user is ever mailed
 * about someone else's endpoint.
 */
async function recipientFor(monitor) {
  if (!monitor.userId) {
    logger.warn({ monitorId: monitor._id }, 'Monitor has no userId - no email recipient');
    return undefined;
  }
  const owner = await User.findById(monitor.userId).select('email emailAlerts').lean();
  if (!owner) {
    logger.warn({ monitorId: monitor._id, userId: monitor.userId }, 'Monitor owner user not found');
    return undefined;
  }
  if (owner.emailAlerts === false) {
    logger.info(
      { monitorId: monitor._id, email: owner.email },
      'Monitor owner has email alerts disabled'
    );
    return undefined;
  }
  logger.debug({ monitorId: monitor._id, email: owner.email }, 'Recipient found for alert');
  return owner.email;
}

/**
 * Ticks land on a fixed grid, so an exact `elapsed >= interval` test loses a
 * whole tick whenever a check finishes a moment after the previous one was
 * dispatched. A 60s monitor on a 30s tick misses the 60s boundary by
 * milliseconds and actually runs every 90s — half again as slow as configured,
 * which on a 3-failure threshold pushes worst-case detection from 3 minutes to
 * 4.5. Firing up to half a tick early keeps the requested cadence and can never
 * double-fire, since the remaining gap still exceeds half a tick.
 */
const DUE_TOLERANCE_MS = Math.round((env.CHECK_TICK_SECONDS * 1000) / 2);

/** A monitor is due when it has never been checked, or its interval has
 * elapsed (within the tolerance above) since the last check. */
function isDue(monitor, now) {
  if (!monitor.lastCheckedAt) return true;
  const elapsedMs = now - new Date(monitor.lastCheckedAt).getTime();
  return elapsedMs >= monitor.intervalSeconds * 1000 - DUE_TOLERANCE_MS;
}

/** Probe one monitor, persist the result, run the state machine, and apply
 * the resulting side effects. Isolated per-monitor so one failure cannot
 * affect the batch. */
async function checkOne(monitor) {
  const result = await probe(monitor);

  await CheckResult.create({
    monitorId: monitor._id,
    statusCode: result.statusCode,
    responseTimeMs: result.responseTimeMs,
    isUp: result.isUp,
    errorMessage: result.errorMessage,
  });

  const { nextStatus, nextConsecutiveFailures, transition } = stateMachine.evaluate(
    { currentStatus: monitor.currentStatus, consecutiveFailures: monitor.consecutiveFailures },
    result,
    env.FAILURE_THRESHOLD
  );

  const update = {
    currentStatus: nextStatus,
    consecutiveFailures: nextConsecutiveFailures,
    lastCheckedAt: new Date(),
  };

  /**
   * An outage does not stop the monitor.
   *
   * This previously set `isActive: false` on the way DOWN, to buy "one alert
   * per outage instead of a stream". But the debounce in the state machine
   * already buys that — a transition only fires on the UP→DOWN edge, so the
   * second failing check is silent whether or not anything is still probing.
   * Stopping meant paying for a guarantee we already had, and the price was
   * the product: a monitor that stops watching the moment the site breaks
   * cannot report the recovery, cannot keep the uptime figure honest, and
   * leaves the user pressing "Check now" by hand to learn anything at all.
   */
  await Monitor.updateOne({ _id: monitor._id }, update);

  if (transition === 'DOWN') {
    const incident = await incidents.openIncident(monitor._id, result.errorMessage);
    const recipient = await recipientFor(monitor);
    logger.info(
      { monitorId: monitor._id, name: monitor.name, recipient },
      'DOWN transition: sending alert'
    );
    const settled = await notifier.send({
      type: 'DOWN',
      monitor,
      at: new Date(),
      detail: result.errorMessage,
      recipient,
    });
    logger.info(
      { monitorId: monitor._id, recipient, channels: notifier.channels.length },
      'DOWN alert sent'
    );
    await incidents.recordDelivery(incident?._id, notifier.channels, settled, recipient);
  } else if (transition === 'RECOVERY') {
    const closed = await incidents.closeIncident(monitor._id);
    // "Back up after 4m 12s" is the first thing you want to know on recovery,
    // and the incident we just closed is the only place that duration exists.
    const downtime = formatDuration(closed?.durationSeconds);
    const recipient = await recipientFor(monitor);
    logger.info(
      { monitorId: monitor._id, name: monitor.name, recipient },
      'RECOVERY transition: sending alert'
    );
    const settled = await notifier.send({
      type: 'RECOVERY',
      monitor,
      at: new Date(),
      detail: downtime
        ? `Back up after ${downtime} of downtime (${result.responseTimeMs}ms)`
        : `Back up (${result.responseTimeMs}ms)`,
      recipient,
    });
    logger.info(
      { monitorId: monitor._id, recipient, channels: notifier.channels.length },
      'RECOVERY alert sent'
    );
    await incidents.recordDelivery(closed?._id, notifier.channels, settled, recipient);
  }

  return { monitorId: monitor._id, isUp: result.isUp, transition };
}

/** One scheduler tick: fan out over all due, active monitors. Uses
 * allSettled so a single rejected probe never aborts the batch. */
async function runDueChecks() {
  const now = Date.now();
  const active = await Monitor.find({ isActive: true });
  const due = active.filter((m) => isDue(m, now));
  if (due.length === 0) return;

  logger.debug({ due: due.length }, 'Running due checks');
  const settled = await Promise.allSettled(due.map(checkOne));

  for (const outcome of settled) {
    if (outcome.status === 'rejected') {
      logger.error({ err: outcome.reason?.message }, 'Check failed unexpectedly');
    }
  }
}

module.exports = { runDueChecks, checkOne, isDue };
