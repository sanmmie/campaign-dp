import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import prisma from '../db/prisma';
import {
  getCampaignPack,
  getPublishedTemplates,
  getTemplateById,
  updatePackAuthorization,
  createPackAsset,
  mapTemplateVersion,
} from '../services/campaignPack';
import { renderPreview } from '../services/templateRenderer';
import { requireRole } from '../middleware/auth';
import { apiRateLimiter } from '../middleware/rateLimit';
import { jsonSchema } from '../lib/schema';
import { auditAdmin } from '../lib/audit';
import { env } from '../config/env';

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

  // GET /api/templates - List published templates (default pack)
  app.get('/api/templates', {
    preHandler: [apiRateLimiter],
    schema: {
      response: {
        200: { type: 'array' },
      },
    },
  },
  async (_request, _reply) => {
    const templates = await getPublishedTemplates();
    return templates;
  });

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

  // GET /api/templates/:templateId/thumbnail - Render template thumbnail (public)
  const thumbnailQuerySchema = z.object({
    version: z.coerce.number().optional(),
  });

  app.get<{ Params: z.infer<typeof templateParamsSchema>; Querystring: z.infer<typeof thumbnailQuerySchema> }>(
    '/api/templates/:templateId/thumbnail',
    {
      preHandler: [apiRateLimiter],
      schema: {
        params: jsonSchema(templateParamsSchema),
        querystring: jsonSchema(thumbnailQuerySchema),
        response: {
          200: { type: 'string', contentEncoding: 'identity', contentMediaType: 'image/png' },
          404: { type: 'object', properties: { error: { type: 'string' }, message: { type: 'string' } } },
          429: { type: 'object', properties: { error: { type: 'string' }, message: { type: 'string' }, retryAfter: { type: 'number' } } },
        },
      },
    },
    async (request, reply) => {
      const { templateId } = request.params;
      const { version } = request.query;

      const pack = await getCampaignPack();
      if (!pack) {
        return reply.code(404).send({ error: 'Campaign pack not found' });
      }

      const template = await getTemplateById(templateId, version);
      if (!template) {
        return reply.code(404).send({ error: 'Template not found' });
      }

      try {
        const preview = await renderPreview({
          pack,
          template,
          textValues: {},
          preset: { width: 512, height: 512, format: 'png' },
          includeDisclaimer: false,
        });

        return reply
          .code(200)
          .header('content-type', 'image/png')
          .header('cache-control', 'public, max-age=86400')
          .send(preview);
      } catch {
        return reply.code(500).send({ error: 'Failed to render thumbnail' });
      }
    }
  );

  // PUT /api/admin/packs/:packId/authorization - Update authorization (admin only)
  app.put<{
    Params: z.infer<typeof packParamsSchema>;
    Body: z.infer<typeof updateAuthSchema>;
  }>(
    '/api/admin/packs/:packId/authorization',
    {
      preHandler: [requireRole(['platform_admin', 'org_admin'])],
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

      await auditAdmin({
        event: 'admin.pack_authorization_updated',
        properties: { packId, authorizedBy, authorizationRef, disclaimer },
        userId: request.user?.id ?? undefined,
      });

      return pack;
    }
  );

  // POST /api/admin/templates/upload - Upload a template design (admin only)
  const layerSchema: z.ZodTypeAny = z.lazy(() =>
    z.object({
      id: z.string().min(1),
      type: z.enum(['image', 'text', 'photo', 'shape']),
      x: z.number(),
      y: z.number(),
      width: z.number().optional(),
      height: z.number().optional(),
      rotation: z.number().optional(),
      opacity: z.number().optional(),
      locked: z.boolean().default(false),
      visible: z.boolean().default(true),
      zIndex: z.number().default(0),
      src: z.string().optional(),
      fit: z.enum(['cover', 'contain', 'fill', 'none']).optional(),
      text: z.string().optional(),
      fontSize: z.number().optional(),
      fontFamily: z.string().optional(),
      fontWeight: z.number().optional(),
      color: z.string().optional(),
      alignment: z.enum(['left', 'center', 'right']).optional(),
      lineHeight: z.number().optional(),
      letterSpacing: z.number().optional(),
      textTransform: z.enum(['none', 'uppercase', 'lowercase', 'capitalize']).optional(),
      maxWidth: z.number().optional(),
      maxHeight: z.number().optional(),
      shape: z.enum(['circle', 'square', 'rounded-rect', 'free']).optional(),
      borderRadius: z.number().optional(),
      shapeType: z.enum(['rect', 'circle', 'ellipse', 'polygon']).optional(),
      stroke: z.string().optional(),
      strokeWidth: z.number().optional(),
      points: z.array(z.number()).optional(),
    })
  );

  const uploadTemplateSchema = z.object({
    packId: z.string(),
    name: z.string().min(1),
    category: z.string(),
    canvas: z.object({ width: z.number().positive(), height: z.number().positive() }),
    photoZone: z.object({
      x: z.number(),
      y: z.number(),
      width: z.number().positive(),
      height: z.number().positive(),
      shape: z.string(),
      borderRadius: z.number().nullable().optional(),
      locked: z.boolean().default(false),
    }),
    layers: z.array(layerSchema),
    version: z.coerce.number().int().positive().default(1),
  });

  app.post<{ Body: z.infer<typeof uploadTemplateSchema> }>(
    '/api/admin/templates/upload',
    {
      preHandler: [requireRole(['platform_admin', 'org_admin']), apiRateLimiter],
      schema: {
        body: jsonSchema(uploadTemplateSchema),
        response: {
          200: { type: 'object', additionalProperties: true },
          400: { type: 'object', properties: { error: { type: 'string' }, message: { type: 'string' } } },
          403: { type: 'object', properties: { error: { type: 'string' }, message: { type: 'string' } } },
        },
      },
    },
    async (request, reply) => {
      const { packId, name, category, canvas, photoZone, layers, version } = request.body;
      const userId = request.user?.id || 'system';

      // Verify pack exists
      const pack = await prisma.campaignPack.findUnique({ where: { id: packId } });
      if (!pack) {
        return reply.code(404).send({ error: 'Campaign pack not found' });
      }

      // Create or find template
      let template = await prisma.template.findFirst({
        where: { packId, name },
      });

      if (!template) {
        template = await prisma.template.create({
          data: {
            id: `tpl_${Date.now()}`,
            name,
            category,
            packId,
            latestVersion: version,
          },
        });
      }

      // Check if version already exists
      const existingVersion = await prisma.templateVersion.findUnique({
        where: { templateId_version: { templateId: template.id, version } },
      });

      if (existingVersion) {
        return reply.code(400).send({
          error: 'Version already exists',
          message: `Template version ${version} already exists for this template`,
        });
      }

      const templateVersion = await prisma.templateVersion.create({
        data: {
          id: `tplv_${Date.now()}`,
          templateId: template.id,
          version,
          name,
          category,
          canvasWidth: canvas.width,
          canvasHeight: canvas.height,
          photoZoneX: photoZone.x,
          photoZoneY: photoZone.y,
          photoZoneWidth: photoZone.width,
          photoZoneHeight: photoZone.height,
          photoZoneShape: photoZone.shape,
          photoZoneBorderRadius: photoZone.borderRadius ?? null,
          photoZoneLocked: photoZone.locked,
          layersJson: JSON.stringify(layers),
          isPublished: true,
          publishedAt: new Date(),
          createdBy: userId,
        },
      });

      // Update latestVersion
      await prisma.template.update({
        where: { id: template.id },
        data: { latestVersion: version, updatedAt: new Date() },
      });

      return {
        templateId: template.id,
        templateVersion: {
          id: templateVersion.id,
          version: templateVersion.version,
          name: templateVersion.name,
          category: templateVersion.category,
          isPublished: templateVersion.isPublished,
        },
      };
    }
  );

  // POST /api/admin/packs/:packId/assets - Register a pack asset (admin only)
  const packAssetSchema = z.object({
    type: z.string(),
    url: z.string().url(),
    mimeType: z.string(),
    width: z.number().int().positive().optional(),
    height: z.number().int().positive().optional(),
  });

  app.post<{
    Params: z.infer<typeof packParamsSchema>;
    Body: z.infer<typeof packAssetSchema>;
  }>(
    '/api/admin/packs/:packId/assets',
    {
      preHandler: [requireRole(['platform_admin', 'org_admin']), apiRateLimiter],
      schema: {
        params: jsonSchema(packParamsSchema),
        body: jsonSchema(packAssetSchema),
        response: {
          200: { type: 'object', additionalProperties: true },
          400: { type: 'object', properties: { error: { type: 'string' } } },
          403: { type: 'object', properties: { error: { type: 'string' } } },
          404: { type: 'object', properties: { error: { type: 'string' } } },
        },
      },
    },
    async (request, reply) => {
      const { packId } = request.params;
      const { type, url, mimeType, width, height } = request.body;
      const uploadedBy = request.user?.id || 'system';

      const pack = await prisma.campaignPack.findUnique({ where: { id: packId } });
      if (!pack) {
        return reply.code(404).send({ error: 'Campaign pack not found' });
      }

      const asset = await createPackAsset(
        packId,
        type,
        url,
        mimeType,
        uploadedBy,
        width,
        height
      );

      return asset;
    }
  );

  // GET /api/admin/templates - List ALL templates in a pack (incl. drafts) for admin
  const adminTemplatesQuerySchema = z.object({
    packId: z.string().optional(),
  });

  app.get<{ Querystring: z.infer<typeof adminTemplatesQuerySchema> }>(
    '/api/admin/templates',
    {
      preHandler: [apiRateLimiter, requireRole(['platform_admin', 'org_admin'])],
      schema: {
        querystring: jsonSchema(adminTemplatesQuerySchema),
        response: {
          200: { type: 'array' },
          403: { type: 'object', properties: { error: { type: 'string' } } },
        },
      },
    },
    async (_request, _reply) => {
      const { packId } = _request.query;
      const id = packId || env.CAMPAIGN_PACK_ID;

      const templates = await prisma.template.findMany({
        where: { packId: id },
        include: {
          versions: { orderBy: { version: 'asc' } },
        },
        orderBy: { name: 'asc' },
      });

      return templates.map((t) => {
        const versions = t.versions.map(mapTemplateVersion);
        return {
          id: t.id,
          name: t.name,
          category: t.category,
          latestVersion: t.latestVersion,
          versions,
          createdAt: t.createdAt.toISOString(),
          updatedAt: t.updatedAt.toISOString(),
        };
      });
    }
  );

  // PUT /api/admin/templates/:templateId/publish - toggle publish state (admin only)
  const togglePublishSchema = z.object({
    isPublished: z.boolean(),
    version: z.coerce.number().int().positive().optional(),
  });

  app.put<{
    Params: z.infer<typeof templateParamsSchema>;
    Body: z.infer<typeof togglePublishSchema>;
  }>(
    '/api/admin/templates/:templateId/publish',
    {
      preHandler: [apiRateLimiter, requireRole(['platform_admin', 'org_admin'])],
      schema: {
        params: jsonSchema(templateParamsSchema),
        body: jsonSchema(togglePublishSchema),
        response: {
          200: { type: 'object', additionalProperties: true },
          403: { type: 'object', properties: { error: { type: 'string' } } },
          404: { type: 'object', properties: { error: { type: 'string' } } },
        },
      },
    },
    async (request, reply) => {
      const { templateId } = request.params;
      const { isPublished, version } = request.body;

      const template = await prisma.template.findUnique({
        where: { id: templateId },
        include: { versions: true },
      });

      if (!template) {
        return reply.code(404).send({ error: 'Template not found' });
      }

      const targetVersion = version ?? template.latestVersion;

      const updated = await prisma.templateVersion.updateMany({
        where: { templateId, version: targetVersion },
        data: {
          isPublished,
          ...(isPublished ? { publishedAt: new Date() } : {}),
        },
      });

      if (updated.count === 0) {
        return reply.code(404).send({ error: 'Template version not found' });
      }

      return {
        templateId,
        version: targetVersion,
        isPublished,
      };
    }
  );

  // POST /api/admin/templates/:templateId/duplicate - duplicate latest version (admin only)
  app.post<{
    Params: z.infer<typeof templateParamsSchema>;
  }>(
    '/api/admin/templates/:templateId/duplicate',
    {
      preHandler: [apiRateLimiter, requireRole(['platform_admin', 'org_admin'])],
      schema: {
        params: jsonSchema(templateParamsSchema),
        response: {
          201: { type: 'object', additionalProperties: true },
          403: { type: 'object', properties: { error: { type: 'string' } } },
          404: { type: 'object', properties: { error: { type: 'string' } } },
        },
      },
    },
    async (request, reply) => {
      const { templateId } = request.params;
      const userId = request.user?.id || 'system';

      const template = await prisma.template.findUnique({
        where: { id: templateId },
      });

      if (!template) {
        return reply.code(404).send({ error: 'Template not found' });
      }

      const source = await prisma.templateVersion.findFirst({
        where: { templateId, version: template.latestVersion },
      });

      if (!source) {
        return reply.code(404).send({ error: 'Template version not found' });
      }

      const newVersion = template.latestVersion + 1;

      const duplicated = await prisma.templateVersion.create({
        data: {
          templateId: template.id,
          version: newVersion,
          name: `${source.name} (Copy)`,
          category: source.category,
          canvasWidth: source.canvasWidth,
          canvasHeight: source.canvasHeight,
          photoZoneX: source.photoZoneX,
          photoZoneY: source.photoZoneY,
          photoZoneWidth: source.photoZoneWidth,
          photoZoneHeight: source.photoZoneHeight,
          photoZoneShape: source.photoZoneShape,
          photoZoneBorderRadius: source.photoZoneBorderRadius,
          photoZoneLocked: source.photoZoneLocked,
          layersJson: source.layersJson,
          isPublished: false,
          createdBy: userId,
        },
      });

      await prisma.template.update({
        where: { id: templateId },
        data: { latestVersion: newVersion },
      });

      return reply.code(201).send({
        templateId: template.id,
        templateVersion: {
          id: duplicated.id,
          version: duplicated.version,
          name: duplicated.name,
          category: duplicated.category,
          isPublished: duplicated.isPublished,
        },
      });
    }
  );
}
