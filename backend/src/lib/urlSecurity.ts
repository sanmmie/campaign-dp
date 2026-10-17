import { URL } from 'node:url';

// Reserved/private IP ranges per RFC 1918, RFC 5735, RFC 6598.
// Blocking these prevents SSRF attacks against internal/metadata endpoints.
const PRIVATE_IP_PREFIXES = [
  '10.',
  '127.',
  '169.254.',
  '172.16.',
  '172.17.',
  '172.18.',
  '172.19.',
  '172.20.',
  '172.21.',
  '172.22.',
  '172.23.',
  '172.24.',
  '172.25.',
  '172.26.',
  '172.27.',
  '172.28.',
  '172.29.',
  '172.30.',
  '172.31.',
  '192.168.',
  '0.0.0.0',
];

function isPrivateHost(host: string): boolean {
  const hostname = host.toLowerCase();
  return PRIVATE_IP_PREFIXES.some((prefix) => hostname.startsWith(prefix));
}

export function isAllowedExternalUrl(url: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }

  // Only HTTPS is permitted for externally fetched resources.
  if (parsed.protocol !== 'https:') {
    return false;
  }

  // Reject private/reserved hosts to prevent SSRF.
  if (isPrivateHost(parsed.hostname)) {
    return false;
  }

  // Reject URLs that include credentials.
  if (parsed.username || parsed.password) {
    return false;
  }

  return true;
}

export interface SafeFetchResult {
  ok: boolean;
  buffer?: Buffer;
  error?: string;
}

/**
 * Fetches an external resource only if it passes SSRF safety checks.
 * Returns the raw buffer on success.
 */
export async function safeFetchBuffer(url: string): Promise<SafeFetchResult> {
  if (!isAllowedExternalUrl(url)) {
    return { ok: false, error: 'URL not allowed' };
  }

  try {
    const response = await fetch(url);
    if (!response.ok) {
      return { ok: false, error: `Upstream returned ${response.status}` };
    }
    const arrayBuffer = await response.arrayBuffer();
    return { ok: true, buffer: Buffer.from(arrayBuffer) };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'Fetch failed',
    };
  }
}
