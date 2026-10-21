import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import prisma from '../db/prisma';
import { env } from '../config/env';
import { getCampaignPack } from '../services/campaignPack';
import { createSignedUrl } from '../services/storage';
import { apiRateLimiter } from '../middleware/rateLimit';
import { authenticate } from '../middleware/auth';
import { jsonSchema } from '../lib/schema';

const shareBodySchema = z.object({
  generationId: z.string().optional(),
  projectId: z.string().optional(),
  presetId: z.string(),
  platform: z.enum(['whatsapp', 'facebook', 'x', 'telegram', 'copy-link', 'copy-image']),
  message: z.string().optional(),
});

const shareParamsSchema = z.object({
  generationId: z.string(),
});

const shareConfigQuerySchema = z.object({
  packId: z.string().optional(),
});

export async function shareRoutes(app: FastifyInstance): Promise<void> {
  // POST /api/share - Create share link/intent
  app.post<{ Body: z.infer<typeof shareBodySchema> }>(
    '/api/share',
    {
      preHandler: [apiRateLimiter, authenticate],
      schema: {
        body: jsonSchema(shareBodySchema),
        response: {
          200: {
            type: 'object',
            properties: {
              url: { type: 'string' },
              intentUrl: { type: 'string' },
              platform: { type: 'string' },
            },
          },
          400: { type: 'object', properties: { error: { type: 'string' }, message: { type: 'string' } } },
          404: { type: 'object', properties: { error: { type: 'string' }, message: { type: 'string' } } },
        },
      },
    },
    async (request, reply) => {
      const { generationId, projectId, platform, message } =
        request.body;
      const userId = request.user?.id || null;

      let imageUrl: string;
      let pack;

      if (generationId) {
        const generation = await prisma.generationRecord.findUnique({
          where: { id: generationId },
        });

        if (!generation) {
          return reply.code(404).send({ error: 'Generation not found' });
        }

        if (generation.userId !== userId && generation.userId !== null) {
          return reply.code(404).send({ error: 'Generation not found' });
        }

        const project = generation.projectId
          ? await prisma.project.findUnique({
              where: { id: generation.projectId },
            })
          : null;

        imageUrl = `${request.headers.origin || 'http://localhost:3001'}/api/generations/${generationId}/file`;
        pack = await getCampaignPack(project?.packId);
      } else if (projectId) {
        const project = await prisma.project.findUnique({
          where: { id: projectId },
        });

        if (!project || project.userId !== userId) {
          return reply.code(404).send({ error: 'Project not found' });
        }

        imageUrl = `${request.headers.origin || 'http://localhost:3001'}/project/${projectId}`;
        pack = await getCampaignPack(project.packId);
      } else {
        return reply
          .code(400)
          .send({ error: 'Either generationId or projectId is required' });
      }

      if (!pack) {
        return reply.code(404).send({ error: 'Campaign pack not found' });
      }

      if (
        !pack.shareTargets.includes(platform as never) &&
        platform !== 'copy-link' &&
        platform !== 'copy-image'
      ) {
        return reply
          .code(400)
          .send({
            error: 'Sharing to this platform is not enabled for this campaign',
          });
      }

      const baseUrl = request.headers.origin || 'http://localhost:3001';
      const shareText = message || `I support ${pack.name}! Join me at ${baseUrl}`;
      const encodedText = encodeURIComponent(shareText);
      const encodedUrl = encodeURIComponent(imageUrl);

      let intentUrl: string;
      let shareUrl: string;

      switch (platform) {
        case 'whatsapp':
          intentUrl = `https://wa.me/?text=${encodedText}%20${encodedUrl}`;
          shareUrl = intentUrl;
          break;
        case 'facebook':
          intentUrl = `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}&quote=${encodedText}`;
          shareUrl = intentUrl;
          break;
        case 'x':
          intentUrl = `https://twitter.com/intent/tweet?text=${encodedText}&url=${encodedUrl}`;
          shareUrl = intentUrl;
          break;
        case 'telegram':
          intentUrl = `https://t.me/share/url?url=${encodedUrl}&text=${encodedText}`;
          shareUrl = intentUrl;
          break;
        case 'copy-link':
          intentUrl = imageUrl;
          shareUrl = imageUrl;
          break;
        case 'copy-image':
          intentUrl = imageUrl;
          shareUrl = imageUrl;
          break;
        default:
          intentUrl = imageUrl;
          shareUrl = imageUrl;
      }

      return {
        url: shareUrl,
        intentUrl,
        platform,
      };
    }
  );

  // GET /api/generations/:generationId/file - Serve generated image file
  app.get<{ Params: z.infer<typeof shareParamsSchema> }>(
    '/api/generations/:generationId/file',
    {
      preHandler: [apiRateLimiter],
      schema: {
        params: jsonSchema(shareParamsSchema),
        response: {
          302: { type: 'null' },
          404: { type: 'object', properties: { error: { type: 'string' }, message: { type: 'string' } } },
        },
      },
    },
    async (request, reply) => {
      const { generationId } = request.params;

      const generation = await prisma.generationRecord.findUnique({
        where: { id: generationId },
      });

      if (!generation || !generation.storagePath) {
        return reply.code(404).send({ error: 'Generation file not found' });
      }

      const signedUrl = await createSignedUrl(
        env.STORAGE_BUCKET,
        generation.storagePath,
        60
      );

      return reply.redirect(302, signedUrl);
    }
  );

  // GET /api/download/:generationId - Download generated image (auth required)
  app.get<{ Params: z.infer<typeof shareParamsSchema> }>(
    '/api/download/:generationId',
    {
      preHandler: [authenticate, apiRateLimiter],
      schema: {
        params: jsonSchema(shareParamsSchema),
        response: {
          200: { type: 'string', contentEncoding: 'identity' },
          401: { type: 'object', properties: { error: { type: 'string' } } },
          403: { type: 'object', properties: { error: { type: 'string' }, message: { type: 'string' } } },
          404: { type: 'object', properties: { error: { type: 'string' }, message: { type: 'string' } } },
        },
      },
    },
    async (request, reply) => {
      const { generationId } = request.params;
      const userId = request.user?.id;

      const generation = await prisma.generationRecord.findUnique({
        where: { id: generationId },
      });

      if (!generation || !generation.storagePath) {
        return reply.code(404).send({ error: 'Generation file not found' });
      }

      if (generation.userId && generation.userId !== userId) {
        return reply.code(403).send({ error: 'Access denied' });
      }

      const signedUrl = await createSignedUrl(
        env.STORAGE_BUCKET,
        generation.storagePath,
        300
      );

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15_000);

      let response: Response;
      try {
        response = await fetch(signedUrl, { signal: controller.signal });
      } catch {
        return reply.code(500).send({ error: 'Failed to retrieve image' });
      } finally {
        clearTimeout(timeout);
      }

      if (!response.ok) {
        return reply.code(500).send({ error: 'Failed to retrieve image' });
      }

      const buffer = Buffer.from(await response.arrayBuffer());
      const contentType = response.headers.get('content-type') || 'image/png';
      const extension = generation.format === 'jpg' ? 'jpg' : generation.format === 'webp' ? 'webp' : 'png';

      return reply
        .code(200)
        .header('content-type', contentType)
        .header('content-disposition', `attachment; filename="generation-${generationId}.${extension}"`)
        .header('content-length', buffer.length.toString())
        .send(buffer);
    }
  );

  // GET /api/share/config - Get share configuration
  app.get<{ Querystring: z.infer<typeof shareConfigQuerySchema> }>(
    '/api/share/config',
    {
      preHandler: [apiRateLimiter],
      schema: {
        querystring: jsonSchema(shareConfigQuerySchema),
        response: {
          200: {
            type: 'object',
            properties: {
              shareTargets: { type: 'array', items: { type: 'string' } },
            },
          },
        },
      },
    },
    async (request, _reply) => {
      const pack = await getCampaignPack(request.query.packId);
      return {
        shareTargets: pack?.shareTargets || ['whatsapp', 'facebook', 'x', 'telegram'],
      };
    }
  );
}
