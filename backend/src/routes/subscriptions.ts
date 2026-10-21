import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import prisma from '../db/prisma';
import { env } from '../config/env';
import {
  TIER_ENTITLEMENTS,
  getTierEntitlements,
  formatNaira,
} from '../lib/entitlements';
import {
  requireAuth,
  requireOrganizationRole,
  type AuthUser,
} from '../middleware/auth';
import { apiRateLimiter } from '../middleware/rateLimit';
import { jsonSchema } from '../lib/schema';

const orgParamsSchema = z.object({
  organizationId: z.string().min(1),
});

const referenceParamsSchema = z.object({
  reference: z.string().min(1),
});

const initializeBodySchema = z.object({
  organizationId: z.string().min(1),
  plan: z.enum(['candidate', 'campaign_pro', 'state', 'national']),
  interval: z.enum(['monthly', 'yearly']),
  email: z.string().email(),
});

const cancelBodySchema = z.object({
  organizationId: z.string().min(1),
});

const webhookBodySchema = z.object({
  event: z.string(),
  data: z.object({
    reference: z.string(),
    status: z.string(),
    amount: z.number(),
    currency: z.string().default('NGN'),
    plan: z.object({
      name: z.string().optional(),
    }).optional(),
    customer: z.object({
      email: z.string().optional(),
    }).optional(),
    paid_at: z.string().optional(),
    gateway_response: z.string().optional(),
  }),
});

function getPaystackSecretKey(): string | undefined {
  return env.PAYSTACK_SECRET_KEY;
}

function getPaystackPublicKey(): string | undefined {
  return env.PAYSTACK_PUBLIC_KEY;
}

export async function subscriptionRoutes(app: FastifyInstance): Promise<void> {
  // GET /api/subscriptions/plans - List all pricing tiers
  app.get(
    '/api/subscriptions/plans',
    {
      preHandler: [apiRateLimiter],
      schema: {
        response: {
          200: { type: 'object', additionalProperties: true },
          429: { type: 'object', properties: { error: { type: 'string' } } },
        },
      },
    },
    async () => {
      const plans = Object.values(TIER_ENTITLEMENTS).map((tier) => ({
        plan: tier.plan,
        name: tier.name,
        description: tier.description,
        priceMonthlyNaira: tier.priceMonthlyNaira,
        priceYearlyNaira: tier.priceYearlyNaira,
        priceMonthlyFormatted: formatNaira(tier.priceMonthlyNaira),
        priceYearlyFormatted:
          tier.priceYearlyNaira !== null
            ? formatNaira(tier.priceYearlyNaira)
            : null,
        generationLimitPerMonth: tier.generationLimitPerMonth,
        storageMb: tier.storageMb,
        teamSeats: tier.teamSeats,
        campaignLimit: tier.campaignLimit,
        features: tier.features,
        isPaid: tier.isPaid,
        isEnterprise: tier.isEnterprise,
        paystackPublicKey: getPaystackPublicKey(),
      }));

      return { plans };
    }
  );

  // GET /api/subscriptions/:organizationId/entitlements - Get entitlements + usage
  app.get<{ Params: z.infer<typeof orgParamsSchema> }>(
    '/api/subscriptions/:organizationId/entitlements',
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
        response: {
          200: { type: 'object', additionalProperties: true },
          401: { type: 'object', properties: { error: { type: 'string' } } },
          403: { type: 'object', properties: { error: { type: 'string' } } },
          404: { type: 'object', properties: { error: { type: 'string' } } },
          429: { type: 'object', properties: { error: { type: 'string' } } },
        },
      },
    },
    async (request, reply) => {
      const { organizationId } = request.params;
      const { getOrganizationEntitlements } = await import(
        '../lib/entitlement-middleware.js'
      );
      const entitlements = await getOrganizationEntitlements(organizationId);
      if (!entitlements) {
        return reply.code(404).send({ error: 'Organization not found' });
      }
      return entitlements;
    }
  );

  // POST /api/subscriptions/checkout - Initialize Paystack payment
  app.post<{ Body: z.infer<typeof initializeBodySchema> }>(
    '/api/subscriptions/checkout',
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
        body: jsonSchema(initializeBodySchema),
        response: {
          200: { type: 'object', additionalProperties: true },
          400: { type: 'object', properties: { error: { type: 'string' } } },
          401: { type: 'object', properties: { error: { type: 'string' } } },
          403: { type: 'object', properties: { error: { type: 'string' } } },
          404: { type: 'object', properties: { error: { type: 'string' } } },
          429: { type: 'object', properties: { error: { type: 'string' } } },
        },
      },
    },
    async (request, reply) => {
      const { organizationId, plan, interval, email } = request.body;
      const secretKey = getPaystackSecretKey();

      if (!secretKey) {
        return reply
          .code(500)
          .send({ error: 'Payment provider not configured' });
      }

      const organization = await prisma.organization.findUnique({
        where: { id: organizationId },
      });

      if (!organization) {
        return reply.code(404).send({ error: 'Organization not found' });
      }

      const entitlements = getTierEntitlements(plan);
      if (!entitlements.isPaid) {
        return reply.code(400).send({ error: 'Plan is not purchasable' });
      }

      const amountNaira =
        interval === 'yearly' && entitlements.priceYearlyNaira !== null
          ? entitlements.priceYearlyNaira
          : entitlements.priceMonthlyNaira;

      const amountKobo = amountNaira * 100;
      const reference = `campaign-dp-${organizationId}-${Date.now()}`;

      // Record pending transaction
      await prisma.paymentTransaction.create({
        data: {
          organizationId,
          reference,
          amount: amountKobo,
          currency: 'NGN',
          status: 'pending',
          plan,
          interval,
          customerEmail: email,
        },
      });

      // Initialize Paystack transaction
      const initResponse = await fetch(
        'https://api.paystack.co/transaction/initialize',
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${secretKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            email,
            amount: amountKobo,
            reference,
            callback_url: `${env.FRONTEND_URL}/subscription/callback`,
            metadata: {
              organizationId,
              plan,
              interval,
            },
          }),
        }
      );

      const initData = (await initResponse.json()) as {
        status?: boolean;
        message?: string;
        data?: {
          authorization_url?: string;
          reference?: string;
          access_code?: string;
        };
        error?: string;
      };

      if (!initResponse.ok || !initData.status) {
        await prisma.paymentTransaction.update({
          where: { reference },
          data: { status: 'failed', gatewayResponse: JSON.stringify(initData) },
        });
        return reply
          .code(502)
          .send({ error: 'Failed to initialize payment' });
      }

      await prisma.paymentTransaction.update({
        where: { reference },
        data: {
          paystackReference: initData.data?.reference,
        },
      });

      return {
        authorizationUrl: initData.data?.authorization_url,
        reference,
        accessCode: initData.data?.access_code,
      };
    }
  );

  // GET /api/subscriptions/verify/:reference - Verify Paystack payment
  app.get<{ Params: z.infer<typeof referenceParamsSchema> }>(
    '/api/subscriptions/verify/:reference',
    {
      preHandler: [apiRateLimiter, requireAuth],
      schema: {
        params: jsonSchema(referenceParamsSchema),
        response: {
          200: { type: 'object', additionalProperties: true },
          400: { type: 'object', properties: { error: { type: 'string' } } },
          401: { type: 'object', properties: { error: { type: 'string' } } },
          403: { type: 'object', properties: { error: { type: 'string' } } },
          404: { type: 'object', properties: { error: { type: 'string' } } },
          429: { type: 'object', properties: { error: { type: 'string' } } },
        },
      },
    },
    async (request, reply) => {
      const { reference } = request.params;
      const secretKey = getPaystackSecretKey();

      if (!secretKey) {
        return reply
          .code(500)
          .send({ error: 'Payment provider not configured' });
      }

      const transaction = await prisma.paymentTransaction.findUnique({
        where: { reference },
        include: { organization: true },
      });

      if (!transaction) {
        return reply.code(404).send({ error: 'Transaction not found' });
      }

      const user = request.user as AuthUser | undefined;
      const isMember =
        user?.isPlatformAdmin ||
        user?.memberships.some(
          (m) => m.organizationId === transaction.organizationId
        );

      if (!isMember) {
        return reply.code(403).send({ error: 'Access denied' });
      }

      // Verify with Paystack
      const verifyResponse = await fetch(
        `https://api.paystack.co/transaction/verify/${reference}`,
        {
          headers: {
            Authorization: `Bearer ${secretKey}`,
          },
        }
      );

      const verifyData = (await verifyResponse.json()) as {
        status?: boolean;
        data?: {
          status?: string;
          reference?: string;
          receipt_number?: string;
        };
        message?: string;
      };

      if (!verifyResponse.ok || !verifyData.status) {
        return reply.code(400).send({ error: 'Payment verification failed' });
      }

      const data = verifyData.data;

      if (!data || data.status !== 'success' || data.reference !== reference) {
        return reply.code(400).send({ error: 'Payment not successful' });
      }

      // Prevent duplicate processing: only activate if still pending
      if (transaction.status !== 'pending') {
          return {
            status: 'already_processed',
            transaction: {
              reference: transaction.reference,
              status: transaction.status,
              plan: transaction.plan,
              amount: transaction.amount,
              paidAt: transaction.paidAt?.toISOString(),
            },
          };
        }

        const now = new Date();
        let periodEnd: Date | null = null;

        if (transaction.interval === 'yearly') {
          periodEnd = new Date(now.getFullYear() + 1, now.getMonth(), now.getDate());
        } else {
          periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, now.getDate());
        }

        await prisma.$transaction([
          prisma.paymentTransaction.update({
            where: { reference },
            data: {
              status: 'success',
              paystackReference: data.reference,
              paidAt: new Date(),
              gatewayResponse: JSON.stringify(data),
              receiptNumber: data.receipt_number,
            },
          }),
          prisma.subscription.upsert({
            where: { organizationId: transaction.organizationId },
            create: {
              organizationId: transaction.organizationId,
              plan: transaction.plan,
              status: 'active',
              currentPeriodStart: new Date(),
              currentPeriodEnd: periodEnd,
              cancelAtPeriodEnd: false,
            },
            update: {
              plan: transaction.plan,
              status: 'active',
              currentPeriodStart: new Date(),
              currentPeriodEnd: periodEnd,
              cancelAtPeriodEnd: false,
            },
          }),
          prisma.organization.update({
            where: { id: transaction.organizationId },
            data: { plan: transaction.plan },
          }),
        ]);

        return {
          status: 'success',
          transaction: {
            reference: transaction.reference,
            status: 'success',
            plan: transaction.plan,
            amount: transaction.amount,
            paidAt: new Date().toISOString(),
          },
          subscription: {
            plan: transaction.plan,
            status: 'active',
            currentPeriodEnd: periodEnd.toISOString(),
          },
        };
    }
  );
  // POST /api/subscriptions/webhook - Paystack webhook
  app.post(
    '/api/subscriptions/webhook',
    {
      preHandler: [apiRateLimiter],
      schema: {
        body: jsonSchema(webhookBodySchema),
        response: {
          200: { type: 'object', properties: { received: { type: 'boolean' } } },
          400: { type: 'object', properties: { error: { type: 'string' } } },
          429: { type: 'object', properties: { error: { type: 'string' } } },
        },
      },
    },
    async (request, reply) => {
      const secretKey = getPaystackSecretKey();

      if (!secretKey) {
        return reply.code(500).send({ error: 'Payment provider not configured' });
      }

      const body = webhookBodySchema.safeParse(request.body);
      if (!body.success) {
        return reply.code(400).send({ error: 'Invalid webhook payload' });
      }

      // Only process successful charge events.
      if (body.data.event !== 'charge.success') {
        return reply.code(200).send({ received: true });
      }

      const { reference } = body.data.data;

      const transaction = await prisma.paymentTransaction.findUnique({
        where: { reference },
      });

      if (!transaction) {
        return reply.code(404).send({ error: 'Transaction not found' });
      }

      // Idempotency: skip if already processed.
      if (transaction.status === 'success') {
        return reply.code(200).send({ received: true });
      }

      // Server-to-server verification with Paystack to confirm the charge
      // succeeded (protects against spoofed webhooks without needing raw body).
      const verifyResponse = await fetch(
        `https://api.paystack.co/transaction/verify/${reference}`,
        {
          headers: {
            Authorization: `Bearer ${secretKey}`,
          },
        }
      );

      const verifyData = (await verifyResponse.json()) as {
        status?: boolean;
        data?: { status?: string; reference?: string };
      };

      if (!verifyResponse.ok || !verifyData.status) {
        return reply.code(400).send({ error: 'Payment verification failed' });
      }

      const data = verifyData.data;
      if (!data || data.status !== 'success' || data.reference !== reference) {
        return reply.code(400).send({ error: 'Payment not successful' });
      }

      const now = new Date();
      let periodEnd: Date | null = null;

      if (transaction.interval === 'yearly') {
        periodEnd = new Date(now.getFullYear() + 1, now.getMonth(), now.getDate());
      } else {
        periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, now.getDate());
      }

      await prisma.$transaction([
        prisma.paymentTransaction.update({
          where: { reference },
          data: {
            status: 'success',
            paystackReference: reference,
            paidAt: now,
            gatewayResponse: JSON.stringify(verifyData),
            receiptNumber: reference,
          },
        }),
        prisma.subscription.upsert({
          where: { organizationId: transaction.organizationId },
          create: {
            organizationId: transaction.organizationId,
            plan: transaction.plan,
            status: 'active',
            currentPeriodStart: new Date(),
            currentPeriodEnd: periodEnd,
            cancelAtPeriodEnd: false,
          },
          update: {
            plan: transaction.plan,
            status: 'active',
            currentPeriodStart: new Date(),
            currentPeriodEnd: periodEnd,
            cancelAtPeriodEnd: false,
          },
        }),
        prisma.organization.update({
          where: { id: transaction.organizationId },
          data: { plan: transaction.plan },
        }),
      ]);

      return reply.code(200).send({ received: true });
    }
  );

  // POST /api/subscriptions/cancel - Cancel subscription (cancel at period end)
  app.post<{ Body: z.infer<typeof cancelBodySchema> }>(
    '/api/subscriptions/cancel',
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
        body: jsonSchema(cancelBodySchema),
        response: {
          200: { type: 'object', additionalProperties: true },
          401: { type: 'object', properties: { error: { type: 'string' } } },
          403: { type: 'object', properties: { error: { type: 'string' } } },
          404: { type: 'object', properties: { error: { type: 'string' } } },
          429: { type: 'object', properties: { error: { type: 'string' } } },
        },
      },
    },
    async (request, reply) => {
      const { organizationId } = request.body;

      const subscription = await prisma.subscription.findUnique({
        where: { organizationId },
      });

      if (!subscription) {
        return reply.code(404).send({ error: 'Subscription not found' });
      }

      await prisma.subscription.update({
        where: { organizationId },
        data: { cancelAtPeriodEnd: true },
      });

      return {
        status: 'success',
        message: 'Subscription will be cancelled at the end of the current period',
        cancelAtPeriodEnd: true,
        currentPeriodEnd: subscription.currentPeriodEnd
          ? subscription.currentPeriodEnd.toISOString()
          : null,
      };
    }
  );

  // GET /api/subscriptions/:organizationId/receipts - Payment history
  app.get<{ Params: z.infer<typeof orgParamsSchema> }>(
    '/api/subscriptions/:organizationId/receipts',
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
        response: {
          200: { type: 'object', additionalProperties: true },
          401: { type: 'object', properties: { error: { type: 'string' } } },
          403: { type: 'object', properties: { error: { type: 'string' } } },
          429: { type: 'object', properties: { error: { type: 'string' } } },
        },
      },
    },
    async (request, _reply) => {
      const { organizationId } = request.params;

      const transactions = await prisma.paymentTransaction.findMany({
        where: { organizationId },
        orderBy: { createdAt: 'desc' },
        take: 50,
        select: {
          id: true,
          reference: true,
          paystackReference: true,
          amount: true,
          currency: true,
          status: true,
          plan: true,
          interval: true,
          paidAt: true,
          gatewayResponse: true,
          receiptNumber: true,
          customerEmail: true,
          createdAt: true,
          updatedAt: true,
        },
      });

      return {
        receipts: transactions.map((t) => ({
          id: t.id,
          reference: t.reference,
          paystackReference: t.paystackReference,
          amountNaira: t.amount / 100,
          currency: t.currency,
          status: t.status,
          plan: t.plan,
          interval: t.interval,
          paidAt: t.paidAt?.toISOString(),
          receiptNumber: t.receiptNumber,
          customerEmail: t.customerEmail,
          createdAt: t.createdAt.toISOString(),
        })),
      };
    }
  );
}
