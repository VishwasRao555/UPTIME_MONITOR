'use strict';

/**
 * Explains, per monitor, why it is not being checked and why no email arrived.
 *
 *   npm run doctor                 # report only, changes nothing
 *   npm run doctor -- --resume-all # un-pause every paused monitor
 *   npm run doctor -- --smtp       # also prove the mail credentials (sends nothing)
 *
 * Written because the failure it diagnoses is silent by nature: a monitor the
 * scheduler is skipping produces no error, no log and no visible difference
 * from a healthy one — its status simply never changes. Guessing at that from
 * the outside is what turns a one-line problem into an afternoon.
 */

const mongoose = require('mongoose');
const env = require('../src/config/env');
const User = require('../src/models/User');
const Monitor = require('../src/models/Monitor');
const Incident = require('../src/models/Incident');
const CheckResult = require('../src/models/CheckResult');

const resumeAll = process.argv.includes('--resume-all');
const checkSmtp = process.argv.includes('--smtp');

const ago = (date) => {
  if (!date) return 'never';
  const s = Math.round((Date.now() - new Date(date).getTime()) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  return `${Math.round(s / 3600)}h ago`;
};

function heading(text) {
  console.log(`\n${text}\n${'-'.repeat(text.length)}`);
}

async function reportConfig() {
  heading('Configuration');
  console.log(`  database         ${env.MONGO_URI ? env.MONGO_URI.replace(/\/\/[^@]*@/, '//') : 'in-memory (data is wiped on restart)'}`);
  console.log(`  tick             every ${env.CHECK_TICK_SECONDS}s`);
  console.log(`  failures to trip ${env.FAILURE_THRESHOLD}`);
  console.log(`  alert channels   ${env.NOTIFIER_CHANNELS.join(', ')}`);

  if (!env.NOTIFIER_CHANNELS.some((c) => c === 'gmail' || c === 'email')) {
    console.log('\n  ! No email channel is enabled — only console logging.');
    console.log("    Add 'gmail' to NOTIFIER_CHANNELS in server/.env.");
  }
  if (!env.MONGO_URI) {
    console.log('\n  ! MONGO_URI is unset, so the database is in-memory: every monitor');
    console.log('    and account you create disappears when the server restarts.');
  }
}

/**
 * The whole point of the script: name the reason, per monitor.
 *
 * Faults and warnings are kept apart because they mean different things to the
 * person reading. A fault is "this monitor is not working". A warning is "this
 * is working exactly as configured, and the configuration may surprise you" —
 * counting the second as broken would cry wolf on a perfectly healthy fleet.
 */
function diagnose(m, owner) {
  const faults = [];
  const warnings = [];

  if (!m.isActive) {
    faults.push(
      'PAUSED — the scheduler only selects {isActive:true}, so this monitor is ' +
        'never probed automatically. "Check now" bypasses that filter, which is ' +
        'why the button works while nothing happens on its own. Fix: press ' +
        'Resume, or re-run with --resume-all.'
    );
  }

  if (m.isActive && m.lastCheckedAt) {
    const overdueBy = Date.now() - new Date(m.lastCheckedAt).getTime() - m.intervalSeconds * 1000;
    if (overdueBy > Math.max(60000, m.intervalSeconds * 1000)) {
      faults.push(
        `OVERDUE by ${Math.round(overdueBy / 1000)}s — it is active but has not been ` +
          'checked on schedule. The server is probably not running (or died).'
      );
    }
  }

  if (m.isActive && !m.lastCheckedAt) {
    warnings.push('NEVER CHECKED YET — no probe has completed. Normal for a new monitor.');
  }

  if (!owner) {
    faults.push('NO OWNER — no account matches userId, so no email can be addressed.');
  } else if (owner.emailAlerts === false) {
    faults.push(`EMAIL ALERTS OFF for ${owner.email} — alerts are suppressed for this account.`);
  }

  // Time-to-detect, the number people are actually surprised by.
  if (m.isActive) {
    const seconds = m.intervalSeconds * env.FAILURE_THRESHOLD;
    if (seconds > 300) {
      warnings.push(
        `SLOW TO TRIP — interval ${m.intervalSeconds}s x ${env.FAILURE_THRESHOLD} failures ` +
          `means an outage takes ~${Math.round(seconds / 60)} minutes to show as DOWN.`
      );
    }
  }

  return { faults, warnings };
}

async function reportMonitors() {
  heading('Monitors');
  const monitors = await Monitor.find({}).sort({ createdAt: 1 }).lean();

  if (monitors.length === 0) {
    console.log('  No monitors exist. Add one in the dashboard.');
    return { monitors, healthy: 0 };
  }

  const users = await User.find({}).select('email emailAlerts').lean();
  const byId = new Map(users.map((u) => [String(u._id), u]));
  let healthy = 0;

  for (const m of monitors) {
    const owner = byId.get(String(m.userId));
    const [checks, openIncident] = await Promise.all([
      CheckResult.countDocuments({ monitorId: m._id }),
      Incident.findOne({ monitorId: m._id, resolvedAt: null }).lean(),
    ]);

    console.log(`\n  ${m.name}  (${m.url})`);
    console.log(
      `    status ${m.currentStatus}   ${m.isActive ? 'active' : 'PAUSED'}   ` +
        `every ${m.intervalSeconds}s   failures ${m.consecutiveFailures}`
    );
    console.log(
      `    owner ${owner ? owner.email : '(none)'}   last checked ${ago(m.lastCheckedAt)}   ` +
        `${checks} checks recorded`
    );
    if (openIncident) console.log(`    open incident since ${ago(openIncident.startedAt)}`);

    const { faults, warnings } = diagnose(m, owner);
    if (faults.length === 0) {
      healthy += 1;
      console.log('    OK — this monitor is being checked on schedule.');
    }
    for (const f of faults) console.log(`    ! ${f}`);
    for (const w of warnings) console.log(`    - ${w}`);
  }

  return { monitors, healthy };
}

/**
 * Every alert the system ever tried to send, and what the provider said.
 * "No email arrived" and "no email was ever attempted" are different problems
 * with different fixes, and this is the only place that distinguishes them.
 */
async function reportDeliveries() {
  heading('Alert delivery history');
  const incidents = await Incident.find({}).sort({ startedAt: -1 }).limit(10).lean();

  if (incidents.length === 0) {
    console.log('  No incidents have ever been opened, so no alert has ever been sent.');
    console.log('  An alert only fires on a *transition* into DOWN. A monitor that was');
    console.log('  already DOWN, or that is never checked, produces no transition and');
    console.log('  therefore no email.');
    return;
  }

  for (const incident of incidents) {
    const receipts = incident.notifications || [];
    console.log(`\n  incident ${ago(incident.startedAt)} — ${incident.cause || 'no cause recorded'}`);
    if (receipts.length === 0) {
      console.log('    no delivery attempt recorded');
      continue;
    }
    for (const r of receipts) {
      console.log(
        `    ${r.ok ? 'ok    ' : 'FAILED'} ${r.channel} -> ${r.recipient || '(no recipient)'}` +
          `${r.error ? `  ${r.error}` : ''}`
      );
    }
  }
}

async function verifySmtp() {
  heading('SMTP credentials');
  const notifier = require('../src/notifiers');
  const mail = notifier.channels.find((c) => typeof c.verify === 'function');
  if (!mail) return console.log('  No verifiable email channel is configured.');

  try {
    await mail.verify();
    console.log(`  ok — ${mail.name} credentials accepted (no mail was sent).`);
  } catch (err) {
    console.log(`  FAILED — ${mail.name}: ${err.message}`);
    console.log('  For gmail this is almost always an App Password problem:');
    console.log('  it must be a 16-character App Password, not the account password.');
  }
}

async function main() {
  if (!env.MONGO_URI) {
    console.log('MONGO_URI is not set — there is no persistent database to inspect.');
    console.log('Put your MongoDB Atlas connection string in server/.env:');
    console.log('  MONGO_URI=mongodb+srv://<user>:<password>@<cluster>.mongodb.net/uptime');
    process.exit(1);
  }

  await mongoose.connect(env.MONGO_URI, { serverSelectionTimeoutMS: 5000 });

  await reportConfig();
  const { monitors, healthy } = await reportMonitors();
  await reportDeliveries();
  if (checkSmtp) await verifySmtp();

  const paused = monitors.filter((m) => !m.isActive);
  let repaired = 0;

  if (resumeAll && paused.length > 0) {
    heading('Repair');
    // Same reset the Resume button performs: a monitor brought back still
    // holding a stale DOWN would never trip again, so it would never alert.
    await Monitor.updateMany(
      { isActive: false },
      { isActive: true, currentStatus: 'PENDING', consecutiveFailures: 0 }
    );
    for (const m of paused) console.log(`  resumed ${m.name}`);
    repaired = paused.length;
    console.log(`\n  ${repaired} monitor(s) resumed. Restart the server if it is running.`);
  } else if (paused.length > 0) {
    heading('Repair available');
    console.log(`  ${paused.length} paused monitor(s) are being skipped by the scheduler.`);
    console.log('  Re-run with --resume-all to un-pause them.');
  }

  heading('Summary');
  // Counted after the repair, not before — a summary that still reports the
  // problem it just fixed is worse than no summary at all.
  console.log(`  ${healthy + repaired}/${monitors.length} monitor(s) are healthy and on schedule.`);

  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error(`\ndoctor failed: ${err.message}`);
  if (/ENOTFOUND|ETIMEDOUT|querySrv|Server selection timed out/i.test(err.message)) {
    console.error('Could not reach Atlas. Check that your IP is allowed under');
    console.error('Atlas → Network Access, and that the cluster is not paused.');
  } else if (/bad auth|Authentication failed/i.test(err.message)) {
    console.error('Atlas rejected the credentials in MONGO_URI — check the database');
    console.error('user under Atlas → Database Access (not your Atlas login).');
  }
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
