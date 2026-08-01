'use strict';

const Notifier = require('../../src/notifiers/Notifier');
const FanoutNotifier = require('../../src/notifiers/FanoutNotifier');
const { telegramHtml, emailHtml, subject, formatDuration } = require('../../src/notifiers/templates');

// The fanout logs through pino; keep the test output readable.
jest.mock('../../src/config/logger', () => ({
  error: jest.fn(),
  warn: jest.fn(),
  info: jest.fn(),
  debug: jest.fn(),
}));

const logger = require('../../src/config/logger');

/** No waiting in tests — the retry policy is behaviour, the delay is not. */
const FAST_RETRY = { backoffMs: [0, 0] };

/** Minimal stub channel: records payloads, or fails on demand.
 * `failTimes` fails the first N attempts and then succeeds, which is what a
 * transient SMTP hiccup looks like. */
class StubNotifier extends Notifier {
  constructor(name, { fails = false, failTimes = 0 } = {}) {
    super(name);
    this.fails = fails;
    this.failTimes = failTimes;
    this.attempts = 0;
    this.received = [];
  }

  async send(payload) {
    this.attempts += 1;
    if (this.fails || this.attempts <= this.failTimes) {
      throw new Error(`${this.name} is broken`);
    }
    this.received.push(payload);
  }
}

const payload = () => ({
  type: 'DOWN',
  monitor: { name: 'API', url: 'https://api.example.com', method: 'GET', expectedStatus: 200 },
  at: new Date('2026-07-30T09:15:00.000Z'),
  detail: 'Timeout after 10000ms',
});

describe('FanoutNotifier', () => {
  beforeEach(() => jest.clearAllMocks());

  it('delivers the alert to every channel', async () => {
    const a = new StubNotifier('a');
    const b = new StubNotifier('b');

    await new FanoutNotifier([a, b]).send(payload());

    expect(a.received).toHaveLength(1);
    expect(b.received).toHaveLength(1);
    expect(a.received[0].monitor.name).toBe('API');
  });

  it('still delivers to healthy channels when one throws', async () => {
    const broken = new StubNotifier('email', { fails: true });
    const healthy = new StubNotifier('telegram');

    await new FanoutNotifier([broken, healthy], FAST_RETRY).send(payload());

    // The whole point: a dead email provider must not cost you the Telegram
    // message telling you the site is down.
    expect(healthy.received).toHaveLength(1);
  });

  it('never rejects, so the scheduler cannot mistake it for a probe failure', async () => {
    const fanout = new FanoutNotifier([new StubNotifier('email', { fails: true })], FAST_RETRY);

    await expect(fanout.send(payload())).resolves.toBeDefined();
  });

  it('retries a channel that fails transiently, so one blip is not a missed alert', async () => {
    const flaky = new StubNotifier('gmail', { failTimes: 2 });

    await new FanoutNotifier([flaky], FAST_RETRY).send(payload());

    expect(flaky.attempts).toBe(3);
    expect(flaky.received).toHaveLength(1);
  });

  it('gives up after the attempt limit rather than retrying forever', async () => {
    const dead = new StubNotifier('gmail', { fails: true });

    await new FanoutNotifier([dead], { ...FAST_RETRY, maxAttempts: 3 }).send(payload());

    expect(dead.attempts).toBe(3);
  });

  it('logs the failing channel by name', async () => {
    await new FanoutNotifier([new StubNotifier('email', { fails: true })], FAST_RETRY).send(
      payload()
    );

    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ channel: 'email', err: 'email is broken' }),
      'Alert delivery failed'
    );
  });

  it('logs a delivered alert with the address it was aimed at', async () => {
    const to = 'someone@example.com';

    await new FanoutNotifier([new StubNotifier('gmail')], FAST_RETRY).send({
      ...payload(),
      recipient: to,
    });

    // Without this line, "I never got the email" is unanswerable after the fact.
    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({ channel: 'gmail', recipient: to }),
      'Alert delivered'
    );
  });
});

describe('templates', () => {
  it('escapes monitor names so markup cannot break the message', () => {
    const evil = {
      ...payload(),
      monitor: { ...payload().monitor, name: '<b>Prod</b> & "staging"' },
    };

    expect(telegramHtml(evil)).toContain('&lt;b&gt;Prod&lt;/b&gt; &amp; &quot;staging&quot;');
    expect(emailHtml(evil)).not.toContain('<b>Prod</b>');
  });

  it('escapes the detail string, which carries raw error text', () => {
    const evil = { ...payload(), detail: 'got <script>alert(1)</script>' };

    expect(telegramHtml(evil)).toContain('&lt;script&gt;');
    expect(emailHtml(evil)).toContain('&lt;script&gt;');
  });

  it('distinguishes DOWN from RECOVERY in the subject', () => {
    expect(subject(payload())).toContain('DOWN');
    expect(subject({ ...payload(), type: 'RECOVERY' })).toContain('RECOVERED');
  });

  it('formats downtime durations', () => {
    expect(formatDuration(45)).toBe('45s');
    expect(formatDuration(252)).toBe('4m 12s');
    expect(formatDuration(4212)).toBe('1h 10m 12s');
    expect(formatDuration(null)).toBe('');
  });
});
