import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import prisma, { Prisma } from '../db/prisma';
import { requireAdmin } from '../middleware/auth';
import { apiRateLimiter } from '../middleware/rateLimit';
import { jsonSchema } from '../lib/schema';
import { auditAdmin } from '../lib/audit';

const createFontSchema = z.object({
  name: z.string().min(1).max(200),
  family: z.string().min(1).max(200),
  weights: z.array(z.number().int().positive()).default([400]),
  url: z.string().url(),
  unicodeRanges: z.array(z.string()).default([]),
  supportsYoruba: z.boolean().default(false),
  variable: z.boolean().default(false),
  isActive: z.boolean().default(true),
});

const fontParamsSchema = z.object({
  fontId: z.string(),
});

const updateFontSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  family: z.string().min(1).max(200).optional(),
  weights: z.array(z.number().int().positive()).optional(),
  url: z.string().url().optional(),
  unicodeRanges: z.array(z.string()).optional(),
  supportsYoruba: z.boolean().optional(),
  variable: z.boolean().optional(),
  isActive: z.boolean().optional(),
});

export async function fontRoutes(app: FastifyInstance): Promise<void> {
  // GET /api/admin/fonts - List fonts (admin only)
  app.get('/api/admin/fonts', {
    preHandler: [apiRateLimiter, requireAdmin],
    schema: {
      response: {
        200: { type: 'array' },
        403: { type: 'object', properties: { error: { type: 'string' } } },
      },
    },
  }, async (_request, _reply) => {
    const fonts = await prisma.fontDefinition.findMany({
      orderBy: { name: 'asc' },
    });

    return fonts.map((f) => ({
      id: f.id,
      name: f.name,
      family: f.family,
      weights: JSON.parse(f.weights),
      url: f.url,
      unicodeRanges: JSON.parse(f.unicodeRanges),
      supportsYoruba: f.supportsYoruba,
      variable: f.variable,
      isActive: f.isActive,
      createdAt: f.createdAt.toISOString(),
      updatedAt: f.updatedAt.toISOString(),
    }));
  });

  // POST /api/admin/fonts - Create font (admin only)
  app.post<{ Body: z.infer<typeof createFontSchema> }>(
    '/api/admin/fonts',
    {
      preHandler: [apiRateLimiter, requireAdmin],
      schema: {
        body: jsonSchema(createFontSchema),
        response: {
          201: { type: 'object', additionalProperties: true },
          400: { type: 'object', properties: { error: { type: 'string' } } },
          403: { type: 'object', properties: { error: { type: 'string' } } },
        },
      },
    },
    async (request, reply) => {
      const { name, family, weights, url, unicodeRanges, supportsYoruba, variable, isActive } = request.body;

      const font = await prisma.fontDefinition.create({
        data: {
          name,
          family,
          weights: JSON.stringify(weights),
          url,
          unicodeRanges: JSON.stringify(unicodeRanges),
          supportsYoruba,
          variable,
          isActive,
        },
      });

      await auditAdmin({
        event: 'admin.font_created',
        properties: { fontId: font.id, name, family, isActive },
        userId: request.user?.id ?? undefined,
      });

      return reply.code(201).send({
        id: font.id,
        name: font.name,
        family: font.family,
        weights: JSON.parse(font.weights),
        url: font.url,
        unicodeRanges: JSON.parse(font.unicodeRanges),
        supportsYoruba: font.supportsYoruba,
        variable: font.variable,
        isActive: font.isActive,
        createdAt: font.createdAt.toISOString(),
        updatedAt: font.updatedAt.toISOString(),
      });
    }
  );

  // PUT /api/admin/fonts/:fontId - Update font (admin only)
  app.put<{
    Params: z.infer<typeof fontParamsSchema>;
    Body: z.infer<typeof updateFontSchema>;
  }>(
    '/api/admin/fonts/:fontId',
    {
      preHandler: [apiRateLimiter, requireAdmin],
      schema: {
        params: jsonSchema(fontParamsSchema),
        body: jsonSchema(updateFontSchema),
        response: {
          200: { type: 'object', additionalProperties: true },
          403: { type: 'object', properties: { error: { type: 'string' } } },
          404: { type: 'object', properties: { error: { type: 'string' } } },
        },
      },
    },
    async (request, reply) => {
      const { fontId } = request.params;
      const body = request.body;

      const existing = await prisma.fontDefinition.findUnique({
        where: { id: fontId },
      });

      if (!existing) {
        return reply.code(404).send({ error: 'Font not found' });
      }

      const updateData: Record<string, unknown> = {};
      if (body.name !== undefined) updateData['name'] = body.name;
      if (body.family !== undefined) updateData['family'] = body.family;
      if (body.weights !== undefined) updateData['weights'] = JSON.stringify(body.weights);
      if (body.url !== undefined) updateData['url'] = body.url;
      if (body.unicodeRanges !== undefined) updateData['unicodeRanges'] = JSON.stringify(body.unicodeRanges);
      if (body.supportsYoruba !== undefined) updateData['supportsYoruba'] = body.supportsYoruba;
      if (body.variable !== undefined) updateData['variable'] = body.variable;
      if (body.isActive !== undefined) updateData['isActive'] = body.isActive;

      const font = await prisma.fontDefinition.update({
        where: { id: fontId },
        data: updateData as unknown as Prisma.FontDefinitionUpdateInput,
      });

      await auditAdmin({
        event: 'admin.font_updated',
        properties: { fontId, ...body },
        userId: request.user?.id ?? undefined,
      });

      return {
        id: font.id,
        name: font.name,
        family: font.family,
        weights: JSON.parse(font.weights),
        url: font.url,
        unicodeRanges: JSON.parse(font.unicodeRanges),
        supportsYoruba: font.supportsYoruba,
        variable: font.variable,
        isActive: font.isActive,
        createdAt: font.createdAt.toISOString(),
        updatedAt: font.updatedAt.toISOString(),
      };
    }
  );
}
