import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Tenant isolation is enforced with the real authentication and authorization
 * middleware (only Prisma and the identity provider are mocked), so these
 * tests prove that one campaign organization cannot read or modify another
 * organization's protected resources.
 */

const state: any = {
  memberships: [] as any[],
  organizations: [] as any[],
  campaigns: [] as any[],
  members: [] as any[],
  tokens: {} as Record<string, any>,
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
      findMany: vi.fn(async ({ where }: any) =>
        state.memberships.filter((m: any) => m.userId === where.userId)
      ),
      findUnique: vi.fn(async () => null),
      create: vi.fn(async ({ data }: any) => ({ id: 'm-new', ...data })),
      update: vi.fn(async ({ data }: any) => ({ id: 'm-1', ...data })),
      delete: vi.fn(async () => ({})),
    },
    organization: {
      findUnique: vi.fn(async ({ where }: any) =>
        state.organizations.find((o: any) => o.id === where.id) ?? null
      ),
      findMany: vi.fn(async () => state.organizations),
      create: vi.fn(async ({ data }: any) => ({ id: 'org-new', ...data })),
      update: vi.fn(async ({ where, data }: any) => ({
        ...state.organizations.find((o: any) => o.id === where.id),
        ...data,
      })),
      delete: vi.fn(async () => ({})),
    },
    campaign: {
      findMany: vi.fn(async () => state.campaigns),
      count: vi.fn(async () => state.campaigns.length),
      findFirst: vi.fn(async () => null),
      findUnique: vi.fn(async () => null),
      create: vi.fn(async ({ data }: any) => ({
        id: 'camp-new',
        ...data,
        createdAt: new Date('2026-01-02T00:00:00Z'),
        updatedAt: new Date('2026-01-02T00:00:00Z'),
      })),
    },
    campaignPack: { count: vi.fn(async () => 0) },
    template: { count: vi.fn(async () => 0) },
    generationRecord: {
      count: vi.fn(async () => 0),
      groupBy: vi.fn(async () => []),
      findMany: vi.fn(async () => []),
    },
    paymentTransaction: {
      create: vi.fn(async ({ data }: any) => ({ id: 'p-1', ...data })),
      findUnique: vi.fn(async () => null),
      findMany: vi.fn(async () => []),
      update: vi.fn(async ({ data }: any) => ({ id: 'p-1', ...data })),
    },
    analyticsEvent: { findMany: vi.fn(async () => []) },
    subscription: {
      findUnique: vi.fn(async () => null),
      upsert: vi.fn(async ({ data }: any) => ({ id: 's-1', ...data })),
      update: vi.fn(async ({ data }: any) => ({ id: 's-1', ...data })),
    },
  },
}));

vi.mock('../middleware/rateLimit', () => ({
  apiRateLimiter: async () => {},
}));

vi.mock('../lib/audit', () => ({ auditAdmin: async () => {} }));

vi.mock('../config/env', () => ({
  env: {
    NODE_ENV: 'test',
    FRONTEND_URL: 'http://localhost:5173',
    ADMIN_EMAILS: [],
    PAYSTACK_SECRET_KEY: 'sk_test_x',
    PAYSTACK_PUBLIC_KEY: 'pk_test_x',
  },
}));

import Fastify from 'fastify';
import fastifyCookie from '@fastify/cookie';
import { organizationRoutes } from './organizations';

const ORG_A = {
  id: 'org-a',
  name: 'Campaign A',
  slug: 'campaign-a',
  plan: 'campaign_pro',
  status: 'active',
  ownerId: 'user-a',
  settings: null,
  campaigns: [] as any[],
  packs: [] as any[],
  subscription: null,
  memberships: [] as any[],
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-01-01T00:00:00Z'),
};

const ORG_B = {
  ...ORG_A,
  id: 'org-b',
  name: 'Campaign B',
  slug: 'campaign-b',
  ownerId: 'user-b',
};

async function buildApp() {
  const app = Fastify();
  await app.register(fastifyCookie);
  // Mirror the production wiring: a global authentication hook populates
  // request.user before the route guards run.
  const { authenticate } = await import('../middleware/auth.js');
  app.addHook('preHandler', authenticate);
  await organizationRoutes(app);
  await app.ready();
  return app;
}

function authHeaders(token: string) {
  return { cookie: `access_token=${token}` };
}

beforeEach(() => {
  state.memberships = [];
  state.organizations = [ORG_A, ORG_B];
  state.campaigns = [];
  state.tokens = {};
  vi.clearAllMocks();
});

describe('Phase 9 — tenant isolation between organizations', () => {
  it('rejects unauthenticated organization access', async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: 'GET',
      url: '/api/organizations/org-a',
    });
    expect(response.statusCode).toBe(401);
  });

  it('allows a member to read their own organization', async () => {
    state.tokens['token-a'] = {
      id: 'user-a',
      email: 'a@example.com',
      email_confirmed_at: '2026-01-01T00:00:00Z',
    };
    state.memberships = [{ userId: 'user-a', organizationId: 'org-a', role: 'org_admin' }];

    const app = await buildApp();
    const response = await app.inject({
      method: 'GET',
      url: '/api/organizations/org-a',
      headers: authHeaders('token-a'),
    });
    expect(response.statusCode).toBe(200);
  });

  it('blocks a member from reading another organization', async () => {
    state.tokens['token-a'] = {
      id: 'user-a',
      email: 'a@example.com',
      email_confirmed_at: '2026-01-01T00:00:00Z',
    };
    state.memberships = [{ userId: 'user-a', organizationId: 'org-a', role: 'org_admin' }];

    const app = await buildApp();
    const response = await app.inject({
      method: 'GET',
      url: '/api/organizations/org-b',
      headers: authHeaders('token-a'),
    });
    expect(response.statusCode).toBe(403);
  });

  it('blocks access to the members list of another organization', async () => {
    state.tokens['token-a'] = {
      id: 'user-a',
      email: 'a@example.com',
      email_confirmed_at: '2026-01-01T00:00:00Z',
    };
    state.memberships = [{ userId: 'user-a', organizationId: 'org-a', role: 'org_admin' }];

    const app = await buildApp();
    const response = await app.inject({
      method: 'GET',
      url: '/api/organizations/org-b/members',
      headers: authHeaders('token-a'),
    });
    expect(response.statusCode).toBe(403);
  });

  it('blocks the dashboard of another organization', async () => {
    state.tokens['token-a'] = {
      id: 'user-a',
      email: 'a@example.com',
      email_confirmed_at: '2026-01-01T00:00:00Z',
    };
    state.memberships = [{ userId: 'user-a', organizationId: 'org-a', role: 'org_admin' }];

    const app = await buildApp();
    const response = await app.inject({
      method: 'GET',
      url: '/api/organizations/org-b/dashboard',
      headers: authHeaders('token-a'),
    });
    expect(response.statusCode).toBe(403);
  });

  it('blocks a member from removing a member of another organization', async () => {
    state.tokens['token-a'] = {
      id: 'user-a',
      email: 'a@example.com',
      email_confirmed_at: '2026-01-01T00:00:00Z',
    };
    state.memberships = [{ userId: 'user-a', organizationId: 'org-a', role: 'org_admin' }];

    const app = await buildApp();
    const response = await app.inject({
      method: 'DELETE',
      url: '/api/organizations/org-b/members/user-x',
      headers: authHeaders('token-a'),
    });
    expect(response.statusCode).toBe(403);
  });

  it('blocks a member from creating campaigns in another organization', async () => {
    state.tokens['token-a'] = {
      id: 'user-a',
      email: 'a@example.com',
      email_confirmed_at: '2026-01-01T00:00:00Z',
    };
    state.memberships = [{ userId: 'user-a', organizationId: 'org-a', role: 'org_admin' }];

    const app = await buildApp();
    const response = await app.inject({
      method: 'POST',
      url: '/api/organizations/org-b/campaigns',
      headers: authHeaders('token-a'),
      payload: { name: 'Injected campaign', slug: 'injected' },
    });
    expect(response.statusCode).toBe(403);
  });

  it('blocks a read-only analyst from performing organization writes', async () => {
    state.tokens['token-analyst'] = {
      id: 'user-analyst',
      email: 'analyst@example.com',
      email_confirmed_at: '2026-01-01T00:00:00Z',
    };
    state.memberships = [
      { userId: 'user-analyst', organizationId: 'org-a', role: 'analyst' },
    ];

    const app = await buildApp();
    const response = await app.inject({
      method: 'POST',
      url: '/api/organizations/org-a/campaigns',
      headers: authHeaders('token-analyst'),
      payload: { name: 'Campaign', slug: 'campaign' },
    });
    expect(response.statusCode).toBe(403);
  });

  it('allows a campaign manager to create campaigns in their own organization', async () => {
    state.tokens['token-manager'] = {
      id: 'user-manager',
      email: 'manager@example.com',
      email_confirmed_at: '2026-01-01T00:00:00Z',
    };
    state.memberships = [
      { userId: 'user-manager', organizationId: 'org-a', role: 'campaign_manager' },
    ];

    const app = await buildApp();
    const response = await app.inject({
      method: 'POST',
      url: '/api/organizations/org-a/campaigns',
      headers: authHeaders('token-manager'),
      payload: { name: 'Campaign', slug: 'campaign' },
    });
    expect(response.statusCode).toBe(201);
  });

  it('allows a platform administrator to reach any organization', async () => {
    state.tokens['token-admin'] = {
      id: 'user-admin',
      email: 'admin@example.com',
      email_confirmed_at: '2026-01-01T00:00:00Z',
    };
    state.memberships = [
      { userId: 'user-admin', organizationId: 'org-x', role: 'platform_admin' },
    ];

    const app = await buildApp();
    const response = await app.inject({
      method: 'GET',
      url: '/api/organizations/org-b',
      headers: authHeaders('token-admin'),
    });
    expect(response.statusCode).toBe(200);
  });
});
