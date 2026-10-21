import { URL } from 'node:url';
import dns from 'node:dns/promises';
import net from 'node:net';

export const MAX_EXTERNAL_FETCH_BYTES = 5 * 1024 * 1024;
export const EXTERNAL_FETCH_TIMEOUT_MS = 10_000;

// Hostname suffixes that must never be reached from a server-side fetch.
const BLOCKED_HOST_SUFFIXES = [
  '.localhost',
  '.local',
  '.internal',
  '.intranet',
  '.home.arpa',
  '.lan',
  '.corp',
];

const BLOCKED_HOSTNAMES = new Set([
  'localhost',
  'localhost.localdomain',
  'metadata.google.internal',
  'instance-data',
]);

/**
 * Parses IPv4 addresses in every notation a URL parser accepts:
 * dotted quad, dotted shorthand (a.b), decimal (2130706433), octal
 * (017700000001 / 0177.0.0.01) and hex (0x7f000001).
 * Returns null when the value is not an IPv4 address in any notation.
 */
function parseIpv4(host: string): number | null {
  const trimmed = host.trim();

  if (!/^[0-9a-fx.]+$/i.test(trimmed)) return null;

  // Single-value hex notation, e.g. 0x7f000001.
  if (/^0x[0-9a-f]+$/i.test(trimmed)) {
    const value = parseInt(trimmed, 16);
    if (Number.isNaN(value) || value > 0xffffffff) return null;
    return value >>> 0;
  }

  const parts = trimmed.split('.');
  if (parts.length > 4) return null;

  // A single component is a full 32-bit address in decimal or octal notation.
  if (parts.length === 1) {
    const part = parts[0] as string;
    if (!/^\d+$/.test(part)) return null;
    const value = /^0[0-7]+$/.test(part) ? parseInt(part, 8) : Number(part);
    if (Number.isNaN(value) || value > 0xffffffff) return null;
    return value >>> 0;
  }

  const octets: number[] = [];
  for (const part of parts) {
    if (!/^\d+$/.test(part)) return null;
    // A leading zero means octal notation.
    const value = /^0[0-7]+$/.test(part) ? parseInt(part, 8) : Number(part);
    if (Number.isNaN(value) || value > 255) return null;
    octets.push(value);
  }

  // Shorthand notations: "a.b" is a.b.0.0 and "a.b.c" is a.b.c.0.
  if (octets.length === 2) {
    const [a, b] = octets as [number, number];
    return (((a << 24) >>> 0) + ((b << 16) >>> 0)) >>> 0;
  }

  if (octets.length === 3) {
    const [a, b, c] = octets as [number, number, number];
    return (((a << 24) >>> 0) + ((b << 16) >>> 0) + ((c << 8) >>> 0)) >>> 0;
  }

  const [a, b, c, d] = octets as [number, number, number, number];
  return (((a << 24) >>> 0) + ((b << 16) >>> 0) + ((c << 8) >>> 0) + d) >>> 0;
}

/** True when the 32-bit IPv4 address is in a private, loopback, link-local or reserved range. */
function isPrivateIpv4(address: number): boolean {
  const a = (address >>> 24) & 0xff;
  const b = (address >>> 16) & 0xff;

  if (a === 0) return true; // 0.0.0.0/8 "this network"
  if (a === 10) return true; // 10.0.0.0/8 private
  if (a === 127) return true; // 127.0.0.0/8 loopback
  if (a === 169 && b === 254) return true; // 169.254.0.0/16 link-local (cloud metadata)
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12 private
  if (a === 192 && b === 168) return true; // 192.168.0.0/16 private
  if (a === 192 && b === 0) return true; // 192.0.0.0/24 IETF protocol assignments
  if (a === 198 && (b === 18 || b === 19)) return true; // 198.18.0.0/15 benchmarking
  if (a === 198 && b === 51 && (address & 0xff) === 100) return true; // 198.51.100.0/24
  if (a === 203 && b === 0 && (address & 0xff) === 113) return true; // 203.0.113.0/24
  if (a === 100 && b >= 64 && b <= 127) return true; // 100.64.0.0/10 CGNAT
  if (a >= 224) return true; // multicast + reserved + broadcast
  return false;
}

/**
 * Parses an IPv6 literal into its eight 16-bit groups.
 * Returns null when the literal is not a valid IPv6 address.
 */
function parseIpv6(literal: string): number[] | null {
  const value = literal.toLowerCase().replace(/^\[|\]$/g, '');
  if (!value.includes(':')) return null;

  const doubleColonIndex = value.indexOf('::');
  if (doubleColonIndex !== -1 && value.indexOf('::', doubleColonIndex + 1) !== -1) {
    return null; // more than one "::" is invalid
  }

  const parseGroups = (parts: string[]): number[] | null => {
    const groups: number[] = [];
    for (let index = 0; index < parts.length; index++) {
      const part = parts[index] as string;
      if (part.includes('.')) {
        // Only the last group may be an embedded IPv4 dotted quad.
        if (index !== parts.length - 1) return null;
        const embedded = parseIpv4(part);
        if (embedded === null) return null;
        groups.push((embedded >>> 16) & 0xffff, embedded & 0xffff);
        continue;
      }
      if (!/^[0-9a-f]{1,4}$/.test(part)) return null;
      groups.push(parseInt(part, 16));
    }
    return groups;
  };

  const head = parseGroups(
    (doubleColonIndex === -1 ? value : value.slice(0, doubleColonIndex))
      .split(':')
      .filter((part) => part !== '')
  );
  if (!head) return null;

  if (doubleColonIndex === -1) {
    return head.length === 8 ? head : null;
  }

  const tail = parseGroups(
    value.slice(doubleColonIndex + 2).split(':').filter((part) => part !== '')
  );
  if (!tail) return null;

  const used = head.length + tail.length;
  if (used > 7) return null; // "::" must stand for at least one group
  return [...head, ...new Array(8 - used).fill(0), ...tail];
}

function ipv6ToBytes(groups: number[]): number[] {
  const bytes: number[] = [];
  for (const group of groups) {
    bytes.push((group >> 8) & 0xff, group & 0xff);
  }
  return bytes;
}

function bytesToIpv4(bytes: number[]): number {
  return (
    (((bytes[0] as number) << 24) >>> 0) +
    (((bytes[1] as number) << 16) >>> 0) +
    (((bytes[2] as number) << 8) >>> 0) +
    (bytes[3] as number)
  ) >>> 0;
}

/**
 * True when the IPv6 literal is loopback, link-local, unique-local, multicast
 * or embeds a private IPv4 address (IPv4-mapped, IPv4-compatible, NAT64 or
 * 6to4). URL parsers normalise "::ffff:127.0.0.1" to "::ffff:7f00:1", so the
 * embedded address has to be decoded from the binary form.
 */
function isPrivateIpv6(literal: string): boolean {
  const groups = parseIpv6(literal);
  // An address we cannot parse is treated as private (fail closed).
  if (!groups) return true;

  const bytes = ipv6ToBytes(groups);
  const isZeroPrefix = (count: number) =>
    groups.slice(0, count).every((group) => group === 0);

  if (groups.every((group) => group === 0)) return true; // ::
  if (isZeroPrefix(7) && groups[7] === 1) return true; // ::1
  if (((groups[0] as number) & 0xffc0) === 0xfe80) return true; // fe80::/10 link-local
  if (((groups[0] as number) & 0xfe00) === 0xfc00) return true; // fc00::/7 unique-local
  if (((groups[0] as number) & 0xff00) === 0xff00) return true; // ff00::/8 multicast
  if (groups[0] === 0x0100 && groups[1] === 0 && groups[2] === 0 && groups[3] === 0) {
    return true; // 100::/64 discard-only prefix
  }

  // IPv4-mapped (::ffff:a.b.c.d) and IPv4-compatible (::a.b.c.d) addresses.
  if (isZeroPrefix(5) && groups[5] === 0xffff) {
    return isPrivateIpv4(bytesToIpv4(bytes.slice(12)));
  }
  if (isZeroPrefix(6)) {
    return isPrivateIpv4(bytesToIpv4(bytes.slice(12)));
  }

  // NAT64 well-known prefix 64:ff9b::/96.
  if (groups[0] === 0x0064 && groups[1] === 0xff9b && groups.slice(2, 6).every((group) => group === 0)) {
    return isPrivateIpv4(bytesToIpv4(bytes.slice(12)));
  }

  // 6to4 (2002::/16) embeds the IPv4 address in bytes 2..5.
  if (groups[0] === 0x2002) {
    return isPrivateIpv4(bytesToIpv4(bytes.slice(2, 6)));
  }

  return false;
}

/**
 * True when the hostname points at infrastructure that must not be reachable
 * from a server-side request (loopback, private networks, cloud metadata).
 */
export function isPrivateHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '');

  if (!host) return true;
  if (BLOCKED_HOSTNAMES.has(host)) return true;
  if (BLOCKED_HOST_SUFFIXES.some((suffix) => host.endsWith(suffix))) return true;

  if (net.isIPv6(host)) {
    return isPrivateIpv6(host);
  }

  const ipv4 = parseIpv4(host);
  if (ipv4 !== null) {
    return isPrivateIpv4(ipv4);
  }

  return false;
}

export interface UrlSafetyOptions {
  /** Maximum number of bytes accepted from the upstream response. */
  maxBytes?: number;
  /** Abort the request after this many milliseconds. */
  timeoutMs?: number;
  /** Skip DNS resolution checks (used by tests and trusted first-party hosts). */
  skipDnsCheck?: boolean;
}

/**
 * Validates an externally supplied URL before it is fetched server-side.
 * Only HTTPS on port 443 is accepted, credentials in the URL are rejected and
 * the host must not resolve to private infrastructure.
 */
export async function isAllowedExternalUrl(
  url: string,
  options: UrlSafetyOptions = {}
): Promise<{ allowed: boolean; reason?: string }> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { allowed: false, reason: 'Malformed URL' };
  }

  if (parsed.protocol !== 'https:') {
    return { allowed: false, reason: 'Only HTTPS URLs are allowed' };
  }

  if (parsed.username || parsed.password) {
    return { allowed: false, reason: 'URLs with embedded credentials are not allowed' };
  }

  const port = parsed.port || '443';
  if (port !== '443') {
    return { allowed: false, reason: 'Only port 443 is allowed' };
  }

  const hostname = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, '');

  if (isPrivateHost(hostname)) {
    return { allowed: false, reason: 'Host is not a public address' };
  }

  if (!options.skipDnsCheck && !net.isIP(hostname)) {
    try {
      const addresses = await dns.lookup(hostname, { all: true });
      if (addresses.some((entry) => isPrivateHost(entry.address))) {
        return { allowed: false, reason: 'Host resolves to a private address' };
      }
    } catch {
      // Resolution failure is not treated as a block: the subsequent request
      // will fail on its own and no data is leaked.
    }
  }

  return { allowed: true };
}

export interface SafeFetchResult {
  ok: boolean;
  buffer?: Buffer;
  error?: string;
}

const MAX_REDIRECTS = 3;
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

/**
 * Fetches a URL and follows redirects manually, re-validating every hop.
 * Automatic redirect following would allow a public host to bounce the
 * request to a private address, which is the classic SSRF redirect bypass.
 */
async function fetchWithValidatedRedirects(
  url: string,
  options: UrlSafetyOptions,
  signal: AbortSignal
): Promise<{ response?: Response; error?: string }> {
  let currentUrl = url;

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const verdict = await isAllowedExternalUrl(currentUrl, options);
    if (!verdict.allowed) {
      return { error: verdict.reason || 'URL not allowed' };
    }

    const response = await fetch(currentUrl, { signal, redirect: 'manual' });

    const location = response.headers.get('location');
    if (!REDIRECT_STATUSES.has(response.status) || !location) {
      return { response };
    }

    if (hop === MAX_REDIRECTS) {
      return { error: 'Too many redirects' };
    }

    let nextUrl: string;
    try {
      nextUrl = new URL(location, currentUrl).toString();
    } catch {
      return { error: 'Upstream returned an invalid redirect target' };
    }
    currentUrl = nextUrl;
  }

  return { error: 'Too many redirects' };
}

/**
 * Fetches an external resource only if it passes SSRF safety checks.
 * The response is size-capped and time-boxed so a hostile or misbehaving
 * upstream cannot exhaust server memory or hold a request open.
 */
export async function safeFetchBuffer(
  url: string,
  options: UrlSafetyOptions = {}
): Promise<SafeFetchResult> {
  const maxBytes = options.maxBytes ?? MAX_EXTERNAL_FETCH_BYTES;
  const timeoutMs = options.timeoutMs ?? EXTERNAL_FETCH_TIMEOUT_MS;

  const verdict = await isAllowedExternalUrl(url, options);
  if (!verdict.allowed) {
    return { ok: false, error: verdict.reason || 'URL not allowed' };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const { response, error } = await fetchWithValidatedRedirects(
      url,
      options,
      controller.signal
    );

    if (error) {
      return { ok: false, error };
    }
    if (!response) {
      return { ok: false, error: 'Fetch failed' };
    }

    if (!response.ok) {
      return { ok: false, error: `Upstream returned ${response.status}` };
    }

    const declaredLength = Number(response.headers.get('content-length') || '0');
    if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
      return { ok: false, error: 'Upstream response exceeds the maximum allowed size' };
    }

    if (!response.body) {
      return { ok: false, error: 'Upstream returned an empty response' };
    }

    const chunks: Buffer[] = [];
    let total = 0;

    for await (const chunk of response.body as unknown as AsyncIterable<Uint8Array>) {
      total += chunk.byteLength;
      if (total > maxBytes) {
        return { ok: false, error: 'Upstream response exceeds the maximum allowed size' };
      }
      chunks.push(Buffer.from(chunk));
    }

    return { ok: true, buffer: Buffer.concat(chunks) };
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      return { ok: false, error: 'Upstream request timed out' };
    }
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'Fetch failed',
    };
  } finally {
    clearTimeout(timer);
  }
}
