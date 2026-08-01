'use strict';

const Notifier = require('./Notifier');
const { postJson } = require('./http');
const { subject, emailHtml, emailText, welcomeSubject, welcomeHtml, welcomeText } = require('./templates');

const BREVO_ENDPOINT = 'https://api.brevo.com/v3/smtp/email';

/**
 * Email through Brevo's transactional API — 300 sends/day on the free plan,
 * forever, with no card. Chosen over raw SMTP because it needs no extra
 * dependency (this is one JSON POST) and it gives you delivery logs when an
 * alert doesn't arrive.
 *
 * ALERT_EMAIL_FROM must be a *verified sender* in your Brevo account. An
 * unverified address is the usual cause of a 400 here, and no amount of
 * retrying will fix it — which is why http.js refuses to retry 4xx.
 */
class EmailNotifier extends Notifier {
  constructor({ apiKey, from, fromName, to, timeoutMs = 10000 }) {
    super('email');
    this.apiKey = apiKey;
    this.from = from;
    this.fromName = fromName;
    this.to = to;
    this.timeoutMs = timeoutMs;
  }

  async send(payload) {
    await postJson(BREVO_ENDPOINT, {
      timeoutMs: this.timeoutMs,
      headers: { 'api-key': this.apiKey },
      body: {
        sender: { email: this.from, name: this.fromName },
        to: this.to.map((email) => ({ email })),
        subject: subject(payload),
        htmlContent: emailHtml(payload),
        textContent: emailText(payload),
      },
    });
  }

  /** See GmailNotifier.sendWelcome — same one-time onboarding email, Brevo transport. */
  async sendWelcome({ to, name }) {
    if (!to) return;
    await postJson(BREVO_ENDPOINT, {
      timeoutMs: this.timeoutMs,
      headers: { 'api-key': this.apiKey },
      body: {
        sender: { email: this.from, name: this.fromName },
        to: [{ email: to }],
        subject: welcomeSubject(),
        htmlContent: welcomeHtml({ name }),
        textContent: welcomeText({ name }),
      },
    });
  }
}

module.exports = EmailNotifier;
