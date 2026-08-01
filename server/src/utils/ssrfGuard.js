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

function isPrivateIPv6(ip) {
  const lower = ip.toLowerCase();
  if (lower === '::1' || lower === '::') return true; // loopback / unspecified
  if (lower.startsWith('fe80')) return true; // link-local
  if (lower.startsWith('fc') || lower.startsWith('fd')) return true; // unique-local
  if (lower.startsWith('::ffff:')) {
    // IPv4-mapped — classify the embedded v4 address.
    const v4 = lower.split(':').pop();
    if (net.isIPv4(v4)) return isPrivateIPv4(v4);
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

  const host = parsed.hostname;

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

module.exports = { assertUrlIsSafe, isPrivateAddress };
