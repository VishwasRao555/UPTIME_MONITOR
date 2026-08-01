'use strict';

const Monitor = require('../models/Monitor');
const CheckResult = require('../models/CheckResult');
const Incident = require('../models/Incident');
const AppError = require('../utils/AppError');
const env = require('../config/env');
const { assertUrlIsSafe } = require('../utils/ssrfGuard');
const { uptimePercentage, rangeToMs } = require('../utils/uptimeCalculator');

/**
 * Fetch a monitor only if this user owns it.
 *
 * Every operation below goes through here, so ownership is enforced in one
 * place instead of eight — a new operation cannot forget it without visibly
 * bypassing this function.
 *
 * A monitor owned by someone else returns 404, not 403. A 403 would confirm
 * the id exists, which hands out a way to enumerate other people's monitors;
 * "not found" is both true from this user's perspective and silent.
 */
async function ownedMonitor(id, userId, { lean = false } = {}) {
  const query = Monitor.findOne({ _id: id, userId });
  const monitor = await (lean ? query.lean() : query);
  if (!monitor) throw new AppError('Monitor not found', 404);
  return monitor;
}

async function createMonitor(input, userId) {
  await assertUrlIsSafe(input.url, { enabled: env.SSRF_GUARD });
  // userId comes from the verified session, never from the request body —
  // otherwise a caller could create monitors in someone else's account.
  return Monitor.create({ ...input, userId });
}

/**
 * List monitors, each enriched for the dashboard card:
 *  - uptime24h        — percentage over the last 24h
 *  - lastResponseMs   — latency of the most recent check
 *  - recent           — last 20 checks (oldest→newest) as { isUp } for the strip
 */
async function listMonitors(userId) {
  const monitors = await Monitor.find({ userId }).sort({ createdAt: -1 }).lean();
  const since = new Date(Date.now() - rangeToMs('24h'));

  return Promise.all(
    monitors.map(async (m) => {
      const [dayResults, recentDesc] = await Promise.all([
        CheckResult.find({ monitorId: m._id, checkedAt: { $gte: since } })
          .select('isUp')
          .lean(),
        CheckResult.find({ monitorId: m._id })
          .sort({ checkedAt: -1 })
          .limit(20)
          .select('isUp responseTimeMs checkedAt')
          .lean(),
      ]);
      const recent = recentDesc.slice().reverse();
      return {
        ...m,
        uptime24h: uptimePercentage(dayResults),
        lastResponseMs: recentDesc[0]?.responseTimeMs ?? null,
        recent: recent.map((r) => ({ isUp: r.isUp })),
      };
    })
  );
}

/** Fleet-wide summary for the dashboard stats bar. Computed from the same
 * enriched list so it never disagrees with the cards. */
async function getOverview(userId) {
  const monitors = await listMonitors(userId);
  const upValues = [];
  const responseTimes = [];
  let up = 0;
  let down = 0;
  let paused = 0;

  for (const m of monitors) {
    if (!m.isActive) paused += 1;
    else if (m.currentStatus === 'UP') up += 1;
    else if (m.currentStatus === 'DOWN') down += 1;
    if (m.uptime24h != null) upValues.push(m.uptime24h);
    if (m.lastResponseMs != null) responseTimes.push(m.lastResponseMs);
  }

  const avg = (arr) =>
    arr.length ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : null;

  return {
    total: monitors.length,
    up,
    down,
    paused,
    pending: monitors.length - up - down - paused,
    avgResponseMs: avg(responseTimes),
    overallUptime24h: upValues.length
      ? Math.round((upValues.reduce((a, b) => a + b, 0) / upValues.length) * 100) / 100
      : null,
  };
}

/** Run an immediate check for one monitor, outside the scheduler cadence.
 * Reuses the exact same per-monitor pipeline (probe → persist → state machine
 * → incidents/alerts) so an on-demand check behaves identically to a scheduled
 * one. Returns the freshly-updated monitor. */
async function checkNow(id, userId) {
  const monitor = await ownedMonitor(id, userId);
  // Required here (not at top) to avoid a require cycle: the scheduler imports
  // model/services, this service is imported by controllers.
  const { checkOne } = require('../scheduler/checkRunner');
  await checkOne(monitor);
  return Monitor.findById(id).lean();
}

async function getMonitor(id, userId) {
  return ownedMonitor(id, userId, { lean: true });
}

async function updateMonitor(id, patch, userId) {
  if (patch.url) await assertUrlIsSafe(patch.url, { enabled: env.SSRF_GUARD });

  // Resuming is a fresh start: clear the failure streak so a monitor that was
  // paused mid-outage needs the full threshold again rather than falling over
  // on its next bad check.
  //
  // currentStatus must be reset too, and that is not cosmetic. The state
  // machine only reports a DOWN transition when the status is *not already*
  // DOWN, so a monitor resumed while still broken would rebuild its failure
  // streak forever without ever tripping again — no incident and no alert,
  // just silent probing. PENDING is also the honest answer here: until the
  // next probe lands we genuinely do not know the state.
  if (patch.isActive === true) {
    patch = { ...patch, consecutiveFailures: 0, currentStatus: 'PENDING' };
  }

  // Scoped by userId in the filter, so a patch can never reach another
  // account's monitor even with a valid id.
  const monitor = await Monitor.findOneAndUpdate({ _id: id, userId }, patch, {
    new: true,
    runValidators: true,
  });
  if (!monitor) throw new AppError('Monitor not found', 404);
  return monitor;
}

async function deleteMonitor(id, userId) {
  const monitor = await Monitor.findOneAndDelete({ _id: id, userId });
  if (!monitor) throw new AppError('Monitor not found', 404);
  // Clean up dependent data so a deleted monitor leaves nothing behind.
  await Promise.all([
    CheckResult.deleteMany({ monitorId: id }),
    Incident.deleteMany({ monitorId: id }),
  ]);
  return monitor;
}

/** Latency time-series for the detail chart, oldest-first for plotting. */
async function getResults(id, range = '24h', userId) {
  await ownedMonitor(id, userId, { lean: true }); // 404s for unknown or unowned ids
  const since = new Date(Date.now() - rangeToMs(range));
  const results = await CheckResult.find({ monitorId: id, checkedAt: { $gte: since } })
    .sort({ checkedAt: 1 })
    .lean();
  return { range, uptime: uptimePercentage(results), results };
}

/** Incidents for one monitor, gated by ownership the same way. */
async function getIncidents(id, userId) {
  await ownedMonitor(id, userId, { lean: true });
  const { listIncidents } = require('./incident.service');
  return listIncidents(id);
}

module.exports = {
  createMonitor,
  listMonitors,
  getOverview,
  checkNow,
  getMonitor,
  updateMonitor,
  deleteMonitor,
  getResults,
  getIncidents,
};
