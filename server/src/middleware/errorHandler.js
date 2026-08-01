'use strict';

const logger = require('../config/logger');

/** Central error handler — last in the middleware chain. Operational
 * AppErrors surface their message and status; anything else is logged and
 * returned as a generic 500 so internals never leak. */
// eslint-disable-next-line no-unused-vars
module.exports = (err, req, res, next) => {
  const statusCode = err.statusCode || 500;

  if (statusCode >= 500) {
    logger.error({ err: err.message, stack: err.stack, path: req.path }, 'Request failed');
  }

  res.status(statusCode).json({
    error: statusCode >= 500 && !err.isOperational ? 'Internal server error' : err.message,
  });
};
