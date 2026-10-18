import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import prisma from '../db/prisma';
import { apiRateLimiter } from '../middleware/rateLimit';
import { jsonSchema } from '../lib/schema';

const publicSlugParams = z.object({
  slug: z.string().min(1).max(100),
});

export async function publicRoutes(app: FastifyInstance): Promise<void> {
  // GET /api/public/campaigns/:slug - Public campaign page data (no auth required)
  app.get<{ Params: z.infer<typeof publicSlugParams> }>(
    '/api/public/campaigns/:slug',
    {
      preHandler: [apiRateLimiter],
      schema: {
        params: jsonSchema(publicSlugParams),
        response: {
          200: { type: 'object', additionalProperties: true },
          404: { type: 'object', properties: { error: { type: 'string' } } },
          429: { type: 'object', properties: { error: { type: 'string' } } },
        },
      },
    },
    async (request, reply) => {
      const { slug } = request.params;

      const campaign = await prisma.campaign.findUnique({
        where: { slug },
        include: {
          organization: {
            select: {
              id: true,
              name: true,
              slug: true,
              plan: true,
              status: true,
            },
          },
          packs: {
            where: {},
            include: {
              assets: true,
              lockup: true,
              templates: {
                where: { versions: { some: { isPublished: true } } },
                include: {
                  versions: {
                    where: { isPublished: true },
                    orderBy: { version: 'asc' },
                  },
                },
                orderBy: { name: 'asc' },
              },
            },
            orderBy: { name: 'asc' },
          },
          templates: {
            where: { versions: { some: { isPublished: true } } },
            include: {
              versions: {
                where: { isPublished: true },
                orderBy: { version: 'asc' },
              },
            },
            orderBy: { name: 'asc' },
          },
        },
      });

      if (!campaign || campaign.status !== 'active') {
        return reply.code(404).send({ error: 'Campaign not found' });
      }

      return {
        id: campaign.id,
        name: campaign.name,
        slug: campaign.slug,
        status: campaign.status,
        authorizedBy: campaign.authorizedBy,
        authorizationRef: campaign.authorizationRef,
        disclaimer: campaign.disclaimer,
        brandPrimary: campaign.brandPrimary,
        brandSecondary: campaign.brandSecondary,
        brandAccent: campaign.brandAccent,
        createdAt: campaign.createdAt.toISOString(),
        updatedAt: campaign.updatedAt.toISOString(),
        organization: campaign.organization,
        packs: campaign.packs.map((pack) => ({
          id: pack.id,
          name: pack.name,
          disclaimer: pack.disclaimer,
          brandPrimary: pack.brandPrimary,
          brandSecondary: pack.brandSecondary,
          brandAccent: pack.brandAccent,
          defaultHeadline: pack.defaultHeadline,
          defaultSubhead: pack.defaultSubhead,
          shareTargets: (() => {
            try {
              const parsed = JSON.parse(pack.shareTargets);
              return Array.isArray(parsed) ? parsed : ['whatsapp', 'facebook', 'x', 'telegram'];
            } catch {
              return ['whatsapp', 'facebook', 'x', 'telegram'];
            }
          })(),
          assets: pack.assets.map((a) => ({
            id: a.id,
            type: a.type,
            url: a.url,
            width: a.width ?? undefined,
            height: a.height ?? undefined,
            mimeType: a.mimeType,
            uploadedAt: a.uploadedAt.toISOString(),
          })),
          lockup: pack.lockup
            ? {
                id: pack.lockup.id,
                type: pack.lockup.type,
                url: pack.lockup.url,
                width: pack.lockup.width ?? undefined,
                height: pack.lockup.height ?? undefined,
                mimeType: pack.lockup.mimeType,
                uploadedAt: pack.lockup.uploadedAt.toISOString(),
              }
            : undefined,
          templates: pack.templates.map((t) => ({
            id: t.id,
            name: t.name,
            category: t.category,
            latestVersion: t.latestVersion,
            versions: t.versions.map((v) => ({
              id: v.id,
              version: v.version,
              name: v.name,
              category: v.category,
              canvasWidth: v.canvasWidth,
              canvasHeight: v.canvasHeight,
              isPublished: v.isPublished,
            })),
          })),
        })),
        templates: campaign.templates.map((t) => ({
          id: t.id,
          name: t.name,
          category: t.category,
          latestVersion: t.latestVersion,
          versions: t.versions.map((v) => ({
            id: v.id,
            version: v.version,
            name: v.name,
            category: v.category,
            canvasWidth: v.canvasWidth,
            canvasHeight: v.canvasHeight,
            isPublished: v.isPublished,
          })),
        })),
      };
    }
  );

  // GET /api/public/organizations/:slug - Public organization page data (no auth required)
  app.get<{ Params: z.infer<typeof publicSlugParams> }>(
    '/api/public/organizations/:slug',
    {
      preHandler: [apiRateLimiter],
      schema: {
        params: jsonSchema(publicSlugParams),
        response: {
          200: { type: 'object', additionalProperties: true },
          404: { type: 'object', properties: { error: { type: 'string' } } },
          429: { type: 'object', properties: { error: { type: 'string' } } },
        },
      },
    },
    async (request, reply) => {
      const { slug } = request.params;

      const organization = await prisma.organization.findUnique({
        where: { slug },
        include: {
          campaigns: {
            where: { status: 'active' },
            select: {
              id: true,
              name: true,
              slug: true,
              status: true,
              createdAt: true,
              updatedAt: true,
            },
            orderBy: { createdAt: 'desc' },
          },
          _count: {
            select: { campaigns: true, memberships: true },
          },
        },
      });

      if (!organization || organization.status !== 'active') {
        return reply.code(404).send({ error: 'Organization not found' });
      }

      return {
        id: organization.id,
        name: organization.name,
        slug: organization.slug,
        plan: organization.plan,
        status: organization.status,
        createdAt: organization.createdAt.toISOString(),
        updatedAt: organization.updatedAt.toISOString(),
        campaigns: organization.campaigns.map((c) => ({
          id: c.id,
          name: c.name,
          slug: c.slug,
          status: c.status,
          createdAt: c.createdAt.toISOString(),
          updatedAt: c.updatedAt.toISOString(),
        })),
        campaignCount: organization._count.campaigns,
        memberCount: organization._count.memberships,
      };
    }
  );
}
