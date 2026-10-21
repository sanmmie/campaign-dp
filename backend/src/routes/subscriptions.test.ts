import { describe, it, expect, vi, beforeEach } from 'vitest';

const state: any = { transaction: null, subscription: null, user: undefined, fetchResponse: { ok: true, json: async () => ({ status: true, data: { status: 'success', reference: 'ref1' } }) } };

vi.mock('../db/prisma', () => ({
  default: {
    paymentTransaction: { findUnique: async () => state.transaction, update: vi.fn(async () => ({})), create: vi.fn(async () => ({})) },
    subscription: { findUnique: async () => state.subscription, upsert: vi.fn(async () => ({})), update: vi.fn(async () => ({})) },
    organization: { findUnique: async () => ({ id: 'org1' }), update: vi.fn(async () => ({})) },
    $transaction: vi.fn(async (ops: any) => Promise.all(ops)),
  },
  prisma: {
    paymentTransaction: { findUnique: async () => state.transaction, update: vi.fn(async () => ({})), create: vi.fn(async () => ({})) },
    subscription: { findUnique: async () => state.subscription, upsert: vi.fn(async () => ({})), update: vi.fn(async () => ({})) },
    organization: { findUnique: async () => ({ id: 'org1' }), update: vi.fn(async () => ({})) },
    $transaction: vi.fn(async (ops: any) => Promise.all(ops)),
  },
}));
vi.mock('../config/env', () => ({ env: { PAYSTACK_SECRET_KEY: 'sk_test_x', PAYSTACK_PUBLIC_KEY: 'pk_test_x', FRONTEND_URL: 'http://localhost:3001', NODE_ENV: 'test', RATE_LIMIT_WINDOW_MS: 60000, RATE_LIMIT_MAX: 100 } }));
vi.mock('../middleware/auth', () => ({ authenticate: async (req: any) => { req.user = state.user || undefined; }, requireAuth: (req: any, reply: any, done: any) => { if (!req.user) { reply.code(401).send({ error: 'Authentication required' }); return; } done(); }, requireOrganizationRole: () => (req: any, reply: any, done: any) => { if (!req.user) { reply.code(401).send({ error: 'Authentication required' }); return; } const orgId = req.body?.organizationId || req.params?.organizationId; const isMember = req.user.isPlatformAdmin || req.user.memberships.some((m: any) => m.organizationId === orgId); if (!isMember) { reply.code(403).send({ error: 'Organization access required' }); return; } done(); } }));
vi.mock('../middleware/rateLimit', () => ({ apiRateLimiter: async () => {} }));

import Fastify from 'fastify';
import { subscriptionRoutes } from './subscriptions';

async function app() {
  const a = Fastify();
  // Mirror the production wiring: authentication is a global preHandler hook
  // (see backend/src/index.ts), so request.user is populated for every route.
  a.addHook('preHandler', async (req: any) => {
    req.user = state.user || undefined;
  });
  await subscriptionRoutes(a);
  await a.ready();
  return a;
}

describe('Phase 9 subscriptions', () => {
  beforeEach(() => {
    state.transaction = null;
    state.subscription = null;
    state.user = undefined;
    globalThis.fetch = (async () => state.fetchResponse) as any;
    (state.fetchResponse as any).json = state.fetchResponse.json;
  });

  it('plans returns prices', async () => {
    const r = await (await app()).inject({ method: 'GET', url: '/api/subscriptions/plans' });
    expect(r.statusCode).toBe(200);
    const plans = r.json().plans;
    const byPlan: any = Object.fromEntries(plans.map((p: any) => [p.plan, p.priceMonthlyNaira]));
    expect(byPlan.supporter).toBe(0);
    expect(byPlan.candidate).toBe(9900);
    expect(byPlan.campaign_pro).toBe(29900);
    expect(byPlan.state).toBe(149000);
    const national = plans.find((p: any) => p.plan === 'national');
    expect(national.priceYearlyNaira).toBe(5000000);
  });

  it('webhook other event returns 200 no change', async () => {
    const r = await (await app()).inject({ method: 'POST', url: '/api/subscriptions/webhook', payload: { event: 'charge.failed', data: { reference: 'ref1', status: 'failed', amount: 100, currency: 'NGN' } } });
    expect(r.statusCode).toBe(200);
  });

  it('webhook malformed returns 400', async () => {
    const r = await (await app()).inject({ method: 'POST', url: '/api/subscriptions/webhook', payload: { event: 'charge.success' } });
    expect(r.statusCode).toBe(400);
  });

  it('webhook unknown reference returns 404', async () => {
    state.transaction = null;
    const r = await (await app()).inject({ method: 'POST', url: '/api/subscriptions/webhook', payload: { event: 'charge.success', data: { reference: 'nope', status: 'success', amount: 100, currency: 'NGN' } } });
    expect(r.statusCode).toBe(404);
  });

  it('webhook already success is idempotent', async () => {
    state.transaction = { id: 't1', reference: 'ref1', status: 'success', organizationId: 'org1', interval: 'monthly', plan: 'candidate' };
    const fetchSpy = vi.fn();
    globalThis.fetch = fetchSpy as any;
    const r = await (await app()).inject({ method: 'POST', url: '/api/subscriptions/webhook', payload: { event: 'charge.success', data: { reference: 'ref1', status: 'success', amount: 100, currency: 'NGN' } } });
    expect(r.statusCode).toBe(200);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('webhook paystack status false returns 400', async () => {
    state.transaction = { id: 't1', reference: 'ref1', status: 'pending', organizationId: 'org1', interval: 'monthly', plan: 'candidate' };
    globalThis.fetch = (async () => ({ ok: true, json: async () => ({ status: false }) })) as any;
    const r = await (await app()).inject({ method: 'POST', url: '/api/subscriptions/webhook', payload: { event: 'charge.success', data: { reference: 'ref1', status: 'success', amount: 100, currency: 'NGN' } } });
    expect(r.statusCode).toBe(400);
  });

  it('webhook success calls updates once', async () => {
    state.transaction = { id: 't1', reference: 'ref1', status: 'pending', organizationId: 'org1', interval: 'monthly', plan: 'candidate' };
    globalThis.fetch = (async () => ({ ok: true, json: async () => ({ status: true, data: { status: 'success', reference: 'ref1' } }) })) as any;
    const prismaMod: any = (await import('../db/prisma.js')).default;
    prismaMod.paymentTransaction.update.mockClear();
    prismaMod.subscription.upsert.mockClear();
    prismaMod.organization.update.mockClear();
    const r = await (await app()).inject({ method: 'POST', url: '/api/subscriptions/webhook', payload: { event: 'charge.success', data: { reference: 'ref1', status: 'success', amount: 100, currency: 'NGN' } } });
    expect(r.statusCode).toBe(200);
    expect(prismaMod.paymentTransaction.update).toHaveBeenCalledTimes(1);
    expect(prismaMod.subscription.upsert).toHaveBeenCalledTimes(1);
    expect(prismaMod.organization.update).toHaveBeenCalledTimes(1);
  });

  it('webhook reference mismatch returns 400', async () => {
    state.transaction = { id: 't1', reference: 'ref1', status: 'pending', organizationId: 'org1', interval: 'monthly', plan: 'candidate' };
    globalThis.fetch = (async () => ({ ok: true, json: async () => ({ status: true, data: { status: 'success', reference: 'other' } }) })) as any;
    const r = await (await app()).inject({ method: 'POST', url: '/api/subscriptions/webhook', payload: { event: 'charge.success', data: { reference: 'ref1', status: 'success', amount: 100, currency: 'NGN' } } });
    expect(r.statusCode).toBe(400);
  });

  it('cancel without auth returns 401', async () => {
    const r = await (await app()).inject({ method: 'POST', url: '/api/subscriptions/cancel', payload: { organizationId: 'org1' } });
    expect(r.statusCode).toBe(401);
  });

  it('cancel no subscription returns 404', async () => {
    state.user = { id: 'u1', memberships: [{ organizationId: 'org1', role: 'org_admin' }], isPlatformAdmin: false };
    state.subscription = null;
    const r = await (await app()).inject({ method: 'POST', url: '/api/subscriptions/cancel', payload: { organizationId: 'org1' }, headers: { authorization: 'Bearer x' } });
    expect(r.statusCode).toBe(404);
  });

  it('cancel non-member returns 403', async () => {
    state.user = { id: 'u2', memberships: [], isPlatformAdmin: false };
    const r = await (await app()).inject({ method: 'POST', url: '/api/subscriptions/cancel', payload: { organizationId: 'org1' }, headers: { authorization: 'Bearer x' } });
    expect(r.statusCode).toBe(403);
  });
});
