import { FastifyRequest, FastifyReply } from 'fastify';
import prisma from '../db/prisma';
import { getTierEntitlements, isLimitUnlimited } from './entitlements';

interface EntitlementCheckOptions {
  action: 'generation';
}

export function requireEntitlement(options: EntitlementCheckOptions) {
  return async (
    request: FastifyRequest,
    reply: FastifyReply,
    done: (err?: Error) => void
  ): Promise<void> => {
    const user = request.user;
    if (!user) {
      reply.code(401).send({ error: 'Authentication required' });
      return;
    }

    const organizationId =
      (request.params as Record<string, string> | undefined)?.['organizationId'] ||
      ((request.body as Record<string, string> | undefined)?.['organizationId'] as string | undefined);

    // If no organization context can be determined, skip the entitlement
    // check (backward compatible). Enforcement is applied when org context
    // is available (e.g. generate requests that include organizationId).
    if (!organizationId) {
      done();
      return;
    }

    const membership = user.memberships.find(
      (m) => m.organizationId === organizationId
    );

    if (!membership && !user.isPlatformAdmin) {
      reply.code(403).send({ error: 'Organization access required' });
      return;
    }

    const organization = await prisma.organization.findUnique({
      where: { id: organizationId },
      include: {
        subscription: true,
        _count: {
          select: {
            generations: {
              where: {
                createdAt: {
                  gte: new Date(
                    new Date().getFullYear(),
                    new Date().getMonth(),
                    1
                  ),
                },
              },
            },
          },
        },
      },
    });

    if (!organization) {
      reply.code(404).send({ error: 'Organization not found' });
      return;
    }

    const entitlements = getTierEntitlements(organization.plan);

    if (options.action === 'generation') {
      const monthlyGenerationCount = (organization as { _count?: { generations: number } })._count?.generations ?? 0;
      const limit = entitlements.generationLimitPerMonth;

      if (!isLimitUnlimited(limit) && monthlyGenerationCount >= limit) {
        reply.code(403).send({
          error: 'Generation limit exceeded',
          message: `Monthly generation limit of ${limit} reached for ${entitlements.name} plan.`,
          limit,
          used: monthlyGenerationCount,
          plan: entitlements.plan,
        });
        return;
      }
    }

    done();
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
            where: {
              createdAt: {
                gte: new Date(
                  new Date().getFullYear(),
                  new Date().getMonth(),
                  1
                ),
              },
            },
          },
          memberships: true,
          campaigns: true,
        },
      },
    },
  });

  if (!organization) return null;

  const entitlements = getTierEntitlements(organization.plan);
  const monthlyGenerationCount = (organization as { _count?: { generations: number } })._count?.generations ?? 0;
  const generationRemaining = isLimitUnlimited(
    entitlements.generationLimitPerMonth
  )
    ? -1
    : Math.max(0, entitlements.generationLimitPerMonth - monthlyGenerationCount);

  return {
    plan: organization.plan,
    entitlements,
    subscription: (organization as { subscription?: { plan: string; status: string; currentPeriodEnd: Date | null } | null }).subscription,
    usage: {
      generationsThisMonth: monthlyGenerationCount,
      generationLimit: entitlements.generationLimitPerMonth,
      generationRemaining,
      generationLimitUnlimited: isLimitUnlimited(
        entitlements.generationLimitPerMonth
      ),
      memberCount: (organization as { _count?: { memberships: number } })._count?.memberships ?? 0,
      teamSeatLimit: entitlements.teamSeats,
      campaignCount: (organization as { _count?: { campaigns: number } })._count?.campaigns ?? 0,
      campaignLimit: entitlements.campaignLimit,
    },
    canGenerate:
      isLimitUnlimited(entitlements.generationLimitPerMonth) ||
      monthlyGenerationCount < entitlements.generationLimitPerMonth,
  };
}
