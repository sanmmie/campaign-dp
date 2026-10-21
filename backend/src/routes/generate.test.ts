import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const state: any = {
  packs: new Map<string, any>(),
  templates: new Map<string, any>(),
  createdGenerations: [] as any[],
  campaignOwner: new Map<string, string>(),
};

vi.mock('../db/prisma', () => ({
  default: {
    generationRecord: {
      create: vi.fn(async ({ data }: any) => {
        state.createdGenerations.push(data);
        return { id: 'gen-1', ...data };
      }),
      count: vi.fn(async () => 0),
    },
    campaign: {
      findFirst: vi.fn(async ({ where }: any) => {
        const owner = state.campaignOwner.get(where.id);
        if (!owner || owner !== where.organizationId) return null;
        return { id: where.id };
      }),
    },
    project: {
      findUnique: vi.fn(async () => null),
    },
    organization: {
      findUnique: vi.fn(async ({ where }: any) => {
        if (where.id === 'org-1' || where.id === 'org-2') {
          return {
            id: where.id,
            plan: 'state',
            subscription: null,
            _count: { generations: 0 },
          };
        }
        return null;
      }),
    },
    rateLimitBucket: {
      findUnique: vi.fn(async () => null),
      upsert: vi.fn(async ({ create }: any) => create),
      update: vi.fn(async ({ create }: any) => create),
    },
  },
}));

vi.mock('../services/campaignPack', () => ({
  getCampaignPack: vi.fn(async (packId?: string) => state.packs.get(packId ?? 'pack-1') ?? null),
  getTemplateById: vi.fn(async (templateId: string, version?: number) => {
    const template = state.templates.get(templateId);
    if (!template) return null;
    if (version && template.version !== version) return null;
    return template;
  }),
}));

vi.mock('../services/templateRenderer', () => ({
  renderTemplate: vi.fn(async () => Buffer.from('rendered-image')),
  renderPreview: vi.fn(async () => Buffer.from('preview-image')),
}));

vi.mock('../services/storage', () => ({
  uploadGeneratedImage: vi.fn(async () => ({
    url: 'https://cdn.example.com/generated.png',
    path: 'generations/project-1/image.png',
  })),
  createSignedUrl: vi.fn(async () => 'https://cdn.example.com/signed.png'),
}));

vi.mock('../middleware/auth', () => ({
  authenticate: async (request: any) => {
    if (request.headers['x-test-user']) {
      request.user = JSON.parse(String(request.headers['x-test-user']));
    }
  },
  requireAuth: async () => {},
}));

vi.mock('../middleware/rateLimit', () => ({
  apiRateLimiter: async () => {},
  generateRateLimiter: async () => {},
  uploadRateLimiter: async () => {},
  msUntilEndOfMonth: () => 30 * 24 * 60 * 60 * 1000,
  rateLimit: async () => true,
}));

vi.mock('../config/env', () => ({
  env: {
    NODE_ENV: 'test',
    FRONTEND_URL: 'http://localhost:5173',
    UPLOAD_MAX_BYTES: 10485760,
    UPLOAD_MAX_PIXELS: 40000000,
    STORAGE_BUCKET: 'bucket',
    CAMPAIGN_PACK_ID: 'pack-1',
  },
}));

import Fastify from 'fastify';
import { generateRoutes } from './generate';

const PACK = {
  id: 'pack-1',
  name: 'Renewed Hope',
  disclaimer: 'Not an official communication.',
  brand: { primary: '#111111', secondary: '#222222', accent: '#333333' },
  assets: { candidatePortrait: [], backgroundTextures: [] },
  templates: [{ id: 'tpl-1', versions: [] }],
  defaultCopy: { headline: 'H', subhead: 'S' },
  shareTargets: ['whatsapp'],
  authorizedBy: 'Someone',
  authorizationRef: 'REF-1',
  createdAt: new Date().toISOString(),
};

const TEMPLATE = {
  id: 'tpl-1',
  templateId: 'tpl-1',
  version: 1,
  name: 'Square DP',
  category: 'whatsapp-dp',
  canvas: { width: 1080, height: 1080 },
  photoZone: { x: 0, y: 0, width: 500, height: 500, shape: 'circle', locked: true },
  layers: [],
  isPublished: true,
  createdBy: 'admin',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

async function buildApp() {
  const app = Fastify();
  await generateRoutes(app);
  await app.ready();
  return app;
}

const generateBody = {
  templateId: 'tpl-1',
  templateVersion: 1,
  presetId: 'instagram-square',
  format: 'png',
  textValues: {},
};

beforeEach(() => {
  state.packs = new Map([['pack-1', PACK]]);
  state.templates = new Map([['tpl-1', TEMPLATE]]);
  state.createdGenerations = [];
  state.campaignOwner = new Map();
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('Phase 9 — template and pack validation', () => {
  it('returns 404 when the campaign pack is unknown', async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: 'POST',
      url: '/api/generate',
      payload: { ...generateBody, packId: 'pack-unknown' },
    });
    expect(response.statusCode).toBe(404);
    expect(response.json().error).toMatch(/pack not found/i);
  });

  it('returns 404 when the template is unknown', async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: 'POST',
      url: '/api/generate',
      payload: { ...generateBody, templateId: 'tpl-unknown' },
    });
    expect(response.statusCode).toBe(404);
    expect(response.json().error).toMatch(/template not found/i);
  });

  it('returns 400 when the template belongs to a different pack', async () => {
    state.packs.set('pack-1', { ...PACK, templates: [{ id: 'tpl-other', versions: [] }] });
    const app = await buildApp();
    const response = await app.inject({
      method: 'POST',
      url: '/api/generate',
      payload: generateBody,
    });
    expect(response.statusCode).toBe(400);
    expect(response.json().error).toMatch(/does not belong/i);
  });

  it('returns 400 for an unknown export preset', async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: 'POST',
      url: '/api/generate',
      payload: { ...generateBody, presetId: 'not-a-preset' },
    });
    expect(response.statusCode).toBe(400);
    expect(response.json().error).toMatch(/preset/i);
  });

  it('rejects a body that does not match the contract', async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: 'POST',
      url: '/api/generate',
      payload: { templateId: 'tpl-1', templateVersion: 0, presetId: 'instagram-square' },
    });
    expect(response.statusCode).toBe(400);
  });
});

describe('Phase 9 — SSRF protection on photo input', () => {
  it('does not fetch a photo from a private host', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const app = await buildApp();

    const response = await app.inject({
      method: 'POST',
      url: '/api/preview',
      payload: {
        templateId: 'tpl-1',
        templateVersion: 1,
        textValues: {},
        photoUrl: 'http://169.254.169.254/latest/meta-data/iam/security-credentials/',
      },
    });

    expect(response.statusCode).toBe(200);
    const calledUrls = fetchSpy.mock.calls.map((call) => String(call[0]));
    expect(calledUrls.some((url) => url.includes('169.254.169.254'))).toBe(false);
  });

  it('does not fetch a photo from a loopback host over http', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const app = await buildApp();

    await app.inject({
      method: 'POST',
      url: '/api/preview',
      payload: {
        templateId: 'tpl-1',
        templateVersion: 1,
        textValues: {},
        photoUrl: 'http://127.0.0.1:5432/secret',
      },
    });

    const calledUrls = fetchSpy.mock.calls.map((call) => String(call[0]));
    expect(calledUrls.some((url) => url.includes('127.0.0.1'))).toBe(false);
  });
});

describe('Phase 9 — generation attribution', () => {
  it('records the organization and campaign on the generation', async () => {
    state.campaignOwner.set('camp-1', 'org-1');
    const app = await buildApp();

    const response = await app.inject({
      method: 'POST',
      url: '/api/generate',
      headers: {
        'x-test-user': JSON.stringify({
          id: 'user-1',
          email: 'u@example.com',
          memberships: [{ organizationId: 'org-1', role: 'org_admin' }],
          isPlatformAdmin: false,
        }),
      },
      payload: {
        ...generateBody,
        organizationId: 'org-1',
        campaignId: 'camp-1',
      },
    });

    expect(response.statusCode).toBe(200);
    expect(state.createdGenerations).toHaveLength(1);
    expect(state.createdGenerations[0].organizationId).toBe('org-1');
    expect(state.createdGenerations[0].campaignId).toBe('camp-1');
    expect(state.createdGenerations[0].userId).toBe('user-1');
  });

  it('drops a campaign that belongs to another organization', async () => {
    state.campaignOwner.set('camp-other', 'org-2');
    const app = await buildApp();

    const response = await app.inject({
      method: 'POST',
      url: '/api/generate',
      headers: {
        'x-test-user': JSON.stringify({
          id: 'user-1',
          email: 'u@example.com',
          memberships: [{ organizationId: 'org-1', role: 'org_admin' }],
          isPlatformAdmin: false,
        }),
      },
      payload: {
        ...generateBody,
        organizationId: 'org-1',
        campaignId: 'camp-other',
      },
    });

    expect(response.statusCode).toBe(200);
    expect(state.createdGenerations[0].organizationId).toBe('org-1');
    expect(state.createdGenerations[0].campaignId).toBeNull();
  });

  it('records a guest generation without an organization', async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: 'POST',
      url: '/api/generate',
      payload: generateBody,
    });
    expect(response.statusCode).toBe(200);
    expect(state.createdGenerations[0].userId).toBeNull();
    expect(state.createdGenerations[0].organizationId).toBeNull();
  });

  it('returns the generation id and export dimensions', async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: 'POST',
      url: '/api/generate',
      payload: generateBody,
    });
    const body = response.json();
    expect(body.generationId).toBe('gen-1');
    expect(body.width).toBe(1080);
    expect(body.height).toBe(1080);
    expect(body.url).toBe('https://cdn.example.com/generated.png');
  });
});

describe('Phase 9 — export presets', () => {
  it('exposes the supported campaign formats', async () => {
    const app = await buildApp();
    const response = await app.inject({ method: 'GET', url: '/api/presets' });
    expect(response.statusCode).toBe(200);
    const ids = response.json().map((p: any) => p.id);
    expect(ids).toContain('whatsapp-dp');
    expect(ids).toContain('instagram-square');
    expect(ids).toContain('story');
    expect(ids).toContain('poster');
    expect(ids).toContain('printable-a4');
  });
});
