'use strict';

const mongoose = require('mongoose');
const env = require('../config/env');

const checkResultSchema = new mongoose.Schema({
  monitorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Monitor',
    required: true,
  },
  statusCode: { type: Number, default: null },
  responseTimeMs: { type: Number, default: null },
  isUp: { type: Boolean, required: true },
  errorMessage: { type: String, default: null },
  checkedAt: { type: Date, default: Date.now },
});

// Dashboard queries always filter by monitor and sort newest-first; without
// this compound index they degrade to a collection scan within days.
checkResultSchema.index({ monitorId: 1, checkedAt: -1 });

// TTL index: auto-purge old results so a free-tier cluster never fills up.
checkResultSchema.index(
  { checkedAt: 1 },
  { expireAfterSeconds: env.RESULT_RETENTION_DAYS * 24 * 60 * 60 }
);

module.exports = mongoose.model('CheckResult', checkResultSchema);
