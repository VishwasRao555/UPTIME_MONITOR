'use strict';

// Must be set before config/env is first required.
process.env.NODE_ENV = 'test';
process.env.SSRF_GUARD = 'false';
process.env.JWT_SECRET = 'test-secret-that-is-comfortably-long-enough-32';
process.env.FAILURE_THRESHOLD = '3';

const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

/**
 * The probe is the only thing standing between this suite and the network.
 * Swapping it for a switch we control is what makes "the site is down for six
 * minutes, then comes back" a deterministic two-line setup.
 */
// The `mock` prefix is required: jest hoists these factories above the
// declarations and only allows through variables named this way.
let mockSiteIsUp = true;
jest.mock('../../src/services/checker.service', () => ({
  probe: jest.fn(async () => (mockSiteIsUp
    ? { isUp: true, statusCode: 200, responseTimeMs: 40, errorMessage: null }
    : { isUp: false, statusCode: 404, responseTimeMs: 40, errorMessage: 'Expected status 200, got 404' })),
}));

/** Records every alert instead of mailing it. */
const mockSent = [];
jest.mock('../../src/notifiers', () => ({
  channels: [{ name: 'stub' }],
  send: jest.fn(async (payload) => {
    mockSent.push(payload);
    return [{ status: 'fulfilled', value: undefined }];
  }),
}));

const Monitor = require('../../src/models/Monitor');
const User = require('../../src/models/User');
const CheckResult = require('../../src/models/CheckResult');
const Incident = require('../../src/models/Incident');
const { runDueChecks } = require('../../src/scheduler/checkRunner');

let mongod;
let owner;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
}, 60000);

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

beforeEach(async () => {
  mockSiteIsUp = true;
  mockSent.length = 0;
  jest.clearAllMocks();
  await Promise.all([
    User.deleteMany({}),
    Monitor.deleteMany({}),
    CheckResult.deleteMany({}),
    Incident.deleteMany({}),
  ]);
  owner = await User.create({
    name: 'Vishwas',
    email: 'owner@example.com',
    passwordHash: 'x',
    emailAlerts: true,
  });
});

const makeMonitor = () =>
  Monitor.create({
    userId: owner._id,
    name: 'Weather App',
    url: 'https://weather.example.com/',
    intervalSeconds: 60,
  });

/**
 * One scheduler pass, a full interval after the previous one.
 *
 * Rewinding `lastCheckedAt` rather than sleeping keeps the suite at
 * milliseconds and removes the wall clock as a source of flake — the thing
 * under test is the due/skip decision, not the passage of real time.
 */
async function tick(monitor) {
  const current = await Monitor.findById(monitor._id).lean();
  if (current.lastCheckedAt) {
    await Monitor.updateOne(
      { _id: monitor._id },
      { lastCheckedAt: new Date(current.lastCheckedAt.getTime() - monitor.intervalSeconds * 1000) }
    );
  }
  await runDueChecks();
}

const checksFor = (monitor) => CheckResult.countDocuments({ monitorId: monitor._id });
const alertsOfType = (type) => mockSent.filter((a) => a.type === type);

describe('an endpoint that goes down and stays down', () => {
  /**
   * The reported bug, stated as an assertion.
   *
   * An uptime monitor that stops probing the moment a site breaks cannot tell
   * you when it comes back, and leaves the user pressing "Check now" by hand —
   * which is exactly how this was reported.
   */
  it('keeps checking after it trips DOWN', async () => {
    const monitor = await makeMonitor();

    await tick(monitor); // UP
    mockSiteIsUp = false;
    await tick(monitor); // fail 1
    await tick(monitor); // fail 2
    await tick(monitor); // fail 3 → DOWN

    const atOutage = await checksFor(monitor);
    expect((await Monitor.findById(monitor._id)).currentStatus).toBe('DOWN');

    // Three more scheduler passes with no user involvement at all.
    await tick(monitor);
    await tick(monitor);
    await tick(monitor);

    expect(await checksFor(monitor)).toBe(atOutage + 3);
  });

  it('stays active, so nothing is waiting on a human to resume it', async () => {
    const monitor = await makeMonitor();
    mockSiteIsUp = false;

    await tick(monitor);
    await tick(monitor);
    await tick(monitor); // → DOWN

    const after = await Monitor.findById(monitor._id).lean();
    expect(after.isActive).toBe(true);
  });

  it('alerts once for the outage, not once per failed check', async () => {
    const monitor = await makeMonitor();
    mockSiteIsUp = false;

    for (let i = 0; i < 8; i += 1) await tick(monitor);

    // The debounce is the product: eight failures is one outage.
    expect(alertsOfType('DOWN')).toHaveLength(1);
  });

  it('opens exactly one incident for the outage', async () => {
    const monitor = await makeMonitor();
    mockSiteIsUp = false;

    for (let i = 0; i < 8; i += 1) await tick(monitor);

    expect(await Incident.countDocuments({ monitorId: monitor._id })).toBe(1);
  });

  it('addresses the alert to the account that owns the monitor', async () => {
    const monitor = await makeMonitor();
    mockSiteIsUp = false;

    for (let i = 0; i < 3; i += 1) await tick(monitor);

    expect(alertsOfType('DOWN')[0].recipient).toBe('owner@example.com');
  });
});

describe('an endpoint that recovers', () => {
  /** Without this, an outage is a dead end: the monitor can never report the
   * fix because it stopped looking. */
  it('detects recovery on its own and says so', async () => {
    const monitor = await makeMonitor();
    mockSiteIsUp = false;

    for (let i = 0; i < 3; i += 1) await tick(monitor); // → DOWN
    expect(alertsOfType('DOWN')).toHaveLength(1);

    mockSiteIsUp = true;
    await tick(monitor);

    const after = await Monitor.findById(monitor._id).lean();
    expect(after.currentStatus).toBe('UP');
    expect(alertsOfType('RECOVERY')).toHaveLength(1);
  });

  it('closes the incident and stamps its duration', async () => {
    const monitor = await makeMonitor();
    mockSiteIsUp = false;

    for (let i = 0; i < 3; i += 1) await tick(monitor);
    mockSiteIsUp = true;
    await tick(monitor);

    const incident = await Incident.findOne({ monitorId: monitor._id }).lean();
    expect(incident.resolvedAt).not.toBeNull();
    expect(incident.durationSeconds).toEqual(expect.any(Number));
  });

  it('alerts again if it breaks a second time', async () => {
    const monitor = await makeMonitor();
    mockSiteIsUp = false;

    for (let i = 0; i < 3; i += 1) await tick(monitor);
    mockSiteIsUp = true;
    await tick(monitor);
    mockSiteIsUp = false;
    for (let i = 0; i < 3; i += 1) await tick(monitor);

    expect(alertsOfType('DOWN')).toHaveLength(2);
    expect(await Incident.countDocuments({ monitorId: monitor._id })).toBe(2);
  });
});

describe('a monitor the user paused by hand', () => {
  it('is left alone by the scheduler', async () => {
    const monitor = await makeMonitor();
    await tick(monitor);
    const before = await checksFor(monitor);

    await Monitor.updateOne({ _id: monitor._id }, { isActive: false });
    await tick(monitor);
    await tick(monitor);

    expect(await checksFor(monitor)).toBe(before);
  });
});
