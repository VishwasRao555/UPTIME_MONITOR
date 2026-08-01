'use strict';

/**
 * Fires a fake DOWN (and optionally RECOVERY) alert through the real, fully
 * configured notifier — same code path the scheduler uses, no database, no
 * waiting for something to actually break.
 *
 *   npm run notify:test              # one DOWN alert
 *   npm run notify:test -- --both    # DOWN, then RECOVERY
 *
 * Because it imports src/notifiers, a missing or malformed credential fails
 * here exactly the way it would at server boot.
 */

const notifier = require('../src/notifiers');
const env = require('../src/config/env');
const db = require('../src/config/db');
const User = require('../src/models/User');

const monitor = {
  name: 'Test Alert (notify-test)',
  url: 'https://example.com/health',
  method: 'GET',
  expectedStatus: 200,
};

async function fire(type, detail, recipient) {
  const settled = await notifier.send({ type, monitor, at: new Date(), detail, recipient });

  settled.forEach((outcome, i) => {
    const channel = notifier.channels[i].name;
    if (outcome.status === 'fulfilled') {
      console.log(`  ok      ${channel}${recipient ? ` → ${recipient}` : ''}`);
    } else {
      console.log(`  FAILED  ${channel} — ${outcome.reason?.message}`);
    }
  });

  return settled.every((o) => o.status === 'fulfilled');
}

async function main() {
  console.log(`Channels: ${env.NOTIFIER_CHANNELS.join(', ')}\n`);

  // Try to find a real user with email alerts enabled
  let recipient = null;
  try {
    await db.connect();
    const user = await User.findOne({ emailAlerts: true }).select('email').lean();
    if (user) {
      recipient = user.email;
      console.log(`Found user with email alerts enabled: ${recipient}\n`);
    } else {
      console.log('No users with email alerts enabled in database.');
      console.log('Using fallback recipient (sender email)\n');
    }
  } catch (err) {
    console.log('Could not connect to database, using fallback\n');
  }

  console.log(`Sending DOWN to: ${recipient || 'fallback (sender email)'}`);
  let ok = await fire('DOWN', 'Simulated failure — this is a test alert.', recipient);

  if (process.argv.includes('--both')) {
    console.log('\nSending RECOVERY...');
    ok = (await fire('RECOVERY', 'Back up after 2m 30s of downtime (142ms)', recipient)) && ok;
  }

  console.log(
    ok
      ? '\nAll channels delivered. Check your email and inbox.'
      : '\nSome channels failed — see the errors above.'
  );

  try {
    await db.disconnect();
  } catch (err) {
    // ignore
  }
  process.exit(ok ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
