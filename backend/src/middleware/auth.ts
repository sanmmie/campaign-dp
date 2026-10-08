import { FastifyRequest, FastifyReply } from 'fastify';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { env } from '../config/env';

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
    supabaseAuth = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY);
  }
  return supabaseAuth;
}

export async function authenticate(
  request: FastifyRequest,
  _reply: FastifyReply
): Promise<void> {
  const authHeader = request.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return; // No auth, continue as guest
  }

  const token = authHeader.slice(7);
  const supabase = getSupabaseAuth();

  const { data: { user }, error } = await supabase.auth.getUser(token);

  if (error || !user) {
    return; // Invalid token, continue as guest
  }

  request.user = {
    id: user.id,
    email: user.email || '',
    role: user.role,
  };

  request.isAdmin = env.ADMIN_EMAILS.includes(user.email || '');
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
