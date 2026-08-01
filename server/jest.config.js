'use strict';

module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/tests/**/*.test.js'],

  /**
   * Jest's 5s default is too tight for this suite and fails it for the wrong
   * reason. Registration hashes at bcrypt cost 12 (~400ms each) against an
   * in-memory MongoDB that has to boot first, so ordinary cases already sit
   * near a second — and one cold start or a passing virus scan pushes them
   * over. A timeout that trips on machine load rather than on a hang teaches
   * people to re-run red suites, which is how a real failure gets ignored.
   */
  testTimeout: 30000,
};
