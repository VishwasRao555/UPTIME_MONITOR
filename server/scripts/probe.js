'use strict';

/**
 * Phase-1 concept check: probe one or more URLs from the command line and
 * print status + latency. No DB, no server. Validates the core idea in
 * isolation.
 *
 *   node scripts/probe.js https://example.com https://httpstat.us/500
 */

const { probe } = require('../src/services/checker.service');

async function main() {
  const urls = process.argv.slice(2);
  if (urls.length === 0) {
    console.log('Usage: node scripts/probe.js <url> [url...]');
    process.exit(1);
  }

  for (const url of urls) {
    const r = await probe({ url, timeoutMs: 10000, expectedStatus: 200 });
    const badge = r.isUp ? 'UP  ' : 'DOWN';
    const ms = r.responseTimeMs != null ? `${r.responseTimeMs}ms` : '-';
    const extra = r.isUp ? `status ${r.statusCode}` : r.errorMessage;
    console.log(`${badge}  ${url}  ${ms.padStart(7)}  ${extra}`);
  }
}

main();
