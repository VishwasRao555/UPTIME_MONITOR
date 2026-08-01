'use strict';

// Must be set before config/env is first required.
process.env.NODE_ENV = 'test';
process.env.SSRF_GUARD = 'false';
process.env.JWT_SECRET = 'test-secret-that-is-comfortably-long-enough-32';

const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const jwt = require('jsonwebtoken');

/** Registration fires a welcome email; stub the channel so tests never hit
 * real SMTP (or mail fake addresses like ada@example.com from the real
 * Gmail account, which is exactly the sender-reputation harm we're trying
 * to avoid). Same pattern as monitoring.test.js uses for outage alerts. */
jest.mock('../../src/notifiers', () => ({
  channels: [{ name: 'stub' }],
  send: jest.fn(async () => [{ status: 'fulfilled', value: undefined }]),
  sendWelcomeEmail: jest.fn(async () => {}),
}));

const auth = require('../../src/services/auth.service');
const monitors = require('../../src/services/monitor.service');
const User = require('../../src/models/User');
const Monitor = require('../../src/models/Monitor');

let mongod;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
}, 60000);

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

afterEach(async () => {
  await Promise.all([User.deleteMany({}), Monitor.deleteMany({})]);
});

const ada = { name: 'Ada Lovelace', email: 'ada@example.com', password: 'correct-horse-8' };
const grace = { name: 'Grace Hopper', email: 'grace@example.com', password: 'nanosecond-99' };

describe('auth.service — registration', () => {
  it('returns a public user carrying no credential material', async () => {
    const { user, token } = await auth.register(ada);

    // Exhaustive on purpose: any new field that reaches the client has to be
    // added here deliberately, which is the moment to ask whether it should.
    expect(user).toEqual({
      id: expect.any(String),
      name: 'Ada Lovelace',
      email: 'ada@example.com',
      emailAlerts: true,
      createdAt: expect.any(Date),
    });
    // The shape is exhaustive above, but be explicit about the thing that
    // must never appear.
    expect(JSON.stringify(user)).not.toMatch(/passwordHash|\$2[aby]\$/);
    expect(token).toEqual(expect.any(String));
  });

  it('stores a bcrypt hash, never the password', async () => {
    await auth.register(ada);
    const stored = await User.findOne({ email: ada.email }).select('+passwordHash');

    expect(stored.passwordHash).not.toBe(ada.password);
    expect(stored.passwordHash).toMatch(/^\$2[aby]\$/);
  });

  it('normalises the email so ADA@ and ada@ are one account', async () => {
    await auth.register({ ...ada, email: '  ADA@Example.COM ' });
    await expect(auth.register(ada)).rejects.toMatchObject({ statusCode: 409 });
  });

  it('rejects a password longer than bcrypt can actually read', async () => {
    // bcrypt ignores everything past 72 bytes; silently truncating would make
    // two different passwords equivalent.
    await expect(
      auth.register({ ...ada, password: 'x'.repeat(73) })
    ).rejects.toMatchObject({ statusCode: 400 });
  });
});

describe('auth.service — login', () => {
  it('accepts the right password', async () => {
    await auth.register(ada);
    const { user } = await auth.login({ email: ada.email, password: ada.password });
    expect(user.email).toBe(ada.email);
  });

  it('gives the same answer for a wrong password and an unknown account', async () => {
    await auth.register(ada);

    const wrongPassword = await auth.login({ email: ada.email, password: 'nope' }).catch((e) => e);
    const noSuchUser = await auth.login({ email: 'ghost@example.com', password: 'nope' }).catch((e) => e);

    // Distinguishable messages would hand out a list of who has an account.
    expect(wrongPassword.statusCode).toBe(401);
    expect(noSuchUser.statusCode).toBe(401);
    expect(wrongPassword.message).toBe(noSuchUser.message);
  });
});

describe('auth.service — tokens', () => {
  it('resolves a freshly issued token to its owner', async () => {
    const { token } = await auth.register(ada);
    const user = await auth.userFromToken(token);
    expect(user.email).toBe(ada.email);
  });

  it.each([
    ['missing', undefined],
    ['malformed', 'not-a-jwt'],
    ['signed with another key', jwt.sign({ sub: 'x', v: 0 }, 'a-different-secret-entirely-abcdef')],
  ])('rejects a %s token', async (_label, token) => {
    await expect(auth.userFromToken(token)).rejects.toMatchObject({ statusCode: 401 });
  });

  it('rejects an expired token', async () => {
    const { user } = await auth.register(ada);
    const expired = jwt.sign({ sub: user.id, v: 0 }, process.env.JWT_SECRET, { expiresIn: '-1s' });
    await expect(auth.userFromToken(expired)).rejects.toMatchObject({ statusCode: 401 });
  });

  it('revokeAllSessions invalidates tokens that are still cryptographically valid', async () => {
    const { user, token } = await auth.register(ada);
    await expect(auth.userFromToken(token)).resolves.toBeTruthy();

    await auth.revokeAllSessions(user.id);

    // The signature still verifies; the tokenVersion no longer matches.
    expect(jwt.verify(token, process.env.JWT_SECRET)).toBeTruthy();
    await expect(auth.userFromToken(token)).rejects.toMatchObject({ statusCode: 401 });
  });

  it("refuses a deleted user's token", async () => {
    const { user, token } = await auth.register(ada);
    await User.deleteOne({ _id: user.id });
    await expect(auth.userFromToken(token)).rejects.toMatchObject({ statusCode: 401 });
  });
});

describe('monitor ownership isolation', () => {
  let a;
  let b;
  let bMonitor;

  beforeEach(async () => {
    a = (await auth.register(ada)).user;
    b = (await auth.register(grace)).user;
    bMonitor = await monitors.createMonitor(
      { name: 'Grace API', url: 'https://grace.example.com', intervalSeconds: 60 },
      b.id
    );
  });

  it('lists only your own monitors', async () => {
    await monitors.createMonitor({ name: 'Ada API', url: 'https://ada.example.com' }, a.id);

    const mine = await monitors.listMonitors(a.id);
    expect(mine).toHaveLength(1);
    expect(mine[0].name).toBe('Ada API');
  });

  it('counts only your own monitors in the overview', async () => {
    const overview = await monitors.getOverview(a.id);
    expect(overview.total).toBe(0);
  });

  it.each([
    ['read', (id, userId) => monitors.getMonitor(id, userId)],
    ['update', (id, userId) => monitors.updateMonitor(id, { name: 'Hijacked' }, userId)],
    ['delete', (id, userId) => monitors.deleteMonitor(id, userId)],
    ['results', (id, userId) => monitors.getResults(id, '24h', userId)],
    ['incidents', (id, userId) => monitors.getIncidents(id, userId)],
  ])("cannot %s someone else's monitor", async (_label, operation) => {
    // 404, not 403 — a 403 would confirm the id exists.
    await expect(operation(bMonitor._id, a.id)).rejects.toMatchObject({ statusCode: 404 });
  });

  it("leaves the other account's monitor untouched after a failed hijack", async () => {
    await monitors.updateMonitor(bMonitor._id, { name: 'Hijacked' }, a.id).catch(() => {});
    const still = await Monitor.findById(bMonitor._id).lean();
    expect(still.name).toBe('Grace API');
  });

  it('resuming a monitor clears the failure streak and the stale status', async () => {
    await Monitor.updateOne(
      { _id: bMonitor._id },
      { isActive: false, consecutiveFailures: 3, currentStatus: 'DOWN' }
    );

    const resumed = await monitors.updateMonitor(bMonitor._id, { isActive: true }, b.id);

    expect(resumed.isActive).toBe(true);
    // A resumed monitor needs the full threshold again, not one bad check.
    expect(resumed.consecutiveFailures).toBe(0);
    // Leaving this at DOWN would stop the state machine ever reporting the
    // next outage, since it only fires on the UP→DOWN edge.
    expect(resumed.currentStatus).toBe('PENDING');
  });

  it('ignores a userId smuggled in through the request body', async () => {
    const created = await monitors.createMonitor(
      { name: 'Sneaky', url: 'https://ada.example.com', userId: b.id },
      a.id
    );
    expect(created.userId.toString()).toBe(a.id);
  });
});
