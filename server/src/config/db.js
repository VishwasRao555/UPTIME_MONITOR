'use strict';

const mongoose = require('mongoose');
const env = require('./env');
const logger = require('./logger');

let memoryServer = null;

/**
 * Resolves the connection string. When MONGO_URI is absent we spin up an
 * in-process MongoDB so a fresh clone runs with zero setup — data is discarded
 * on exit. Point MONGO_URI at Atlas to persist.
 *
 * That fallback is a development convenience and nothing more. In production it
 * would be actively harmful: the service would boot green, serve traffic, and
 * throw every account and monitor away on the next deploy — a data-loss bug
 * wearing a healthy status check. A missing MONGO_URI there is fatal instead.
 */
async function resolveUri() {
  if (env.MONGO_URI) return env.MONGO_URI;

  if (env.NODE_ENV === 'production') {
    throw new Error(
      'MONGO_URI is required in production (MONGO_URL is accepted too).\n' +
        '  Set it to your MongoDB Atlas connection string (Atlas → Connect → Drivers):\n' +
        '    mongodb+srv://<user>:<password>@<cluster>.mongodb.net/uptime?retryWrites=true&w=majority\n' +
        '  If your host shows a variable under some other name, this reads exactly\n' +
        '  MONGO_URI or MONGO_URL — anything else is invisible to it.\n' +
        '  Refusing to fall back to the in-memory database, which would discard\n' +
        '  every account and monitor on the next restart.'
    );
  }

  logger.warn('MONGO_URI not set — starting an in-memory MongoDB (data is not persisted)');
  // Required lazily: it is a devDependency and only needed on this path.
  const { MongoMemoryServer } = require('mongodb-memory-server');
  memoryServer = await MongoMemoryServer.create();
  return memoryServer.getUri('uptime');
}

/**
 * Turns a driver-level connection failure into an instruction.
 *
 * The database is MongoDB Atlas, and the two ways it refuses a connection both
 * produce errors that describe the symptom rather than the cause. A DNS/timeout
 * failure on an `mongodb+srv` host is almost always the caller's IP missing from
 * the Atlas access list — nothing about "querySrv ENOTFOUND" says so. Bad auth
 * is usually the password pasted in raw when it contains characters the URI
 * grammar reserves. Naming the likely fix is the difference between a one-minute
 * change in the Atlas UI and an afternoon spent suspecting the app.
 */
function explain(err, uri) {
  const message = err.message || '';
  const isAtlas = uri.startsWith('mongodb+srv://');
  const safeUri = uri.replace(/\/\/[^@]*@/, '//');

  // `cause` keeps the original driver error reachable for anyone debugging the
  // connection itself, rather than trading it away for the friendlier message.
  const wrap = (text) => new Error(`${text}\n  (original error: ${message})`, { cause: err });

  if (/bad auth|Authentication failed/i.test(message)) {
    return wrap(
      `MongoDB rejected the credentials in MONGO_URI.\n` +
        '  Check the database user under Atlas → Database Access — note that is a\n' +
        '  separate user from your Atlas login.\n' +
        '  If the password contains @ : / ? # [ ] or %, it must be percent-encoded\n' +
        '  in the URI (@ becomes %40, # becomes %23, and so on).'
    );
  }

  if (isAtlas && /ENOTFOUND|ETIMEDOUT|querySrv|Server selection timed out/i.test(message)) {
    return wrap(
      `Cannot reach MongoDB Atlas at ${safeUri}.\n` +
        '  The usual cause is network access: Atlas → Network Access must list the\n' +
        '  IP connecting to it. Railway has no static outbound IP, so that entry\n' +
        '  needs to be 0.0.0.0/0 for the deployed backend to connect at all.\n' +
        '  Otherwise check that the cluster is not paused and the hostname is exact.'
    );
  }

  if (/ECONNREFUSED/.test(message)) {
    return wrap(
      `Cannot reach MongoDB at ${safeUri}.\n` +
        '  Nothing is listening there. If you meant to use Atlas, MONGO_URI should\n' +
        '  be the mongodb+srv:// string from Atlas → Connect → Drivers.\n' +
        '  Or unset MONGO_URI in server/.env to use a throwaway in-memory database.'
    );
  }

  return err;
}

async function connect() {
  const uri = await resolveUri();

  mongoose.connection.on('disconnected', () => logger.warn('MongoDB disconnected'));
  mongoose.connection.on('reconnected', () => logger.info('MongoDB reconnected'));

  /**
   * Retry until a deadline, not a fixed attempt count.
   *
   * An M0 Atlas cluster is paused after inactivity and can take well over a
   * minute to wake. The HTTP server is already listening by the time we get
   * here (see server.js), so Railway's /health probe can keep getting 503
   * while we wait — that is a slow start, not a dead process. The deadline
   * leaves headroom under railway.json's 300s healthcheckTimeout: once we give
   * up and exit, the platform has nothing left to probe.
   */
  const deadlineMs = Date.now() + 240_000;
  const maxBackoffMs = 15000;
  let attempt = 0;
  let lastErr;
  while (Date.now() < deadlineMs) {
    attempt += 1;
    try {
      await mongoose.connect(uri, { serverSelectionTimeoutMS: 10000 });
      logger.info({ host: mongoose.connection.host }, 'MongoDB connected');
      return mongoose.connection;
    } catch (err) {
      lastErr = err;
      const remaining = deadlineMs - Date.now();
      if (remaining <= 0) break;
      const waitMs = Math.min(attempt * 2000, maxBackoffMs, remaining);
      logger.warn(
        { attempt, waitMs, remainingMs: remaining, err: err.message },
        'MongoDB connect failed, retrying'
      );
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    }
  }
  throw explain(lastErr || new Error('MongoDB connect timed out'), uri);
}

async function disconnect() {
  await mongoose.connection.close();
  if (memoryServer) await memoryServer.stop();
}

module.exports = { connect, disconnect };
