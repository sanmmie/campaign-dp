import {
  FastifyReply,
  FastifyRequest,
} from 'fastify';
import { env } from '../config/env';
import crypto from 'node:crypto';

export const CSRF_COOKIE = 'csrf_token';

const unsafeMethods = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

const sameSiteValue: 'lax' | 'none' =
  env.NODE_ENV === 'production' ? 'none' : 'lax';

const baseCookieOptions = {
  httpOnly: false,
  secure: env.NODE_ENV === 'production',
  sameSite: sameSiteValue,
  path: '/',
};

export function issueCsrfCookie(reply: FastifyReply): string {
  const token = crypto.randomBytes(32).toString('hex');

  reply.setCookie(CSRF_COOKIE, token, {
    ...baseCookieOptions,
    maxAge: 60 * 60 * 24 * 30,
  });

  return token;
}

export function clearCsrfCookie(reply: FastifyReply): void {
  reply.clearCookie(CSRF_COOKIE, {
    ...baseCookieOptions,
    maxAge: 0,
  });
}

export async function csrfProtection(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  // Auth endpoints establish sessions; they do not mutate an existing
  // authenticated session, so CSRF does not apply. Exempt them to avoid
  // blocking login/signup/logout/reset before a CSRF cookie exists.
  if (request.url.startsWith('/api/auth/')) {
    return;
  }

  if (!unsafeMethods.has(request.method)) {
    return;
  }

  // OPTIONS preflight is handled by CORS; do not apply CSRF to it.
  if (request.method === 'OPTIONS') {
    return;
  }

  const origin = request.headers.origin;

  // Reject requests without an Origin header (browser-originated state-changing
  // requests always send one; server-to-server callers should use separate
  // authenticated routes instead of weakening this rule).
  if (!origin || origin !== env.FRONTEND_URL) {
    reply.code(403).send({
      error: 'Forbidden',
      message: 'Invalid request origin',
    });
    return;
  }

  // Double-submit CSRF: the csrf_token cookie value must match the
  // X-CSRF-Token header. The cookie is readable by JS but the auth cookies
  // remain HttpOnly, so this is defense in depth, not an auth secret.
  const cookieToken = request.cookies[CSRF_COOKIE];
  const headerToken = request.headers['x-csrf-token'];

  if (
    !cookieToken ||
    typeof headerToken !== 'string' ||
    cookieToken !== headerToken
  ) {
    reply.code(403).send({
      error: 'Forbidden',
      message: 'Invalid CSRF token',
    });
  }
}
