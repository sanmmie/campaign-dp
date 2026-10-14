import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import {
  getCampaignPack,
  getPublishedTemplates,
  getTemplateById,
  updatePackAuthorization,
} from '../services/campaignPack';
import { requireAdmin } from '../middleware/auth';
import { apiRateLimiter } from '../middleware/rateLimit';
import { jsonSchema } from '../lib/schema';

const packParamsSchema = z.object({
  packId: z.string(),
});

const templateParamsSchema = z.object({
  templateId: z.string(),
  version: z.coerce.number().optional(),
});

const updateAuthSchema = z.object({
  authorizedBy: z.string().nullable(),
  authorizationRef: z.string().nullable(),
  disclaimer: z.string().min(1),
});

const packResponseSchema = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    name: { type: 'string' },
    authorizedBy: { type: ['string', 'null'] },
    authorizationRef: { type: ['string', 'null'] },
    disclaimer: { type: 'string' },
    brand: {
      type: 'object',
      properties: {
        primary: { type: 'string' },
        secondary: { type: 'string' },
        accent: { type: 'string' },
        lockup: { type: ['object', 'null'] },
      },
    },
    assets: {
      type: 'object',
      properties: {
        candidatePortrait: { type: 'array' },
        backgroundTextures: { type: 'array' },
      },
    },
    templates: { type: 'array' },
    defaultCopy: {
      type: 'object',
      properties: {
        headline: { type: 'string' },
        subhead: { type: 'string' },
      },
    },
    shareTargets: { type: 'array', items: { type: 'string' } },
    createdAt: { type: 'string' },
    updatedAt: { type: 'string' },
  },
};

async function handleGetPack(
  request: FastifyRequest<{ Params: { packId?: string } }>,
  reply: FastifyReply
) {
  const { packId } = request.params;
  const pack = await getCampaignPack(packId);

  if (!pack) {
    return reply.code(404).send({ error: 'Campaign pack not found' });
  }

  return pack;
}

export async function packRoutes(app: FastifyInstance): Promise<void> {
  // GET /api/packs - Get default campaign pack
  app.get<{ Params: { packId?: string } }>('/api/packs', {
    preHandler: [apiRateLimiter],
    schema: {
      response: {
        200: packResponseSchema,
        404: { type: 'object', properties: { error: { type: 'string' }, message: { type: 'string' } } },
      },
    },
  }, handleGetPack);

  // GET /api/packs/:packId - Get specific campaign pack
  app.get<{ Params: z.infer<typeof packParamsSchema> }>(
    '/api/packs/:packId',
    {
      preHandler: [apiRateLimiter],
      schema: {
        params: jsonSchema(packParamsSchema),
        response: {
          200: packResponseSchema,
          404: { type: 'object', properties: { error: { type: 'string' }, message: { type: 'string' } } },
        },
      },
    },
    handleGetPack
  );

  // GET /api/packs/:packId/templates - Get published templates
  app.get<{ Params: z.infer<typeof packParamsSchema> }>(
    '/api/packs/:packId/templates',
    {
      preHandler: [apiRateLimiter],
      schema: {
        params: jsonSchema(packParamsSchema),
        response: {
          200: { type: 'array' },
        },
      },
    },
    async (request, _reply) => {
      const { packId } = request.params;
      const templates = await getPublishedTemplates(packId);
      return templates;
    }
  );

  // GET /api/templates/:templateId - Get specific template version
  app.get<{ Params: z.infer<typeof templateParamsSchema> }>(
    '/api/templates/:templateId',
    {
      preHandler: [apiRateLimiter],
      schema: {
        params: jsonSchema(templateParamsSchema),
        response: {
          200: { type: 'object', additionalProperties: true },
          404: { type: 'object', properties: { error: { type: 'string' }, message: { type: 'string' } } },
        },
      },
    },
    async (request, reply) => {
      const { templateId, version } = request.params;
      const template = await getTemplateById(templateId, version);

      if (!template) {
        return reply.code(404).send({ error: 'Template not found' });
      }

      return template;
    }
  );

  // PUT /api/admin/packs/:packId/authorization - Update authorization (admin only)
  app.put<{
    Params: z.infer<typeof packParamsSchema>;
    Body: z.infer<typeof updateAuthSchema>;
  }>(
    '/api/admin/packs/:packId/authorization',
    {
      preHandler: [requireAdmin],
      schema: {
        params: jsonSchema(packParamsSchema),
        body: jsonSchema(updateAuthSchema),
        response: {
          200: packResponseSchema,
          403: { type: 'object', properties: { error: { type: 'string' }, message: { type: 'string' } } },
          404: { type: 'object', properties: { error: { type: 'string' }, message: { type: 'string' } } },
        },
      },
    },
    async (request, reply) => {
      const { packId } = request.params;
      const { authorizedBy, authorizationRef, disclaimer } = request.body;

      const pack = await updatePackAuthorization(
        packId,
        authorizedBy,
        authorizationRef,
        disclaimer
      );

      if (!pack) {
        return reply.code(404).send({ error: 'Campaign pack not found' });
      }

      return pack;
    }
  );
}
