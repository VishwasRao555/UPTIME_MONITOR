'use strict';

/** Pure helper: given an array of check results, return the fraction that
 * were up, as a percentage rounded to two decimals. Empty input → null so
 * the UI can distinguish "no data" from "0% uptime". */
function uptimePercentage(results) {
  if (!results || results.length === 0) return null;
  const up = results.reduce((n, r) => n + (r.isUp ? 1 : 0), 0);
  return Math.round((up / results.length) * 10000) / 100;
}

/** Milliseconds for a named range window, e.g. '24h' | '7d' | '30d'. */
function rangeToMs(range) {
  const table = {
    '1h': 60 * 60 * 1000,
    '24h': 24 * 60 * 60 * 1000,
    '7d': 7 * 24 * 60 * 60 * 1000,
    '30d': 30 * 24 * 60 * 60 * 1000,
  };
  return table[range] || table['24h'];
}

module.exports = { uptimePercentage, rangeToMs };
