import { describe, it, expect, vi, beforeEach } from 'vitest';

const state: any = {
  buckets: new Map<string, { count: number; resetAt: Date }>(),
  organizations: new Map<string, any>(),
  userGenerationCount: 0,
  projects: new Map<string, any>(),
};

vi.mock('../db/prisma', () => ({
  default: {
    rateLimitBucket: {
      findUnique: vi.fn(async ({ where }: any) => {
        const bucket = state.buckets.get(where.key);
        return bucket ? { key: where.key, ...bucket } : null;
      }),
      upsert: vi.fn(async ({ where, create }: any) => {
        const bucket = { key: where.key, ...create };
        state.buckets.set(where.key, { count: bucket.count, resetAt: bucket.resetAt });
        return { key: where.key, ...bucket };
      }),
      update: vi.fn(async ({ where, data }: any) => {
        const existing = state.buckets.get(where.key);
        const count = (existing?.count ?? 0) + (data.count?.increment ?? 0);
        const resetAt = data.resetAt ?? existing?.resetAt ?? new Date();
        state.buckets.set(where.key, { count, resetAt });
        return { key: where.key, count, resetAt };
      }),
    },
    organization: {
      findUnique: vi.fn(async ({ where }: any) => state.organizations.get(where.id) ?? null),
    },
    generationRecord: {
      count: vi.fn(async () => state.userGenerationCount),
      create: vi.fn(async () => ({ id: 'gen-1' })),
    },
    project: {
      findUnique: vi.fn(async ({ where }: any) => state.projects.get(where.id) ?? null),
    },
  },
}));

vi.mock('../config/env', () => ({
  env: {
    NODE_ENV: 'test',
    RATE_LIMIT_WINDOW_MS: 60000,
    RATE_LIMIT_MAX: 100,
  },
}));

import Fastify from 'fastify';
import { requireEntitlement, resolveGenerationContext } from './entitlement-middleware';
import { TIER_ENTITLEMENTS, getTierEntitlements, isLimitUnlimited, formatNaira } from './entitlements';

function buildApp() {
  const app = Fastify();
  app.decorateRequest('user', null);
  app.addHook('preHandler', async (request: any) => {
    if (request.headers['x-test-user']) {
      request.user = JSON.parse(String(request.headers['x-test-user']));
    }
  });
  app.post('/generate', { preHandler: [requireEntitlement({ action: 'generation' })] }, async () => ({
    ok: true,
  }));
  return app;
}

const memberUser = {
  id: 'user-1',
  email: 'member@example.com',
  memberships: [{ organizationId: 'org-a', role: 'org_admin' }],
  isPlatformAdmin: false,
};

const multiOrgUser = {
  id: 'user-2',
  email: 'multi@example.com',
  memberships: [
    { organizationId: 'org-a', role: 'org_admin' },
    { organizationId: 'org-b', role: 'analyst' },
  ],
  isPlatformAdmin: false,
};

const soloUser = {
  id: 'user-3',
  email: 'solo@example.com',
  memberships: [],
  isPlatformAdmin: false,
};

beforeEach(() => {
  state.buckets = new Map();
  state.organizations = new Map();
  state.userGenerationCount = 0;
  state.projects = new Map();
  vi.clearAllMocks();
});

describe('Phase 9 — tier entitlements', () => {
  it('exposes the pricing hypothesis with the documented limits', () => {
    expect(TIER_ENTITLEMENTS.supporter.priceMonthlyNaira).toBe(0);
    expect(TIER_ENTITLEMENTS.supporter.generationLimitPerMonth).toBe(10);
    expect(TIER_ENTITLEMENTS.candidate.priceMonthlyNaira).toBe(9900);
    expect(TIER_ENTITLEMENTS.campaign_pro.priceMonthlyNaira).toBe(29900);
    expect(TIER_ENTITLEMENTS.state.priceMonthlyNaira).toBe(149000);
    expect(TIER_ENTITLEMENTS.national.priceYearlyNaira).toBe(5000000);
  });

  it('falls back to the supporter tier for unknown plans', () => {
    expect(getTierEntitlements('does-not-exist').plan).toBe('supporter');
  });

  it('treats negative limits as unlimited', () => {
    expect(isLimitUnlimited(-1)).toBe(true);
    expect(isLimitUnlimited(10)).toBe(false);
  });

  it('formats naira amounts', () => {
    expect(formatNaira(29900)).toMatch(/29,900/);
  });
});

describe('Phase 9 — generation context resolution', () => {
  it('uses an explicit organizationId', async () => {
    const request: any = { body: { organizationId: 'org-a' }, params: {}, user: memberUser };
    const context = await resolveGenerationContext(request);
    expect(context).toMatchObject({ organizationId: 'org-a', basis: 'organization' });
  });

  it('inherits the organization from the referenced project', async () => {
    state.projects.set('proj-1', { organizationId: 'org-a', campaignId: 'camp-1' });
    const request: any = { body: { projectId: 'proj-1' }, params: {}, user: soloUser };
    const context = await resolveGenerationContext(request);
    expect(context).toMatchObject({
      organizationId: 'org-a',
      campaignId: 'camp-1',
      basis: 'organization',
    });
  });

  it('inherits the only membership of the user', async () => {
    const request: any = { body: {}, params: {}, user: memberUser };
    const context = await resolveGenerationContext(request);
    expect(context).toMatchObject({ organizationId: 'org-a', basis: 'organization' });
  });

  it('falls back to the personal allowance when the user has several organizations', async () => {
    const request: any = { body: {}, params: {}, user: multiOrgUser };
    const context = await resolveGenerationContext(request);
    expect(context).toMatchObject({ organizationId: null, basis: 'user' });
  });
});

describe('Phase 9 — entitlement enforcement', () => {
  it('allows a guest within the free monthly allowance', async () => {
    const app = await buildApp();
    const response = await app.inject({ method: 'POST', url: '/generate' });
    expect(response.statusCode).toBe(200);
  });

  it('blocks a guest once the monthly allowance is used up', async () => {
    const app = await buildApp();
    for (let i = 0; i < 10; i++) {
      const ok = await app.inject({ method: 'POST', url: '/generate' });
      expect(ok.statusCode).toBe(200);
    }
    const blocked = await app.inject({ method: 'POST', url: '/generate' });
    expect(blocked.statusCode).toBe(429);
    expect(blocked.json().error).toMatch(/too many requests/i);
  });

  it('blocks an unaffiliated signed-in user after the free allowance', async () => {
    state.userGenerationCount = 10;
    const app = await buildApp();
    const response = await app.inject({
      method: 'POST',
      url: '/generate',
      headers: { 'x-test-user': JSON.stringify(soloUser) },
    });
    expect(response.statusCode).toBe(403);
    expect(response.json().error).toMatch(/limit exceeded/i);
  });

  it('allows an unaffiliated signed-in user below the free allowance', async () => {
    state.userGenerationCount = 3;
    const app = await buildApp();
    const response = await app.inject({
      method: 'POST',
      url: '/generate',
      headers: { 'x-test-user': JSON.stringify(soloUser) },
    });
    expect(response.statusCode).toBe(200);
  });

  it('blocks a member whose organization reached its plan limit', async () => {
    state.organizations.set('org-a', {
      id: 'org-a',
      plan: 'candidate', // 100 generations per month
      subscription: null,
      _count: { generations: 100 },
    });

    const app = await buildApp();
    const response = await app.inject({
      method: 'POST',
      url: '/generate',
      headers: { 'x-test-user': JSON.stringify(memberUser) },
    });
    expect(response.statusCode).toBe(403);
    expect(response.json().plan).toBe('candidate');
  });

  it('allows a member below the organization plan limit', async () => {
    state.organizations.set('org-a', {
      id: 'org-a',
      plan: 'candidate',
      subscription: null,
      _count: { generations: 12 },
    });

    const app = await buildApp();
    const response = await app.inject({
      method: 'POST',
      url: '/generate',
      headers: { 'x-test-user': JSON.stringify(memberUser) },
    });
    expect(response.statusCode).toBe(200);
  });

  it('does not allow an organization limit to be bypassed by omitting organizationId', async () => {
    state.organizations.set('org-a', {
      id: 'org-a',
      plan: 'candidate',
      subscription: null,
      _count: { generations: 100 },
    });
    state.userGenerationCount = 0;

    const app = await buildApp();
    const response = await app.inject({
      method: 'POST',
      url: '/generate',
      headers: { 'x-test-user': JSON.stringify(memberUser) },
      payload: {},
    });
    expect(response.statusCode).toBe(403);
  });

  it('rejects a user who is not a member of the requested organization', async () => {
    state.organizations.set('org-b', {
      id: 'org-b',
      plan: 'state',
      subscription: null,
      _count: { generations: 0 },
    });

    const app = await buildApp();
    const response = await app.inject({
      method: 'POST',
      url: '/generate',
      headers: { 'x-test-user': JSON.stringify(memberUser) },
      payload: { organizationId: 'org-b' },
    });
    expect(response.statusCode).toBe(403);
    expect(response.json().error).toMatch(/organization access required/i);
  });

  it('returns 404 when the organization does not exist', async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: 'POST',
      url: '/generate',
      headers: {
        'x-test-user': JSON.stringify({
          ...memberUser,
          memberships: [{ organizationId: 'org-missing', role: 'org_admin' }],
        }),
      },
      payload: { organizationId: 'org-missing' },
    });
    expect(response.statusCode).toBe(404);
  });

  it('does not reveal whether a foreign organization exists', async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: 'POST',
      url: '/generate',
      headers: { 'x-test-user': JSON.stringify(memberUser) },
      payload: { organizationId: 'org-missing' },
    });
    expect(response.statusCode).toBe(403);
    expect(response.json().error).toMatch(/organization access required/i);
  });

  it('allows unlimited plans regardless of usage', async () => {
    state.organizations.set('org-a', {
      id: 'org-a',
      plan: 'national',
      subscription: null,
      _count: { generations: 100000 },
    });

    const app = await buildApp();
    const response = await app.inject({
      method: 'POST',
      url: '/generate',
      headers: { 'x-test-user': JSON.stringify(memberUser) },
    });
    expect(response.statusCode).toBe(200);
  });
});
