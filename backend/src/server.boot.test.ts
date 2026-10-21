import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { FastifyInstance } from 'fastify';
import { buildServer } from './index';

let app: FastifyInstance;

beforeAll(async () => {
  app = await buildServer();
  await app.ready();
});

afterAll(async () => {
  await app.close();
});

describe('Phase 9 — server boot regression', () => {
  it('builds the server without throwing', () => {
    expect(app).toBeDefined();
  });

  it('registers the core supporter journey routes', () => {
    const expected: Array<[string, string]> = [
      ['GET', '/api/health'],
      ['GET', '/api/templates'],
      ['GET', '/api/packs'],
      ['GET', '/api/presets'],
      ['POST', '/api/upload'],
      ['GET', '/api/upload/config'],
      ['POST', '/api/preview'],
      ['POST', '/api/generate'],
      ['POST', '/api/share'],
      ['GET', '/api/share/config'],
      ['GET', '/api/generations/:generationId/file'],
      ['GET', '/api/download/:generationId'],
      ['GET', '/api/public/campaigns/:slug'],
      ['GET', '/api/public/organizations/:slug'],
      ['GET', '/api/subscriptions/plans'],
      ['POST', '/api/subscriptions/webhook'],
      ['GET', '/api/organizations'],
      ['GET', '/api/organizations/:organizationId/dashboard'],
      ['POST', '/api/analytics'],
    ];

    for (const [method, url] of expected) {
      expect(app.hasRoute({ method: method as any, url }), `${method} ${url}`).toBe(true);
    }
  });

  it('responds to the health check', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/health' });
    expect(response.statusCode).toBe(200);
    expect(response.json().status).toBe('ok');
  });

  it('returns a JSON 404 for unknown routes', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/does-not-exist' });
    expect(response.statusCode).toBe(404);
    expect(response.json().error).toBeTruthy();
  });

  it('sets the baseline security headers', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/health' });
    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['x-frame-options']).toBeDefined();
    expect(response.headers['content-security-policy']).toBeDefined();
  });

  it('rejects state-changing requests without a valid origin', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/analytics',
      payload: { event: 'campaign_visit', sessionId: 'test' },
    });
    expect(response.statusCode).toBe(403);
    expect(response.json().error).toBe('Forbidden');
  });

  it('rejects state-changing requests with a mismatched origin', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/analytics',
      headers: { origin: 'https://evil.example.com' },
      payload: { event: 'campaign_visit', sessionId: 'test' },
    });
    expect(response.statusCode).toBe(403);
  });

  it('does not leak a stack trace on an internal error', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/does-not-exist',
    });
    expect(response.body).not.toMatch(/at Object\./);
    expect(response.body).not.toMatch(/node_modules/);
  });
});
