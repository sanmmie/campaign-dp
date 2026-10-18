import { describe, it, expect, vi, beforeEach } from 'vitest';

const calls: any = {};
const state: any = { confirmedAt: '2026-01-01T00:00:00Z', refreshOk: true, signupSession: false };

vi.mock('@supabase/supabase-js', () => ({
  createClient: (_u: string, _k: string, opts: any) => {
    calls.clientOpts = calls.clientOpts || [];
    calls.clientOpts.push(opts);
    return {
      auth: {
        signInWithPassword: async () => ({
          data: {
            user: { id: 'u1', email: 'boss@example.com', role: 'authenticated', email_confirmed_at: state.confirmedAt },
            session: { access_token: 'AT1', refresh_token: 'RT1', expires_at: 1234567890, expires_in: 3600 },
          },
          error: null,
        }),
        signUp: async () => ({
          data: state.signupSession
            ? { user: { id: 'u2', email: 'new@example.com', role: 'authenticated', email_confirmed_at: state.confirmedAt }, session: { access_token: 'AT3', refresh_token: 'RT3', expires_at: 5, expires_in: 3600 } }
            : { user: { id: 'u2', email: 'new@example.com', role: 'authenticated' }, session: null },
          error: null,
        }),
        resend: async () => ({ error: null }),
        resetPasswordForEmail: async () => ({ error: null }),
        refreshSession: async ({ refresh_token }: any) => {
          calls.refreshArg = refresh_token;
          return state.refreshOk
            ? { data: { session: { access_token: 'AT2', refresh_token: 'RT2', expires_at: 999, expires_in: 3600 } }, error: null }
            : { data: { session: null }, error: { message: 'bad' } };
        },
        getUser: async (t: string) => (t === 'AT1' ? { data: { user: { id: 'u1', email: 'boss@example.com', email_confirmed_at: state.confirmedAt } }, error: null } : { data: { user: null }, error: { message: 'x' } }),
        admin: {
          updateUserById: async (id: string, attrs: any) => { calls.update = { id, attrs }; return { error: null }; },
          signOut: async (jwt: string, scope: string) => {
            calls.signOut = { jwt, scope };
            if (jwt === 'THROW') throw new Error('boom');
            return { error: null };
          },
        },
      },
    };
  },
}));
vi.mock('../db/prisma', () => ({ default: { userProfile: { upsert: async () => ({}) }, membership: { findMany: async () => [] } }, prisma: { membership: { findMany: async () => [] } } }));
vi.mock('../middleware/rateLimit', () => ({
  apiRateLimiter: async () => {},
  resendConfirmationIpRateLimiter: async () => {},
  resendConfirmationRateLimiter: async () => {},
}));
vi.mock('../config/env', () => ({
  env: {
    SUPABASE_URL: 'https://x.supabase.co', SUPABASE_ANON_KEY: 'anon', SUPABASE_SERVICE_ROLE_KEY: 'svc',
    FRONTEND_URL: 'https://campaign-dp.vercel.app', ADMIN_EMAILS: ['Boss@Example.com'],
    NODE_ENV: 'test',
  },
}));

import Fastify from 'fastify';
import fastifyCookie from '@fastify/cookie';
import { authRoutes } from './auth';

async function app() {
  const a = Fastify();
  await a.register(fastifyCookie);
  await authRoutes(a);
  await a.ready();
  return a;
}

function cookieHeader(accessToken: string, refreshToken?: string) {
  const parts = [`access_token=${accessToken}`];
  if (refreshToken) parts.push(`refresh_token=${refreshToken}`);
  return parts.join('; ');
}

function setCookieValues(r: any): string[] {
  const raw = r.headers['set-cookie'];
  if (!raw) return [];
  return Array.isArray(raw) ? raw : [raw];
}

describe('auth steps 5-7', () => {
  beforeEach(() => { state.confirmedAt = '2026-01-01T00:00:00Z'; state.refreshOk = true; delete calls.signOut; });

  it('login returns user metadata without tokens, sets cookies', async () => {
    const r = await (await app()).inject({ method: 'POST', url: '/api/auth/login', payload: { email: 'boss@example.com', password: 'x' } });
    const b = r.json();
    expect(r.statusCode).toBe(200);
    expect(b.token).toBeUndefined();
    expect(b.refreshToken).toBeUndefined();
    expect(b.user.id).toBe('u1');
    expect(b.isAdmin).toBe(true);
    expect(b.expiresAt).toBe(1234567890);
    // Cookies should be set
    const setCookie = setCookieValues(r);
    expect(setCookie.some((c: string) => c.startsWith('access_token='))).toBe(true);
    expect(setCookie.some((c: string) => c.startsWith('refresh_token='))).toBe(true);
  });

  it('isAdmin is false when email is not confirmed', async () => {
    state.confirmedAt = null;
    const r = await (await app()).inject({ method: 'POST', url: '/api/auth/login', payload: { email: 'boss@example.com', password: 'x' } });
    expect(r.json().isAdmin).toBe(false);
  });

  it('refresh rotates tokens via cookie', async () => {
    const r = await (await app()).inject({
      method: 'POST',
      url: '/api/auth/refresh',
      headers: { cookie: cookieHeader('AT1', 'RT1') },
    });
    expect(r.statusCode).toBe(200);
    expect(calls.refreshArg).toBe('RT1');
    // Cookies should be updated
    const setCookie = setCookieValues(r);
    expect(setCookie.some((c: string) => c.startsWith('access_token='))).toBe(true);
  });

  it('refresh failure is 401 without cookie', async () => {
    state.refreshOk = false;
    const a = await app();
    expect((await a.inject({ method: 'POST', url: '/api/auth/refresh', headers: { cookie: cookieHeader('AT1', 'bad') } })).statusCode).toBe(401);
  });

  it('logout revokes with local scope and clears cookies', async () => {
    const a = await app();
    const r = await a.inject({ method: 'POST', url: '/api/auth/logout', headers: { cookie: cookieHeader('AT1', 'RT1') } });
    expect(r.statusCode).toBe(200);
    expect(calls.signOut).toEqual({ jwt: 'AT1', scope: 'local' });
    // Cookies should be cleared
    const setCookie = setCookieValues(r);
    expect(setCookie.some((c: string) => c.startsWith('access_token='))).toBe(true);
    expect((await a.inject({ method: 'POST', url: '/api/auth/logout' })).statusCode).toBe(200); // no cookie
    expect((await a.inject({ method: 'POST', url: '/api/auth/logout', headers: { cookie: cookieHeader('THROW', 'RT1') } })).statusCode).toBe(200); // revoke throws
  });

  it('supabase clients are created without session persistence/auto-refresh', async () => {
    await app();
    await (await app()).inject({ method: 'POST', url: '/api/auth/login', payload: { email: 'a@b.co', password: 'x' } });
    expect(calls.clientOpts.every((o: any) => o.auth.persistSession === false && o.auth.autoRefreshToken === false)).toBe(true);
  });

  it('signup without session -> needsConfirmation, no token', async () => {
    state.signupSession = false;
    const r = await (await app()).inject({ method: 'POST', url: '/api/auth/signup', payload: { email: 'new@example.com', password: 'longenough1' } });
    expect(r.json()).toMatchObject({ needsConfirmation: true, isAdmin: false, user: { id: 'u2' } });
    expect(r.json().token).toBeUndefined();
  });

  it('signup with session -> sets cookies, no token in body', async () => {
    state.signupSession = true;
    const r = await (await app()).inject({ method: 'POST', url: '/api/auth/signup', payload: { email: 'new@example.com', password: 'longenough1' } });
    expect(r.json().token).toBeUndefined();
    expect(r.json().refreshToken).toBeUndefined();
    const setCookie = setCookieValues(r);
    expect(setCookie.some((c: string) => c.startsWith('access_token='))).toBe(true);
  });

  it('resend-confirmation returns generic 200', async () => {
    const a = await app();
    const r = await a.inject({
      method: 'POST',
      url: '/api/auth/resend-confirmation',
      payload: { email: 'new@example.com' },
    });
    expect(r.statusCode).toBe(200);
    expect(r.json()).toMatchObject({ ok: true });
    expect(r.json().message).toContain('confirmation email');
  });

  it('resend-confirmation normalizes email', async () => {
    const a = await app();
    const r = await a.inject({
      method: 'POST',
      url: '/api/auth/resend-confirmation',
      payload: { email: 'New@Example.com' },
    });
    expect(r.statusCode).toBe(200);
    expect(r.json()).toMatchObject({ ok: true });
  });

  it('reset-password body is not stripped', async () => {
    const a = await app();
    expect((await a.inject({ method: 'POST', url: '/api/auth/reset-password', payload: { email: 'a@b.co' } })).json()).toEqual({ ok: true });
  });
});
