import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import prisma from '../db/prisma';
import { requireRole } from '../middleware/auth';
import { apiRateLimiter } from '../middleware/rateLimit';
import { jsonSchema } from '../lib/schema';

const ingestAnalyticsSchema = z.object({
  event: z.enum([
    'campaign_visit',
    'share',
    'template_use',
    'generation',
    'download',
  ]),
  properties: z.record(z.string(), z.unknown()).default({}),
  sessionId: z.string().min(1).max(200),
});

export async function analyticsRoutes(app: FastifyInstance): Promise<void> {
  // POST /api/analytics - Ingest analytics event
  app.post<{ Body: z.infer<typeof ingestAnalyticsSchema> }>(
    '/api/analytics',
    {
      preHandler: [apiRateLimiter],
      schema: {
        body: jsonSchema(ingestAnalyticsSchema),
        response: {
          200: { type: 'object', properties: { ok: { type: 'boolean' } } },
          400: { type: 'object', properties: { error: { type: 'string' } } },
          429: { type: 'object', properties: { error: { type: 'string' } } },
        },
      },
    },
    async (request, _reply) => {
      const { event, properties, sessionId } = request.body;

      // The acting identity always comes from the verified session, never from
      // the request body, so a client cannot attribute events to another user.
      const userId = request.user?.id ?? null;

      await prisma.analyticsEvent.create({
        data: {
          event,
          properties: JSON.stringify(properties),
          sessionId,
          userId,
        },
      });

      return { ok: true };
    }
  );

  // GET /api/admin/analytics - Analytics summary (admin and analyst)
  app.get('/api/admin/analytics', {
    preHandler: [apiRateLimiter, requireRole(['platform_admin', 'org_admin', 'analyst'])],
    schema: {
      response: {
        200: { type: 'object', additionalProperties: true },
        403: { type: 'object', properties: { error: { type: 'string' } } },
      },
    },
  }, async (_request, _reply) => {
    const totalEvents = await prisma.analyticsEvent.count();
    const eventsByEvent = await prisma.analyticsEvent.groupBy({
      by: ['event'],
      _count: { event: true },
      orderBy: { _count: { event: 'desc' } },
      take: 20,
    });
    const uniqueUsers = await prisma.analyticsEvent.groupBy({
      by: ['userId'],
      having: { userId: { not: null } },
    });

    return {
      totalEvents,
      eventsByEvent: eventsByEvent.map((e) => ({
        event: e.event,
        count: e._count.event,
      })),
      uniqueUsers: uniqueUsers.length,
    };
  });
}
