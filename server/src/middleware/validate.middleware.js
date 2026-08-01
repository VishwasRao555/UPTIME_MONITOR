'use strict';

const AppError = require('../utils/AppError');

/** Validates req.body against a Zod schema, replacing it with the parsed
 * (coerced, defaulted) value. Rejects with a 400 listing every issue. */
module.exports = (schema) => (req, _res, next) => {
  const result = schema.safeParse(req.body);
  if (!result.success) {
    const message = result.error.issues
      .map((i) => `${i.path.join('.') || 'body'}: ${i.message}`)
      .join('; ');
    return next(new AppError(message, 400));
  }
  req.body = result.data;
  return next();
};
