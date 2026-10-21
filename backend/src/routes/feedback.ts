import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import prisma from '../db/prisma';
import { apiRateLimiter } from '../middleware/rateLimit';
import { requireAdmin, requireAuth } from '../middleware/auth';
import { jsonSchema } from '../lib/schema';

const feedbackBody = z.object({
  rating: z.number().int().min(1).max(5),
  category: z.enum(['bug', 'idea', 'usability', 'other']).default('other'),
  message: z.string().min(3).max(2000),
  contact: z.string().max(200).optional(),
  consent: z.literal(true),
  sessionId: z.string().max(200).optional(),
});

export async function feedbackRoutes(app: FastifyInstance): Promise<void> {
  // POST /api/feedback - Consent based product feedback (no account required)
  app.post<{ Body: z.infer<typeof feedbackBody> }>(
    '/api/feedback',
    {
      preHandler: [apiRateLimiter],
      schema: {
        body: jsonSchema(feedbackBody),
        response: {
          201: { type: 'object', properties: { id: { type: 'string' }, received: { type: 'boolean' } } },
          400: { type: 'object', properties: { error: { type: 'string' } } },
          429: { type: 'object', properties: { error: { type: 'string' } } },
        },
      },
    },
    async (request, reply) => {
      const body = request.body;

      const feedback = await prisma.feedback.create({
        data: {
          rating: body.rating,
          category: body.category,
          message: body.message.trim(),
          contact: body.contact?.trim() || null,
          consent: true,
          // The owner is taken from the verified session, never from the body.
          userId: request.user?.id ?? null,
          sessionId: body.sessionId ?? null,
        },
        select: { id: true },
      });

      return reply.code(201).send({ id: feedback.id, received: true });
    }
  );

  // GET /api/admin/feedback - Review collected feedback (platform admin only)
  app.get(
    '/api/admin/feedback',
    {
      preHandler: [requireAuth, requireAdmin],
      schema: {
        response: {
          200: {
            type: 'object',
            properties: {
              total: { type: 'number' },
              items: { type: 'array', items: { type: 'object', additionalProperties: true } },
            },
          },
          401: { type: 'object', properties: { error: { type: 'string' } } },
          403: { type: 'object', properties: { error: { type: 'string' } } },
        },
      },
    },
    async (request) => {
      const limit = Math.min(
        Math.max(Number((request.query as { limit?: string }).limit ?? 50) || 50, 1),
        200
      );

      const [items, total] = await Promise.all([
        prisma.feedback.findMany({ orderBy: { createdAt: 'desc' }, take: limit }),
        prisma.feedback.count(),
      ]);

      return {
        total,
        items: items.map((item) => ({
          id: item.id,
          rating: item.rating,
          category: item.category,
          message: item.message,
          contact: item.contact,
          userId: item.userId,
          createdAt: item.createdAt.toISOString(),
        })),
      };
    }
  );
}
