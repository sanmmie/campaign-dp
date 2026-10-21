import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Projects are user-scoped. These tests use the real session middleware so
 * that ownership is proven from the verified identity, not from a client
 * supplied id, and that a foreign project is indistinguishable from a
 * missing one.
 */

const state: any = {
  projects: [] as any[],
  tokens: {} as Record<string, any>,
  nextId: 1,
};

function makeProject(userId: string | null) {
  return {
    id: `p-${state.nextId++}`,
    userId,
    packId: 'pack-1',
    templateId: 'tpl-1',
    templateVersion: 1,
    templateSnapshot: '{}',
    photoUrl: null,
    photoTransform: null,
    textValues: '{}',
    editorState: '{}',
    exportSettings: '{}',
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
  };
}

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
    project: {
      findMany: vi.fn(async ({ where }: any) =>
        state.projects.filter((p: any) => p.userId === where.userId)
      ),
      count: vi.fn(async ({ where }: any) =>
        state.projects.filter((p: any) => p.userId === where.userId).length
      ),
      findUnique: vi.fn(async ({ where }: any) =>
        state.projects.find((p: any) => p.id === where.id) ?? null
      ),
      create: vi.fn(async ({ data }: any) => {
        const project = makeProject(data.userId ?? null);
        Object.assign(project, data);
        state.projects.push(project);
        return project;
      }),
      update: vi.fn(async ({ where, data }: any) => {
        const project = state.projects.find((p: any) => p.id === where.id);
        if (!project) return null;
        Object.assign(project, data);
        return project;
      }),
      delete: vi.fn(async ({ where }: any) => {
        const index = state.projects.findIndex((p: any) => p.id === where.id);
        if (index >= 0) state.projects.splice(index, 1);
        return {};
      }),
    },
  },
}));

vi.mock('../middleware/rateLimit', () => ({
  apiRateLimiter: async () => {},
}));

import Fastify from 'fastify';
import fastifyCookie from '@fastify/cookie';
import { projectRoutes } from './projects';

async function buildApp() {
  const app = Fastify();
  await app.register(fastifyCookie);
  const { authenticate } = await import('../middleware/auth.js');
  app.addHook('preHandler', authenticate);
  await projectRoutes(app);
  await app.ready();
  return app;
}

function authHeaders(token: string) {
  return { cookie: `access_token=${token}` };
}

const OWNER_TOKEN = 'owner-token';
const OTHER_TOKEN = 'other-token';

beforeEach(() => {
  state.projects = [];
  state.nextId = 1;
  state.tokens = {
    [OWNER_TOKEN]: {
      id: 'user-owner',
      email: 'owner@example.com',
      email_confirmed_at: '2026-01-01T00:00:00Z',
    },
    [OTHER_TOKEN]: {
      id: 'user-other',
      email: 'other@example.com',
      email_confirmed_at: '2026-01-01T00:00:00Z',
    },
  };
  vi.clearAllMocks();
});

describe('Phase 9 — project ownership isolation', () => {
  it('stores the session user as the project owner', async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: 'POST',
      url: '/api/projects',
      headers: authHeaders(OWNER_TOKEN),
      payload: {
        packId: 'pack-1',
        templateId: 'tpl-1',
        templateVersion: 1,
        templateSnapshot: { name: 'Template' },
        userId: 'user-other',
      },
    });

    expect(response.statusCode).toBe(201);
    expect(response.json().userId).toBe('user-owner');
  });

  it('stores a null owner for guest projects', async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: 'POST',
      url: '/api/projects',
      payload: {
        packId: 'pack-1',
        templateId: 'tpl-1',
        templateVersion: 1,
        templateSnapshot: { name: 'Template' },
      },
    });

    expect(response.statusCode).toBe(201);
    expect(response.json().userId).toBeNull();
  });

  it('does not reveal another user project', async () => {
    const owner = makeProject('user-owner');
    state.projects.push(owner);

    const app = await buildApp();
    const response = await app.inject({
      method: 'GET',
      url: `/api/projects/${owner.id}`,
      headers: authHeaders(OTHER_TOKEN),
    });

    expect(response.statusCode).toBe(404);
  });

  it('does not reveal a project to an anonymous visitor', async () => {
    const owner = makeProject('user-owner');
    state.projects.push(owner);

    const app = await buildApp();
    const response = await app.inject({
      method: 'GET',
      url: `/api/projects/${owner.id}`,
    });

    expect(response.statusCode).toBe(404);
  });

  it('blocks updates to another user project', async () => {
    const owner = makeProject('user-owner');
    state.projects.push(owner);

    const app = await buildApp();
    const response = await app.inject({
      method: 'PUT',
      url: `/api/projects/${owner.id}`,
      headers: authHeaders(OTHER_TOKEN),
      payload: { textValues: { headline: 'Hijacked' } },
    });

    expect(response.statusCode).toBe(404);
    expect(state.projects[0].textValues).toBe('{}');
  });

  it('blocks deletion of another user project', async () => {
    const owner = makeProject('user-owner');
    state.projects.push(owner);

    const app = await buildApp();
    const response = await app.inject({
      method: 'DELETE',
      url: `/api/projects/${owner.id}`,
      headers: authHeaders(OTHER_TOKEN),
    });

    expect(response.statusCode).toBe(404);
    expect(state.projects).toHaveLength(1);
  });

  it('blocks duplication of another user project', async () => {
    const owner = makeProject('user-owner');
    state.projects.push(owner);

    const app = await buildApp();
    const response = await app.inject({
      method: 'POST',
      url: `/api/projects/${owner.id}/duplicate`,
      headers: authHeaders(OTHER_TOKEN),
    });

    expect(response.statusCode).toBe(404);
    expect(state.projects).toHaveLength(1);
  });

  it('lists only the projects of the session user', async () => {
    state.projects.push(makeProject('user-owner'), makeProject('user-other'));

    const app = await buildApp();
    const response = await app.inject({
      method: 'GET',
      url: '/api/projects',
      headers: authHeaders(OWNER_TOKEN),
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.total).toBe(1);
    expect(body.projects).toHaveLength(1);
    expect(body.projects[0].userId).toBe('user-owner');
  });

  it('lists only guest projects for anonymous visitors', async () => {
    state.projects.push(makeProject(null), makeProject('user-owner'));

    const app = await buildApp();
    const response = await app.inject({
      method: 'GET',
      url: '/api/projects',
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.total).toBe(1);
    expect(body.projects[0].userId).toBeNull();
  });

  it('lets the owner read and update their own project', async () => {
    const owner = makeProject('user-owner');
    state.projects.push(owner);

    const app = await buildApp();

    const read = await app.inject({
      method: 'GET',
      url: `/api/projects/${owner.id}`,
      headers: authHeaders(OWNER_TOKEN),
    });
    expect(read.statusCode).toBe(200);

    const update = await app.inject({
      method: 'PUT',
      url: `/api/projects/${owner.id}`,
      headers: authHeaders(OWNER_TOKEN),
      payload: { textValues: { headline: 'Updated' } },
    });
    expect(update.statusCode).toBe(200);
    expect(state.projects[0].textValues).toBe(JSON.stringify({ headline: 'Updated' }));
  });
});
