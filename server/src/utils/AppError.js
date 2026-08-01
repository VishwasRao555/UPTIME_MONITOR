'use strict';

/** Error carrying an HTTP status code, thrown by services and shaped by the
 * central error handler. Anything without a statusCode is treated as a 500. */
class AppError extends Error {
  constructor(message, statusCode = 500) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }
}

module.exports = AppError;
