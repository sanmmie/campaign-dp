import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Analytics ingestion must attribute events to the verified session identity
 * only. A client must never be able to attribute an event to another user by
 * sending a userId in the request body, and the event name is restricted to a
 * fixed allowlist.
 */

const state: any = {
  tokens: {} as Record<string, any>,
  events: [] as any[],
};

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    auth: {
      getUser: async (token: string) => {
        const user = state.tokens[token];
        return user
          ? { data: { user }, error: null }
          : { data: { user: null }, error: { message: 'invalid' } };
      },
    },
  }),
}));

vi.mock('../db/prisma', () => ({
  default: {
    membership: {
      findMany: vi.fn(async () => []),
    },
    analyticsEvent: {
      create: vi.fn(async ({ data }: any) => {
        const event = { id: 'evt-1', ...data };
        state.events.push(event);
        return event;
      }),
      count: vi.fn(async () => state.events.length),
      groupBy: vi.fn(async () => []),
    },
  },
}));

vi.mock('../middleware/rateLimit', () => ({
  apiRateLimiter: async () => {},
}));

vi.mock('../config/env', () => ({
  env: {
    NODE_ENV: 'test',
    FRONTEND_URL: 'http://localhost:5173',
    ADMIN_EMAILS: [],
  },
}));

import Fastify from 'fastify';
import fastifyCookie from '@fastify/cookie';
import { analyticsRoutes } from './analytics';

async function buildApp() {
  const app = Fastify();
  await app.register(fastifyCookie);
  const { authenticate } = await import('../middleware/auth.js');
  app.addHook('preHandler', authenticate);
  await analyticsRoutes(app);
  await app.ready();
  return app;
}

beforeEach(() => {
  state.tokens = {};
  state.events = [];
  vi.clearAllMocks();
});

describe('Phase 9 — analytics ingestion', () => {
  it('derives userId from the verified session for authenticated users', async () => {
    state.tokens['token-a'] = {
      id: 'user-a',
      email: 'a@example.com',
      email_confirmed_at: '2026-01-01T00:00:00Z',
    };

    const app = await buildApp();
    const response = await app.inject({
      method: 'POST',
      url: '/api/analytics',
      headers: { cookie: 'access_token=token-a' },
      payload: { event: 'campaign_visit', sessionId: 'session-1' },
    });

    expect(response.statusCode).toBe(200);
    expect(state.events).toHaveLength(1);
    expect(state.events[0].userId).toBe('user-a');
  });

  it('ignores a userId supplied in the request body', async () => {
    state.tokens['token-a'] = {
      id: 'user-a',
      email: 'a@example.com',
      email_confirmed_at: '2026-01-01T00:00:00Z',
    };

    const app = await buildApp();
    const response = await app.inject({
      method: 'POST',
      url: '/api/analytics',
      headers: { cookie: 'access_token=token-a' },
      payload: {
        event: 'share',
        sessionId: 'session-1',
        userId: 'user-victim',
        properties: { userId: 'user-victim' },
      },
    });

    expect(response.statusCode).toBe(200);
    expect(state.events[0].userId).toBe('user-a');
  });

  it('records a null userId for anonymous visitors', async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: 'POST',
      url: '/api/analytics',
      payload: { event: 'generation', sessionId: 'guest-session' },
    });

    expect(response.statusCode).toBe(200);
    expect(state.events[0].userId).toBeNull();
  });

  it('rejects events outside the allowlist', async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: 'POST',
      url: '/api/analytics',
      payload: { event: 'admin_purge', sessionId: 'session-1' },
    });

    expect(response.statusCode).toBe(400);
    expect(state.events).toHaveLength(0);
  });

  it('rejects events outside the allowlist even for authenticated users', async () => {
    state.tokens['token-a'] = {
      id: 'user-a',
      email: 'a@example.com',
      email_confirmed_at: '2026-01-01T00:00:00Z',
    };

    const app = await buildApp();
    const response = await app.inject({
      method: 'POST',
      url: '/api/analytics',
      headers: { cookie: 'access_token=token-a' },
      payload: { event: 'sql_injection', sessionId: 'session-1' },
    });

    expect(response.statusCode).toBe(400);
    expect(state.events).toHaveLength(0);
  });

  it('accepts every allowlisted event type', async () => {
    const app = await buildApp();
    const events = [
      'campaign_visit',
      'share',
      'template_use',
      'generation',
      'download',
    ];

    for (const event of events) {
      const response = await app.inject({
        method: 'POST',
        url: '/api/analytics',
        payload: { event, sessionId: 'session-1' },
      });
      expect(response.statusCode).toBe(200);
    }

    expect(state.events).toHaveLength(events.length);
  });

  it('requires a sessionId', async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: 'POST',
      url: '/api/analytics',
      payload: { event: 'share' },
    });

    expect(response.statusCode).toBe(400);
    expect(state.events).toHaveLength(0);
  });

  it('serializes properties as a JSON string', async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: 'POST',
      url: '/api/analytics',
      payload: {
        event: 'template_use',
        sessionId: 'session-1',
        properties: { templateId: 'tpl-1', nested: { a: 1 } },
      },
    });

    expect(response.statusCode).toBe(200);
    expect(typeof state.events[0].properties).toBe('string');
    expect(JSON.parse(state.events[0].properties)).toEqual({
      templateId: 'tpl-1',
      nested: { a: 1 },
    });
  });
});

describe('Phase 9 — analytics admin summary', () => {
  it('rejects unauthenticated access', async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: 'GET',
      url: '/api/admin/analytics',
    });
    expect(response.statusCode).toBe(401);
  });

  it('rejects users without an analytics role', async () => {
    state.tokens['token-a'] = {
      id: 'user-a',
      email: 'a@example.com',
      email_confirmed_at: '2026-01-01T00:00:00Z',
    };

    const app = await buildApp();
    const response = await app.inject({
      method: 'GET',
      url: '/api/admin/analytics',
      headers: { cookie: 'access_token=token-a' },
    });
    expect(response.statusCode).toBe(403);
  });
});
