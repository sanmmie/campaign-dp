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
            session: { access_token: 'AT1', refresh_token: 'RT1', expires_at: 1234567890 },
          },
          error: null,
        }),
        signUp: async () => ({
          data: state.signupSession
            ? { user: { id: 'u2', email: 'new@example.com', role: 'authenticated', email_confirmed_at: state.confirmedAt }, session: { access_token: 'AT3', refresh_token: 'RT3', expires_at: 5 } }
            : { user: { id: 'u2', email: 'new@example.com', role: 'authenticated' }, session: null },
          error: null,
        }),
        resetPasswordForEmail: async () => ({ error: null }),
        refreshSession: async ({ refresh_token }: any) => {
          calls.refreshArg = refresh_token;
          return state.refreshOk
            ? { data: { session: { access_token: 'AT2', refresh_token: 'RT2', expires_at: 999 } }, error: null }
            : { data: { session: null }, error: { message: 'bad' } };
        },
        getUser: async (t: string) => (t === 'GOOD' ? { data: { user: { id: 'u1' } }, error: null } : { data: { user: null }, error: { message: 'x' } }),
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
vi.mock('../db/prisma', () => ({ default: { userProfile: { upsert: async () => ({}) } }, prisma: {} }));
vi.mock('../middleware/rateLimit', () => ({ apiRateLimiter: async () => {} }));
vi.mock('../config/env', () => ({
  env: {
    SUPABASE_URL: 'https://x.supabase.co', SUPABASE_ANON_KEY: 'anon', SUPABASE_SERVICE_ROLE_KEY: 'svc',
    FRONTEND_URL: 'https://campaign-dp.vercel.app', ADMIN_EMAILS: ['Boss@Example.com'],
  },
}));

import Fastify from 'fastify';
import { authRoutes } from './auth';

async function app() {
  const a = Fastify();
  await authRoutes(a);
  await a.ready();
  return a;
}

describe('auth steps 5-7', () => {
  beforeEach(() => { state.confirmedAt = '2026-01-01T00:00:00Z'; state.refreshOk = true; delete calls.signOut; });

  it('login returns existing fields plus refreshToken/expiresAt', async () => {
    const r = await (await app()).inject({ method: 'POST', url: '/api/auth/login', payload: { email: 'boss@example.com', password: 'x' } });
    const b = r.json();
    expect(r.statusCode).toBe(200);
    expect(b.token).toBe('AT1');
    expect(b.refreshToken).toBe('RT1');
    expect(b.expiresAt).toBe(1234567890);
    expect(b.user.id).toBe('u1');
    expect(b.isAdmin).toBe(true);
  });

  it('isAdmin is false when email is not confirmed', async () => {
    state.confirmedAt = null;
    const r = await (await app()).inject({ method: 'POST', url: '/api/auth/login', payload: { email: 'boss@example.com', password: 'x' } });
    expect(r.json().isAdmin).toBe(false);
    expect(r.json().token).toBe('AT1');
  });

  it('refresh rotates tokens', async () => {
    const r = await (await app()).inject({ method: 'POST', url: '/api/auth/refresh', payload: { refreshToken: 'RT1' } });
    expect(r.statusCode).toBe(200);
    expect(r.json()).toEqual({ token: 'AT2', refreshToken: 'RT2', expiresAt: 999 });
    expect(calls.refreshArg).toBe('RT1');
  });

  it('refresh failure is 401, bad body is 400', async () => {
    state.refreshOk = false;
    const a = await app();
    expect((await a.inject({ method: 'POST', url: '/api/auth/refresh', payload: { refreshToken: 'bad' } })).statusCode).toBe(401);
    expect((await a.inject({ method: 'POST', url: '/api/auth/refresh', payload: {} })).statusCode).toBe(400);
  });

  it('logout revokes with local scope and is always 200', async () => {
    const a = await app();
    const r = await a.inject({ method: 'POST', url: '/api/auth/logout', headers: { authorization: 'Bearer TOK' } });
    expect(r.statusCode).toBe(200);
    expect(calls.signOut).toEqual({ jwt: 'TOK', scope: 'local' });
    expect((await a.inject({ method: 'POST', url: '/api/auth/logout' })).statusCode).toBe(200); // no token
    expect((await a.inject({ method: 'POST', url: '/api/auth/logout', headers: { authorization: 'Bearer THROW' } })).statusCode).toBe(200); // revoke throws
  });

  it('supabase clients are created without session persistence/auto-refresh', async () => {
    await app();
    await (await app()).inject({ method: 'POST', url: '/api/auth/login', payload: { email: 'a@b.co', password: 'x' } });
    expect(calls.clientOpts.every((o: any) => o.auth.persistSession === false && o.auth.autoRefreshToken === false)).toBe(true);
  });

  it('signup without session -> needsConfirmation, token null (frontend shows check-email)', async () => {
    state.signupSession = false;
    const r = await (await app()).inject({ method: 'POST', url: '/api/auth/signup', payload: { email: 'new@example.com', password: 'longenough1' } });
    expect(r.json()).toMatchObject({ token: null, needsConfirmation: true, isAdmin: false, user: { id: 'u2' } });
  });

  it('signup with session -> tokens returned', async () => {
    state.signupSession = true;
    const r = await (await app()).inject({ method: 'POST', url: '/api/auth/signup', payload: { email: 'new@example.com', password: 'longenough1' } });
    expect(r.json()).toMatchObject({ token: 'AT3', refreshToken: 'RT3', expiresAt: 5 });
  });

  it('reset-password and update-password bodies are not stripped', async () => {
    const a = await app();
    expect((await a.inject({ method: 'POST', url: '/api/auth/reset-password', payload: { email: 'a@b.co' } })).json()).toEqual({ ok: true });
    const u = await a.inject({ method: 'POST', url: '/api/auth/update-password', headers: { authorization: 'Bearer GOOD' }, payload: { password: 'newpassword1' } });
    expect(u.json()).toEqual({ ok: true });
    expect(calls.update).toEqual({ id: 'u1', attrs: { password: 'newpassword1' } });
  });
});