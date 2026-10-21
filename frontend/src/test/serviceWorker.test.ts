import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const SW_SOURCE = fs.readFileSync(
  path.resolve(__dirname, '../../public/sw.js'),
  'utf8'
);

interface Harness {
  handleFetch: (request: Request, mode?: string) => Promise<{
    responded: boolean;
    cachedKeys: string[];
    fetchedUrls: string[];
  }>;
  cacheStore: Map<string, Map<string, unknown>>;
}

function requestKey(request: Request): string {
  return request.url;
}

function loadServiceWorker(): Harness {
  const listeners: Record<string, Array<(event: any) => void>> = {};
  const cacheStore = new Map<string, Map<string, unknown>>();
  const fetchedUrls: string[] = [];

  const caches = {
    async open(name: string) {
      if (!cacheStore.has(name)) cacheStore.set(name, new Map());
      const bucket = cacheStore.get(name)!;
      return {
        async addAll() {},
        async match(request: Request) {
          return bucket.get(requestKey(request));
        },
        async put(request: Request, response: unknown) {
          bucket.set(requestKey(request), response);
        },
      };
    },
    async keys() {
      return Array.from(cacheStore.keys());
    },
    async delete(name: string) {
      return cacheStore.delete(name);
    },
  };

  const self = {
    addEventListener(type: string, handler: (event: any) => void) {
      (listeners[type] ||= []).push(handler);
    },
    skipWaiting() {},
    clients: { claim() {} },
    location: { origin: 'https://campaign-dp.vercel.app' },
  };

  const context: Record<string, unknown> = {
    self,
    caches,
    console,
    setTimeout,
    clearTimeout,
    URL,
    Promise,
    Response,
    Request,
    async fetch(input: any) {
      const url = typeof input === 'string' ? input : input.url;
      fetchedUrls.push(url);
      return new Response('{}', { status: 200 });
    },
  };

  vm.createContext(context);
  vm.runInContext(SW_SOURCE, context);

  const handler = (listeners['fetch'] || [])[0];

  return {
    cacheStore,
    async handleFetch(request: Request) {
      const bucketBefore = Array.from(cacheStore.values()).reduce(
        (total, bucket) => total + bucket.size,
        0
      );

      let responded = false;
      let responsePromise: Promise<unknown> | null = null;

      const event = {
        request,
        respondWith(promise: Promise<unknown>) {
          responded = true;
          responsePromise = promise;
        },
        waitUntil() {},
      };

      handler(event);
      if (responsePromise) {
        await responsePromise;
      }

      const bucketAfter = Array.from(cacheStore.values()).reduce(
        (total, bucket) => total + bucket.size,
        0
      );

      return {
        responded,
        cachedKeys:
          bucketAfter > bucketBefore
            ? Array.from(cacheStore.values()).flatMap((bucket) => Array.from(bucket.keys()))
            : [],
        fetchedUrls: [...fetchedUrls],
      };
    },
  };
}

function makeRequest(url: string, mode = 'no-cors'): Request {
  // A plain object is used because the Request constructor does not accept
  // the "navigate" mode that document requests use.
  return {
    url,
    method: 'GET',
    mode,
    headers: new Headers(),
  } as unknown as Request;
}

describe('Phase 9 — service worker caching policy', () => {
  let harness: Harness;

  beforeEach(() => {
    harness = loadServiceWorker();
  });

  it('does not intercept personalised API reads', async () => {
    for (const url of [
      'https://campaign-dp.vercel.app/api/profile',
      'https://campaign-dp.vercel.app/api/auth/me',
      'https://campaign-dp.vercel.app/api/organizations',
      'https://campaign-dp.vercel.app/api/projects',
      'https://campaign-dp.vercel.app/api/organizations/org-1/dashboard',
    ]) {
      const result = await harness.handleFetch(makeRequest(url));
      expect(result.responded, url).toBe(false);
    }
  });

  it('caches public, non-personalised API reads', async () => {
    const result = await harness.handleFetch(
      makeRequest('https://campaign-dp.vercel.app/api/templates')
    );
    expect(result.responded).toBe(true);
    expect(result.cachedKeys.some((key) => key.includes('/api/templates'))).toBe(true);
  });

  it('does not cache the public campaign API for a long period but does serve it offline', async () => {
    const result = await harness.handleFetch(
      makeRequest('https://campaign-dp.vercel.app/api/public/campaigns/renewed-hope')
    );
    expect(result.responded).toBe(true);
  });

  it('uses the network first for the document shell so deployments reach clients', async () => {
    const result = await harness.handleFetch(
      makeRequest('https://campaign-dp.vercel.app/', 'navigate')
    );
    expect(result.responded).toBe(true);
    expect(result.fetchedUrls.some((url) => url.endsWith('/'))).toBe(true);
  });

  it('ignores non-GET requests', async () => {
    const request = new Request('https://campaign-dp.vercel.app/api/generate', {
      method: 'POST',
    });
    const result = await harness.handleFetch(request);
    expect(result.responded).toBe(false);
  });

  it('ignores cross-origin requests', async () => {
    const result = await harness.handleFetch(
      makeRequest('https://cdn.example.com/image.png')
    );
    expect(result.responded).toBe(false);
  });
});
