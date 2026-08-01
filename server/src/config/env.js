'use strict';

/**
 * Validates the environment once, at boot, and fails fast.
 * Everything downstream imports the frozen result instead of reading
 * process.env, so a missing variable surfaces on startup rather than at
 * 3 a.m. inside a scheduler tick.
 */

require('dotenv').config();
const { z } = require('zod');

const intFromEnv = (fallback) =>
  z.coerce.number().int().positive().default(fallback);

/** Split a comma-separated variable into a de-duplicated, trimmed list. */
const csv = (value) => [
  ...new Set(
    String(value)
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
  ),
];

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: intFromEnv(5000),

  // MongoDB Atlas. Leave unset in development to boot an in-memory MongoDB;
  // required in production, which config/db.js enforces.
  //
  // The preprocess step treats "" as unset. A hosting dashboard makes an empty
  // variable trivially easy to create — add the row, forget to paste the value —
  // and without this the app would reject it as a malformed URL rather than
  // falling back, turning a blank field into a boot loop with a confusing cause.
  MONGO_URI: z.preprocess(
    (v) => (typeof v === 'string' && v.trim() === '' ? undefined : v),
    z.string().url().optional()
  ),

  // Scheduler
  //
  // The scheduler renders this into the *seconds* field of a cron expression
  // (`*/N * * * * *`), and that field only spans 0-59. node-cron accepts a
  // larger step without complaint and then quietly fires at second 0 only — so
  // a tick of 90 or 120 silently behaves as 60, and `cron.validate()` still
  // returns true. Rejecting it here turns a cadence that is wrong in a way
  // nothing reports into a startup error that says so.
  CHECK_TICK_SECONDS: z.coerce
    .number()
    .int()
    .min(1)
    .max(59, 'must be 1-59: it becomes the seconds field of a cron expression')
    .default(30),
  FAILURE_THRESHOLD: intFromEnv(3),
  REQUEST_TIMEOUT_MS: intFromEnv(10000),
  RESULT_RETENTION_DAYS: intFromEnv(30),

  // Notifiers — a comma-separated list; every listed channel receives every
  // alert. See src/notifiers/index.js for the registry.
  NOTIFIER_CHANNELS: z
    .string()
    .default('console')
    .transform(csv)
    .pipe(z.array(z.enum(['console', 'telegram', 'email', 'gmail'])).nonempty()),

  // Telegram — required only when 'telegram' is enabled (see the refinement
  // below). Get a token from @BotFather; `npm run telegram:id` prints the id.
  TELEGRAM_BOT_TOKEN: z.string().min(1).optional(),
  TELEGRAM_CHAT_ID: z.string().min(1).optional(),

  // Email via your own Gmail over SMTP — required only when 'gmail' is on.
  // GMAIL_APP_PASSWORD is a 16-character App Password, never your login
  // password. Google shows it with spaces; they are ignored either way.
  GMAIL_USER: z.string().email().optional(),
  GMAIL_APP_PASSWORD: z
    .string()
    .optional()
    .transform((v) => (v ? v.replace(/\s+/g, '') : v)),

  // Email via Brevo's transactional API — required only when 'email' is on.
  // The sender address must be a verified sender in your Brevo account.
  BREVO_API_KEY: z.string().min(1).optional(),
  ALERT_EMAIL_FROM: z.string().email().optional(),
  ALERT_EMAIL_FROM_NAME: z.string().default('Sentinel'),
  ALERT_EMAIL_TO: z
    .string()
    .default('')
    .transform(csv)
    .pipe(z.array(z.string().email('must be a comma-separated list of emails'))),

  // How long to wait on a notification provider before giving up.
  NOTIFY_TIMEOUT_MS: intFromEnv(10000),

  // Auth. JWT_SECRET is mandatory in production — see the guard below the
  // schema. 32 chars is the floor for an HS256 key worth having.
  JWT_SECRET: z.string().min(32, 'must be at least 32 characters').optional(),
  JWT_EXPIRES_DAYS: intFromEnv(30),

  // Cookies are Secure in production and plain HTTP in development, since
  // localhost has no TLS. Override only if you terminate TLS upstream.
  COOKIE_SECURE: z.enum(['true', 'false']).optional().transform((v) => v === undefined ? undefined : v === 'true'),

  /**
   * SameSite policy for the auth cookie. Left unset it resolves to 'none' in
   * production and 'lax' in development (see below the schema).
   *
   * This exists because the frontend and the API are deployed to different
   * sites — the React build on Vercel, the API on Railway. `.vercel.app` and
   * `.up.railway.app` are separate registrable domains, so every API call the
   * browser makes is cross-site, and a 'lax' cookie is simply not attached to
   * cross-site XHR/fetch. The failure mode is the nasty kind: login returns
   * 200, the cookie is stored, and every request after it goes out
   * unauthenticated with nothing in the network tab to explain why.
   *
   * 'none' is only safe here because the API never mutates state through GET
   * and CORS_ORIGIN is an exact allow-list — a third-party site can make the
   * browser send the cookie, but cannot read any response it did not get
   * permission for.
   */
  COOKIE_SAMESITE: z.enum(['lax', 'none', 'strict']).optional(),

  // Off by default: trusting proxy headers blindly lets a client spoof its own
  // IP, which would defeat the auth rate limiter. Turn on only behind a proxy
  // you control.
  TRUST_PROXY: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),

  // Blocking private IP ranges is on by default; disable only to monitor
  // something on your own LAN.
  SSRF_GUARD: z
    .enum(['true', 'false'])
    .default('true')
    .transform((v) => v === 'true'),

  CORS_ORIGIN: z.string().default('http://localhost:5173'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
})
  /**
   * Credentials are only mandatory for the channels actually switched on.
   * Checking it here means "telegram enabled, token missing" is a startup
   * error rather than a silently dropped 3 a.m. alert.
   */
  .superRefine((cfg, ctx) => {
    const mustHave = (key, enabledBy) => {
      const value = cfg[key];
      if (value !== undefined && !(Array.isArray(value) && value.length === 0)) return;
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [key],
        message: `required when '${enabledBy}' is listed in NOTIFIER_CHANNELS`,
      });
    };

    if (cfg.NOTIFIER_CHANNELS.includes('telegram')) {
      mustHave('TELEGRAM_BOT_TOKEN', 'telegram');
      mustHave('TELEGRAM_CHAT_ID', 'telegram');
    }
    if (cfg.NOTIFIER_CHANNELS.includes('email')) {
      mustHave('BREVO_API_KEY', 'email');
      mustHave('ALERT_EMAIL_FROM', 'email');
      mustHave('ALERT_EMAIL_TO', 'email');
    }
    if (cfg.NOTIFIER_CHANNELS.includes('gmail')) {
      mustHave('GMAIL_USER', 'gmail');
      mustHave('GMAIL_APP_PASSWORD', 'gmail');
    }
  });

// The prototype shipped a singular NOTIFIER_CHANNEL; keep existing .env files
// booting by treating it as an alias for the new list.
const source = { ...process.env };
if (!source.NOTIFIER_CHANNELS && source.NOTIFIER_CHANNEL) {
  source.NOTIFIER_CHANNELS = source.NOTIFIER_CHANNEL;
}

/**
 * MONGO_URL is the same thing by the other common name.
 *
 * Railway's own MongoDB service publishes the connection string as MONGO_URL,
 * and its variable autocomplete offers that spelling — so it is what you end up
 * with on that platform unless you deliberately type something else. One letter
 * apart from what this app reads, and the failure it caused gave no hint: the
 * process refused to start for a missing MONGO_URI while the dashboard plainly
 * showed a MONGO_URL sitting right there, and the platform reported only
 * "Healthcheck failed".
 *
 * Accepting both is not indulging a typo — it is accepting the name the host
 * actually hands you. MONGO_URI still wins if both are set, so an explicit
 * value is never overridden by an injected one.
 */
if (!source.MONGO_URI && source.MONGO_URL) {
  source.MONGO_URI = source.MONGO_URL;
  console.warn('MONGO_URI is not set — using MONGO_URL instead (they mean the same thing).');
}

const parsed = schema.safeParse(source);

if (!parsed.success) {
  const issues = parsed.error.issues
    .map((i) => `  - ${i.path.join('.') || '(root)'}: ${i.message}`)
    .join('\n');
  console.error(`Invalid environment configuration:\n${issues}`);
  process.exit(1);
}

const config = { ...parsed.data };

/**
 * A signing key is not optional — it is the only thing standing between a
 * forged cookie and someone else's monitors. In production a missing one is
 * fatal. In development we mint a random key so the prototype still boots with
 * zero config; the cost is that restarting the server signs everyone out,
 * which is the safe direction to fail.
 */
if (!config.JWT_SECRET) {
  if (config.NODE_ENV === 'production') {
    console.error(
      'Invalid environment configuration:\n' +
        '  - JWT_SECRET: required in production.\n' +
        "    Generate one with:  node -e \"console.log(require('crypto').randomBytes(48).toString('hex'))\""
    );
    process.exit(1);
  }
  config.JWT_SECRET = require('crypto').randomBytes(48).toString('hex');
  console.warn(
    'JWT_SECRET not set — generated a temporary one for development. ' +
      'Sessions will not survive a restart.'
  );
}

// Secure cookies wherever we are not on plain-HTTP localhost.
if (config.COOKIE_SECURE === undefined) {
  config.COOKIE_SECURE = config.NODE_ENV === 'production';
}

/**
 * In production the frontend (Vercel) and the API (Railway) are different
 * sites, so the auth cookie has to be SameSite=None to survive the trip. In
 * development both are localhost — same site — where 'lax' is the stricter and
 * therefore better default, and 'none' would not work anyway because browsers
 * refuse a SameSite=None cookie that is not also Secure, and localhost is HTTP.
 */
if (config.COOKIE_SAMESITE === undefined) {
  config.COOKIE_SAMESITE = config.NODE_ENV === 'production' ? 'none' : 'lax';
}

/**
 * Every browser silently rejects `SameSite=None` without `Secure`. Silently is
 * the problem: the server would report a successful login, set a cookie the
 * browser throws on the floor, and leave you debugging the API for a
 * misconfiguration that lives entirely in two environment variables. Refusing
 * to boot puts the error where the mistake is.
 */
if (config.COOKIE_SAMESITE === 'none' && !config.COOKIE_SECURE) {
  console.error(
    'Invalid environment configuration:\n' +
      '  - COOKIE_SAMESITE=none requires COOKIE_SECURE=true (browsers drop the\n' +
      '    cookie otherwise, and login will appear to succeed but never persist).\n' +
      '    Serve the API over HTTPS and set COOKIE_SECURE=true, or use\n' +
      '    COOKIE_SAMESITE=lax if the frontend is served from this same origin.'
  );
  process.exit(1);
}

module.exports = Object.freeze(config);
