'use strict';

const dns = require('dns').promises;
const net = require('net');
const AppError = require('./AppError');

/**
 * SSRF guard. Small interface — `assertUrlIsSafe(url)` — hiding URL parsing,
 * scheme allow-listing, DNS resolution, and private-range classification.
 * A user-supplied URL that resolves to loopback, link-local, or private
 * space would turn this service into an attack proxy (e.g. hitting a cloud
 * metadata endpoint at 169.254.169.254), so those are rejected before any
 * probe is scheduled.
 */

function isPrivateIPv4(ip) {
  const [a, b] = ip.split('.').map(Number);
  if (a === 10) return true; // 10.0.0.0/8
  if (a === 127) return true; // loopback
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
  if (a === 192 && b === 168) return true; // 192.168.0.0/16
  if (a === 169 && b === 254) return true; // link-local / cloud metadata
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT 100.64.0.0/10
  if (a === 0) return true; // "this host"
  return false;
}

/**
 * IPv4-mapped IPv6 addresses have two spellings for the same 32 bits:
 * `::ffff:127.0.0.1` and `::ffff:7f00:1`. Node hands back either depending on
 * where the address came from — `dns.lookup` normalises a bracketed URL
 * authority to the dotted form, but a literal or an attacker-controlled AAAA
 * record can arrive in hex.
 *
 * Reading only the last colon-separated group caught the dotted spelling and
 * silently passed the hex one: `'::ffff:7f00:1'.split(':').pop()` is `'1'`,
 * which is not IPv4, so loopback was classified as public. Decoding both
 * spellings to the same four octets is what makes the two forms indistinguish-
 * able to the caller, which is the only safe answer for an allow/deny check.
 */
function mappedIPv4(lower) {
  const tail = lower.slice('::ffff:'.length);

  // Dotted form: ::ffff:127.0.0.1
  if (net.isIPv4(tail)) return tail;

  // Hex form: ::ffff:7f00:1 — two groups of up to 16 bits, the second of which
  // may be abbreviated ("1" means 0x0001).
  const groups = tail.split(':');
  if (groups.length !== 2) return null;
  if (!groups.every((g) => /^[0-9a-f]{1,4}$/.test(g))) return null;

  const [high, low] = groups.map((g) => parseInt(g, 16));
  return [high >> 8, high & 0xff, low >> 8, low & 0xff].join('.');
}

function isPrivateIPv6(ip) {
  const lower = ip.toLowerCase();
  if (lower === '::1' || lower === '::') return true; // loopback / unspecified
  if (lower.startsWith('fe80')) return true; // link-local
  if (lower.startsWith('fc') || lower.startsWith('fd')) return true; // unique-local
  if (lower.startsWith('::ffff:')) {
    // IPv4-mapped — classify the embedded v4 address.
    const v4 = mappedIPv4(lower);
    // An unparseable mapped address is treated as private: this is an
    // allow/deny check, and "I could not read it" must never mean "allow".
    if (!v4) return true;
    return isPrivateIPv4(v4);
  }
  return false;
}

function isPrivateAddress(ip) {
  return net.isIPv6(ip) ? isPrivateIPv6(ip) : isPrivateIPv4(ip);
}

async function assertUrlIsSafe(rawUrl, { enabled = true } = {}) {
  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new AppError('Invalid URL', 400);
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new AppError('Only http and https URLs are allowed', 400);
  }

  if (!enabled) return;

  // An IPv6 authority keeps its brackets in `hostname` ("[::1]"), which no IP
  // parser accepts. Without stripping them every IPv6 literal missed the fast
  // path below and reached the DNS branch instead — where it happened to be
  // caught only because dns.lookup echoes the address back. Relying on that is
  // relying on a lookup we never needed to perform.
  const host = parsed.hostname.replace(/^\[|\]$/g, '');

  // A literal IP never needs DNS.
  if (net.isIP(host)) {
    if (isPrivateAddress(host)) {
      throw new AppError('URL resolves to a blocked private address', 400);
    }
    return;
  }

  let records;
  try {
    records = await dns.lookup(host, { all: true });
  } catch {
    throw new AppError(`Cannot resolve host: ${host}`, 400);
  }

  for (const { address } of records) {
    if (isPrivateAddress(address)) {
      throw new AppError('URL resolves to a blocked private address', 400);
    }
  }
}

/**
 * Statuses that carry the request to a new URL, and what method to use there.
 * 303 is defined to become GET; 301/302 do the same for anything that was a
 * POST, which is what every browser and HTTP client does in practice.
 */
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

function methodAfterRedirect(status, method) {
  if (status === 303) return 'GET';
  if ((status === 301 || status === 302) && method === 'POST') return 'GET';
  return method;
}

/**
 * fetch, with the private-address policy enforced on **every hop**.
 *
 * Checking a URL when the monitor is saved answers a question that expires the
 * moment it is answered. Two things happen after it:
 *
 *   1. DNS can be repointed. The host that resolved to a public address at
 *      create time resolves to 169.254.169.254 an hour later, and nothing
 *      re-asks — the probe just follows it, every minute, forever.
 *   2. The response can redirect. `redirect: 'follow'` hands the runtime a
 *      blank cheque: one 302 from a host the user does control is enough to
 *      aim this server at anything inside the private network it runs in.
 *
 * Both turn the monitor into a proxy for reaching addresses its owner cannot,
 * and the status code and timing that come back are enough to enumerate what
 * is listening. So the check lives here, next to the request it governs,
 * rather than at the boundary where the URL was first accepted. Callers cannot
 * forget it, because there is no other way to make the request.
 *
 * `assertSafe` is injectable purely so tests can isolate the redirect hop from
 * address classification; production always uses the real guard.
 */
async function safeFetch(
  rawUrl,
  { enabled = true, assertSafe = assertUrlIsSafe, maxRedirects = 5, method = 'GET', ...init } = {}
) {
  let url = rawUrl;
  let currentMethod = method;

  for (let hop = 0; hop <= maxRedirects; hop += 1) {
    await assertSafe(url, { enabled });

    // 'manual' is what makes the loop ours: with 'follow', the runtime chases
    // the chain internally and the next hop is never offered for inspection.
    const response = await fetch(url, { ...init, method: currentMethod, redirect: 'manual' });

    const location = response.headers.get('location');
    if (!REDIRECT_STATUSES.has(response.status) || !location) return response;

    // Discard the redirect's body before moving on. An un-consumed body keeps
    // its connection out of the pool, and this runs on a scheduler that probes
    // forever — a leak measured per-check becomes a leak measured per-day.
    // Only redirect responses are cancelled; the final one is the caller's.
    await response.body?.cancel().catch(() => {});

    // Relative Locations are legal and common, so resolve against the hop we
    // are on rather than assuming an absolute URL.
    url = new URL(location, url).toString();
    currentMethod = methodAfterRedirect(response.status, currentMethod);
  }

  throw new Error(`Too many redirects (more than ${maxRedirects})`);
}

module.exports = { assertUrlIsSafe, isPrivateAddress, safeFetch };
