'use strict';

/**
 * The HTTP probe. `probe(monitor)` performs one request and returns a plain
 * result object — it never touches the database, the state machine, or the
 * notifier. That keeps it a pure-ish function of (monitor, network) and makes
 * it trivial to exercise against a mock server.
 *
 * A monitor is "up" when the request completes within its timeout AND the
 * response status matches expectedStatus. Everything else — DNS failure,
 * timeout, connection refused, wrong status — is a down result carrying an
 * errorMessage.
 */

async function probe(monitor) {
  const { url, method = 'GET', timeoutMs = 10000, expectedStatus = 200 } = monitor;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const startedAt = Date.now();

  try {
    const response = await fetch(url, {
      method,
      redirect: 'follow',
      signal: controller.signal,
      // A realistic UA avoids being bounced by naive bot filters.
      headers: { 'User-Agent': 'UptimeMonitor/0.1 (+prototype)' },
    });

    const responseTimeMs = Date.now() - startedAt;
    const statusMatches = response.status === expectedStatus;

    return {
      isUp: statusMatches,
      statusCode: response.status,
      responseTimeMs,
      errorMessage: statusMatches
        ? null
        : `Expected status ${expectedStatus}, got ${response.status}`,
    };
  } catch (err) {
    const responseTimeMs = Date.now() - startedAt;
    const aborted = err.name === 'AbortError';
    return {
      isUp: false,
      statusCode: null,
      responseTimeMs,
      errorMessage: aborted ? `Timeout after ${timeoutMs}ms` : err.message,
    };
  } finally {
    clearTimeout(timer);
  }
}

module.exports = { probe };
