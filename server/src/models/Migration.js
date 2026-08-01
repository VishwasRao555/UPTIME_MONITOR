'use strict';

const mongoose = require('mongoose');

/**
 * A record that one data repair has already been applied.
 *
 * Schema changes are handled by Mongoose, but *data* left in a bad shape by an
 * older version of the code is not — it survives every deploy until something
 * goes back and fixes it. This collection is what makes such a repair run
 * exactly once instead of every boot, which matters when the repair is not
 * idempotent from the user's point of view (resuming a monitor they have since
 * deliberately paused would be a bug, not a fix).
 */
const migrationSchema = new mongoose.Schema({
  /** Stable identifier for the repair. Unique, so two server processes racing
   * at startup cannot both apply it. */
  key: { type: String, required: true, unique: true, index: true },
  appliedAt: { type: Date, default: Date.now },
  /** What it actually did, for the audit trail. */
  note: { type: String, default: null },
});

module.exports = mongoose.model('Migration', migrationSchema);
