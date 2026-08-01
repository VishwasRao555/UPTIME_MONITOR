'use strict';

const Incident = require('../models/Incident');
const logger = require('../config/logger');

/** Open an incident when a monitor trips DOWN. Guards against duplicates so a
 * process restart mid-outage cannot create a second open incident. */
async function openIncident(monitorId, cause) {
  const existing = await Incident.findOne({ monitorId, resolvedAt: null });
  if (existing) return existing;
  return Incident.create({ monitorId, startedAt: new Date(), cause });
}

/** Close the open incident on recovery, stamping duration. No-op if none is
 * open (again, restart-safe / idempotent). */
async function closeIncident(monitorId) {
  const open = await Incident.findOne({ monitorId, resolvedAt: null });
  if (!open) return null;
  const resolvedAt = new Date();
  open.resolvedAt = resolvedAt;
  open.durationSeconds = Math.round((resolvedAt - open.startedAt) / 1000);
  await open.save();
  return open;
}

/**
 * Append delivery receipts for one alert to an incident.
 *
 * `settled` is the Promise.allSettled array the fanout returns, positionally
 * aligned with `channels`. Never throws: a bookkeeping failure must not take
 * down the check that produced the alert, so the worst case is a missing
 * receipt rather than a missing check.
 */
async function recordDelivery(incidentId, channels, settled, recipient) {
  if (!incidentId || !Array.isArray(settled)) return;

  const receipts = settled.map((outcome, i) => ({
    channel: channels[i]?.name ?? 'unknown',
    recipient: recipient ?? null,
    ok: outcome.status === 'fulfilled',
    error: outcome.status === 'rejected' ? outcome.reason?.message ?? 'unknown error' : null,
    at: new Date(),
  }));

  try {
    await Incident.updateOne({ _id: incidentId }, { $push: { notifications: { $each: receipts } } });
  } catch (err) {
    logger.error({ err: err.message, incidentId: String(incidentId) }, 'Could not record alert delivery');
  }
}

function listIncidents(monitorId, limit = 50) {
  return Incident.find({ monitorId }).sort({ startedAt: -1 }).limit(limit).lean();
}

module.exports = { openIncident, closeIncident, listIncidents, recordDelivery };
