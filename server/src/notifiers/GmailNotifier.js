'use strict';

const nodemailer = require('nodemailer');
const Notifier = require('./Notifier');
const { subject, emailHtml, emailText, welcomeSubject, welcomeHtml, welcomeText } = require('./templates');

/**
 * Email through your own Gmail account over SMTP.
 *
 * Setup is two steps and no third-party signup: turn on 2-Step Verification on
 * the Google account, then create an **App Password** and put that 16-character
 * value in GMAIL_APP_PASSWORD. Your normal Google password will not work here —
 * Google blocked plain-password SMTP, and an App Password is the supported
 * replacement. It is also revocable on its own, so it can be withdrawn without
 * touching the account password.
 *
 * Gmail allows roughly 500 recipients a day, which an uptime monitor that only
 * mails on state changes will not come close to.
 *
 * Each alert goes to the address on the account that owns the monitor
 * (`payload.recipient`), so two users never see each other's outages.
 */
class GmailNotifier extends Notifier {
  constructor({ user, appPassword, fromName, fallbackTo, timeoutMs = 10000 }) {
    super('gmail');
    this.user = user;
    this.fromName = fromName;
    this.fallbackTo = fallbackTo;

    this.transport = nodemailer.createTransport({
      service: 'gmail',
      auth: { user, pass: appPassword },
      connectionTimeout: timeoutMs,
      greetingTimeout: timeoutMs,
      socketTimeout: timeoutMs,
    });
  }

  async send(payload) {
    // The monitor's owner, falling back to the configured address for alerts
    // that belong to no one in particular.
    const to = payload.recipient || this.fallbackTo;
    if (!to) return; // nobody to tell

    const info = await this.transport.sendMail({
      from: `"${this.fromName}" <${this.user}>`,
      to,
      subject: subject(payload),
      text: emailText(payload),
      html: emailHtml(payload),
    });

    /**
     * Nodemailer only throws when *every* recipient is refused. A partial
     * rejection resolves, so without this check a send that reached nobody
     * would still be recorded as delivered.
     */
    if (info.rejected?.length) {
      throw new Error(`Gmail rejected ${info.rejected.join(', ')} — ${info.response}`);
    }

    // Google's queue id. This is the difference between "we think we sent it"
    // and a receipt you can take to a mail admin — and it is what separates a
    // broken sender from a message that was accepted and then filed as spam.
    return { messageId: info.messageId, response: info.response };
  }

  /**
   * A one-time, low-stakes email sent at signup — see templates.js for why
   * this is the actual fix for outage alerts landing in spam. Not routed
   * through FanoutNotifier: it has no monitor, no DOWN/RECOVERY type, and
   * isn't relevant to non-email channels.
   */
  async sendWelcome({ to, name }) {
    if (!to) return;
    const info = await this.transport.sendMail({
      from: `"${this.fromName}" <${this.user}>`,
      to,
      subject: welcomeSubject(),
      text: welcomeText({ name }),
      html: welcomeHtml({ name }),
    });
    if (info.rejected?.length) {
      throw new Error(`Gmail rejected ${info.rejected.join(', ')} — ${info.response}`);
    }
    return { messageId: info.messageId, response: info.response };
  }

  /** Proves the credentials before an outage does. Used by notify:test. */
  async verify() {
    await this.transport.verify();
  }
}

module.exports = GmailNotifier;
