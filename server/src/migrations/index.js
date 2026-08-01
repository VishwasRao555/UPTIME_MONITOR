'use strict';

const Migration = require('../models/Migration');
const Monitor = require('../models/Monitor');
const logger = require('../config/logger');

/**
 * One-time data repairs, applied at boot.
 *
 * Changing the code that *writes* a field does nothing for the documents an
 * older version already wrote. That gap is exactly how the "scheduler never
 * checks anything, but Check now works" report survived a fix to the scheduler:
 * the behaviour that stranded the data was removed, the stranded data stayed
 * stranded, and from the outside nothing had changed.
 */
const MIGRATIONS = [
  {
    key: 'heal-monitors-paused-by-outage',
    description: 'Resume monitors that an older build paused when they went DOWN',

    /**
     * An earlier version of `checkRunner` set `isActive:false` when a monitor
     * tripped DOWN, to get "one alert per outage" for free. That is no longer
     * done — the state machine's debounce already provides it — but the rows it
     * wrote are still sitting there with `isActive:false`.
     *
     * Such a monitor is invisible to the scheduler, which selects on
     * `{isActive:true}`, while `checkNow` calls `checkOne` directly and skips
     * that filter entirely. So the site is never probed on its own and the
     * "Check now" button appears to be the only thing that works. That is the
     * whole bug.
     *
     * `currentStatus:'DOWN'` is the discriminator. The old code only ever set
     * the two together, and a human pressing Pause leaves the status alone — so
     * this pair is the signature of the stranding and not of a deliberate
     * pause. Monitors paused by hand are left exactly as the user left them.
     *
     * The status reset is not cosmetic. The state machine only reports a DOWN
     * transition when the status is not *already* DOWN, so a monitor resumed
     * still holding a stale DOWN would probe forever without ever tripping
     * again — no incident, no alert, no email. PENDING is also simply honest:
     * until the next probe lands we do not know the state.
     */
    async run() {
      const filter = { isActive: false, currentStatus: 'DOWN' };
      const stranded = await Monitor.find(filter).select('name url').lean();
      if (stranded.length === 0) return 'nothing to repair';

      await Monitor.updateMany(filter, {
        isActive: true,
        currentStatus: 'PENDING',
        consecutiveFailures: 0,
      });

      for (const m of stranded) {
        logger.warn(
          { monitor: m.name, url: m.url },
          'Resumed a monitor that an older build had paused during an outage — ' +
            'the scheduler had been skipping it'
        );
      }
      return `resumed ${stranded.length} monitor(s)`;
    },
  },
];

/**
 * Applies every repair that has not run yet.
 *
 * The record is claimed *before* the work runs, so two processes starting
 * together cannot both apply the same repair — the unique index makes the
 * loser fail fast and skip. If the work then throws, the claim is released so
 * the next boot retries rather than silently marking it done.
 */
async function runMigrations() {
  for (const migration of MIGRATIONS) {
    try {
      await Migration.create({ key: migration.key });
    } catch (err) {
      if (err.code === 11000) continue; // already applied, or another process is on it
      throw err;
    }

    try {
      const note = await migration.run();
      await Migration.updateOne({ key: migration.key }, { note });
      logger.info({ migration: migration.key, note }, 'Data repair applied');
    } catch (err) {
      await Migration.deleteOne({ key: migration.key }).catch(() => {});
      throw err;
    }
  }
}

module.exports = { runMigrations, MIGRATIONS };
