import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { FastifyReply, FastifyRequest } from 'fastify';

/**
 * The rate limiter is the first line of defence for the public endpoints and
 * backs the monthly guest export quota, so its counting, windowing and
 * fail-open behaviour are covered here.
 */

const state: any = {
  buckets: new Map<string, { key: string; count: number; resetAt: Date }>(),
  storeAvailable: true,
};

vi.mock('../db/prisma', () => ({
  default: {
    rateLimitBucket: {
      findUnique: vi.fn(async ({ where }: any) => {
        if (!state.storeAvailable) throw new Error('store unavailable');
        return state.buckets.get(where.key) ?? null;
      }),
      upsert: vi.fn(async ({ where, create, update }: any) => {
        if (!state.storeAvailable) throw new Error('store unavailable');
        const bucket = {
          key: where.key,
          count: create?.count ?? update?.count ?? 1,
          resetAt: create?.resetAt ?? update?.resetAt,
        };
        state.buckets.set(where.key, bucket);
        return bucket;
      }),
      update: vi.fn(async ({ where, data }: any) => {
        if (!state.storeAvailable) throw new Error('store unavailable');
        const existing = state.buckets.get(where.key);
        const bucket = {
          ...existing,
          count: (existing?.count ?? 0) + (data.count?.increment ?? 0),
        };
        state.buckets.set(where.key, bucket);
        return bucket;
      }),
      deleteMany: vi.fn(async ({ where }: any) => {
        let count = 0;
        for (const [key, bucket] of state.buckets.entries()) {
          if (bucket.resetAt.getTime() < where.resetAt.lt.getTime()) {
            state.buckets.delete(key);
            count += 1;
          }
        }
        return { count };
      }),
    },
  },
}));

import {
  cleanupRateLimitBuckets,
  msUntilEndOfMonth,
  rateLimit,
} from './rateLimit';

function fakeRequest(ip: string, overrides: Record<string, unknown> = {}): FastifyRequest {
  return {
    ip,
    url: '/api/test',
    routeOptions: { url: '/api/test' },
    log: { warn: vi.fn() },
    user: undefined,
    ...overrides,
  } as unknown as FastifyRequest;
}

function fakeReply(): FastifyReply & { headers: Record<string, string>; payload?: unknown } {
  const reply: any = {
    headers: {} as Record<string, string>,
    statusCode: 200,
    payload: undefined,
    header(key: string, value: string) {
      reply.headers[key] = value;
      return reply;
    },
    code(status: number) {
      reply.statusCode = status;
      return reply;
    },
    send(payload: unknown) {
      reply.payload = payload;
      return reply;
    },
  };
  return reply;
}

beforeEach(() => {
  state.buckets = new Map();
  state.storeAvailable = true;
  vi.clearAllMocks();
});

describe('Phase 9 — rate limit enforcement', () => {
  it('allows requests up to the limit and reports the remaining quota', async () => {
    const request = fakeRequest('1.2.3.4');

    for (let attempt = 0; attempt < 3; attempt++) {
      const reply = fakeReply();
      const allowed = await rateLimit(request, reply, { max: 3 });
      expect(allowed).toBe(true);
      expect(reply.statusCode).toBe(200);
      expect(reply.headers['X-RateLimit-Limit']).toBe('3');
      expect(reply.headers['X-RateLimit-Remaining']).toBe(String(2 - attempt));
    }
  });

  it('blocks requests over the limit with 429', async () => {
    const request = fakeRequest('1.2.3.4');

    await rateLimit(request, fakeReply(), { max: 2 });
    await rateLimit(request, fakeReply(), { max: 2 });

    const reply = fakeReply();
    const allowed = await rateLimit(request, reply, { max: 2 });

    expect(allowed).toBe(false);
    expect(reply.statusCode).toBe(429);
    expect((reply.payload as any).error).toBe('Too Many Requests');
    expect((reply.payload as any).retryAfter).toBeGreaterThan(0);
    expect(reply.headers['X-RateLimit-Remaining']).toBe('0');
  });

  it('counts each key separately', async () => {
    const keyOf = (ip: string) => `test:${ip}`;

    await rateLimit(fakeRequest('1.1.1.1'), fakeReply(), {
      max: 1,
      keyGenerator: (req) => keyOf(req.ip),
    });
    await rateLimit(fakeRequest('1.1.1.1'), fakeReply(), {
      max: 1,
      keyGenerator: (req) => keyOf(req.ip),
    });

    const blocked = fakeReply();
    const allowed = await rateLimit(fakeRequest('1.1.1.1'), blocked, {
      max: 1,
      keyGenerator: (req) => keyOf(req.ip),
    });
    expect(allowed).toBe(false);

    const other = fakeReply();
    const otherAllowed = await rateLimit(fakeRequest('2.2.2.2'), other, {
      max: 1,
      keyGenerator: (req) => keyOf(req.ip),
    });
    expect(otherAllowed).toBe(true);
  });

  it('starts a fresh window once the previous one expired', async () => {
    const key = 'test:window';
    state.buckets.set(key, {
      key,
      count: 5,
      resetAt: new Date(Date.now() - 1000),
    });

    const reply = fakeReply();
    const allowed = await rateLimit(fakeRequest('1.2.3.4'), reply, {
      max: 2,
      keyGenerator: () => key,
    });

    expect(allowed).toBe(true);
    expect(state.buckets.get(key)?.count).toBe(1);
  });

  it('honours a dynamic window length', async () => {
    const key = 'test:dynamic';
    let calls = 0;

    await rateLimit(fakeRequest('1.2.3.4'), fakeReply(), {
      max: 5,
      windowMs: () => {
        calls += 1;
        return 60_000;
      },
      keyGenerator: () => key,
    });

    expect(calls).toBeGreaterThan(0);
    const bucket = state.buckets.get(key);
    expect(bucket).toBeDefined();
    expect(bucket!.resetAt.getTime()).toBeGreaterThan(Date.now());
  });

  it('fails open when the rate limit store is unavailable', async () => {
    state.storeAvailable = false;
    const request = fakeRequest('1.2.3.4');
    const reply = fakeReply();

    const allowed = await rateLimit(request, reply, { max: 1 });

    expect(allowed).toBe(true);
    expect(reply.statusCode).toBe(200);
    expect(request.log.warn).toHaveBeenCalled();
  });
});

describe('Phase 9 — monthly quota window', () => {
  it('returns a positive duration until the first of the next month', () => {
    const now = new Date('2026-01-15T10:00:00Z');
    const remaining = msUntilEndOfMonth(now);

    expect(remaining).toBeGreaterThan(0);
    const target = new Date(now.getTime() + remaining);
    expect(target.getDate()).toBe(1);
    expect(target.getHours()).toBe(0);
    expect(target.getMinutes()).toBe(0);
  });

  it('never returns less than one second', () => {
    const endOfMonth = new Date(2026, 1, 1, 0, 0, 0, 0);
    expect(msUntilEndOfMonth(new Date(endOfMonth.getTime() - 10))).toBe(1000);
  });
});

describe('Phase 9 — bucket cleanup', () => {
  it('removes expired buckets and keeps the active ones', async () => {
    state.buckets.set('old', {
      key: 'old',
      count: 1,
      resetAt: new Date(Date.now() - 48 * 60 * 60 * 1000),
    });
    state.buckets.set('fresh', {
      key: 'fresh',
      count: 1,
      resetAt: new Date(Date.now() + 60 * 60 * 1000),
    });

    const deleted = await cleanupRateLimitBuckets(24);

    expect(deleted).toBe(1);
    expect(state.buckets.has('old')).toBe(false);
    expect(state.buckets.has('fresh')).toBe(true);
  });
});
