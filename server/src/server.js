'use strict';

const app = require('./app');
const env = require('./config/env');
const logger = require('./config/logger');
const db = require('./config/db');
const { runMigrations } = require('./migrations');
const { startScheduler } = require('./scheduler');

async function main() {
  /**
   * Bind the HTTP port before touching Mongo.
   *
   * Railway's deploy healthcheck probes /health on $PORT. If we wait for Atlas
   * (cold M0 clusters routinely take a minute-plus) before listen(), that probe
   * gets connection-refused the whole time and the platform reports only
   * "Healthcheck failure" — even though the process is alive and retrying.
   *
   * Binding to 0.0.0.0 (not 127.0.0.1) is required so the check from outside
   * the container can reach us. Railway injects PORT; we already honour it.
   */
  const server = app.listen(env.PORT, '0.0.0.0', () => {
    logger.info({ port: env.PORT, env: env.NODE_ENV }, 'API listening');
  });

  // A port conflict is the single most common local crash. Handle it cleanly
  // with an actionable message instead of an unhandled 'error' event dumping a
  // stack trace and killing nodemon.
  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      logger.error(
        { port: env.PORT },
        `Port ${env.PORT} is already in use. Another server is probably still ` +
          `running. Stop it (Windows: "npx kill-port ${env.PORT}") or set a ` +
          `different PORT in server/.env, then start again.`
      );
    } else {
      logger.error({ err: err.message, code: err.code }, 'HTTP server error');
    }
    process.exit(1);
  });

  await db.connect();

  // Before the scheduler runs, not after: a repair that resumes monitors the
  // scheduler would otherwise skip has to land before the first tick, or the
  // first minute of every boot is spent not checking things again.
  //
  // Never fatal, though. A data repair that cannot be applied is a reason to
  // shout, not a reason to refuse to monitor anything — the claim is released
  // on failure, so the next boot simply tries again.
  try {
    await runMigrations();
  } catch (err) {
    logger.error(
      { err: err.message },
      'Data repair failed — starting anyway. Run "npm run doctor" to see what is unhealthy'
    );
  }

  const scheduler = startScheduler();

  // Graceful shutdown: stop taking ticks, drain the server, close the DB.
  let closing = false;
  const shutdown = async (signal) => {
    if (closing) return;
    closing = true;
    logger.info({ signal }, 'Shutting down');
    // Let an in-flight batch of checks finish before the database goes away,
    // so an orderly exit does not look like a crash in the logs.
    await scheduler.drain();
    server.close();
    await db.disconnect();
    process.exit(0);
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  // Last-resort safety nets so a stray rejection/exception is logged clearly
  // rather than tearing the process down with a raw stack trace.
  process.on('unhandledRejection', (reason) => {
    logger.error({ reason: reason?.message || reason }, 'Unhandled promise rejection');
  });
  process.on('uncaughtException', (err) => {
    logger.error({ err: err.message, stack: err.stack }, 'Uncaught exception — exiting');
    shutdown('uncaughtException');
  });
}

main().catch((err) => {
  logger.error({ err: err.message, stack: err.stack }, 'Fatal boot error');
  process.exit(1);
});
