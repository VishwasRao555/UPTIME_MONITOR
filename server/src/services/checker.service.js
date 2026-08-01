'use strict';

const env = require('../config/env');
const { safeFetch } = require('../utils/ssrfGuard');

/**
 * The HTTP probe. `probe(monitor)` performs one request and returns a plain
 * result object — it never touches the database, the state machine, or the
 * notifier. That keeps it a pure-ish function of (monitor, network) and makes
 * it trivial to exercise against a mock server.
 *
 * A monitor is "up" when the request completes within its timeout AND the
 * response status matches expectedStatus. Everything else — DNS failure,
 * timeout, connection refused, wrong status, or a destination the SSRF guard
 * refuses — is a down result carrying an errorMessage.
 *
 * A blocked address is deliberately a *result*, not an exception: the caller
 * records it like any other failed check, so a monitor whose host was repointed
 * at private space shows up as DOWN with the reason on the dashboard, instead
 * of throwing inside the scheduler where it would be logged once and never
 * reach the user.
 */

async function probe(monitor, { assertSafe } = {}) {
  const { url, method = 'GET', timeoutMs = 10000, expectedStatus = 200 } = monitor;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const startedAt = Date.now();

  try {
    const response = await safeFetch(url, {
      method,
      // Re-checked here, not just when the monitor was saved — DNS can be
      // repointed and responses can redirect. See safeFetch.
      enabled: env.SSRF_GUARD,
      ...(assertSafe ? { assertSafe } : {}),
      signal: controller.signal,
      // A realistic UA avoids being bounced by naive bot filters.
      headers: { 'User-Agent': 'UptimeMonitor/0.1 (+prototype)' },
    });

    const responseTimeMs = Date.now() - startedAt;
    const statusMatches = response.status === expectedStatus;

    // An uptime check cares about the status line, never the payload. Reading
    // it would mean downloading whole pages every interval; leaving it dangling
    // pins the connection instead. Cancelling is the third option, and the only
    // one that costs nothing in a process that repeats this forever.
    await response.body?.cancel().catch(() => {});

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
