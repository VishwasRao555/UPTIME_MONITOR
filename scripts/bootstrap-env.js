'use strict';

/**
 * Creates `server/.env` on a fresh clone.
 *
 * `.env` is gitignored, so a clone has none — and without it the server falls
 * back to a throwaway in-memory database and a JWT secret that changes every
 * boot. Both are silent, and both look like "my account keeps disappearing".
 * This writes a working one, with a real random secret so nobody has to
 * remember to generate it.
 *
 * Never overwrites an existing file: that would destroy a secret in use and
 * sign everyone out.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const target = path.join(__dirname, '..', 'server', '.env');

if (fs.existsSync(target)) {
  console.log('server/.env already exists — leaving it alone.');
  process.exit(0);
}

const secret = crypto.randomBytes(48).toString('hex');

const contents = `NODE_ENV=development
PORT=5000

# Persistent MongoDB from docker-compose.yml at the project root.
# Start it with:  npm run db:up
# Leave this unset and the server uses a throwaway in-memory database that is
# wiped on exit — your account will not survive a restart.
MONGO_URI=mongodb://sentinel:sentinel-local-dev@127.0.0.1:27017/uptime?authSource=admin

# Signs session cookies. Generated locally on first setup. Changing it signs
# everyone out. Required in production — the server refuses to boot without it.
JWT_SECRET=${secret}
JWT_EXPIRES_DAYS=30
TRUST_PROXY=false

# Scheduler
CHECK_TICK_SECONDS=30
FAILURE_THRESHOLD=3
REQUEST_TIMEOUT_MS=10000
RESULT_RETENTION_DAYS=30

# Alerts — 'console' needs no credentials. See README for telegram / email.
NOTIFIER_CHANNELS=console
NOTIFY_TIMEOUT_MS=10000

SSRF_GUARD=true
CORS_ORIGIN=http://localhost:5173,http://localhost:5174
LOG_LEVEL=info
`;

fs.writeFileSync(target, contents);
console.log('Created server/.env with a freshly generated JWT_SECRET.');
