'use strict';

const env = require('../config/env');
const logger = require('../config/logger');
const ConsoleNotifier = require('./ConsoleNotifier');
const TelegramNotifier = require('./TelegramNotifier');
const EmailNotifier = require('./EmailNotifier');
const GmailNotifier = require('./GmailNotifier');
const FanoutNotifier = require('./FanoutNotifier');

/** Every channel the NOTIFIER_CHANNELS list can name. Adding one means adding
 * a subclass and an entry here — nothing else in the codebase changes.
 * Credentials are already proven present by the env schema's refinement, so
 * these builders can read them without defensive checks. */
const REGISTRY = {
  console: () => new ConsoleNotifier(),

  telegram: () =>
    new TelegramNotifier({
      botToken: env.TELEGRAM_BOT_TOKEN,
      chatId: env.TELEGRAM_CHAT_ID,
      timeoutMs: env.NOTIFY_TIMEOUT_MS,
    }),

  gmail: () =>
    new GmailNotifier({
      user: env.GMAIL_USER,
      appPassword: env.GMAIL_APP_PASSWORD,
      fromName: env.ALERT_EMAIL_FROM_NAME,
      // Used only for alerts with no owner to address.
      fallbackTo: env.ALERT_EMAIL_TO[0] || env.GMAIL_USER,
      timeoutMs: env.NOTIFY_TIMEOUT_MS,
    }),

  email: () =>
    new EmailNotifier({
      apiKey: env.BREVO_API_KEY,
      from: env.ALERT_EMAIL_FROM,
      fromName: env.ALERT_EMAIL_FROM_NAME,
      to: env.ALERT_EMAIL_TO,
      timeoutMs: env.NOTIFY_TIMEOUT_MS,
    }),
};

/** Resolves the active channels from configuration. Always returns a fanout —
 * even for a single channel — so error isolation behaves identically no matter
 * how many are switched on. */
function createNotifier() {
  const channels = env.NOTIFIER_CHANNELS.map((id) => REGISTRY[id]());
  logger.info({ channels: env.NOTIFIER_CHANNELS }, 'Alert channels active');
  return new FanoutNotifier(channels);
}

// A single shared instance is enough for the prototype.
const notifier = createNotifier();

/**
 * Fires the one-time onboarding email (see templates.welcomeHtml for why)
 * through whichever email-capable channel is configured. Not part of the
 * Notifier interface — it has no monitor and isn't relevant to Telegram or
 * Console — so channels are found by duck-typing rather than fanning out.
 *
 * Never throws: called from registration, which must succeed even if the
 * mailbox is unreachable. Every failure is logged so a broken sender is
 * still visible, just not fatal to signup.
 */
async function sendWelcomeEmail(user) {
  const emailChannels = notifier.channels.filter((c) => typeof c.sendWelcome === 'function');
  if (emailChannels.length === 0) return;

  await Promise.all(
    emailChannels.map(async (channel) => {
      try {
        await channel.sendWelcome({ to: user.email, name: user.name });
        logger.info({ channel: channel.name, to: user.email }, 'Welcome email sent');
      } catch (err) {
        logger.error(
          { channel: channel.name, to: user.email, err: err.message },
          'Welcome email failed'
        );
      }
    })
  );
}

module.exports = notifier;
module.exports.sendWelcomeEmail = sendWelcomeEmail;
