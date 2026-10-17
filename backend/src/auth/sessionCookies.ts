import { FastifyReply } from 'fastify';
import { env } from '../config/env';

export const ACCESS_COOKIE = 'access_token';
export const REFRESH_COOKIE = 'refresh_token';

const sameSiteValue: 'lax' | 'none' =
  env.NODE_ENV === 'production' ? 'none' : 'lax';

const baseCookieOptions = {
  httpOnly: true,
  secure: env.NODE_ENV === 'production',
  sameSite: sameSiteValue,
  path: '/',
};

export function setSessionCookies(
  reply: FastifyReply,
  accessToken: string,
  refreshToken: string,
  expiresInSeconds = 3600
): void {
  reply.setCookie(ACCESS_COOKIE, accessToken, {
    ...baseCookieOptions,
    maxAge: expiresInSeconds,
  });

  reply.setCookie(REFRESH_COOKIE, refreshToken, {
    ...baseCookieOptions,
    maxAge: 60 * 60 * 24 * 30,
  });
}

export function clearSessionCookies(reply: FastifyReply): void {
  reply.clearCookie(ACCESS_COOKIE, {
    ...baseCookieOptions,
    maxAge: 0,
  });

  reply.clearCookie(REFRESH_COOKIE, {
    ...baseCookieOptions,
    maxAge: 0,
  });
}
