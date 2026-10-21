import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Pilot feedback is collected with explicit consent. The endpoint must not
 * accept feedback without consent, must not let a client attribute feedback
 * to another account, and must not be usable to flood the endpoint.
 */

const state: any = {
  feedback: [] as any[],
  tokens: {} as Record<string, any>,
  nextId: 1,
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
    membership: { findMany: vi.fn(async () => []) },
    feedback: {
      create: vi.fn(async ({ data }: any) => {
        const item = { id: `fb-${state.nextId++}`, createdAt: new Date(), ...data };
        state.feedback.push(item);
        return item;
      }),
      findMany: vi.fn(async () => state.feedback),
      count: vi.fn(async () => state.feedback.length),
    },
  },
}));

vi.mock('../middleware/rateLimit', () => ({
  apiRateLimiter: async () => {},
}));

import Fastify from 'fastify';
import fastifyCookie from '@fastify/cookie';
import { feedbackRoutes } from './feedback';

async function buildApp() {
  const app = Fastify();
  await app.register(fastifyCookie);
  const { authenticate } = await import('../middleware/auth.js');
  app.addHook('preHandler', authenticate);
  await feedbackRoutes(app);
  await app.ready();
  return app;
}

beforeEach(() => {
  state.feedback = [];
  state.nextId = 1;
  state.tokens = {
    'user-token': {
      id: 'user-1',
      email: 'user@example.com',
      email_confirmed_at: '2026-01-01T00:00:00Z',
    },
  };
  vi.clearAllMocks();
});

describe('Phase 10 — consent based feedback', () => {
  it('stores feedback that carries explicit consent', async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: 'POST',
      url: '/api/feedback',
      payload: {
        rating: 5,
        category: 'idea',
        message: 'Please add a WhatsApp status format.',
        consent: true,
      },
    });

    expect(response.statusCode).toBe(201);
    expect(response.json().received).toBe(true);
    expect(state.feedback).toHaveLength(1);
    expect(state.feedback[0].consent).toBe(true);
    expect(state.feedback[0].rating).toBe(5);
    expect(state.feedback[0].message).toBe('Please add a WhatsApp status format.');
  });

  it('rejects feedback without consent', async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: 'POST',
      url: '/api/feedback',
      payload: { rating: 4, category: 'other', message: 'Nice app' },
    });

    expect(response.statusCode).toBe(400);
    expect(state.feedback).toHaveLength(0);
  });

  it('rejects feedback with consent explicitly disabled', async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: 'POST',
      url: '/api/feedback',
      payload: {
        rating: 4,
        category: 'other',
        message: 'Nice app',
        consent: false,
      },
    });

    expect(response.statusCode).toBe(400);
    expect(state.feedback).toHaveLength(0);
  });

  it('rejects ratings outside the supported range', async () => {
    const app = await buildApp();
    for (const rating of [0, 6, 2.5]) {
      const response = await app.inject({
        method: 'POST',
        url: '/api/feedback',
        payload: { rating, category: 'other', message: 'Test feedback', consent: true },
      });
      expect(response.statusCode).toBe(400);
    }
    expect(state.feedback).toHaveLength(0);
  });

  it('rejects unknown categories', async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: 'POST',
      url: '/api/feedback',
      payload: {
        rating: 3,
        category: 'marketing',
        message: 'Test feedback',
        consent: true,
      },
    });

    expect(response.statusCode).toBe(400);
  });

  it('rejects an empty message', async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: 'POST',
      url: '/api/feedback',
      payload: { rating: 3, category: 'other', message: '', consent: true },
    });

    expect(response.statusCode).toBe(400);
  });

  it('attributes feedback to the verified session, not the request body', async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: 'POST',
      url: '/api/feedback',
      headers: { cookie: 'access_token=user-token' },
      payload: {
        rating: 4,
        category: 'usability',
        message: 'The editor is easy to use.',
        userId: 'someone-else',
        consent: true,
      },
    });

    expect(response.statusCode).toBe(201);
    expect(state.feedback[0].userId).toBe('user-1');
  });

  it('stores anonymous feedback without an owner', async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: 'POST',
      url: '/api/feedback',
      payload: {
        rating: 2,
        category: 'bug',
        message: 'The download button did nothing.',
        consent: true,
      },
    });

    expect(response.statusCode).toBe(201);
    expect(state.feedback[0].userId).toBeNull();
  });

  it('keeps the contact details only when they are provided', async () => {
    const app = await buildApp();
    await app.inject({
      method: 'POST',
      url: '/api/feedback',
      payload: {
        rating: 4,
        category: 'other',
        message: 'With contact details',
        contact: '  campaign@example.com  ',
        consent: true,
      },
    });
    await app.inject({
      method: 'POST',
      url: '/api/feedback',
      payload: {
        rating: 4,
        category: 'other',
        message: 'Without contact details',
        consent: true,
      },
    });

    expect(state.feedback[0].contact).toBe('campaign@example.com');
    expect(state.feedback[1].contact).toBeNull();
  });

  it('does not expose collected feedback without an administrator role', async () => {
    const app = await buildApp();
    const response = await app.inject({ method: 'GET', url: '/api/admin/feedback' });

    expect(response.statusCode).toBe(401);
  });
});
