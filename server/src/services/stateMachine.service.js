'use strict';

/**
 * The heart of the system, kept as a pure function: no Express, no Mongoose,
 * no clock, no I/O. Given the monitor's current state and one probe result,
 * it returns the next state and which transition (if any) the caller should
 * act on. Because it is pure, it is exhaustively testable against a truth
 * table of (currentStatus, isUp, consecutiveFailures) combinations.
 *
 * Debounce is the whole point: a monitor only flips to DOWN after N
 * consecutive failures, which is what separates a useful alert from spam.
 *
 * @returns {{
 *   nextStatus: 'UP'|'DOWN'|'PENDING',
 *   nextConsecutiveFailures: number,
 *   transition: null | 'DOWN' | 'RECOVERY'
 * }}
 */
function evaluate(state, result, threshold) {
  const { currentStatus, consecutiveFailures } = state;

  if (result.isUp) {
    // Any success clears the failure streak.
    const recovered = currentStatus === 'DOWN';
    return {
      nextStatus: 'UP',
      nextConsecutiveFailures: 0,
      transition: recovered ? 'RECOVERY' : null,
    };
  }

  // Failure path.
  const failures = consecutiveFailures + 1;
  const shouldTripDown = failures >= threshold && currentStatus !== 'DOWN';

  return {
    // If we don't trip DOWN, the status is unchanged (UP stays UP while the
    // failure streak builds; DOWN stays DOWN; PENDING stays PENDING).
    nextStatus: shouldTripDown ? 'DOWN' : currentStatus,
    nextConsecutiveFailures: failures,
    transition: shouldTripDown ? 'DOWN' : null,
  };
}

module.exports = { evaluate };
