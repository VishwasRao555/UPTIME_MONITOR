'use strict';

const mongoose = require('mongoose');

/**
 * What happened when we tried to tell someone about this incident, per channel.
 *
 * Stored rather than only logged because "I never got the email" is otherwise
 * unanswerable: the alert is a single fire-and-forget moment inside a scheduler
 * tick, and once the process output scrolls away there is nothing left to
 * inspect. Recording it against the incident makes the question a query.
 */
const deliverySchema = new mongoose.Schema(
  {
    channel: { type: String, required: true },
    /** Where it was aimed. Null for channels that have no per-user address. */
    recipient: { type: String, default: null },
    ok: { type: Boolean, required: true },
    error: { type: String, default: null },
    at: { type: Date, default: Date.now },
  },
  { _id: false }
);

const incidentSchema = new mongoose.Schema({
  monitorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Monitor',
    required: true,
    index: true,
  },
  startedAt: { type: Date, required: true, default: Date.now },
  resolvedAt: { type: Date, default: null },
  durationSeconds: { type: Number, default: null },
  cause: { type: String, default: null },

  /** Delivery receipts for the DOWN alert and, later, the RECOVERY alert. */
  notifications: { type: [deliverySchema], default: [] },
});

module.exports = mongoose.model('Incident', incidentSchema);
