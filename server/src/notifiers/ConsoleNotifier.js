'use strict';

const Notifier = require('./Notifier');
const logger = require('../config/logger');

/** The zero-config channel: writes the alert to the structured log. Proves the
 * seam end-to-end without any credentials. Telegram/Email adapters slot in
 * beside this one later. */
class ConsoleNotifier extends Notifier {
  constructor() {
    super('console');
  }

  async send({ type, monitor, at, detail }) {
    const line = `[ALERT:${type}] "${monitor.name}" (${monitor.url}) at ${at.toISOString()}`;
    if (type === 'DOWN') logger.error({ detail }, line);
    else logger.info({ detail }, line);
  }
}

module.exports = ConsoleNotifier;
