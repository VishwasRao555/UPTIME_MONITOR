'use strict';

const mongoose = require('mongoose');

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 100 },

    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },

    /**
     * The bcrypt digest — never the password. `select: false` keeps it out of
     * every query result by default, so it cannot reach a JSON response by
     * accident. The one place that needs it asks for it explicitly.
     */
    passwordHash: { type: String, required: true, select: false },

    /**
     * Bumped to invalidate every token already issued to this user. A JWT
     * carries the version it was signed with; if it no longer matches, the
     * token is refused. This is what makes a 30-day token revocable on logout
     * or a password change without any server-side session store.
     */
    tokenVersion: { type: Number, default: 0 },

    /** Whether outage emails go to this account's address. On by default —
     * someone signing up for an uptime monitor wants to be told. */
    emailAlerts: { type: Boolean, default: true },
  },
  { timestamps: true }
);

/** The only user shape that may leave the server. */
userSchema.methods.toPublic = function toPublic() {
  return {
    id: this._id.toString(),
    name: this.name,
    email: this.email,
    emailAlerts: this.emailAlerts,
    createdAt: this.createdAt,
  };
};

module.exports = mongoose.model('User', userSchema);
