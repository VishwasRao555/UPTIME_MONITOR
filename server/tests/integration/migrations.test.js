'use strict';

// Must be set before config/env is first required.
process.env.NODE_ENV = 'test';
process.env.SSRF_GUARD = 'false';
process.env.JWT_SECRET = 'test-secret-that-is-comfortably-long-enough-32';
process.env.FAILURE_THRESHOLD = '3';

const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

let mockSiteIsUp = false;
jest.mock('../../src/services/checker.service', () => ({
  probe: jest.fn(async () => (mockSiteIsUp
    ? { isUp: true, statusCode: 200, responseTimeMs: 40, errorMessage: null }
    : { isUp: false, statusCode: 500, responseTimeMs: 40, errorMessage: 'Expected status 200, got 500' })),
}));

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
const Migration = require('../../src/models/Migration');
const CheckResult = require('../../src/models/CheckResult');
const Incident = require('../../src/models/Incident');
const { runMigrations } = require('../../src/migrations');
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
  mockSiteIsUp = false;
  mockSent.length = 0;
  jest.clearAllMocks();
  await Promise.all([
    User.deleteMany({}),
    Monitor.deleteMany({}),
    Migration.deleteMany({}),
    CheckResult.deleteMany({}),
    Incident.deleteMany({}),
  ]);
  owner = await User.create({ name: 'Vishwas', email: 'owner@example.com', passwordHash: 'x' });
});

/** Exactly what an older build left behind: paused *and* holding a DOWN. */
const strandedByOldBuild = () =>
  Monitor.create({
    userId: owner._id,
    name: 'Weather App',
    url: 'https://weather.example.com/',
    intervalSeconds: 60,
    isActive: false,
    currentStatus: 'DOWN',
    consecutiveFailures: 4,
  });

describe('monitors stranded by the old pause-on-outage build', () => {
  /**
   * The reported bug, stated as an assertion.
   *
   * Removing the code that paused monitors during an outage did nothing for the
   * rows it had already written, so from the user's side the fix changed
   * nothing at all: the scheduler still skipped their monitor, and "Check now"
   * was still the only thing that did anything.
   */
  it('is invisible to the scheduler until the repair runs', async () => {
    const monitor = await strandedByOldBuild();

    await runDueChecks();
    expect(await CheckResult.countDocuments({ monitorId: monitor._id })).toBe(0);

    await runMigrations();

    await runDueChecks();
    expect(await CheckResult.countDocuments({ monitorId: monitor._id })).toBe(1);
  });

  /**
   * Resuming alone is not enough. The state machine only reports a DOWN
   * transition when the status is not *already* DOWN, so a monitor brought back
   * still holding a stale DOWN would be probed forever without ever tripping —
   * no incident and no email, which is the second half of the report.
   */
  it('can alert again once repaired, instead of staying silently DOWN', async () => {
    await strandedByOldBuild();
    await runMigrations();

    const repaired = await Monitor.findOne({ name: 'Weather App' }).lean();
    expect(repaired.currentStatus).toBe('PENDING');
    expect(repaired.consecutiveFailures).toBe(0);

    // Three failing passes is a fresh outage, and must produce a fresh alert.
    for (let i = 0; i < 3; i += 1) {
      await Monitor.updateOne({ _id: repaired._id }, { lastCheckedAt: null });
      await runDueChecks();
    }

    expect(await Monitor.findById(repaired._id).then((m) => m.currentStatus)).toBe('DOWN');
    expect(mockSent.filter((a) => a.type === 'DOWN')).toHaveLength(1);
    expect(mockSent[0].recipient).toBe('owner@example.com');
  });

  it('leaves a monitor the user paused by hand alone', async () => {
    // Paused by a human: the status is whatever it was, not DOWN.
    const paused = await Monitor.create({
      userId: owner._id,
      name: 'Paused On Purpose',
      url: 'https://example.com/',
      intervalSeconds: 60,
      isActive: false,
      currentStatus: 'UP',
    });

    await runMigrations();

    expect(await Monitor.findById(paused._id).then((m) => m.isActive)).toBe(false);
  });

  it('runs once and not on every boot', async () => {
    await strandedByOldBuild();
    await runMigrations();

    // The user pauses it deliberately after the repair has already run.
    await Monitor.updateOne({ name: 'Weather App' }, { isActive: false, currentStatus: 'DOWN' });
    await runMigrations();

    expect(await Monitor.findOne({ name: 'Weather App' }).then((m) => m.isActive)).toBe(false);
    expect(await Migration.countDocuments({ key: 'heal-monitors-paused-by-outage' })).toBe(1);
  });
});
