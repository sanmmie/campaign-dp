import { FastifyRequest, FastifyReply } from 'fastify';
import prisma from '../db/prisma';
import { getTierEntitlements, isLimitUnlimited, TIER_ENTITLEMENTS } from './entitlements';
import { msUntilEndOfMonth, rateLimit } from '../middleware/rateLimit';

interface EntitlementCheckOptions {
  action: 'generation';
}

export interface GenerationContext {
  organizationId: string | null;
  campaignId: string | null;
  /** 'organization' when the generation is billed to an organization, 'user' otherwise. */
  basis: 'organization' | 'user';
}

declare module 'fastify' {
  interface FastifyRequest {
    generationContext?: GenerationContext;
  }
}

/** Start of the current calendar month, used as the usage window. */
export function monthStart(now: Date = new Date()): Date {
  return new Date(now.getFullYear(), now.getMonth(), 1);
}

function firstString(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === 'string' && value.trim().length > 0) {
      return value.trim();
    }
  }
  return null;
}

/**
 * Determines which organization (if any) a generation belongs to.
 *
 * Resolution order:
 *   1. An explicit organizationId in the request.
 *   2. The organization of the referenced project.
 *   3. The user's only organization membership.
 *   4. None - the generation is billed to the individual supporter allowance.
 *
 * The context is always resolved server-side so that a client cannot opt out
 * of quota enforcement by omitting organizationId.
 */
export async function resolveGenerationContext(
  request: FastifyRequest
): Promise<GenerationContext> {
  const body = (request.body ?? {}) as Record<string, unknown>;
  const params = (request.params ?? {}) as Record<string, string>;

  const explicitOrganizationId = firstString(
    body['organizationId'],
    params['organizationId']
  );
  const explicitCampaignId = firstString(body['campaignId']);

  if (explicitOrganizationId) {
    return {
      organizationId: explicitOrganizationId,
      campaignId: explicitCampaignId,
      basis: 'organization',
    };
  }

  const projectId = firstString(body['projectId']);
  if (projectId) {
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: { organizationId: true, campaignId: true },
    });
    if (project?.organizationId) {
      return {
        organizationId: project.organizationId,
        campaignId: explicitCampaignId ?? project.campaignId ?? null,
        basis: 'organization',
      };
    }
  }

  const memberships = request.user?.memberships ?? [];
  const singleMembership = memberships.length === 1 ? memberships[0] : undefined;
  if (singleMembership) {
    return {
      organizationId: singleMembership.organizationId,
      campaignId: explicitCampaignId,
      basis: 'organization',
    };
  }

  return {
    organizationId: null,
    campaignId: explicitCampaignId,
    basis: 'user',
  };
}

export function requireEntitlement(options: EntitlementCheckOptions) {
  // Fastify rejects async hooks that also declare a `done` callback, so this
  // hook is async with two arguments only and returns the reply when it has
  // already been sent.
  return async (
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> => {
    const user = request.user;

    // Guests may generate within the free supporter allowance. The quota is
    // tracked per IP address and resets at the start of each calendar month.
    if (!user) {
      const supporter = TIER_ENTITLEMENTS.supporter;
      const allowed = await rateLimit(request, reply, {
        windowMs: () => msUntilEndOfMonth(),
        max: supporter.generationLimitPerMonth,
        keyGenerator: (req) => `guest-generation:${req.ip}`,
      });
      if (!allowed) {
        return;
      }
      request.generationContext = {
        organizationId: null,
        campaignId: null,
        basis: 'user',
      };
      return;
    }

    const context = await resolveGenerationContext(request);
    request.generationContext = context;

    if (options.action !== 'generation') {
      return;
    }

    if (context.organizationId) {
      const membership = user.memberships.find(
        (m) => m.organizationId === context.organizationId
      );

      if (!membership && !user.isPlatformAdmin) {
        return reply.code(403).send({ error: 'Organization access required' });
      }

      const organization = await prisma.organization.findUnique({
        where: { id: context.organizationId },
        include: {
          subscription: true,
          _count: {
            select: {
              generations: {
                where: { createdAt: { gte: monthStart() } },
              },
            },
          },
        },
      });

      if (!organization) {
        return reply.code(404).send({ error: 'Organization not found' });
      }

      const entitlements = getTierEntitlements(organization.plan);
      const monthlyGenerationCount = organization._count.generations;
      const limit = entitlements.generationLimitPerMonth;

      if (!isLimitUnlimited(limit) && monthlyGenerationCount >= limit) {
        return reply.code(403).send({
          error: 'Generation limit exceeded',
          message: `Monthly generation limit of ${limit} reached for ${entitlements.name} plan.`,
          limit,
          used: monthlyGenerationCount,
          plan: entitlements.plan,
        });
      }

      return;
    }

    // No organization context: the free supporter allowance applies per user so
    // that omitting organizationId cannot be used to bypass quota enforcement.
    const entitlements = TIER_ENTITLEMENTS.supporter;
    const limit = entitlements.generationLimitPerMonth;

    const monthlyGenerationCount = await prisma.generationRecord.count({
      where: { userId: user.id, createdAt: { gte: monthStart() } },
    });

    if (!isLimitUnlimited(limit) && monthlyGenerationCount >= limit) {
      return reply.code(403).send({
        error: 'Generation limit exceeded',
        message: `Monthly generation limit of ${limit} reached for the free ${entitlements.name} plan. Sign in to a campaign organization to continue.`,
        limit,
        used: monthlyGenerationCount,
        plan: entitlements.plan,
      });
    }
  };
}

export async function getOrganizationEntitlements(organizationId: string) {
  const organization = await prisma.organization.findUnique({
    where: { id: organizationId },
    include: {
      subscription: true,
      _count: {
        select: {
          generations: {
            where: { createdAt: { gte: monthStart() } },
          },
          memberships: true,
          campaigns: true,
        },
      },
    },
  });

  if (!organization) return null;

  const entitlements = getTierEntitlements(organization.plan);
  const monthlyGenerationCount = organization._count.generations;
  const generationRemaining = isLimitUnlimited(
    entitlements.generationLimitPerMonth
  )
    ? -1
    : Math.max(0, entitlements.generationLimitPerMonth - monthlyGenerationCount);

  return {
    plan: organization.plan,
    entitlements,
    subscription: organization.subscription
      ? {
          plan: organization.subscription.plan,
          status: organization.subscription.status,
          currentPeriodEnd: organization.subscription.currentPeriodEnd,
        }
      : null,
    usage: {
      generationsThisMonth: monthlyGenerationCount,
      generationLimit: entitlements.generationLimitPerMonth,
      generationRemaining,
      generationLimitUnlimited: isLimitUnlimited(
        entitlements.generationLimitPerMonth
      ),
      memberCount: organization._count.memberships,
      teamSeatLimit: entitlements.teamSeats,
      campaignCount: organization._count.campaigns,
      campaignLimit: entitlements.campaignLimit,
    },
    canGenerate:
      isLimitUnlimited(entitlements.generationLimitPerMonth) ||
      monthlyGenerationCount < entitlements.generationLimitPerMonth,
  };
}
