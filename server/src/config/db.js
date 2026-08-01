'use strict';

const mongoose = require('mongoose');
const env = require('./env');
const logger = require('./logger');

let memoryServer = null;

/**
 * Resolves the connection string. When MONGO_URI is absent we spin up an
 * in-process MongoDB so the prototype runs with zero setup — data is
 * discarded on exit. Point MONGO_URI at Atlas or a local mongod to persist.
 */
async function resolveUri() {
  if (env.MONGO_URI) return env.MONGO_URI;

  logger.warn('MONGO_URI not set — starting an in-memory MongoDB (data is not persisted)');
  // Required lazily: it is a devDependency and only needed on this path.
  const { MongoMemoryServer } = require('mongodb-memory-server');
  memoryServer = await MongoMemoryServer.create();
  return memoryServer.getUri('uptime');
}

/**
 * Turns a refused connection into an instruction.
 *
 * "connect ECONNREFUSED 127.0.0.1:27017" is accurate and useless: the database
 * this project ships with lives in a container, and the only thing that has
 * gone wrong is that the container is not running. Saying so — with the command
 * that starts it — is the difference between a five-second fix and assuming the
 * app itself is broken.
 */
function explain(err, uri) {
  const refused = err.message?.includes('ECONNREFUSED');
  const isLocal = /127\.0\.0\.1|localhost/.test(uri);
  if (!refused || !isLocal) return err;

  // `cause` keeps the original driver error reachable for anyone debugging the
  // connection itself, rather than trading it away for the friendlier message.
  return new Error(
    `Cannot reach MongoDB at ${uri.replace(/\/\/[^@]*@/, '//')}.\n` +
      '  The database runs in Docker and does not appear to be up.\n' +
      '  Start it from the project root with:  npm run db:up\n' +
      '  (that needs Docker Desktop running first)\n' +
      '  Or unset MONGO_URI in server/.env to use a throwaway in-memory database.',
    { cause: err }
  );
}

async function connect() {
  const uri = await resolveUri();

  mongoose.connection.on('disconnected', () => logger.warn('MongoDB disconnected'));
  mongoose.connection.on('reconnected', () => logger.info('MongoDB reconnected'));

  // Retry with linear backoff: a cold Atlas cluster or a container that is
  // still booting should not take the whole process down.
  const maxAttempts = 5;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000 });
      logger.info({ host: mongoose.connection.host }, 'MongoDB connected');
      return mongoose.connection;
    } catch (err) {
      if (attempt === maxAttempts) throw explain(err, uri);
      const waitMs = attempt * 2000;
      logger.warn({ attempt, waitMs, err: err.message }, 'MongoDB connect failed, retrying');
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    }
  }
  return null;
}

async function disconnect() {
  await mongoose.connection.close();
  if (memoryServer) await memoryServer.stop();
}

module.exports = { connect, disconnect };
