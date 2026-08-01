'use strict';

const mongoose = require('mongoose');

const STATUS = ['UP', 'DOWN', 'PENDING'];

const monitorSchema = new mongoose.Schema(
  {
    /** Owner. Every read and write is scoped by this — see monitor.service. */
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },

    name: { type: String, required: true, trim: true, maxlength: 100 },
    url: { type: String, required: true, trim: true },
    method: {
      type: String,
      enum: ['GET', 'HEAD', 'POST'],
      default: 'GET',
      uppercase: true,
    },
    intervalSeconds: { type: Number, default: 60, min: 30 },
    expectedStatus: { type: Number, default: 200 },
    timeoutMs: { type: Number, default: 10000, min: 1000 },

    /**
     * Whether the scheduler probes this monitor. Only the user sets it: an
     * outage no longer stops monitoring, so `false` here always means "someone
     * pressed Pause" and never "this broke".
     */
    isActive: { type: Boolean, default: true },

    // Runtime state owned by the state machine.
    currentStatus: { type: String, enum: STATUS, default: 'PENDING' },
    consecutiveFailures: { type: Number, default: 0 },
    lastCheckedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

monitorSchema.statics.STATUS = STATUS;

module.exports = mongoose.model('Monitor', monitorSchema);
