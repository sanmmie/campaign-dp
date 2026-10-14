import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import prisma from '../db/prisma';
import { authenticate, requireAuth } from '../middleware/auth';
import { apiRateLimiter } from '../middleware/rateLimit';
import { jsonSchema } from '../lib/schema';

const updateProfileSchema = z
  .object({
    displayName: z.string().min(1).max(200).nullable().optional(),
    defaultName: z.string().min(1).max(200).nullable().optional(),
    defaultTitle: z.string().min(1).max(200).nullable().optional(),
    defaultOrganisation: z.string().min(1).max(200).nullable().optional(),
    defaultWardLGA: z.string().min(1).max(200).nullable().optional(),
  })
  .strict();

interface ProfileRow {
  id: string;
  userId: string;
  email: string;
  displayName: string | null;
  avatarUrl: string | null;
  defaultName: string | null;
  defaultTitle: string | null;
  defaultOrganisation: string | null;
  defaultWardLGA: string | null;
  createdAt: Date;
  updatedAt: Date;
}

function serializeProfile(p: ProfileRow) {
  return {
    id: p.id,
    email: p.email,
    displayName: p.displayName,
    avatarUrl: p.avatarUrl,
    defaultName: p.defaultName,
    defaultTitle: p.defaultTitle,
    defaultOrganisation: p.defaultOrganisation,
    defaultWardLGA: p.defaultWardLGA,
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
  };
}

export async function profileRoutes(app: FastifyInstance): Promise<void> {
  // GET /api/profile
  app.get('/api/profile', {
    preHandler: [apiRateLimiter, authenticate, requireAuth],
    schema: {
      response: {
        200: { type: 'object', additionalProperties: true },
        401: { type: 'object', properties: { error: { type: 'string' }, message: { type: 'string' } } },
        404: { type: 'object', properties: { error: { type: 'string' }, message: { type: 'string' } } },
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user;
    if (!user) {
      return reply.code(401).send({ error: 'Authentication required' });
    }

    const profile = await prisma.userProfile.findUnique({
      where: { userId: user.id },
    });

    if (!profile) {
      return reply.code(404).send({ error: 'Profile not found' });
    }

    return serializeProfile(profile);
  });

  // PUT /api/profile
  app.put<{ Body: z.infer<typeof updateProfileSchema> }>(
    '/api/profile',
    {
      preHandler: [apiRateLimiter, authenticate, requireAuth],
      schema: {
        body: jsonSchema(updateProfileSchema),
        response: {
          200: { type: 'object', additionalProperties: true },
          400: { type: 'object', properties: { error: { type: 'string' }, message: { type: 'string' } } },
          401: { type: 'object', properties: { error: { type: 'string' }, message: { type: 'string' } } },
        },
      },
    },
    async (request, reply) => {
      const user = request.user;
      if (!user) {
        return reply.code(401).send({ error: 'Authentication required' });
      }

      const body = request.body;
      const existing = await prisma.userProfile.findUnique({
        where: { userId: user.id },
      });

      const profile = await prisma.userProfile.upsert({
        where: { userId: user.id },
        create: {
          userId: user.id,
          email: existing?.email ?? user.email,
          displayName: body.displayName ?? existing?.displayName ?? null,
          defaultName: body.defaultName ?? existing?.defaultName ?? null,
          defaultTitle: body.defaultTitle ?? existing?.defaultTitle ?? null,
          defaultOrganisation:
            body.defaultOrganisation ?? existing?.defaultOrganisation ?? null,
          defaultWardLGA: body.defaultWardLGA ?? existing?.defaultWardLGA ?? null,
        },
        update: {
          displayName: body.displayName ?? undefined,
          defaultName: body.defaultName ?? undefined,
          defaultTitle: body.defaultTitle ?? undefined,
          defaultOrganisation: body.defaultOrganisation ?? undefined,
          defaultWardLGA: body.defaultWardLGA ?? undefined,
        },
      });

      return serializeProfile(profile);
    }
  );
}
