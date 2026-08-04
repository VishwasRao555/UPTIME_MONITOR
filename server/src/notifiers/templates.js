'use strict';

/**
 * Turns an alert payload into the wording each channel wants. Kept apart from
 * the channels themselves so the message can be tested — and reworded —
 * without touching any network code.
 *
 * Monitor names and URLs arrive from the public API, so every interpolation
 * into markup goes through escapeHtml. An alert is the one message you cannot
 * afford to have silently mangled by a stray '<' in a monitor name.
 */

const env = require('../config/env');

/**
 * The name every email claims to be from, read once from config so the
 * footer can never drift from the `From:` header. A mismatch between the
 * two — mail arrives "From: Acme Alerts" but the body says "Sent by
 * UPTIME_MONITOR" — is exactly the inconsistency spam filters (and recipients)
 * read as a phishing tell.
 */
const BRAND = env.ALERT_EMAIL_FROM_NAME;

const COLORS = {
  DOWN: { accent: '#e23b3b', label: 'DOWN', emoji: '🔴', verb: 'is down' },
  RECOVERY: { accent: '#1f9d55', label: 'RECOVERED', emoji: '🟢', verb: 'is back up' },
};

const escapeHtml = (value) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

/** 4212 → "1h 10m 12s", 72 → "1m 12s". Empty for null/negative. */
function formatDuration(seconds) {
  if (seconds == null || seconds < 0) return '';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return [h && `${h}h`, (h || m) && `${m}m`, `${s}s`].filter(Boolean).join(' ');
}

const theme = (type) => COLORS[type] ?? COLORS.DOWN;

/** The ordered rows both renderers show, so they can never drift apart. */
function facts({ monitor, at, detail }) {
  return [
    ['Monitor', monitor.name],
    ['URL', monitor.url],
    ['Check', `${monitor.method || 'GET'} → expected ${monitor.expectedStatus ?? 200}`],
    ['Detail', detail || '—'],
    ['Time', at.toISOString().replace('T', ' ').replace(/\.\d+Z$/, ' UTC')],
  ];
}

function subject(payload) {
  const { emoji, label } = theme(payload.type);
  return `${emoji} ${label} — ${payload.monitor.name}`;
}

/** Telegram's HTML subset: b/i/a/code only, and newlines instead of <br>. */
function telegramHtml(payload) {
  const { emoji, verb } = theme(payload.type);
  const { monitor } = payload;

  const lines = [
    `${emoji} <b>${escapeHtml(monitor.name)}</b> ${verb}`,
    '',
    ...facts(payload)
      .slice(1)
      .map(([key, value]) => `<b>${key}:</b> ${escapeHtml(value)}`),
  ];

  return lines.join('\n');
}

/** A single-column, inline-styled email — the only layout every client renders. */
function emailHtml(payload) {
  const { accent, emoji, label } = theme(payload.type);
  const { monitor } = payload;

  const rows = facts(payload)
    .map(
      ([key, value]) => `
        <tr>
          <td style="padding:8px 0;color:#6f6a5c;font-size:13px;width:88px;vertical-align:top;">${key}</td>
          <td style="padding:8px 0;color:#141310;font-size:13px;word-break:break-all;">${escapeHtml(value)}</td>
        </tr>`
    )
    .join('');

  return `<!doctype html>
<html>
  <body style="margin:0;padding:24px 12px;background:#f4efe1;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width:520px;margin:0 auto;background:#fffdf7;border:1px solid #e7dfc9;border-radius:14px;overflow:hidden;">
      <tr>
        <td style="background:${accent};padding:18px 24px;color:#ffffff;font-size:16px;font-weight:700;letter-spacing:0.02em;">
          ${emoji} ${label}
        </td>
      </tr>
      <tr>
        <td style="padding:22px 24px;">
          <p style="margin:0 0 18px;font-size:18px;font-weight:700;color:#141310;">${escapeHtml(monitor.name)}</p>
          <table role="presentation" cellpadding="0" cellspacing="0" width="100%">${rows}</table>
        </td>
      </tr>
      <tr>
        <td style="padding:14px 24px;background:#faf5e8;border-top:1px solid #e7dfc9;color:#8a8474;font-size:12px;">
          Sent by ${escapeHtml(BRAND)} because you have alerts enabled for this monitor.
          Manage this in your dashboard's account settings at any time.
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

/** Plain-text alternative; also what spam filters read first. */
function emailText(payload) {
  const { label } = theme(payload.type);
  return [
    `${label}: ${payload.monitor.name}`,
    '',
    ...facts(payload)
      .slice(1)
      .map(([key, value]) => `${key}: ${value}`),
    '',
    `Sent by ${BRAND} because you have alerts enabled for this monitor.`,
    'Manage this in your dashboard\'s account settings at any time.',
  ].join('\n');
}

/** Subject for the one-time welcome email sent at signup. */
function welcomeSubject() {
  return `Welcome to ${BRAND} — outage alerts are on`;
}

/**
 * A deliberately low-stakes first email, sent right after signup rather than
 * waiting for the first real outage.
 *
 * This is the actual fix for "the DOWN alert landed in spam": a brand-new
 * sender/recipient pair has no history for Gmail to trust, and the first
 * message that pair ever exchanges is otherwise a scary, automated-looking
 * DOWN alert that nobody is watching for — the worst possible message to
 * have filtered quietly. Sending something calm during onboarding, while the
 * user is still looking at the screen and expecting it, gives them a chance
 * to mark it "Not spam" / add the sender to contacts before it ever matters.
 * Gmail treats that action as a strong trust signal for every later message
 * from the same address.
 */
function welcomeHtml({ name }) {
  return `<!doctype html>
<html>
  <body style="margin:0;padding:24px 12px;background:#f4efe1;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width:520px;margin:0 auto;background:#fffdf7;border:1px solid #e7dfc9;border-radius:14px;overflow:hidden;">
      <tr>
        <td style="background:#2f6f4e;padding:18px 24px;color:#ffffff;font-size:16px;font-weight:700;letter-spacing:0.02em;">
          👋 Welcome to ${escapeHtml(BRAND)}
        </td>
      </tr>
      <tr>
        <td style="padding:22px 24px;color:#141310;font-size:14px;line-height:1.6;">
          <p style="margin:0 0 12px;">Hi ${escapeHtml(name)},</p>
          <p style="margin:0 0 12px;">
            Your account is set up. From now on, this address
            (${escapeHtml(env.GMAIL_USER || env.ALERT_EMAIL_FROM || '')}) will email you here
            whenever one of your monitors goes down or recovers — nothing more.
          </p>
          <p style="margin:0 0 12px;">
            One favor: if this lands in Spam or Promotions, please move it to your inbox
            and mark it "Not spam." That's what tells Gmail to trust the outage alerts
            you'll actually need to see.
          </p>
        </td>
      </tr>
      <tr>
        <td style="padding:14px 24px;background:#faf5e8;border-top:1px solid #e7dfc9;color:#8a8474;font-size:12px;">
          You're receiving this because you created an account. Manage alert
          preferences any time in your dashboard's account settings.
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

function welcomeText({ name }) {
  return [
    `Welcome to ${BRAND}`,
    '',
    `Hi ${name},`,
    '',
    `Your account is set up. This address will email you here whenever one of ` +
      `your monitors goes down or recovers — nothing more.`,
    '',
    `One favor: if this lands in Spam or Promotions, please move it to your ` +
      `inbox and mark it "Not spam." That's what tells Gmail to trust the ` +
      `outage alerts you'll actually need to see.`,
    '',
    `You're receiving this because you created an account. Manage alert ` +
      `preferences any time in your dashboard's account settings.`,
  ].join('\n');
}

module.exports = {
  subject,
  telegramHtml,
  emailHtml,
  emailText,
  welcomeSubject,
  welcomeHtml,
  welcomeText,
  escapeHtml,
  formatDuration,
};
