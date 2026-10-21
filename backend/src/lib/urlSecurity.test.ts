import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../config/env', () => ({
  env: { NODE_ENV: 'test' },
}));

import {
  isAllowedExternalUrl,
  isPrivateHost,
  safeFetchBuffer,
  MAX_EXTERNAL_FETCH_BYTES,
} from './urlSecurity';

describe('Phase 9 — SSRF host classification', () => {
  it('treats loopback, private and link-local addresses as private', () => {
    const privateHosts = [
      '127.0.0.1',
      '127.1.2.3',
      '10.0.0.1',
      '10.255.255.255',
      '172.16.0.1',
      '172.31.255.255',
      '192.168.1.1',
      '169.254.169.254', // cloud metadata endpoint
      '0.0.0.0',
      '100.64.0.1', // CGNAT
      '198.18.0.1', // benchmarking range
      '255.255.255.255',
    ];

    for (const host of privateHosts) {
      expect(isPrivateHost(host), host).toBe(true);
    }
  });

  it('blocks obfuscated IPv4 notations that resolve to loopback', () => {
    // 127.0.0.1 in decimal, hex and octal notation.
    expect(isPrivateHost('2130706433')).toBe(true);
    expect(isPrivateHost('0x7f000001')).toBe(true);
    expect(isPrivateHost('017700000001')).toBe(true);
    expect(isPrivateHost('127.1')).toBe(true);
  });

  it('blocks IPv6 loopback, link-local and unique-local addresses', () => {
    expect(isPrivateHost('::1')).toBe(true);
    expect(isPrivateHost('fe80::1')).toBe(true);
    expect(isPrivateHost('fc00::1')).toBe(true);
    expect(isPrivateHost('::ffff:127.0.0.1')).toBe(true);
  });

  it('blocks IPv4 addresses embedded in IPv6 literals', () => {
    // URL parsers normalise "::ffff:127.0.0.1" to the hex form "::ffff:7f00:1",
    // so the embedded address has to be decoded from the binary representation.
    expect(isPrivateHost('::ffff:7f00:1')).toBe(true);
    expect(isPrivateHost('::ffff:a9fe:a9fe')).toBe(true); // 169.254.169.254 metadata
    expect(isPrivateHost('::ffff:0:0')).toBe(true);
    expect(isPrivateHost('::7f00:1')).toBe(true); // IPv4-compatible loopback
    expect(isPrivateHost('64:ff9b::7f00:1')).toBe(true); // NAT64 mapped loopback
    expect(isPrivateHost('2002:7f00:1::')).toBe(true); // 6to4 wrapped loopback
    expect(isPrivateHost('[::ffff:7f00:1]')).toBe(true);
  });

  it('still allows public IPv6 addresses with an embedded public IPv4', () => {
    expect(isPrivateHost('::ffff:8f8:8f8')).toBe(false);
    expect(isPrivateHost('64:ff9b::808:808')).toBe(false);
    expect(isPrivateHost('2002:808:808::')).toBe(false);
  });

  it('blocks shorthand IPv4 notations that resolve to private ranges', () => {
    // "a.b" means a.b.0.0 and "a.b.c" means a.b.c.0.
    expect(isPrivateHost('127.1')).toBe(true);
    expect(isPrivateHost('10.1')).toBe(true);
    expect(isPrivateHost('192.168.1')).toBe(true);
    expect(isPrivateHost('169.254.169')).toBe(true);
    expect(isPrivateHost('172.16.5')).toBe(true);
  });

  it('blocks localhost and internal-only suffixes', () => {
    expect(isPrivateHost('localhost')).toBe(true);
    expect(isPrivateHost('app.localhost')).toBe(true);
    expect(isPrivateHost('db.internal')).toBe(true);
    expect(isPrivateHost('metadata.google.internal')).toBe(true);
    expect(isPrivateHost('printer.local')).toBe(true);
  });

  it('allows ordinary public hosts', () => {
    expect(isPrivateHost('cdn.example.com')).toBe(false);
    expect(isPrivateHost('8.8.8.8')).toBe(false);
    expect(isPrivateHost('2606:4700::1111')).toBe(false);
  });
});

describe('Phase 9 — external URL policy', () => {
  it('rejects non-HTTPS schemes', async () => {
    for (const url of [
      'http://example.com/a.png',
      'ftp://example.com/a.png',
      'file:///etc/passwd',
      'data:image/png;base64,AAAA',
    ]) {
      const verdict = await isAllowedExternalUrl(url, { skipDnsCheck: true });
      expect(verdict.allowed, url).toBe(false);
    }
  });

  it('rejects URLs with embedded credentials', async () => {
    const verdict = await isAllowedExternalUrl('https://user:pass@example.com/a.png', {
      skipDnsCheck: true,
    });
    expect(verdict.allowed).toBe(false);
  });

  it('rejects non-443 ports', async () => {
    const verdict = await isAllowedExternalUrl('https://example.com:8443/a.png', {
      skipDnsCheck: true,
    });
    expect(verdict.allowed).toBe(false);
  });

  it('rejects private hosts', async () => {
    const verdict = await isAllowedExternalUrl('https://169.254.169.254/latest/meta-data', {
      skipDnsCheck: true,
    });
    expect(verdict.allowed).toBe(false);
    expect(verdict.reason).toBeTruthy();
  });

  it('rejects hosts that are private only in their normalised IPv6 form', async () => {
    for (const url of [
      'https://[::ffff:7f00:1]/secret.png',
      'https://[::ffff:a9fe:a9fe]/latest/meta-data',
      'https://[::1]/secret.png',
    ]) {
      const verdict = await isAllowedExternalUrl(url, { skipDnsCheck: true });
      expect(verdict.allowed, url).toBe(false);
    }
  });

  it('rejects malformed URLs', async () => {
    const verdict = await isAllowedExternalUrl('not-a-url', { skipDnsCheck: true });
    expect(verdict.allowed).toBe(false);
  });

  it('accepts a public HTTPS URL', async () => {
    const verdict = await isAllowedExternalUrl('https://cdn.example.com/a.png', {
      skipDnsCheck: true,
    });
    expect(verdict.allowed).toBe(true);
  });
});

describe('Phase 9 — safeFetchBuffer limits', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('does not perform a request for a blocked URL', async () => {
    const fetchSpy = vi.fn();
    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    const result = await safeFetchBuffer('https://127.0.0.1/secret.png');

    expect(result.ok).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('rejects a response larger than the byte cap', async () => {
    const body = new Uint8Array(1024);
    globalThis.fetch = vi.fn(async () =>
      new Response(body, {
        status: 200,
        headers: { 'content-length': '1024' },
      })
    ) as unknown as typeof fetch;

    const result = await safeFetchBuffer('https://cdn.example.com/a.png', {
      skipDnsCheck: true,
      maxBytes: 512,
    });

    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/size/i);
  });

  it('rejects a streamed response that exceeds the cap', async () => {
    globalThis.fetch = vi.fn(async () => {
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(new Uint8Array(600));
          controller.enqueue(new Uint8Array(600));
          controller.close();
        },
      });
      return new Response(stream, { status: 200 });
    }) as unknown as typeof fetch;

    const result = await safeFetchBuffer('https://cdn.example.com/a.png', {
      skipDnsCheck: true,
      maxBytes: 1000,
    });

    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/size/i);
  });

  it('reports a timeout instead of hanging', async () => {
    globalThis.fetch = vi.fn(
      (_url: string, init?: { signal?: AbortSignal }) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => {
            const error = new Error('aborted');
            error.name = 'AbortError';
            reject(error);
          });
        })
    ) as unknown as typeof fetch;

    const result = await safeFetchBuffer('https://cdn.example.com/a.png', {
      skipDnsCheck: true,
      timeoutMs: 20,
    });

    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/timed out/i);
  });

  it('returns the body for a small successful response', async () => {
    globalThis.fetch = vi.fn(async () =>
      new Response(new Uint8Array([1, 2, 3]), { status: 200 })
    ) as unknown as typeof fetch;

    const result = await safeFetchBuffer('https://cdn.example.com/a.png', {
      skipDnsCheck: true,
    });

    expect(result.ok).toBe(true);
    expect(result.buffer?.length).toBe(3);
  });

  it('does not follow a redirect into a private address', async () => {
    const fetchSpy = vi.fn(async (url: string) => {
      if (url === 'https://cdn.example.com/a.png') {
        return new Response(null, {
          status: 302,
          headers: { location: 'https://169.254.169.254/latest/meta-data' },
        });
      }
      return new Response(new Uint8Array([9]), { status: 200 });
    });
    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    const result = await safeFetchBuffer('https://cdn.example.com/a.png', {
      skipDnsCheck: true,
    });

    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/private|not a public|not allowed/i);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('follows a redirect to another public address', async () => {
    const fetchSpy = vi.fn(async (url: string) => {
      if (url === 'https://cdn.example.com/a.png') {
        return new Response(null, {
          status: 301,
          headers: { location: 'https://images.example.com/b.png' },
        });
      }
      return new Response(new Uint8Array([1, 2]), { status: 200 });
    });
    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    const result = await safeFetchBuffer('https://cdn.example.com/a.png', {
      skipDnsCheck: true,
    });

    expect(result.ok).toBe(true);
    expect(result.buffer?.length).toBe(2);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it('stops after too many redirects', async () => {
    const fetchSpy = vi.fn(
      async () =>
        new Response(null, {
          status: 302,
          headers: { location: 'https://cdn.example.com/loop.png' },
        })
    );
    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    const result = await safeFetchBuffer('https://cdn.example.com/a.png', {
      skipDnsCheck: true,
    });

    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/redirect/i);
  });

  it('exposes a sane default maximum', () => {
    expect(MAX_EXTERNAL_FETCH_BYTES).toBeGreaterThan(0);
    expect(MAX_EXTERNAL_FETCH_BYTES).toBeLessThanOrEqual(10 * 1024 * 1024);
  });
});
