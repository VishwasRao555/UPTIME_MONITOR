'use strict';

/**
 * Shows the incident record(s) for the active monitor, including the stored
 * delivery receipts — the ground truth for whether the DOWN email actually
 * sent, and if not, why.
 *
 * Run with: npm run check:incident
 */

const logger = require('../src/config/logger');
const db = require('../src/config/db');
const Monitor = require('../src/models/Monitor');
const Incident = require('../src/models/Incident');

async function main() {
  await db.connect();

  const monitor = await Monitor.findOne({}).sort({ createdAt: -1 });
  if (!monitor) {
    logger.warn('No monitor found');
    process.exit(0);
  }

  logger.info({ name: monitor.name, id: monitor._id.toString() }, 'Monitor');

  const incidents = await Incident.find({ monitorId: monitor._id }).sort({ startedAt: -1 }).lean();

  if (incidents.length === 0) {
    logger.warn('No incidents recorded for this monitor at all — openIncident() was never called');
    process.exit(0);
  }

  for (const inc of incidents) {
    logger.info(
      {
        id: inc._id.toString(),
        startedAt: inc.startedAt,
        resolvedAt: inc.resolvedAt,
        cause: inc.cause,
        notificationCount: inc.notifications.length,
      },
      'Incident'
    );

    if (inc.notifications.length === 0) {
      logger.error('  No delivery receipts at all — recordDelivery was never reached or crashed silently');
    }

    inc.notifications.forEach((n, i) => {
      logger.info(
        {
          channel: n.channel,
          recipient: n.recipient,
          ok: n.ok,
          error: n.error,
          at: n.at,
        },
        `  Delivery receipt #${i + 1}`
      );
    });
  }

  process.exit(0);
}

main().catch((err) => {
  logger.error({ err: err.message, stack: err.stack }, 'Failed');
  process.exit(1);
});
