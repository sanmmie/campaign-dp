import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { env } from '../config/env';
import { apiRateLimiter } from '../middleware/rateLimit';
import prisma from '../db/prisma';
import { jsonSchema } from '../lib/schema';

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

const refreshSchema = z.object({
  refreshToken: z.string().min(1),
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

      return {
        user,
        token: data.session.access_token,
        refreshToken: data.session.refresh_token,
        expiresAt: data.session.expires_at ?? null,
        isAdmin: isAdminUser(user.email, data.user.email_confirmed_at),
      };
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
        return {
          user,
          token: null,
          isAdmin: false,
          needsConfirmation: true,
        };
      }

      return {
        user,
        token: data.session.access_token,
        refreshToken: data.session.refresh_token,
        expiresAt: data.session.expires_at ?? null,
        isAdmin: isAdminUser(user.email, data.user.email_confirmed_at),
      };
    }
  );

  // POST /api/auth/refresh
  app.post<{ Body: z.infer<typeof refreshSchema> }>(
    '/api/auth/refresh',
    {
      preHandler: [apiRateLimiter],
      schema: {
        body: jsonSchema(refreshSchema),
        response: {
          200: { type: 'object', additionalProperties: true },
          401: { type: 'object', properties: { error: { type: 'string' }, message: { type: 'string' } } },
        },
      },
    },
    async (request, reply) => {
      const supabase = getSupabaseAuth();

      const { data, error } = await supabase.auth.refreshSession({
        refresh_token: request.body.refreshToken,
      });

      if (error || !data.session) {
        return reply.code(401).send({ error: 'Session expired. Please sign in again.' });
      }

      return {
        token: data.session.access_token,
        refreshToken: data.session.refresh_token,
        expiresAt: data.session.expires_at ?? null,
      };
    }
  );

  // POST /api/auth/logout - revokes this session server-side. Always 200 so
  // the client can log out even if the token is already expired/invalid.
  app.post(
    '/api/auth/logout',
    {
      preHandler: [apiRateLimiter],
      schema: { response: { 200: { type: 'object', additionalProperties: true } } },
    },
    async (request) => {
      const authHeader = request.headers.authorization;
      if (authHeader && authHeader.startsWith('Bearer ')) {
        try {
          await getSupabaseAdmin().auth.admin.signOut(authHeader.slice(7), 'local');
        } catch (err) {
          request.log.warn({ err }, 'logout revoke failed');
        }
      }
      return { ok: true };
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
