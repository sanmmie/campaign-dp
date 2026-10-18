import { FastifyRequest, FastifyReply } from 'fastify';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { env } from '../config/env';
import { ACCESS_COOKIE } from '../auth/sessionCookies';
import { isAdminEmail, isEmailConfirmed } from '../lib/admin';
import prisma from '../db/prisma';

export type UserRole =
  | 'platform_admin'
  | 'org_admin'
  | 'campaign_manager'
  | 'template_designer'
  | 'analyst';

interface Membership {
  organizationId: string;
  role: string;
}

export interface AuthUser {
  id: string;
  email: string;
  role?: string;
  memberships: Membership[];
  isPlatformAdmin: boolean;
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

  const memberships = await prisma.membership.findMany({
    where: { userId: user.id },
    select: { organizationId: true, role: true },
  });

  const isPlatformAdmin =
    (isEmailConfirmed(user.email_confirmed_at) && isAdminEmail(user.email || '')) ||
    memberships.some((m) => m.role === 'platform_admin');

  request.user = {
    id: user.id,
    email: user.email || '',
    role: user.role,
    memberships,
    isPlatformAdmin,
  };

  // Backward-compatible admin flag
  request.isAdmin = isPlatformAdmin;
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

/**
 * Require the authenticated user to have at least one of the given roles
 * (globally, considering platform_admin as having every role).
 */
export function requireRole(
  roles: UserRole[]
) {
  return (request: FastifyRequest, reply: FastifyReply, done: () => void): void => {
    const user = request.user;
    if (!user) {
      reply.code(401).send({ error: 'Authentication required' });
      return;
    }

    const userRoles = new Set([
      ...user.memberships.map((m) => m.role),
      ...(user.isPlatformAdmin ? roles : []),
    ]);

    const hasRole = roles.some((r) => userRoles.has(r) || user.isPlatformAdmin);

    if (!hasRole) {
      reply.code(403).send({ error: 'Insufficient role' });
      return;
    }
    done();
  };
}

/**
 * Backward-compatible admin guard: platform administrators only.
 * Prefer requireOrganizationRole(['platform_admin', 'org_admin'], ...) for org-scoped admin access.
 */
export function requireAdmin(
  request: FastifyRequest,
  reply: FastifyReply,
  done: () => void
): void {
  const user = request.user;
  if (!user || !user.isPlatformAdmin) {
    reply.code(403).send({ error: 'Admin access required' });
    return;
  }
  done();
}

/**
 * Require the authenticated user to be a member of the organization identified
 * by the given param key (e.g. 'organizationId'), or be a platform admin.
 */
export function requireOrganizationAccess(paramKey = 'organizationId') {
  return (request: FastifyRequest, reply: FastifyReply, done: () => void): void => {
    if (!request.user) {
      reply.code(401).send({ error: 'Authentication required' });
      return;
    }

    if (request.user.isPlatformAdmin) {
      done();
      return;
    }

    const organizationId = (request.params as Record<string, string> | undefined)?.[paramKey];
    if (!organizationId) {
      reply.code(400).send({ error: 'Missing organization identifier' });
      return;
    }

    const isMember = request.user.memberships.some(
      (m) => m.organizationId === organizationId
    );

    if (!isMember) {
      reply.code(403).send({ error: 'Organization access required' });
      return;
    }
    done();
  };
}

/**
 * Require the authenticated user to have at least one of the given roles
 * within the organization identified by the given param key.
 */
export function requireOrganizationRole(
  roles: UserRole[],
  paramKey = 'organizationId'
) {
  return (request: FastifyRequest, reply: FastifyReply, done: () => void): void => {
    if (!request.user) {
      reply.code(401).send({ error: 'Authentication required' });
      return;
    }

    if (request.user.isPlatformAdmin) {
      done();
      return;
    }

    const organizationId = (request.params as Record<string, string> | undefined)?.[paramKey];
    if (!organizationId) {
      reply.code(400).send({ error: 'Missing organization identifier' });
      return;
    }

    const membership = request.user.memberships.find(
      (m) => m.organizationId === organizationId
    );

    if (!membership || !roles.includes(membership.role as UserRole)) {
      reply.code(403).send({ error: 'Insufficient organization role' });
      return;
    }
    done();
  };
}

/**
 * Helper: check whether the user can access a given organization.
 */
export function canAccessOrganization(user: AuthUser | undefined, organizationId: string): boolean {
  if (!user) return false;
  if (user.isPlatformAdmin) return true;
  return user.memberships.some((m) => m.organizationId === organizationId);
}

/**
 * Helper: check the user's role within a given organization.
 */
export function organizationRole(user: AuthUser | undefined, organizationId: string): string | undefined {
  if (!user) return undefined;
  if (user.isPlatformAdmin) return 'platform_admin';
  const m = user.memberships.find((x) => x.organizationId === organizationId);
  return m?.role;
}
