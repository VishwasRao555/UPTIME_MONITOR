'use strict';

/**
 * The notifier seam. Every channel implements one method:
 *
 *   send({ type, monitor, at, detail }) → Promise<void>
 *
 *   type   — 'DOWN' | 'RECOVERY'
 *   monitor — the monitor document that changed state
 *   at      — Date of the transition
 *   detail  — human-readable context (error message, downtime, ...)
 *
 * The state machine and scheduler know only this interface — never a concrete
 * channel. Adding Telegram/Email/Webhook later means writing one subclass and
 * registering it in the factory; no calling code changes. That is the point of
 * keeping the alert channel a configuration concern rather than a code one.
 */
class Notifier {
  /** @param {string} name — the channel id, used when reporting failures. */
  constructor(name = 'unknown') {
    this.name = name;
  }

  // eslint-disable-next-line no-unused-vars
  async send(payload) {
    throw new Error('Notifier.send() must be implemented by a subclass');
  }
}

module.exports = Notifier;
