import { describe, it, expect, vi, beforeEach } from 'vitest';

const state: any = { generation: null, project: null, pack: { name: 'Pack', shareTargets: ['whatsapp'] }, signedUrl: 'https://signed.example/img.png', fetchResponse: { ok: true, buffer: Buffer.from('abc'), contentType: 'image/png' } };

vi.mock('../db/prisma', () => ({
  default: {
    generationRecord: { findUnique: async () => state.generation },
    project: { findUnique: async () => state.project },
  },
  prisma: {
    generationRecord: { findUnique: async () => state.generation },
    project: { findUnique: async () => state.project },
  },
}));
vi.mock('../services/storage', () => ({ createSignedUrl: async () => state.signedUrl }));
vi.mock('../services/campaignPack', () => ({ getCampaignPack: async () => state.pack }));
vi.mock('../middleware/auth', () => ({ authenticate: async (req: any) => { req.user = state.user || undefined; } }));
vi.mock('../middleware/rateLimit', () => ({ apiRateLimiter: async () => {} }));
vi.mock('../config/env', () => ({ env: { STORAGE_BUCKET: 'bucket', FRONTEND_URL: 'http://localhost:3001', NODE_ENV: 'test' } }));

import Fastify from 'fastify';
import fastifyCookie from '@fastify/cookie';
import { shareRoutes } from './share';

async function app() {
  const a = Fastify();
  await a.register(fastifyCookie);
  await shareRoutes(a);
  await a.ready();
  return a;
}

globalThis.fetch = (async () => ({
  ok: state.fetchResponse.ok,
  arrayBuffer: async () => state.fetchResponse.buffer,
  headers: { get: (_k: string) => state.fetchResponse.contentType },
})) as any;

describe('Phase 9 share', () => {
  beforeEach(() => {
    state.user = undefined;
    state.generation = { id: 'g1', userId: null, projectId: null, storagePath: 'p', format: 'png' };
    state.project = null;
    state.pack = { name: 'Pack', shareTargets: ['whatsapp'] };
    state.signedUrl = 'https://signed.example/img.png';
  });

  it('guest creates share intent', async () => {
    const r = await (await app()).inject({ method: 'POST', url: '/api/share', payload: { generationId: 'g1', presetId: 'p', platform: 'whatsapp' }, headers: { origin: 'http://localhost:3001' } });
    expect(r.statusCode).toBe(200);
    const b = r.json();
    expect(b.url).toBeTruthy();
    expect(b.intentUrl).toBeTruthy();
  });

  it('different user returns 404', async () => {
    state.user = { id: 'u2', memberships: [] };
    state.generation = { id: 'g1', userId: 'u1', projectId: null, storagePath: 'p', format: 'png' };
    const r = await (await app()).inject({ method: 'POST', url: '/api/share', payload: { generationId: 'g1', presetId: 'p', platform: 'whatsapp' } });
    expect(r.statusCode).toBe(404);
  });

  it('unknown generation returns 404', async () => {
    state.generation = null;
    const r = await (await app()).inject({ method: 'POST', url: '/api/share', payload: { generationId: 'nope', presetId: 'p', platform: 'whatsapp' } });
    expect(r.statusCode).toBe(404);
  });

  it('missing ids returns 400', async () => {
    const r = await (await app()).inject({ method: 'POST', url: '/api/share', payload: { presetId: 'p', platform: 'whatsapp' } });
    expect(r.statusCode).toBe(400);
  });

  it('whatsapp returns wa.me with encoded text', async () => {
    const r = await (await app()).inject({ method: 'POST', url: '/api/share', payload: { generationId: 'g1', presetId: 'p', platform: 'whatsapp', message: 'hi' } });
    expect(r.statusCode).toBe(200);
    expect(r.json().intentUrl).toContain('wa.me');
    expect(r.json().intentUrl).toContain(encodeURIComponent('hi'));
  });

  it('telegram returns t.me', async () => {
    state.pack = { name: 'Pack', shareTargets: ['whatsapp', 'telegram'] };
    const r = await (await app()).inject({ method: 'POST', url: '/api/share', payload: { generationId: 'g1', presetId: 'p', platform: 'telegram' } });
    expect(r.statusCode).toBe(200);
    expect(r.json().intentUrl).toContain('t.me');
  });

  it('copy-link returns image url', async () => {
    const r = await (await app()).inject({ method: 'POST', url: '/api/share', payload: { generationId: 'g1', presetId: 'p', platform: 'copy-link' } });
    expect(r.statusCode).toBe(200);
    expect(r.json().url).toContain('/api/generations/g1/file');
  });

  it('platform not enabled returns 400', async () => {
    const r = await (await app()).inject({ method: 'POST', url: '/api/share', payload: { generationId: 'g1', presetId: 'p', platform: 'x' } });
    expect(r.statusCode).toBe(400);
    expect(r.json().error).toContain('not enabled');
  });

  it('file redirects 302', async () => {
    const r = await (await app()).inject({ method: 'GET', url: '/api/generations/g1/file' });
    expect(r.statusCode).toBe(302);
  });

  it('file unknown returns 404', async () => {
    state.generation = null;
    const r = await (await app()).inject({ method: 'GET', url: '/api/generations/nope/file' });
    expect(r.statusCode).toBe(404);
  });

  it('download sets content-disposition and type', async () => {
    state.user = { id: 'u1', memberships: [] };
    state.generation = { id: 'g1', userId: 'u1', projectId: null, storagePath: 'p', format: 'png' };
    const r = await (await app()).inject({ method: 'GET', url: '/api/download/g1' });
    expect(r.statusCode).toBe(200);
    expect(r.headers['content-disposition']).toContain('.png');
    expect(r.headers['content-type']).toBeTruthy();
  });

  it('download other user returns 403', async () => {
    state.user = { id: 'u2', memberships: [] };
    state.generation = { id: 'g1', userId: 'u1', projectId: null, storagePath: 'p', format: 'png' };
    const r = await (await app()).inject({ method: 'GET', url: '/api/download/g1' });
    expect(r.statusCode).toBe(403);
  });

  it('download unknown returns 404', async () => {
    state.generation = null;
    const r = await (await app()).inject({ method: 'GET', url: '/api/download/nope' });
    expect(r.statusCode).toBe(404);
  });

  it('share config returns targets', async () => {
    const r = await (await app()).inject({ method: 'GET', url: '/api/share/config' });
    expect(r.statusCode).toBe(200);
    expect(r.json().shareTargets).toEqual(['whatsapp']);
  });
});
