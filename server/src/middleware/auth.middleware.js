'use strict';

const asyncHandler = require('../utils/asyncHandler');
const auth = require('../services/auth.service');
const { readAuthCookie } = require('../utils/authCookie');

/**
 * Gate for every route that touches user-owned data. Resolves the cookie to a
 * user and puts it on `req.user`, or fails the request with a 401.
 *
 * Downstream handlers can therefore treat `req.user` as guaranteed — there is
 * no "if authenticated" branch anywhere in a controller, because an
 * unauthenticated request never reaches one.
 */
const requireAuth = asyncHandler(async (req, _res, next) => {
  req.user = await auth.userFromToken(readAuthCookie(req));
  next();
});

module.exports = { requireAuth };
