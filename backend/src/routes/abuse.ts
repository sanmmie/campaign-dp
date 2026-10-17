import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import prisma from '../db/prisma';
import { requireAdmin } from '../middleware/auth';
import { apiRateLimiter } from '../middleware/rateLimit';
import { jsonSchema } from '../lib/schema';

const createAbuseReportSchema = z.object({
  targetType: z.enum(['template', 'generation', 'project']),
  targetId: z.string(),
  reason: z.string().min(1).max(500),
  details: z.string().optional(),
});

const abuseReportParamsSchema = z.object({
  reportId: z.string(),
});

const reviewAbuseReportSchema = z.object({
  status: z.enum(['pending', 'reviewed', 'dismissed', 'actioned']),
  reviewedBy: z.string().optional(),
});

export async function abuseRoutes(app: FastifyInstance): Promise<void> {
  // POST /api/abuse-reports - Create abuse report
  app.post<{ Body: z.infer<typeof createAbuseReportSchema> }>(
    '/api/abuse-reports',
    {
      preHandler: [apiRateLimiter],
      schema: {
        body: jsonSchema(createAbuseReportSchema),
        response: {
          201: { type: 'object', additionalProperties: true },
          400: { type: 'object', properties: { error: { type: 'string' } } },
          429: { type: 'object', properties: { error: { type: 'string' } } },
        },
      },
    },
    async (request, reply) => {
      const { targetType, targetId, reason, details } = request.body;
      const reporterId = request.user?.id || null;

      const report = await prisma.abuseReport.create({
        data: {
          targetType,
          targetId,
          reporterId,
          reason,
          details: details ?? null,
        },
      });

      return reply.code(201).send({
        id: report.id,
        status: report.status,
        createdAt: report.createdAt.toISOString(),
      });
    }
  );

  // GET /api/admin/abuse-reports - List abuse reports (admin only)
  app.get('/api/admin/abuse-reports', {
    preHandler: [apiRateLimiter, requireAdmin],
    schema: {
      response: {
        200: { type: 'array' },
        403: { type: 'object', properties: { error: { type: 'string' } } },
      },
    },
  }, async (_request, _reply) => {
    const reports = await prisma.abuseReport.findMany({
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    return reports.map((r) => ({
      id: r.id,
      targetType: r.targetType,
      targetId: r.targetId,
      reporterId: r.reporterId,
      reason: r.reason,
      details: r.details,
      status: r.status,
      reviewedAt: r.reviewedAt?.toISOString() ?? null,
      reviewedBy: r.reviewedBy,
      createdAt: r.createdAt.toISOString(),
    }));
  });

  // PUT /api/admin/abuse-reports/:reportId - Review abuse report (admin only)
  app.put<{
    Params: z.infer<typeof abuseReportParamsSchema>;
    Body: z.infer<typeof reviewAbuseReportSchema>;
  }>(
    '/api/admin/abuse-reports/:reportId',
    {
      preHandler: [apiRateLimiter, requireAdmin],
      schema: {
        params: jsonSchema(abuseReportParamsSchema),
        body: jsonSchema(reviewAbuseReportSchema),
        response: {
          200: { type: 'object', additionalProperties: true },
          403: { type: 'object', properties: { error: { type: 'string' } } },
          404: { type: 'object', properties: { error: { type: 'string' } } },
        },
      },
    },
    async (request, reply) => {
      const { reportId } = request.params;
      const { status, reviewedBy } = request.body;

      const report = await prisma.abuseReport.findUnique({
        where: { id: reportId },
      });

      if (!report) {
        return reply.code(404).send({ error: 'Abuse report not found' });
      }

      const updated = await prisma.abuseReport.update({
        where: { id: reportId },
        data: {
          status,
          reviewedAt: new Date(),
          reviewedBy: reviewedBy ?? request.user?.id ?? null,
        },
      });

      return {
        id: updated.id,
        status: updated.status,
        reviewedAt: updated.reviewedAt?.toISOString() ?? null,
        reviewedBy: updated.reviewedBy,
      };
    }
  );
}
