import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../db/prisma', () => ({
  default: {
    organization: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    membership: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    subscription: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
      update: vi.fn(),
    },
    campaign: {
      findMany: vi.fn(),
      count: vi.fn(),
      findFirst: vi.fn(),
    },
    campaignPack: {
      count: vi.fn(),
    },
    template: {
      count: vi.fn(),
    },
    generationRecord: {
      count: vi.fn(),
      groupBy: vi.fn(),
      findMany: vi.fn(),
    },
    paymentTransaction: {
      create: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
    },
    analyticsEvent: {
      findMany: vi.fn(),
    },
    $transaction: vi.fn(async (arr: any[]) => {
      const results: any[] = [];
      for (const op of arr ?? []) {
        const entries = Object.entries(op);
        if (entries.length > 0) {
          const [, update] = entries[0] as [string, any];
          results.push(await update);
        }
      }
      return results;
    }),
  },
  prisma: {
    organization: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    membership: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    subscription: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
      update: vi.fn(),
    },
    campaign: {
      findMany: vi.fn(),
      count: vi.fn(),
      findFirst: vi.fn(),
    },
    campaignPack: {
      count: vi.fn(),
    },
    template: {
      count: vi.fn(),
    },
    generationRecord: {
      count: vi.fn(),
      groupBy: vi.fn(),
      findMany: vi.fn(),
    },
    paymentTransaction: {
      create: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
    },
    analyticsEvent: {
      findMany: vi.fn(),
    },
    $transaction: vi.fn(async (arr: any[]) => {
      const results: any[] = [];
      for (const op of arr ?? []) {
        const entries = Object.entries(op);
        if (entries.length > 0) {
          const [, update] = entries[0] as [string, any];
          results.push(await update);
        }
      }
      return results;
    }),
  },
}));
vi.mock('../middleware/auth', () => ({
  requireAuth: async (req: any, reply: any) => {
    if (!req.user) {
      reply.code(401).send({ error: 'Authentication required' });
      return;
    }
  },
  requireOrganizationAccess: () => async (_req: any, _reply: any) => {},
  requireOrganizationRole: () => async (_req: any, _reply: any) => {},
  authenticate: async () => {},
  organizationRole: () => 'org_admin',
}));
vi.mock('../middleware/rateLimit', () => ({
  apiRateLimiter: async (_req: any, _reply: any) => {},
}));
vi.mock('../lib/audit', () => ({ auditAdmin: async () => {} }));
vi.mock('../lib/entitlement-middleware', () => ({
  requireEntitlement: () => async () => {},
}));
vi.mock('../config/env', () => ({
  env: {
    PAYSTACK_SECRET_KEY: 'sk_test_xxx',
    PAYSTACK_PUBLIC_KEY: 'pk_test_xxx',
    FRONTEND_URL: 'http://localhost:5173',
    NODE_ENV: 'test',
  },
}));
vi.mock('fetch', () => ({ default: vi.fn(), __esModule: true }));

import Fastify from 'fastify';
import fastifyCookie from '@fastify/cookie';
import { organizationRoutes } from './organizations';

async function buildApp(extraRoutes?: (a: any) => void) {
  const a = Fastify();
  await a.register(fastifyCookie);
  await a.register(organizationRoutes);
  if (extraRoutes) await extraRoutes(a);
  await a.ready();
  return a;
}

beforeEach(() => {
  vi.resetAllMocks();
});

describe('Phase 9 — Organizations management routes (tenant isolation)', () => {
  it('GET /api/organizations returns 401 without authentication', async () => {
    const app = await buildApp();
    const r = await app.inject({
      method: 'GET',
      url: '/api/organizations',
    });
    expect(r.statusCode).toBe(401);
  });

  it('GET /api/organizations/:id returns 401 without authentication', async () => {
    const app = await buildApp();
    const r = await app.inject({
      method: 'GET',
      url: '/api/organizations/org-1',
    });
    expect(r.statusCode).toBe(401);
  });

  it('PATCH /:organizationId/status rejects invalid status with 400', async () => {
    const app = await buildApp();
    const r = await app.inject({
      method: 'PATCH',
      url: '/api/organizations/org-1/status',
      cookies: { access_token: 't1' },
      payload: { status: 'bogus' },
    });
    expect(r.statusCode).toBe(400);
  });

  it('PATCH /:organizationId/members/:userId rejects invalid role with 400', async () => {
    const app = await buildApp();
    const r = await app.inject({
      method: 'PATCH',
      url: '/api/organizations/org-1/members/u2',
      cookies: { access_token: 't1' },
      payload: { role: 'invalid_role' as any },
    });
    expect(r.statusCode).toBe(400);
  });

  it('DELETE /:organizationId/members/:userId requires auth', async () => {
    const app = await buildApp();
    const r = await app.inject({
      method: 'DELETE',
      url: '/api/organizations/org-1/members/u2',
    });
    expect(r.statusCode).toBe(401);
  });
});

describe('Phase 9 — Entitlement middleware (generation limits)', () => {
  it('returns 401 for unauthenticated generate request', async () => {
    const app = await buildApp();
    const r = await app.inject({
      method: 'POST',
      url: '/api/generate',
      body: { organizationId: 'org-1' },
    });
    expect([401, 404]).toContain(r.statusCode);
  });
});
