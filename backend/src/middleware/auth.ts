import { FastifyRequest, FastifyReply } from 'fastify';
import { createClient, SupabaseClient, User } from '@supabase/supabase-js';
import { env } from '../config/env';
import { ACCESS_COOKIE } from '../auth/sessionCookies';

interface AuthUser {
  id: string;
  email: string;
  role?: string;
}

declare module 'fastify' {
  interface FastifyRequest {
    user?: AuthUser;
    isAdmin?: boolean;
  }
}

let supabaseAuth: SupabaseClient | null = null;

function getSupabaseAuth(): SupabaseClient {
  if (!supabaseAuth) {
    supabaseAuth = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
  }
  return supabaseAuth;
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function isAdminEmail(email: string): boolean {
  const normalized = normalizeEmail(email);
  return env.ADMIN_EMAILS.map(normalizeEmail).includes(normalized);
}

function isEmailConfirmed(user: User): boolean {
  return !!user.email_confirmed_at;
}

function getAccessToken(request: FastifyRequest): string | null {
  const cookieToken = request.cookies[ACCESS_COOKIE];
  if (cookieToken) {
    return cookieToken;
  }

  // Temporary migration support: Bearer header still works.
  const authHeader = request.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.slice(7);
  }

  return null;
}

export async function authenticate(
  request: FastifyRequest,
  _reply: FastifyReply
): Promise<void> {
  const accessToken = getAccessToken(request);

  if (!accessToken) {
    return; // No auth, continue as guest
  }

  const supabase = getSupabaseAuth();

  const { data: { user }, error } = await supabase.auth.getUser(accessToken);

  if (error || !user) {
    return; // Invalid token, continue as guest
  }

  request.user = {
    id: user.id,
    email: user.email || '',
    role: user.role,
  };

  // Admin requires confirmed email
  request.isAdmin = isEmailConfirmed(user) && isAdminEmail(user.email || '');
}

export function requireAuth(
  request: FastifyRequest,
  reply: FastifyReply,
  done: () => void
): void {
  if (!request.user) {
    reply.code(401).send({ error: 'Authentication required' });
    return;
  }
  done();
}

export function requireAdmin(
  request: FastifyRequest,
  reply: FastifyReply,
  done: () => void
): void {
  if (!request.user || !request.isAdmin) {
    reply.code(403).send({ error: 'Admin access required' });
    return;
  }
  done();
}
