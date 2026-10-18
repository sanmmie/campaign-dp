import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import prisma from '../db/prisma';
import {
  requireAuth,
  requireOrganizationAccess,
  requireOrganizationRole,
  organizationRole,
  type AuthUser,
} from '../middleware/auth';
import { apiRateLimiter } from '../middleware/rateLimit';
import { jsonSchema } from '../lib/schema';
import { auditAdmin } from '../lib/audit';

const orgParamsSchema = z.object({
  organizationId: z.string().uuid().or(z.string().min(1)),
});

const campaignParamsSchema = z.object({
  organizationId: z.string().uuid().or(z.string().min(1)),
  campaignId: z.string().uuid().or(z.string().min(1)),
});

const memberParamsSchema = z.object({
  organizationId: z.string().uuid().or(z.string().min(1)),
  userId: z.string().uuid().or(z.string().min(1)),
});

const createOrganizationSchema = z.object({
  name: z.string().min(1).max(200),
  slug: z.string().min(1).max(60).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
});

const createCampaignSchema = z.object({
  name: z.string().min(1).max(200),
  slug: z.string().min(1).max(60).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  status: z.enum(['draft', 'active', 'completed', 'archived']).default('draft'),
  authorizedBy: z.string().optional(),
  authorizationRef: z.string().optional(),
  disclaimer: z.string().optional(),
});

const addMemberSchema = z.object({
  userId: z.string().uuid().or(z.string().min(1)),
  role: z.enum([
    'org_admin',
    'campaign_manager',
    'template_designer',
    'analyst',
  ]),
});

const updateStatusSchema = z.object({
  status: z.enum(['active', 'suspended', 'cancelled']),
});

const updateSettingsSchema = z.object({
  state: z.string().min(1).max(100).optional(),
  lga: z.string().min(1).max(100).optional(),
  ward: z.string().min(1).max(100).optional(),
  customDomain: z.string().min(1).max(200).optional(),
  contactEmail: z.string().email().optional(),
  appName: z.string().min(1).max(100).optional(),
  supportEmail: z.string().email().optional(),
});

const hexColor = z.string().regex(/^#[0-9A-Fa-f]{6}$/);

const updateBrandingSchema = z.object({
  brandPrimary: hexColor.optional(),
  brandSecondary: hexColor.optional(),
  brandAccent: hexColor.optional(),
  brandLockupId: z.string().uuid().or(z.string().min(1)).optional(),
  defaultHeadline: z.string().min(1).max(200).optional(),
  defaultSubhead: z.string().min(1).max(300).optional(),
});

const updateMemberRoleSchema = z.object({
  role: z.enum([
    'org_admin',
    'campaign_manager',
    'template_designer',
    'analyst',
  ]),
});

export async function organizationRoutes(app: FastifyInstance): Promise<void> {
  // GET /api/organizations - List organizations the user belongs to
  app.get('/api/organizations', {
    preHandler: [apiRateLimiter, requireAuth],
    schema: {
      response: {
        200: { type: 'array' },
        401: { type: 'object', properties: { error: { type: 'string' } } },
      },
    },
  }, async (request, reply) => {
    const user = request.user as AuthUser;
    if (!user) {
      return reply.code(401).send({ error: 'Authentication required' });
    }

    const memberships = await prisma.membership.findMany({
      where: { userId: user.id },
      include: {
        organization: {
          include: {
            _count: {
              select: { campaigns: true, packs: true, generations: true },
            },
            subscription: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return memberships.map((m) => ({
      id: m.organization.id,
      name: m.organization.name,
      slug: m.organization.slug,
      plan: m.organization.plan,
      status: m.organization.status,
      role: m.role,
      isPlatformAdmin: user.isPlatformAdmin,
      createdAt: m.organization.createdAt.toISOString(),
      updatedAt: m.organization.updatedAt.toISOString(),
      campaignCount: m.organization._count.campaigns,
      packCount: m.organization._count.packs,
      generationCount: m.organization._count.generations,
      subscription: m.organization.subscription
        ? {
            plan: m.organization.subscription.plan,
            status: m.organization.subscription.status,
            currentPeriodEnd: m.organization.subscription.currentPeriodEnd
              ? m.organization.subscription.currentPeriodEnd.toISOString()
              : null,
          }
        : null,
    }));
  });

  // POST /api/organizations - Create an organization (platform_admin or any authenticated user)
  app.post<{ Body: z.infer<typeof createOrganizationSchema> }>(
    '/api/organizations',
    {
      preHandler: [apiRateLimiter, requireAuth],
      schema: {
        body: jsonSchema(createOrganizationSchema),
        response: {
          201: { type: 'object', additionalProperties: true },
          400: { type: 'object', properties: { error: { type: 'string' } } },
          401: { type: 'object', properties: { error: { type: 'string' } } },
        },
      },
    },
    async (request, reply) => {
      const user = request.user as AuthUser;
      if (!user) {
        return reply.code(401).send({ error: 'Authentication required' });
      }

      const { name, slug } = request.body;

      const existing = await prisma.organization.findUnique({ where: { slug } });
      if (existing) {
        return reply.code(409).send({ error: 'Organization slug already in use' });
      }

      const organization = await prisma.organization.create({
        data: {
          name,
          slug,
          ownerId: user.id,
        },
      });

      await prisma.membership.create({
        data: {
          userId: user.id,
          organizationId: organization.id,
          role: 'org_admin',
        },
      });

      await auditAdmin({
        event: 'organization.created',
        properties: { organizationId: organization.id, name, slug },
        userId: user.id,
      });

      return reply.code(201).send({
        id: organization.id,
        name: organization.name,
        slug: organization.slug,
        role: 'org_admin',
        createdAt: organization.createdAt.toISOString(),
      });
    }
  );

  // GET /api/organizations/:organizationId - Organization detail
  app.get<{ Params: z.infer<typeof orgParamsSchema> }>(
    '/api/organizations/:organizationId',
    {
      preHandler: [
        apiRateLimiter,
        requireAuth,
        requireOrganizationAccess('organizationId'),
      ],
      schema: {
        params: jsonSchema(orgParamsSchema),
        response: {
          200: { type: 'object', additionalProperties: true },
          401: { type: 'object', properties: { error: { type: 'string' } } },
          403: { type: 'object', properties: { error: { type: 'string' } } },
          404: { type: 'object', properties: { error: { type: 'string' } } },
        },
      },
    },
    async (request, reply) => {
      const user = request.user as AuthUser;
      const { organizationId } = request.params;

      const organization = await prisma.organization.findUnique({
        where: { id: organizationId },
        include: {
          campaigns: {
            orderBy: { updatedAt: 'desc' },
            take: 10,
          },
          packs: {
            orderBy: { updatedAt: 'desc' },
            take: 10,
          },
          subscription: true,
          memberships: {
            include: {
              organization: false,
            },
            orderBy: { createdAt: 'desc' },
          },
        },
      });

      if (!organization) {
        return reply.code(404).send({ error: 'Organization not found' });
      }

      const role = organizationRole(user, organizationId);

      return {
        id: organization.id,
        name: organization.name,
        slug: organization.slug,
        plan: organization.plan,
        status: organization.status,
        ownerId: organization.ownerId,
        role,
        isPlatformAdmin: user?.isPlatformAdmin ?? false,
        settings: organization.settings,
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
        packs: organization.packs.map((p) => ({
          id: p.id,
          name: p.name,
          createdAt: p.createdAt.toISOString(),
          updatedAt: p.updatedAt.toISOString(),
        })),
        subscription: organization.subscription
          ? {
              id: organization.subscription.id,
              plan: organization.subscription.plan,
              status: organization.subscription.status,
              currentPeriodStart: organization.subscription.currentPeriodStart
                ? organization.subscription.currentPeriodStart.toISOString()
                : null,
              currentPeriodEnd: organization.subscription.currentPeriodEnd
                ? organization.subscription.currentPeriodEnd.toISOString()
                : null,
              cancelAtPeriodEnd: organization.subscription.cancelAtPeriodEnd,
            }
          : null,
        members: organization.memberships.map((m) => ({
          id: m.id,
          userId: m.userId,
          role: m.role,
          createdAt: m.createdAt.toISOString(),
        })),
      };
    }
  );

  // GET /api/organizations/:organizationId/campaigns - List campaigns
  app.get<{ Params: z.infer<typeof orgParamsSchema> }>(
    '/api/organizations/:organizationId/campaigns',
    {
      preHandler: [
        apiRateLimiter,
        requireAuth,
        requireOrganizationAccess('organizationId'),
      ],
      schema: {
        params: jsonSchema(orgParamsSchema),
        response: {
          200: { type: 'array' },
          401: { type: 'object', properties: { error: { type: 'string' } } },
          403: { type: 'object', properties: { error: { type: 'string' } } },
        },
      },
    },
    async (request, _reply) => {
      const { organizationId } = request.params;

      const campaigns = await prisma.campaign.findMany({
        where: { organizationId },
        orderBy: { updatedAt: 'desc' },
      });

      return campaigns.map((c) => ({
        id: c.id,
        organizationId: c.organizationId,
        name: c.name,
        slug: c.slug,
        status: c.status,
        authorizedBy: c.authorizedBy,
        authorizationRef: c.authorizationRef,
        disclaimer: c.disclaimer,
        brandPrimary: c.brandPrimary,
        brandSecondary: c.brandSecondary,
        brandAccent: c.brandAccent,
        createdAt: c.createdAt.toISOString(),
        updatedAt: c.updatedAt.toISOString(),
      }));
    }
  );

  // POST /api/organizations/:organizationId/campaigns - Create campaign
  app.post<{
    Params: z.infer<typeof orgParamsSchema>;
    Body: z.infer<typeof createCampaignSchema>;
  }>(
    '/api/organizations/:organizationId/campaigns',
    {
      preHandler: [
        apiRateLimiter,
        requireAuth,
        requireOrganizationRole(
          ['platform_admin', 'org_admin', 'campaign_manager'],
          'organizationId'
        ),
      ],
      schema: {
        params: jsonSchema(orgParamsSchema),
        body: jsonSchema(createCampaignSchema),
        response: {
          201: { type: 'object', additionalProperties: true },
          400: { type: 'object', properties: { error: { type: 'string' } } },
          401: { type: 'object', properties: { error: { type: 'string' } } },
          403: { type: 'object', properties: { error: { type: 'string' } } },
        },
      },
    },
    async (request, reply) => {
      const { organizationId } = request.params;
      const { name, slug, status, authorizedBy, authorizationRef, disclaimer } =
        request.body;

      const existing = await prisma.campaign.findUnique({ where: { slug } });
      if (existing) {
        return reply.code(409).send({ error: 'Campaign slug already in use' });
      }

      const campaign = await prisma.campaign.create({
        data: {
          organizationId,
          name,
          slug,
          status,
          authorizedBy: authorizedBy || null,
          authorizationRef: authorizationRef || null,
          disclaimer: disclaimer || '',
        },
      });

      await auditAdmin({
        event: 'campaign.created',
        properties: { campaignId: campaign.id, organizationId, name, slug },
        userId: (request.user as AuthUser)?.id,
      });

      return reply.code(201).send({
        id: campaign.id,
        name: campaign.name,
        slug: campaign.slug,
        status: campaign.status,
        createdAt: campaign.createdAt.toISOString(),
      });
    }
  );

  // GET /api/organizations/:organizationId/campaigns/:campaignId - Campaign detail
  app.get<{ Params: z.infer<typeof campaignParamsSchema> }>(
    '/api/organizations/:organizationId/campaigns/:campaignId',
    {
      preHandler: [
        apiRateLimiter,
        requireAuth,
        requireOrganizationAccess('organizationId'),
      ],
      schema: {
        params: jsonSchema(campaignParamsSchema),
        response: {
          200: { type: 'object', additionalProperties: true },
          401: { type: 'object', properties: { error: { type: 'string' } } },
          403: { type: 'object', properties: { error: { type: 'string' } } },
          404: { type: 'object', properties: { error: { type: 'string' } } },
        },
      },
    },
    async (request, reply) => {
      const { organizationId, campaignId } = request.params;
      const user = request.user as AuthUser;

      const campaign = await prisma.campaign.findFirst({
        where: { id: campaignId, organizationId },
        include: {
          packs: true,
          templates: {
            include: {
              versions: {
                where: { isPublished: true },
                orderBy: { version: 'asc' },
              },
            },
          },
          generations: {
            orderBy: { createdAt: 'desc' },
            take: 10,
          },
        },
      });

      if (!campaign) {
        return reply.code(404).send({ error: 'Campaign not found' });
      }

      const role = organizationRole(user, organizationId);

      const totalGenerations = await prisma.generationRecord.count({
        where: { campaignId },
      });

      return {
        id: campaign.id,
        organizationId: campaign.organizationId,
        name: campaign.name,
        slug: campaign.slug,
        status: campaign.status,
        authorizedBy: campaign.authorizedBy,
        authorizationRef: campaign.authorizationRef,
        disclaimer: campaign.disclaimer,
        brandPrimary: campaign.brandPrimary,
        brandSecondary: campaign.brandSecondary,
        brandAccent: campaign.brandAccent,
        role,
        isPlatformAdmin: user?.isPlatformAdmin ?? false,
        createdAt: campaign.createdAt.toISOString(),
        updatedAt: campaign.updatedAt.toISOString(),
        totalGenerations,
        packs: campaign.packs.map((p) => ({
          id: p.id,
          name: p.name,
          createdAt: p.createdAt.toISOString(),
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
            isPublished: v.isPublished,
          })),
        })),
        recentGenerations: campaign.generations.map((g) => ({
          id: g.id,
          presetId: g.presetId,
          format: g.format,
          width: g.width,
          height: g.height,
          fileSize: g.fileSize,
          createdAt: g.createdAt.toISOString(),
        })),
      };
    }
  );

  // GET /api/organizations/:organizationId/members - List members
  app.get<{ Params: z.infer<typeof orgParamsSchema> }>(
    '/api/organizations/:organizationId/members',
    {
      preHandler: [
        apiRateLimiter,
        requireAuth,
        requireOrganizationAccess('organizationId'),
      ],
      schema: {
        params: jsonSchema(orgParamsSchema),
        response: {
          200: { type: 'array' },
          401: { type: 'object', properties: { error: { type: 'string' } } },
          403: { type: 'object', properties: { error: { type: 'string' } } },
        },
      },
    },
    async (request, _reply) => {
      const { organizationId } = request.params;

      const memberships = await prisma.membership.findMany({
        where: { organizationId },
        orderBy: { createdAt: 'desc' },
      });

      return memberships.map((m) => ({
        id: m.id,
        userId: m.userId,
        role: m.role,
        createdAt: m.createdAt.toISOString(),
      }));
    }
  );

  // POST /api/organizations/:organizationId/members - Add member
  app.post<{
    Params: z.infer<typeof orgParamsSchema>;
    Body: z.infer<typeof addMemberSchema>;
  }>(
    '/api/organizations/:organizationId/members',
    {
      preHandler: [
        apiRateLimiter,
        requireAuth,
        requireOrganizationRole(
          ['platform_admin', 'org_admin'],
          'organizationId'
        ),
      ],
      schema: {
        params: jsonSchema(orgParamsSchema),
        body: jsonSchema(addMemberSchema),
        response: {
          201: { type: 'object', additionalProperties: true },
          400: { type: 'object', properties: { error: { type: 'string' } } },
          401: { type: 'object', properties: { error: { type: 'string' } } },
          403: { type: 'object', properties: { error: { type: 'string' } } },
          409: { type: 'object', properties: { error: { type: 'string' } } },
        },
      },
    },
    async (request, reply) => {
      const { organizationId } = request.params;
      const { userId, role } = request.body;

      const existing = await prisma.membership.findUnique({
        where: { userId_organizationId: { userId, organizationId } },
      });
      if (existing) {
        return reply.code(409).send({ error: 'User is already a member' });
      }

      const membership = await prisma.membership.create({
        data: { userId, organizationId, role },
      });

      await auditAdmin({
        event: 'organization.member_added',
        properties: {
          organizationId,
          userId,
          role,
          addedBy: (request.user as AuthUser)?.id,
        },
        userId: (request.user as AuthUser)?.id,
      });

      return reply.code(201).send({
        id: membership.id,
        userId: membership.userId,
        organizationId: membership.organizationId,
        role: membership.role,
        createdAt: membership.createdAt.toISOString(),
      });
    }
  );

  // DELETE /api/organizations/:organizationId/members/:userId - Remove member
  app.delete<{ Params: z.infer<typeof memberParamsSchema> }>(
    '/api/organizations/:organizationId/members/:userId',
    {
      preHandler: [
        apiRateLimiter,
        requireAuth,
        requireOrganizationRole(
          ['platform_admin', 'org_admin'],
          'organizationId'
        ),
      ],
      schema: {
        params: jsonSchema(memberParamsSchema),
        response: {
          204: { type: 'null' },
          401: { type: 'object', properties: { error: { type: 'string' } } },
          403: { type: 'object', properties: { error: { type: 'string' } } },
          404: { type: 'object', properties: { error: { type: 'string' } } },
        },
      },
    },
    async (request, reply) => {
      const { organizationId, userId } = request.params;

      const membership = await prisma.membership.findUnique({
        where: { userId_organizationId: { userId, organizationId } },
      });
      if (!membership) {
        return reply.code(404).send({ error: 'Membership not found' });
      }

      await prisma.membership.delete({
        where: { userId_organizationId: { userId, organizationId } },
      });

      await auditAdmin({
        event: 'organization.member_removed',
        properties: {
          organizationId,
          userId,
          removedBy: (request.user as AuthUser)?.id,
        },
        userId: (request.user as AuthUser)?.id,
      });

      return reply.code(204).send();
    }
  );

  // GET /api/organizations/:organizationId/subscription - Subscription
  app.get<{ Params: z.infer<typeof orgParamsSchema> }>(
    '/api/organizations/:organizationId/subscription',
    {
      preHandler: [
        apiRateLimiter,
        requireAuth,
        requireOrganizationAccess('organizationId'),
      ],
      schema: {
        params: jsonSchema(orgParamsSchema),
        response: {
          200: { type: 'object', additionalProperties: true },
          401: { type: 'object', properties: { error: { type: 'string' } } },
          403: { type: 'object', properties: { error: { type: 'string' } } },
          404: { type: 'object', properties: { error: { type: 'string' } } },
        },
      },
    },
    async (request, reply) => {
      const { organizationId } = request.params;

      const subscription = await prisma.subscription.findUnique({
        where: { organizationId },
      });

      if (!subscription) {
        return reply.code(404).send({ error: 'Subscription not found' });
      }

      return {
        id: subscription.id,
        plan: subscription.plan,
        status: subscription.status,
        currentPeriodStart: subscription.currentPeriodStart
          ? subscription.currentPeriodStart.toISOString()
          : null,
        currentPeriodEnd: subscription.currentPeriodEnd
          ? subscription.currentPeriodEnd.toISOString()
          : null,
        cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
        createdAt: subscription.createdAt.toISOString(),
        updatedAt: subscription.updatedAt.toISOString(),
      };
    }
  );

  // GET /api/organizations/:organizationId/dashboard - Dashboard stats
  app.get<{ Params: z.infer<typeof orgParamsSchema> }>(
    '/api/organizations/:organizationId/dashboard',
    {
      preHandler: [
        apiRateLimiter,
        requireAuth,
        requireOrganizationAccess('organizationId'),
      ],
      schema: {
        params: jsonSchema(orgParamsSchema),
        response: {
          200: { type: 'object', additionalProperties: true },
          401: { type: 'object', properties: { error: { type: 'string' } } },
          403: { type: 'object', properties: { error: { type: 'string' } } },
        },
      },
    },
    async (request, _reply) => {
      const { organizationId } = request.params;

      const [
        totalGenerations,
        generationsByFormat,
        generationsByPreset,
        recentGenerations,
        templateUsage,
        totalTemplates,
        totalCampaigns,
      ] = await Promise.all([
        prisma.generationRecord.count({ where: { organizationId } }),
        prisma.generationRecord.groupBy({
          by: ['format'],
          where: { organizationId },
          _count: { format: true },
        }),
        prisma.generationRecord.groupBy({
          by: ['presetId'],
          where: { organizationId },
          _count: { presetId: true },
        }),
        prisma.generationRecord.findMany({
          where: { organizationId },
          orderBy: { createdAt: 'desc' },
          take: 10,
        }),
        prisma.generationRecord.groupBy({
          by: ['projectId'],
          where: { organizationId },
          _count: { projectId: true },
        }),
        prisma.template.count({ where: { organizationId } }),
        prisma.campaign.count({ where: { organizationId } }),
      ]);

      return {
        organizationId,
        totalGenerations,
        generationsByFormat: generationsByFormat.map((g) => ({
          format: g.format,
          count: g._count.format,
        })),
        generationsByPreset: generationsByPreset.map((g) => ({
          presetId: g.presetId,
          count: g._count.presetId,
        })),
        recentGenerations: recentGenerations.map((g) => ({
          id: g.id,
          presetId: g.presetId,
          format: g.format,
          width: g.width,
          height: g.height,
          fileSize: g.fileSize,
          createdAt: g.createdAt.toISOString(),
        })),
        templateUsage,
        totalTemplates,
        totalCampaigns,
      };
    }
  );

  // GET /api/organizations/:organizationId/analytics - Org-scoped transparent analytics
  app.get<{ Params: z.infer<typeof orgParamsSchema> }>(
    '/api/organizations/:organizationId/analytics',
    {
      preHandler: [apiRateLimiter, requireAuth, requireOrganizationAccess('organizationId')],
      schema: {
        params: jsonSchema(orgParamsSchema),
        response: {
          200: { type: 'object', additionalProperties: true },
          401: { type: 'object', properties: { error: { type: 'string' } } },
          403: { type: 'object', properties: { error: { type: 'string' } } },
          404: { type: 'object', properties: { error: { type: 'string' } } },
        },
      },
    },
    async (request, _reply) => {
      const { organizationId } = request.params;
      return computeAnalytics({ organizationId });
    }
  );

  // GET /api/organizations/:organizationId/campaigns/:campaignId/analytics - Campaign-scoped transparent analytics
  app.get<{ Params: z.infer<typeof campaignParamsSchema> }>(
    '/api/organizations/:organizationId/campaigns/:campaignId/analytics',
    {
      preHandler: [apiRateLimiter, requireAuth, requireOrganizationAccess('organizationId')],
      schema: {
        params: jsonSchema(campaignParamsSchema),
        response: {
          200: { type: 'object', additionalProperties: true },
          401: { type: 'object', properties: { error: { type: 'string' } } },
          403: { type: 'object', properties: { error: { type: 'string' } } },
          404: { type: 'object', properties: { error: { type: 'string' } } },
        },
      },
    },
    async (request, _reply) => {
      const { organizationId, campaignId } = request.params;
      const campaign = await prisma.campaign.findFirst({
        where: { id: campaignId, organizationId },
      });
      if (!campaign) {
        return _reply.code(404).send({ error: 'Campaign not found' });
      }
      return computeAnalytics({ organizationId, campaignId });
    }
  );

  // PATCH /api/organizations/:organizationId/status - Suspend/reactivate/offboard organization
  app.patch<{
    Params: z.infer<typeof orgParamsSchema>;
    Body: z.infer<typeof updateStatusSchema>;
  }>(
    '/api/organizations/:organizationId/status',
    {
      preHandler: [
        apiRateLimiter,
        requireAuth,
        requireOrganizationRole(
          ['platform_admin', 'org_admin'],
          'organizationId'
        ),
      ],
      schema: {
        params: jsonSchema(orgParamsSchema),
        body: jsonSchema(updateStatusSchema),
        response: {
          200: { type: 'object', additionalProperties: true },
          401: { type: 'object', properties: { error: { type: 'string' } } },
          403: { type: 'object', properties: { error: { type: 'string' } } },
          404: { type: 'object', properties: { error: { type: 'string' } } },
        },
      },
    },
    async (request, reply) => {
      const { organizationId } = request.params;
      const { status } = request.body;

      const organization = await prisma.organization.findUnique({
        where: { id: organizationId },
      });
      if (!organization) {
        return reply.code(404).send({ error: 'Organization not found' });
      }

      const updated = await prisma.organization.update({
        where: { id: organizationId },
        data: { status },
      });

      await auditAdmin({
        event: 'organization.status_changed',
        properties: {
          organizationId,
          previousStatus: organization.status,
          newStatus: status,
          changedBy: (request.user as AuthUser)?.id,
        },
        userId: (request.user as AuthUser)?.id,
      });

      return {
        id: updated.id,
        status: updated.status,
        name: updated.name,
        slug: updated.slug,
      };
    }
  );

  // PATCH /api/organizations/:organizationId/settings - Update org settings (white-label + Nigerian structure)
  app.patch<{
    Params: z.infer<typeof orgParamsSchema>;
    Body: z.infer<typeof updateSettingsSchema>;
  }>(
    '/api/organizations/:organizationId/settings',
    {
      preHandler: [
        apiRateLimiter,
        requireAuth,
        requireOrganizationRole(
          ['platform_admin', 'org_admin'],
          'organizationId'
        ),
      ],
      schema: {
        params: jsonSchema(orgParamsSchema),
        body: jsonSchema(updateSettingsSchema),
        response: {
          200: { type: 'object', additionalProperties: true },
          401: { type: 'object', properties: { error: { type: 'string' } } },
          403: { type: 'object', properties: { error: { type: 'string' } } },
          404: { type: 'object', properties: { error: { type: 'string' } } },
        },
      },
    },
    async (request, reply) => {
      const { organizationId } = request.params;
      const { state, lga, ward, ...whiteLabel } = request.body;

      const organization = await prisma.organization.findUnique({
        where: { id: organizationId },
      });
      if (!organization) {
        return reply.code(404).send({ error: 'Organization not found' });
      }

      const currentSettings: Record<string, unknown> = {};
      try {
        Object.assign(currentSettings, JSON.parse(organization.settings ?? '{}'));
      } catch {
        // keep empty
      }

      const nextSettings: Record<string, unknown> = {
        ...currentSettings,
        ...Object.fromEntries(
          Object.entries(whiteLabel).filter(
            ([, value]) => value !== undefined && value !== ''
          )
        ),
      };

      const updated = await prisma.organization.update({
        where: { id: organizationId },
        data: {
          state: state ?? undefined,
          lga: lga ?? undefined,
          ward: ward ?? undefined,
          settings: JSON.stringify(nextSettings),
        },
      });

      await auditAdmin({
        event: 'organization.settings_changed',
        properties: {
          organizationId,
          changedBy: (request.user as AuthUser)?.id,
        },
        userId: (request.user as AuthUser)?.id,
      });

      return {
        id: updated.id,
        state: updated.state,
        lga: updated.lga,
        ward: updated.ward,
        settings: updated.settings,
      };
    }
  );

  // PATCH /api/organizations/:organizationId/branding - Update configurable organization branding
  app.patch<{
    Params: z.infer<typeof orgParamsSchema>;
    Body: z.infer<typeof updateBrandingSchema>;
  }>(
    '/api/organizations/:organizationId/branding',
    {
      preHandler: [
        apiRateLimiter,
        requireAuth,
        requireOrganizationRole(
          ['platform_admin', 'org_admin'],
          'organizationId'
        ),
      ],
      schema: {
        params: jsonSchema(orgParamsSchema),
        body: jsonSchema(updateBrandingSchema),
        response: {
          200: { type: 'object', additionalProperties: true },
          401: { type: 'object', properties: { error: { type: 'string' } } },
          403: { type: 'object', properties: { error: { type: 'string' } } },
          404: { type: 'object', properties: { error: { type: 'string' } } },
        },
      },
    },
    async (request, reply) => {
      const { organizationId } = request.params;
      const {
        brandPrimary,
        brandSecondary,
        brandAccent,
        brandLockupId,
        defaultHeadline,
        defaultSubhead,
      } = request.body;

      const organization = await prisma.organization.findUnique({
        where: { id: organizationId },
      });
      if (!organization) {
        return reply.code(404).send({ error: 'Organization not found' });
      }

      // Validate brand lockup asset exists and belongs to this organization's packs
      if (brandLockupId) {
        const lockup = await prisma.packAsset.findUnique({
          where: { id: brandLockupId },
        });
        if (!lockup) {
          return reply.code(400).send({ error: 'Brand lockup asset not found' });
        }
      }

      const updated = await prisma.organization.update({
        where: { id: organizationId },
        data: {
          brandPrimary,
          brandSecondary,
          brandAccent,
          brandLockupId,
          defaultHeadline,
          defaultSubhead,
        },
        include: {
          brandLockup: true,
        },
      });

      await auditAdmin({
        event: 'organization.branding_changed',
        properties: {
          organizationId,
          changedBy: (request.user as AuthUser)?.id,
        },
        userId: (request.user as AuthUser)?.id,
      });

      return {
        id: updated.id,
        brandPrimary: updated.brandPrimary,
        brandSecondary: updated.brandSecondary,
        brandAccent: updated.brandAccent,
        brandLockup: updated.brandLockup
          ? {
              id: updated.brandLockup.id,
              url: updated.brandLockup.url,
              type: updated.brandLockup.type,
            }
          : null,
        defaultHeadline: updated.defaultHeadline,
        defaultSubhead: updated.defaultSubhead,
      };
    }
  );

  // PATCH /api/organizations/:organizationId/members/:userId - Update coordinator role
  app.patch<{
    Params: z.infer<typeof memberParamsSchema>;
    Body: z.infer<typeof updateMemberRoleSchema>;
  }>(
    '/api/organizations/:organizationId/members/:userId',
    {
      preHandler: [
        apiRateLimiter,
        requireAuth,
        requireOrganizationRole(
          ['platform_admin', 'org_admin'],
          'organizationId'
        ),
      ],
      schema: {
        params: jsonSchema(memberParamsSchema),
        body: jsonSchema(updateMemberRoleSchema),
        response: {
          200: { type: 'object', additionalProperties: true },
          401: { type: 'object', properties: { error: { type: 'string' } } },
          403: { type: 'object', properties: { error: { type: 'string' } } },
          404: { type: 'object', properties: { error: { type: 'string' } } },
        },
      },
    },
    async (request, reply) => {
      const { organizationId, userId } = request.params;
      const { role } = request.body;

      const membership = await prisma.membership.findUnique({
        where: { userId_organizationId: { userId, organizationId } },
      });
      if (!membership) {
        return reply.code(404).send({ error: 'Membership not found' });
      }

      const updated = await prisma.membership.update({
        where: { userId_organizationId: { userId, organizationId } },
        data: { role },
      });

      await auditAdmin({
        event: 'organization.member_role_changed',
        properties: {
          organizationId,
          userId,
          previousRole: membership.role,
          newRole: role,
          changedBy: (request.user as AuthUser)?.id,
        },
        userId: (request.user as AuthUser)?.id,
      });

      return {
        id: updated.id,
        userId: updated.userId,
        organizationId: updated.organizationId,
        role: updated.role,
      };
    }
  );

  async function computeAnalytics(opts: {
    organizationId: string;
    campaignId?: string;
  }) {
    const orgId = opts.organizationId;
    const campaignId = opts.campaignId;

    const where: Record<string, unknown> = {
      properties: { contains: orgId },
    };
    if (campaignId) {
      where['properties'] = { contains: campaignId };
    }

    const events = await prisma.analyticsEvent.findMany({
      where,
      orderBy: { timestamp: 'desc' },
      take: 1000,
    });

    const eventsByEvent = new Map<string, number>();
    const generationsByFormat = new Map<string, number>();
    const generationsByPreset = new Map<string, number>();
    const sharesByPlatform = new Map<string, number>();
    const downloadsByFormat = new Map<string, number>();
    const userIds = new Set<string>();

    for (const e of events) {
      let props: Record<string, unknown> = {};
      try {
        props = JSON.parse(e.properties) as Record<string, unknown>;
      } catch {
        props = {};
      }

      eventsByEvent.set(e.event, (eventsByEvent.get(e.event) ?? 0) + 1);
      if (e.userId) userIds.add(e.userId);

      if (e.event === 'generation') {
        const fmt = String(props['format'] ?? 'unknown');
        const preset = String(props['presetId'] ?? 'unknown');
        generationsByFormat.set(fmt, (generationsByFormat.get(fmt) ?? 0) + 1);
        generationsByPreset.set(preset, (generationsByPreset.get(preset) ?? 0) + 1);
      } else if (e.event === 'share') {
        const platform = String(props['platform'] ?? 'unknown');
        sharesByPlatform.set(platform, (sharesByPlatform.get(platform) ?? 0) + 1);
      } else if (e.event === 'download') {
        const fmt = String(props['format'] ?? 'unknown');
        downloadsByFormat.set(fmt, (downloadsByFormat.get(fmt) ?? 0) + 1);
      }
    }

    return {
      totalEvents: events.length,
      eventsByEvent: [...eventsByEvent.entries()].map(([event, count]) => ({ event, count })),
      uniqueUsers: userIds.size,
      generationsByFormat: [...generationsByFormat.entries()].map(([format, count]) => ({ format, count })),
      generationsByPreset: [...generationsByPreset.entries()].map(([presetId, count]) => ({ presetId, count })),
      sharesByPlatform: [...sharesByPlatform.entries()].map(([platform, count]) => ({ platform, count })),
      downloadsByFormat: [...downloadsByFormat.entries()].map(([format, count]) => ({ format, count })),
      recentActivity: events.map((e) => ({
        id: e.id,
        event: e.event,
        properties: e.properties,
        timestamp: e.timestamp.toISOString(),
        userId: e.userId,
      })),
    };
  }
}
