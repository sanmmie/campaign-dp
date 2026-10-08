import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import prisma from '../db/prisma';
import { getCampaignPack, getTemplateById } from '../services/campaignPack';
import { renderTemplate, renderPreview } from '../services/templateRenderer';
import { uploadGeneratedImage } from '../services/storage';
import { generateRateLimiter, apiRateLimiter } from '../middleware/rateLimit';
import { authenticate } from '../middleware/auth';
import { jsonSchema } from '../lib/schema';
import { EXPORT_PRESETS } from '@deltadp/shared';

const photoTransformSchema = z.object({
  x: z.number().default(0),
  y: z.number().default(0),
  scaleX: z.number().default(1),
  scaleY: z.number().default(1),
  rotation: z.number().default(0),
  flipX: z.boolean().default(false),
  flipY: z.boolean().default(false),
  crop: z
    .object({
      x: z.number(),
      y: z.number(),
      width: z.number(),
      height: z.number(),
    })
    .optional(),
});

const generateBodySchema = z.object({
  packId: z.string().optional(),
  templateId: z.string(),
  templateVersion: z.number().int().positive(),
  photoUrl: z.string().url().optional(),
  photoTransform: photoTransformSchema.optional(),
  textValues: z.record(z.string()).default({}),
  presetId: z.string(),
  format: z.enum(['png', 'jpg', 'webp']).default('png'),
  quality: z.number().min(1).max(100).default(90),
  includeDisclaimer: z.boolean().default(true),
  saveProject: z.boolean().default(false),
  projectId: z.string().optional(),
});

const previewBodySchema = z.object({
  packId: z.string().optional(),
  templateId: z.string(),
  templateVersion: z.number().int().positive(),
  photoUrl: z.string().url().optional(),
  photoTransform: photoTransformSchema.optional(),
  textValues: z.record(z.string()).default({}),
  includeDisclaimer: z.boolean().default(true),
});

export async function generateRoutes(app: FastifyInstance): Promise<void> {
  // POST /api/generate - Generate final export
  app.post<{ Body: z.infer<typeof generateBodySchema> }>(
    '/api/generate',
    {
      preHandler: [authenticate, generateRateLimiter],
      schema: {
        body: jsonSchema(generateBodySchema),
        response: {
          200: {
            type: 'object',
            properties: {
              url: { type: 'string' },
              path: { type: 'string' },
              width: { type: 'number' },
              height: { type: 'number' },
              format: { type: 'string' },
              fileSize: { type: 'number' },
              generationId: { type: 'string' },
            },
          },
          400: { type: 'object', properties: { error: { type: 'string' }, message: { type: 'string' } } },
          404: { type: 'object', properties: { error: { type: 'string' }, message: { type: 'string' } } },
          429: {
            type: 'object',
            properties: { error: { type: 'string' }, message: { type: 'string' }, retryAfter: { type: 'number' } },
          },
        },
      },
    },
    async (request, reply) => {
      const body = request.body;
      const userId = request.user?.id || null;

      // Fetch pack and template
      const pack = await getCampaignPack(body.packId);
      if (!pack) {
        return reply.code(404).send({ error: 'Campaign pack not found' });
      }

      const template = await getTemplateById(body.templateId, body.templateVersion);
      if (!template) {
        return reply.code(404).send({ error: 'Template not found' });
      }

      // Verify template belongs to pack
      if (!pack.templates.some((t) => t.id === template.templateId)) {
        return reply
          .code(400)
          .send({ error: 'Template does not belong to this campaign pack' });
      }

      // Find preset
      const preset = EXPORT_PRESETS.find((p) => p.id === body.presetId);
      if (!preset) {
        return reply.code(400).send({ error: 'Invalid export preset' });
      }

      // Load photo if provided
      let photoBuffer: Buffer | undefined;
      if (body.photoUrl) {
        try {
          const response = await fetch(body.photoUrl);
          if (response.ok) {
            photoBuffer = Buffer.from(await response.arrayBuffer());
          }
        } catch {
          // Photo loading failed, continue without photo
        }
      }

      // Render template
      const rendered = await renderTemplate({
        pack,
        template,
        photoBuffer,
        photoTransform: body.photoTransform,
        textValues: body.textValues,
        preset: { ...preset, format: body.format, quality: body.quality },
        includeDisclaimer: body.includeDisclaimer,
      });

      // Upload generated image
      const storageKey = body.projectId || `gen-${Date.now()}`;
      const { url, path } = await uploadGeneratedImage(
        storageKey,
        rendered,
        body.format
      );

      // Record generation
      const generation = await prisma.generationRecord.create({
        data: {
          projectId: storageKey,
          storagePath: path,
          userId,
          presetId: body.presetId,
          format: body.format,
          fileSize: BigInt(rendered.length),
          width: preset.width,
          height: preset.height,
        },
      });

      return {
        url,
        path,
        width: preset.width,
        height: preset.height,
        format: body.format,
        fileSize: rendered.length,
        generationId: generation.id,
      };
    }
  );

  // POST /api/preview - Generate low-res preview
  app.post<{ Body: z.infer<typeof previewBodySchema> }>(
    '/api/preview',
    {
      preHandler: [authenticate, generateRateLimiter],
      schema: {
        body: jsonSchema(previewBodySchema),
        response: {
          200: {
            type: 'object',
            properties: {
              dataUrl: { type: 'string' },
              width: { type: 'number' },
              height: { type: 'number' },
            },
          },
          400: { type: 'object', properties: { error: { type: 'string' }, message: { type: 'string' } } },
          404: { type: 'object', properties: { error: { type: 'string' }, message: { type: 'string' } } },
          429: {
            type: 'object',
            properties: { error: { type: 'string' }, message: { type: 'string' }, retryAfter: { type: 'number' } },
          },
        },
      },
    },
    async (request, reply) => {
      const body = request.body;

      const pack = await getCampaignPack(body.packId);
      if (!pack) {
        return reply.code(404).send({ error: 'Campaign pack not found' });
      }

      const template = await getTemplateById(body.templateId, body.templateVersion);
      if (!template) {
        return reply.code(404).send({ error: 'Template not found' });
      }

      let photoBuffer: Buffer | undefined;
      if (body.photoUrl) {
        try {
          const response = await fetch(body.photoUrl);
          if (response.ok) {
            photoBuffer = Buffer.from(await response.arrayBuffer());
          }
        } catch {
          // Continue without photo
        }
      }

      const preview = await renderPreview({
        pack,
        template,
        photoBuffer,
        photoTransform: body.photoTransform,
        textValues: body.textValues,
        preset: { width: 512, height: 512, format: 'png' },
        includeDisclaimer: body.includeDisclaimer,
      });

      const dataUrl = `data:image/png;base64,${preview.toString('base64')}`;

      return {
        dataUrl,
        width: 512,
        height: 512,
      };
    }
  );

  // GET /api/presets - Get export presets
  app.get('/api/presets', {
    preHandler: [apiRateLimiter],
    schema: {
      response: {
        200: { type: 'array' },
      },
    },
  }, async (_request: FastifyRequest, _reply: FastifyReply) => {
    return EXPORT_PRESETS;
  });
}
