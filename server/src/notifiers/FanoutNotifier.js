'use strict';

const Notifier = require('./Notifier');
const logger = require('../config/logger');

/** How many times a single channel may attempt one alert, and how long to wait
 * between tries. An outage alert is worth a few seconds of persistence: SMTP
 * greeting timeouts and transient DNS blips are exactly the failures that
 * succeed on the second try, and there is no later delivery — miss this send
 * and the user is simply never told. */
const MAX_ATTEMPTS = 3;
const RETRY_BACKOFF_MS = [1000, 4000];

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Delivers one alert to every configured channel at once.
 *
 * Three guarantees, all deliberate:
 *
 *  1. Channels are independent. An expired Brevo key must not stop the
 *     Telegram message that tells you your site is down.
 *  2. A channel gets more than one shot. See MAX_ATTEMPTS above.
 *  3. `send()` never rejects. The scheduler calls this from inside its check
 *     loop, where a throw would be logged as "Check failed unexpectedly" and
 *     misattribute a notification problem to the probe. Failures are logged
 *     here, at the layer that actually knows which channel broke.
 *
 * Every outcome is logged either way, with the address it was aimed at. A
 * silently dropped alert is indistinguishable from a monitor that never fired,
 * and that ambiguity is unaffordable to debug after the fact.
 */
class FanoutNotifier extends Notifier {
  /** The retry shape is injectable so tests can exercise the give-up path
   * without actually waiting out the backoff. */
  constructor(channels, { maxAttempts = MAX_ATTEMPTS, backoffMs = RETRY_BACKOFF_MS } = {}) {
    super('fanout');
    this.channels = channels;
    this.maxAttempts = maxAttempts;
    this.backoffMs = backoffMs;
  }

  async deliver(channel, payload) {
    const context = {
      channel: channel.name,
      monitor: payload.monitor?.name,
      alert: payload.type,
      recipient: payload.recipient,
    };

    for (let attempt = 1; ; attempt += 1) {
      try {
        await channel.send(payload);
        logger.info({ ...context, attempt }, 'Alert delivered');
        return;
      } catch (err) {
        if (attempt >= this.maxAttempts) {
          logger.error(
            { ...context, attempts: attempt, err: err.message },
            'Alert delivery failed'
          );
          throw err;
        }
        logger.warn(
          { ...context, attempt, err: err.message },
          'Alert delivery attempt failed — retrying'
        );
        await delay(this.backoffMs[attempt - 1] ?? this.backoffMs[this.backoffMs.length - 1]);
      }
    }
  }

  async send(payload) {
    return Promise.allSettled(this.channels.map((c) => this.deliver(c, payload)));
  }
}

module.exports = FanoutNotifier;
