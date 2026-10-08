import { FastifyRequest, FastifyReply } from 'fastify';
import prisma from '../db/prisma';
import { env } from '../config/env';

interface RateLimitOptions {
  windowMs?: number;
  max?: number;
  keyGenerator?: (req: FastifyRequest) => string;
}

export async function rateLimit(
  request: FastifyRequest,
  reply: FastifyReply,
  options: RateLimitOptions = {}
): Promise<boolean> {
  const windowMs = options.windowMs ?? env.RATE_LIMIT_WINDOW_MS;
  const max = options.max ?? env.RATE_LIMIT_MAX;
  const key = options.keyGenerator
    ? options.keyGenerator(request)
    : `${request.ip}:${request.routeOptions?.url || request.url}`;

  const now = new Date();

  let bucket;
  try {
    bucket = await prisma.rateLimitBucket.findUnique({ where: { key } });

    if (!bucket || bucket.resetAt < now) {
      const resetAt = new Date(now.getTime() + windowMs);
      bucket = await prisma.rateLimitBucket.upsert({
        where: { key },
        create: { key, count: 1, resetAt },
        update: { count: 1, resetAt },
      });
    } else {
      bucket = await prisma.rateLimitBucket.update({
        where: { key },
        data: { count: { increment: 1 } },
      });
    }
  } catch (error) {
    // Fail open: a rate-limit store outage must not take down the API.
    request.log.warn({ err: error }, 'Rate limit store unavailable; failing open');
    return true;
  }

  const remaining = Math.max(0, max - bucket.count);
  const resetTime = Math.max(
    1,
    Math.ceil((bucket.resetAt.getTime() - now.getTime()) / 1000)
  );

  reply.header('X-RateLimit-Limit', max.toString());
  reply.header('X-RateLimit-Remaining', remaining.toString());
  reply.header('X-RateLimit-Reset', resetTime.toString());

  if (bucket.count > max) {
    reply.code(429).send({
      error: 'Too Many Requests',
      message: `Rate limit exceeded. Try again in ${resetTime} seconds.`,
      retryAfter: resetTime,
    });
    return false;
  }

  return true;
}

export function createRateLimiter(options: RateLimitOptions = {}) {
  return async (
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> => {
    await rateLimit(request, reply, options);
  };
}

export const uploadRateLimiter = createRateLimiter({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 20,
  keyGenerator: (req) => `upload:${req.ip}:${req.user?.id || 'guest'}`,
});

export const generateRateLimiter = createRateLimiter({
  windowMs: 60 * 1000, // 1 minute
  max: 30,
  keyGenerator: (req) => `generate:${req.ip}:${req.user?.id || 'guest'}`,
});

export const apiRateLimiter = createRateLimiter({
  windowMs: 60 * 1000, // 1 minute
  max: 100,
  keyGenerator: (req) => `api:${req.ip}:${req.user?.id || 'guest'}`,
});
