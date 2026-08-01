'use strict';

/** Wraps an async controller so a rejected promise reaches Express's error
 * chain instead of hanging the request. */
module.exports = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);
