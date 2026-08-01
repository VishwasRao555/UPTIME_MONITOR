'use strict';

/**
 * Boot-configuration behaviour, exercised the only way it can be: in a fresh
 * process each time.
 *
 * config/env.js validates once at require time, freezes the result, and calls
 * process.exit on anything invalid. That is deliberate — it is what makes a bad
 * variable a startup error instead of a 3 a.m. surprise — but it also means the
 * module cannot be re-imported with different input inside one Jest worker.
 * Spawning is what buys back the ability to test it at all.
 *
 * These cases are here because each one has already cost a failed deployment or
 * a silent misbehaviour, and none of them are visible from the code that reads
 * `env.X` downstream.
 */

const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ENV_MODULE = path.join(__dirname, '..', '..', 'src', 'config', 'env.js');

/**
 * A directory with no .env in it, used as the child's working directory.
 *
 * env.js calls `require('dotenv').config()`, which resolves its file against
 * `process.cwd()` — and note that plain `.config()` ignores DOTENV_CONFIG_PATH
 * entirely, since that is only honoured by the `-r dotenv/config` preload.
 * Running from the server root therefore let the developer's own server/.env
 * leak in and decide the answer: these cases passed only while that file
 * happened to have MONGO_URI commented out, and started failing the moment a
 * real connection string was added. Somewhere empty is the only cwd that makes
 * the result depend on the variables the test actually passes.
 */
const CLEAN_CWD = fs.mkdtempSync(path.join(os.tmpdir(), 'sentinel-env-'));

afterAll(() => fs.rmSync(CLEAN_CWD, { recursive: true, force: true }));

/** Load config/env.js in a clean process and report what it resolved to. */
function loadEnv(vars) {
  const script =
    `const e = require(${JSON.stringify(ENV_MODULE)});` +
    'process.stdout.write(JSON.stringify({' +
    'mongo: e.MONGO_URI ?? null,' +
    'sameSite: e.COOKIE_SAMESITE,' +
    'secure: e.COOKIE_SECURE,' +
    'port: e.PORT,' +
    '}));';

  try {
    const stdout = execFileSync(process.execPath, ['-e', script], {
      cwd: CLEAN_CWD,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        PATH: process.env.PATH,
        SystemRoot: process.env.SystemRoot, // Windows: node will not start without it
        ...vars,
      },
    });
    return { ok: true, ...JSON.parse(stdout.slice(stdout.indexOf('{'))) };
  } catch (err) {
    return { ok: false, status: err.status, stderr: `${err.stderr || ''}${err.stdout || ''}` };
  }
}

const PROD = {
  NODE_ENV: 'production',
  JWT_SECRET: 'x'.repeat(48),
  NOTIFIER_CHANNELS: 'console',
};

const ATLAS = 'mongodb+srv://user:pass@cluster0.example.mongodb.net/uptime';

describe('MONGO_URL is accepted as MONGO_URI', () => {
  /**
   * The bug this exists for: Railway's MongoDB service publishes the string as
   * MONGO_URL, so that is the name you end up with there. The app read only
   * MONGO_URI, exited on boot, and the platform reported nothing but
   * "Healthcheck failed" — a one-letter difference costing a whole deploy.
   */
  test('MONGO_URL alone is used', () => {
    const env = loadEnv({ ...PROD, MONGO_URL: ATLAS });
    expect(env.ok).toBe(true);
    expect(env.mongo).toBe(ATLAS);
  });

  test('MONGO_URI alone is used', () => {
    const env = loadEnv({ ...PROD, MONGO_URI: ATLAS });
    expect(env.ok).toBe(true);
    expect(env.mongo).toBe(ATLAS);
  });

  test('MONGO_URI wins when both are set, so an explicit value is never overridden', () => {
    const explicit = 'mongodb+srv://explicit:pw@explicit.example.mongodb.net/uptime';
    const env = loadEnv({ ...PROD, MONGO_URI: explicit, MONGO_URL: ATLAS });
    expect(env.ok).toBe(true);
    expect(env.mongo).toBe(explicit);
  });

  test('neither set leaves it unset rather than inventing one', () => {
    const env = loadEnv({ ...PROD });
    expect(env.ok).toBe(true);
    expect(env.mongo).toBeNull();
  });

  /**
   * A hosting dashboard makes an empty variable trivial to create — add the
   * row, forget the value. Treating "" as a malformed URL rather than as unset
   * would turn a blank field into a boot loop.
   */
  test('an empty value is treated as unset, not as a malformed URL', () => {
    const env = loadEnv({ ...PROD, MONGO_URI: '', MONGO_URL: '' });
    expect(env.ok).toBe(true);
    expect(env.mongo).toBeNull();
  });
});

describe('connection string shapes', () => {
  /**
   * The seed-list form is standard Mongo syntax and the only way to reach a
   * replica set without an SRV lookup, but its comma-separated authority is not
   * a legal WHATWG URL. Validating with .url() rejected it at boot as "Invalid
   * url", which reads as a bad value rather than a bad check.
   */
  test('accepts a replica-set seed list, which is not a valid WHATWG URL', () => {
    const seedList =
      'mongodb://u:p@a.example.net:27017,b.example.net:27017,c.example.net:27017' +
      '/uptime?ssl=true&replicaSet=rs0&authSource=admin';
    expect(() => new URL(seedList)).toThrow(); // the premise: genuinely not a URL
    const env = loadEnv({ ...PROD, MONGO_URI: seedList });
    expect(env.ok).toBe(true);
    expect(env.mongo).toBe(seedList);
  });

  test.each([
    ['mongodb+srv', ATLAS],
    ['mongodb single host', 'mongodb://u:p@a.example.net:27017/uptime'],
    ['no credentials', 'mongodb://localhost:27017/uptime'],
  ])('accepts %s', (_label, uri) => {
    const env = loadEnv({ ...PROD, MONGO_URI: uri });
    expect(env.ok).toBe(true);
    expect(env.mongo).toBe(uri);
  });

  // The scheme is the one thing worth asserting; the driver reports the rest.
  test.each([
    ['a bare hostname', 'cluster0.example.mongodb.net/uptime'],
    ['the wrong scheme', 'https://cluster0.example.mongodb.net/uptime'],
    ['a scheme with nothing after it', 'mongodb://'],
  ])('rejects %s', (_label, uri) => {
    const env = loadEnv({ ...PROD, MONGO_URI: uri });
    expect(env.ok).toBe(false);
    expect(env.stderr).toMatch(/mongodb:\/\/ or mongodb\+srv:\/\//);
  });
});

describe('cross-site cookie policy', () => {
  // The Vercel frontend and Railway API are different sites, so a Lax cookie
  // would never be attached to an API call. Production must default to None.
  test('production defaults to SameSite=None + Secure', () => {
    const env = loadEnv({ ...PROD, MONGO_URI: ATLAS });
    expect(env.sameSite).toBe('none');
    expect(env.secure).toBe(true);
  });

  test('development stays on the stricter Lax, where both halves share an origin', () => {
    const env = loadEnv({ NODE_ENV: 'development', MONGO_URI: ATLAS });
    expect(env.sameSite).toBe('lax');
    expect(env.secure).toBe(false);
  });

  // Browsers discard SameSite=None without Secure and say nothing, which would
  // read as a login that succeeds and then immediately forgets you.
  test('refuses to boot on SameSite=None without Secure', () => {
    const env = loadEnv({
      ...PROD,
      MONGO_URI: ATLAS,
      COOKIE_SAMESITE: 'none',
      COOKIE_SECURE: 'false',
    });
    expect(env.ok).toBe(false);
    expect(env.status).toBe(1);
    expect(env.stderr).toMatch(/COOKIE_SAMESITE=none requires COOKIE_SECURE=true/);
  });

  test('a single-origin deployment can still opt back into Lax', () => {
    const env = loadEnv({ ...PROD, MONGO_URI: ATLAS, COOKIE_SAMESITE: 'lax' });
    expect(env.ok).toBe(true);
    expect(env.sameSite).toBe('lax');
  });
});

describe('platform-injected PORT', () => {
  // Railway assigns the port and injects it; ignoring it would leave the app
  // listening somewhere the health check never looks.
  test('honours an injected PORT over the default', () => {
    const env = loadEnv({ ...PROD, MONGO_URI: ATLAS, PORT: '8080' });
    expect(env.port).toBe(8080);
  });

  test('falls back to 5000 when nothing is injected', () => {
    const env = loadEnv({ ...PROD, MONGO_URI: ATLAS });
    expect(env.port).toBe(5000);
  });
});
