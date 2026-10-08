import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { env } from '../config/env';
import { authenticate } from '../middleware/auth';
import { apiRateLimiter } from '../middleware/rateLimit';
import prisma from '../db/prisma';
import { jsonSchema } from '../lib/schema';

let supabaseAuth: SupabaseClient | null = null;

function getSupabaseAuth(): SupabaseClient {
  if (!supabaseAuth) {
    supabaseAuth = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY);
  }
  return supabaseAuth;
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

interface AuthResponseUser {
  id: string;
  email: string;
  role?: string;
}

function isAdminEmail(email: string): boolean {
  return env.ADMIN_EMAILS.includes(email);
}

async function ensureProfile(userId: string, email: string): Promise<void> {
  try {
    await prisma.userProfile.upsert({
      where: { userId },
      create: { userId, email },
      update: { email },
    });
  } catch {
    // Profile sync is best-effort; auth still succeeds.
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
          200: { type: 'object' },
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
        isAdmin: isAdminEmail(user.email),
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
          200: { type: 'object' },
          400: { type: 'object', properties: { error: { type: 'string' }, message: { type: 'string' } } },
        },
      },
    },
    async (request, reply) => {
      const { email, password } = request.body;
      const supabase = getSupabaseAuth();

      const { data, error } = await supabase.auth.signUp({ email, password });

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

      return {
        user,
        token: data.session?.access_token ?? null,
        isAdmin: isAdminEmail(user.email),
      };
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
          200: { type: 'object' },
          400: { type: 'object', properties: { error: { type: 'string' }, message: { type: 'string' } } },
        },
      },
    },
    async (request, reply) => {
      const { email } = request.body;
      const supabase = getSupabaseAuth();

      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${env.FRONTEND_URL}/reset-password`,
      });

      if (error) {
        return reply.code(400).send({ error: error.message });
      }

      return { ok: true };
    }
  );

  // GET /api/auth/me
  app.get('/api/auth/me', {
    preHandler: [apiRateLimiter, authenticate],
    schema: {
      response: {
        200: { type: 'object' },
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
