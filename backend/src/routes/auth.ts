import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { env } from '../config/env';
import { apiRateLimiter, resendConfirmationIpRateLimiter, resendConfirmationRateLimiter } from '../middleware/rateLimit';
import prisma from '../db/prisma';
import { jsonSchema } from '../lib/schema';
import { resendSignupConfirmation } from '../services/authService';
import {
  setSessionCookies,
  clearSessionCookies,
  ACCESS_COOKIE,
  REFRESH_COOKIE,
} from '../auth/sessionCookies';

let supabaseAuth: SupabaseClient | null = null;
let supabaseAdmin: SupabaseClient | null = null;

function getSupabaseAuth(): SupabaseClient {
  if (!supabaseAuth) {
    supabaseAuth = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
  }
  return supabaseAuth;
}

function getSupabaseAdmin(): SupabaseClient {
  if (!supabaseAdmin) {
    if (!env.SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error('SUPABASE_SERVICE_ROLE_KEY not configured');
    }
    supabaseAdmin = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
  }
  return supabaseAdmin;
}

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const signupSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

const resetPasswordSchema = z.object({
  email: z.string().email(),
});

const updatePasswordSchema = z.object({
  password: z.string().min(8),
});

const resendConfirmationSchema = z.object({
  email: z.string().email(),
});

interface AuthResponseUser {
  id: string;
  email: string;
  role?: string;
}

function isAdminUser(email: string, confirmedAt?: string | null): boolean {
  if (!confirmedAt) return false;
  const normalized = email.trim().toLowerCase();
  return env.ADMIN_EMAILS.map(e => e.trim().toLowerCase()).includes(normalized);
}

async function ensureProfile(userId: string, email: string): Promise<void> {
  try {
    await prisma.userProfile.upsert({
      where: { userId },
      create: { userId, email },
      update: { email },
    });
  } catch (error) {
    // Log the error but don't fail auth
    console.error('Profile sync failed:', error);
  }
}

export async function authRoutes(app: FastifyInstance): Promise<void> {
  // POST /api/auth/login
  app.post<{ Body: z.infer<typeof loginSchema> }>(
    '/api/auth/login',
    {
      preHandler: [apiRateLimiter],
      schema: {
        body: jsonSchema(loginSchema),
        response: {
          200: { type: 'object', additionalProperties: true },
          400: { type: 'object', properties: { error: { type: 'string' }, message: { type: 'string' } } },
          401: { type: 'object', properties: { error: { type: 'string' }, message: { type: 'string' } } },
        },
      },
    },
    async (request, reply) => {
      const { email, password } = request.body;
      const supabase = getSupabaseAuth();

      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error || !data.session || !data.user) {
        return reply.code(401).send({ error: 'Invalid email or password' });
      }

      const user: AuthResponseUser = {
        id: data.user.id,
        email: data.user.email || '',
        role: data.user.role || undefined,
      };

      await ensureProfile(user.id, user.email);

      setSessionCookies(
        reply,
        data.session.access_token,
        data.session.refresh_token,
        data.session.expires_in ?? 3600
      );

      return reply.code(200).send({
        user,
        isAdmin: isAdminUser(user.email, data.user.email_confirmed_at),
        expiresAt: data.session.expires_at ?? null,
      });
    }
  );

  // POST /api/auth/signup
  app.post<{ Body: z.infer<typeof signupSchema> }>(
    '/api/auth/signup',
    {
      preHandler: [apiRateLimiter],
      schema: {
        body: jsonSchema(signupSchema),
        response: {
          200: { type: 'object', additionalProperties: true },
          400: { type: 'object', properties: { error: { type: 'string' }, message: { type: 'string' } } },
        },
      },
    },
    async (request, reply) => {
      const { email, password } = request.body;
      const supabase = getSupabaseAuth();

      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${env.FRONTEND_URL}/login`,
        },
      });

      if (error) {
        return reply.code(400).send({ error: error.message });
      }

      if (!data.user) {
        return reply
          .code(400)
          .send({ error: 'Unable to create account. Please try again.' });
      }

      const user: AuthResponseUser = {
        id: data.user.id,
        email: data.user.email || '',
        role: data.user.role || undefined,
      };

      await ensureProfile(user.id, user.email);

      // If no session (email confirmation required), return needsConfirmation
      if (!data.session) {
        return reply.code(200).send({
          user,
          isAdmin: false,
          needsConfirmation: true,
        });
      }

      setSessionCookies(
        reply,
        data.session.access_token,
        data.session.refresh_token,
        data.session.expires_in ?? 3600
      );

      return reply.code(200).send({
        user,
        isAdmin: isAdminUser(user.email, data.user.email_confirmed_at),
        expiresAt: data.session.expires_at ?? null,
      });
    }
  );

  // POST /api/auth/resend-confirmation
  // Returns a generic success response regardless of whether the email exists
  // to prevent account enumeration. Rate limited per IP and per IP+email.
  app.post<{ Body: z.infer<typeof resendConfirmationSchema> }>(
    '/api/auth/resend-confirmation',
    {
      preHandler: [
        resendConfirmationIpRateLimiter,
        resendConfirmationRateLimiter,
      ],
      schema: {
        body: jsonSchema(resendConfirmationSchema),
        response: {
          200: {
            type: 'object',
            properties: {
              ok: { type: 'boolean' },
              message: { type: 'string' },
            },
          },
          400: { type: 'object', properties: { error: { type: 'string' }, message: { type: 'string' } } },
          429: { type: 'object', properties: { error: { type: 'string' }, message: { type: 'string' }, retryAfter: { type: 'number' } } },
        },
      },
    },
    async (request, reply) => {
      if (reply.sent) {
        return;
      }

      const email = request.body.email.trim().toLowerCase();

      const result = await resendSignupConfirmation(email);

      if (!result.ok) {
        request.log.info(
          { email, providerError: result.providerError },
          'Confirmation resend completed with provider response'
        );
      }

      // Always return a generic success response to prevent account enumeration.
      return reply.code(200).send({
        ok: true,
        message:
          'If confirmation is required, a new confirmation email has been sent.',
      });
    }
  );
  // POST /api/auth/refresh - reads refresh token from HttpOnly cookie
  app.post(
    '/api/auth/refresh',
    {
      preHandler: [apiRateLimiter],
      schema: {
        response: {
          200: { type: 'object', additionalProperties: true },
          401: { type: 'object', properties: { error: { type: 'string' }, message: { type: 'string' } } },
        },
      },
    },
    async (request, reply) => {
      const refreshToken = request.cookies[REFRESH_COOKIE];

      if (!refreshToken) {
        clearSessionCookies(reply);
        return reply.code(401).send({ error: 'Session expired. Please sign in again.' });
      }

      const supabase = getSupabaseAuth();

      const { data, error } = await supabase.auth.refreshSession({
        refresh_token: refreshToken,
      });

      if (error || !data.session) {
        clearSessionCookies(reply);
        return reply.code(401).send({ error: 'Session expired. Please sign in again.' });
      }

      setSessionCookies(
        reply,
        data.session.access_token,
        data.session.refresh_token,
        data.session.expires_in ?? 3600
      );

      return {
        expiresAt: data.session.expires_at ?? null,
      };
    }
  );

  // POST /api/auth/logout - revokes this session server-side and clears cookies. Always 200.
  app.post(
    '/api/auth/logout',
    {
      preHandler: [apiRateLimiter],
      schema: { response: { 200: { type: 'object', properties: { ok: { type: 'boolean' } } } } },
    },
    async (request, reply) => {
      const accessToken = request.cookies[ACCESS_COOKIE];

      try {
        if (accessToken) {
          await getSupabaseAdmin().auth.admin.signOut(accessToken, 'local');
        }
      } catch (err) {
        request.log.warn({ err }, 'logout revoke failed');
      } finally {
        clearSessionCookies(reply);
      }

      return reply.code(200).send({ ok: true });
    }
  );

  // POST /api/auth/reset-password
  app.post<{ Body: z.infer<typeof resetPasswordSchema> }>(
    '/api/auth/reset-password',
    {
      preHandler: [apiRateLimiter],
      schema: {
        body: jsonSchema(resetPasswordSchema),
        response: {
          200: { type: 'object', additionalProperties: true },
          400: { type: 'object', properties: { error: { type: 'string' }, message: { type: 'string' } } },
        },
      },
    },
    async (request, reply) => {
      const { email } = request.body;
      const supabase = getSupabaseAuth();

      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${env.FRONTEND_URL}/update-password`,
      });

      if (error) {
        return reply.code(400).send({ error: error.message });
      }

      return { ok: true };
    }
  );

  // POST /api/auth/update-password
  app.post<{ Body: z.infer<typeof updatePasswordSchema> }>(
    '/api/auth/update-password',
    {
      preHandler: [apiRateLimiter],
      schema: {
        body: jsonSchema(updatePasswordSchema),
        response: {
          200: { type: 'object', additionalProperties: true },
          400: { type: 'object', properties: { error: { type: 'string' }, message: { type: 'string' } } },
          401: { type: 'object', properties: { error: { type: 'string' }, message: { type: 'string' } } },
        },
      },
    },
    async (request, reply) => {
      const { password } = request.body;

      // Verify the user's access token from Authorization header
      const authHeader = request.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return reply.code(401).send({ error: 'Missing or invalid authorization header' });
      }

      const token = authHeader.slice(7);
      const supabaseAuth = getSupabaseAuth();

      const { data: { user }, error: userError } = await supabaseAuth.auth.getUser(token);

      if (userError || !user) {
        return reply.code(401).send({ error: 'Invalid or expired reset token' });
      }

      // Update the user's password using service role
      const supabaseAdmin = getSupabaseAdmin();

      const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(user.id, {
        password,
      });

      if (updateError) {
        return reply.code(400).send({ error: updateError.message });
      }

      return { ok: true };
    }
  );

  // GET /api/auth/me - authenticate already runs globally, so we don't need it here
  app.get('/api/auth/me', {
    preHandler: [apiRateLimiter],
    schema: {
      response: {
        200: { type: 'object', additionalProperties: true },
        401: { type: 'object', properties: { error: { type: 'string' }, message: { type: 'string' } } },
      },
    },
  }, async (request, reply) => {
    if (!request.user) {
      return reply.code(401).send({ error: 'Not authenticated' });
    }

    return {
      user: request.user,
      isAdmin: !!request.isAdmin,
    };
  });
}
