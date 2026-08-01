'use strict';

/**
 * The one HTTP call every remote channel needs: POST JSON, bounded by a
 * timeout, retried once when — and only when — retrying could plausibly help.
 *
 * The distinction matters. A 401 means the token is wrong; hammering it again
 * just doubles the log noise. A 502 or a dropped connection is exactly the kind
 * of blip that a second attempt fixes, and an alert is the last thing you want
 * to lose to one bad packet.
 */

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Carries whether another attempt is worth making. */
class DeliveryError extends Error {
  constructor(message, { retryable }) {
    super(message);
    this.name = 'DeliveryError';
    this.retryable = retryable;
  }
}

async function attempt(url, { headers, body, timeoutMs }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', accept: 'application/json', ...headers },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (response.ok) return response;

    // Providers explain refusals in the body; keep a slice for the log.
    const detail = await response.text().catch(() => '');
    throw new DeliveryError(`HTTP ${response.status} — ${detail.slice(0, 300)}`, {
      // 4xx is a bad token or a malformed payload: our bug, not a blip.
      // 429 is the exception — it explicitly means "try again later".
      retryable: response.status >= 500 || response.status === 429,
    });
  } catch (err) {
    if (err instanceof DeliveryError) throw err;
    // Timeout, DNS failure, connection reset — all worth one more shot.
    const timedOut = err.name === 'AbortError';
    throw new DeliveryError(timedOut ? `Timed out after ${timeoutMs}ms` : err.message, {
      retryable: true,
    });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * @param {string} url
 * @param {{ headers?: object, body: object, timeoutMs?: number,
 *           attempts?: number, retryDelayMs?: number }} options
 * @returns {Promise<Response>} resolves only on a 2xx
 */
async function postJson(url, options) {
  const { attempts = 2, retryDelayMs = 1000, timeoutMs = 10000, ...rest } = options;

  for (let n = 1; ; n += 1) {
    try {
      return await attempt(url, { ...rest, timeoutMs });
    } catch (err) {
      if (!err.retryable || n >= attempts) throw err;
      await sleep(retryDelayMs);
    }
  }
}

module.exports = { postJson, DeliveryError };
