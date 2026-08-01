'use strict';

// Must be set before config/env is first required. This suite is the one place
// that exercises the guard switched ON — everything else disables it so tests
// can point at localhost.
process.env.NODE_ENV = 'test';
process.env.SSRF_GUARD = 'true';
process.env.JWT_SECRET = 'test-secret-that-is-comfortably-long-enough-32';

const http = require('http');
const { probe } = require('../../src/services/checker.service');
const { assertUrlIsSafe, isPrivateAddress } = require('../../src/utils/ssrfGuard');

/**
 * A server that counts the requests it receives.
 *
 * The count is the assertion that matters. "The probe returned a down result"
 * is not enough to prove the guard worked — a blocked request and a request
 * that was made and then discarded look identical from the return value, and
 * only one of them is a security hole. Counting at the target is the only way
 * to tell "never contacted" from "contacted, then ignored".
 */
async function startServer(handler) {
  const server = http.createServer(handler);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  return {
    port,
    origin: `http://127.0.0.1:${port}`,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}

describe('address classification', () => {
  test.each([
    ['127.0.0.1', true],
    ['10.1.2.3', true],
    ['192.168.1.1', true],
    ['172.16.0.1', true],
    ['169.254.169.254', true], // cloud metadata — the reason this guard exists
    ['100.64.0.1', true],
    ['0.0.0.0', true],
    ['8.8.8.8', false],
    ['1.1.1.1', false],
    ['::1', true],
    ['fe80::1', true],
    ['fd00::1', true],
    ['2606:4700:4700::1111', false],
    // IPv4-mapped IPv6. The dotted form was handled; the hex form is the same
    // address written differently and must classify identically.
    ['::ffff:127.0.0.1', true],
    ['::ffff:7f00:1', true],
    ['::ffff:a9fe:a9fe', true], // 169.254.169.254 in hex
  ])('%s → private: %s', (ip, expected) => {
    expect(isPrivateAddress(ip)).toBe(expected);
  });
});

describe('assertUrlIsSafe', () => {
  const safe = (url) => assertUrlIsSafe(url, { enabled: true });

  test('rejects a loopback literal', async () => {
    await expect(safe('http://127.0.0.1/')).rejects.toThrow(/private address/);
  });

  test('rejects the cloud metadata endpoint', async () => {
    await expect(safe('http://169.254.169.254/latest/meta-data/')).rejects.toThrow(
      /private address/
    );
  });

  test('rejects non-http schemes', async () => {
    await expect(safe('file:///etc/passwd')).rejects.toThrow(/http and https/);
    await expect(safe('gopher://example.com/')).rejects.toThrow(/http and https/);
  });

  // Bracketed IPv6 authority. `new URL(...).hostname` keeps the brackets, so a
  // naive net.isIP() test misses it and the address falls through to a DNS
  // lookup it was never going to need.
  test('rejects a bracketed IPv6 loopback literal', async () => {
    await expect(safe('http://[::1]/')).rejects.toThrow(/private address/);
  });

  test('rejects a bracketed IPv4-mapped loopback literal', async () => {
    await expect(safe('http://[::ffff:127.0.0.1]/')).rejects.toThrow(/private address/);
  });
});

describe('probe enforces the guard at request time', () => {
  /**
   * Validating only at create/update is a check against a claim that expires
   * the moment it is made: DNS can be repointed at a private address any time
   * after the monitor is saved, and the probe would follow it forever after.
   */
  test('refuses to contact a private address even for a stored monitor', async () => {
    let hits = 0;
    const target = await startServer((_req, res) => {
      hits += 1;
      res.writeHead(200).end('ok');
    });

    try {
      const result = await probe({ url: target.origin, timeoutMs: 2000 });

      expect(hits).toBe(0);
      expect(result.isUp).toBe(false);
      expect(result.errorMessage).toMatch(/private address/i);
    } finally {
      await target.close();
    }
  });

  /**
   * The redirect hole. The first hop is public and passes any pre-flight check;
   * the redirect target is not. With `redirect: 'follow'` the runtime chases it
   * without asking anyone, which turns the monitor into a proxy for scanning
   * internal addresses.
   */
  test('does not follow a redirect into a private address', async () => {
    let internalHits = 0;
    const internal = await startServer((_req, res) => {
      internalHits += 1;
      res.writeHead(200).end('secret');
    });

    const publicSite = await startServer((_req, res) => {
      res.writeHead(302, { Location: `${internal.origin}/latest/meta-data/` }).end();
    });

    // Treat only the entry point as public, so this test isolates the redirect
    // hop rather than re-testing the classifier.
    const allowEntryPointOnly = async (url) => {
      if (new URL(url).port !== String(publicSite.port)) {
        throw Object.assign(new Error('URL resolves to a blocked private address'), {
          statusCode: 400,
        });
      }
    };

    try {
      const result = await probe(
        { url: publicSite.origin, timeoutMs: 2000 },
        { assertSafe: allowEntryPointOnly }
      );

      expect(internalHits).toBe(0);
      expect(result.isUp).toBe(false);
      expect(result.errorMessage).toMatch(/private address/i);
    } finally {
      await Promise.all([publicSite.close(), internal.close()]);
    }
  });

  test('still reports a normal response from an allowed host', async () => {
    const site = await startServer((_req, res) => res.writeHead(200).end('ok'));
    try {
      const result = await probe(
        { url: site.origin, timeoutMs: 2000 },
        { assertSafe: async () => {} }
      );
      expect(result.isUp).toBe(true);
      expect(result.statusCode).toBe(200);
    } finally {
      await site.close();
    }
  });

  test('follows an allowed redirect and reports the final status', async () => {
    const final = await startServer((_req, res) => res.writeHead(200).end('done'));
    const entry = await startServer((_req, res) =>
      res.writeHead(302, { Location: `${final.origin}/` }).end()
    );
    try {
      const result = await probe(
        { url: entry.origin, timeoutMs: 2000 },
        { assertSafe: async () => {} }
      );
      expect(result.isUp).toBe(true);
      expect(result.statusCode).toBe(200);
    } finally {
      await Promise.all([entry.close(), final.close()]);
    }
  });

  test('gives up on a redirect loop instead of hanging', async () => {
    let hits = 0;
    const looper = await startServer((req, res) => {
      hits += 1;
      res.writeHead(302, { Location: `/again${hits}` }).end();
    });
    try {
      const result = await probe(
        { url: looper.origin, timeoutMs: 5000 },
        { assertSafe: async () => {} }
      );
      expect(result.isUp).toBe(false);
      expect(result.errorMessage).toMatch(/redirect/i);
      expect(hits).toBeLessThan(15);
    } finally {
      await looper.close();
    }
  });
});
