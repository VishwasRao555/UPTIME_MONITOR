'use strict';

/**
 * Assigns monitors that predate accounts to an existing user.
 *
 * Monitors created before auth landed have no `userId`, so every scoped query
 * skips them — they are invisible rather than lost. This hands them to one
 * account.
 *
 *   node scripts/claim-monitors.js you@example.com          # dry run
 *   node scripts/claim-monitors.js you@example.com --apply  # actually do it
 *
 * Only relevant if MONGO_URI points at a real database; the default in-memory
 * one starts empty every boot and has nothing to claim.
 */

const mongoose = require('mongoose');
const env = require('../src/config/env');
const User = require('../src/models/User');
const Monitor = require('../src/models/Monitor');

async function main() {
  const [email, flag] = process.argv.slice(2);
  const apply = flag === '--apply';

  if (!email) {
    console.error('Usage: node scripts/claim-monitors.js <email> [--apply]');
    process.exit(1);
  }
  if (!env.MONGO_URI) {
    console.error('MONGO_URI is not set — the in-memory database has nothing to claim.');
    process.exit(1);
  }

  await mongoose.connect(env.MONGO_URI);

  const user = await User.findOne({ email: email.trim().toLowerCase() });
  if (!user) {
    console.error(`No account found for ${email}. Sign up first, then re-run this.`);
    await mongoose.disconnect();
    process.exit(1);
  }

  // `userId: null` covers documents written before the field existed.
  const filter = { $or: [{ userId: { $exists: false } }, { userId: null }] };
  const orphans = await Monitor.find(filter).select('name url').lean();

  if (orphans.length === 0) {
    console.log('No unowned monitors found. Nothing to do.');
    await mongoose.disconnect();
    return;
  }

  console.log(`${orphans.length} unowned monitor(s) → ${user.email}:`);
  for (const m of orphans) console.log(`  ${m.name}  (${m.url})`);

  if (!apply) {
    console.log('\nDry run. Re-run with --apply to make the change.');
  } else {
    const { modifiedCount } = await Monitor.updateMany(filter, { userId: user._id });
    console.log(`\nClaimed ${modifiedCount} monitor(s).`);
  }

  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error(err.message);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
