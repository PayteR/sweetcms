import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { eq, and, desc, sql, gte } from 'drizzle-orm';
import { createTRPCRouter, protectedProcedure, sectionProcedure } from '../trpc';
import { getProvider, isBillingEnabled, getEnabledProviders } from '@/server/lib/payment/factory';
import { getSubscription } from '@/engine/lib/payment/subscription-service';
import {
  validateCode,
  applyDiscount,
  removeDiscount,
  getActiveDiscount,
} from '@/engine/lib/payment/discount-service';
import { PLANS, getPlan } from '@/config/plans';
import { member } from '@/server/db/schema';
import { saasSubscriptions, saasPaymentTransactions, saasDiscountCodes } from '@/server/db/schema';
import { getStats as getCachedStats } from '@/engine/lib/stats-cache';

function requireOrg(activeOrganizationId: string | null | undefined): string {
  if (!activeOrganizationId) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: 'No active organization selected',
    });
  }
  return activeOrganizationId;
}

const billingAdminProcedure = sectionProcedure('billing');

export const billingRouter = createTRPCRouter({
  getPlans: protectedProcedure.query(() => {
    return PLANS.map(({ providerPrices: _pp, ...plan }) => plan);
  }),

  getProviders: protectedProcedure.query(() => {
    return getEnabledProviders();
  }),

  getSubscription: protectedProcedure.query(async ({ ctx }) => {
    const orgId = requireOrg(ctx.activeOrganizationId);
    const sub = await getSubscription(orgId);
    if (!sub) return { planId: 'free', status: 'active' as const };
    return sub;
  }),

  createCheckoutSession: protectedProcedure
    .input(
      z.object({
        planId: z.string().min(1).max(50),
        interval: z.enum(['monthly', 'yearly']),
        providerId: z.string().min(1).max(50).default('stripe'),
        discountCode: z.string().max(50).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      if (!isBillingEnabled()) {
        throw new TRPCError({
          code: 'PRECONDITION_FAILED',
          message: 'Billing is not configured',
        });
      }

      const provider = await getProvider(input.providerId);
      if (!provider) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `Payment provider "${input.providerId}" is not available`,
        });
      }

      // Check interval is allowed for this provider
      if (provider.config.allowedIntervals && !provider.config.allowedIntervals.includes(input.interval)) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `${provider.config.name} only supports ${provider.config.allowedIntervals.join(', ')} billing`,
        });
      }

      const orgId = requireOrg(ctx.activeOrganizationId);

      // Verify user is owner or admin of org
      const [memberRecord] = await ctx.db
        .select()
        .from(member)
        .where(
          and(eq(member.organizationId, orgId), eq(member.userId, ctx.session.user.id))
        )
        .limit(1);

      if (!memberRecord || !['owner', 'admin'].includes(memberRecord.role)) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Only org owners/admins can manage billing',
        });
      }

      const plan = getPlan(input.planId);
      if (!plan) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Plan not found' });
      }

      const originalPriceCents = input.interval === 'yearly' ? plan.priceYearly : plan.priceMonthly;
      let resolvedDiscount: import('@/engine/types/payment').DiscountDefinition | undefined;
      let finalPriceCents: number | undefined;

      // Validate discount code if provided
      let discountUsageId: string | undefined;
      let discountCodeId: string | undefined;
      if (input.discountCode) {
        const validation = await validateCode(
          input.discountCode,
          ctx.session.user.id,
          input.planId,
          originalPriceCents,
        );
        if (!validation.valid) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: validation.message ?? 'Invalid discount code' });
        }
        // Apply the discount (creates usage record)
        const applied = await applyDiscount(input.discountCode, ctx.session.user.id, input.planId);
        resolvedDiscount = applied.discount;
        discountUsageId = applied.usageId;
        discountCodeId = applied.discountCodeId;
        finalPriceCents = validation.finalPriceCents ?? undefined;
      }

      const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';

      const result = await provider.createCheckout({
        organizationId: orgId,
        planId: input.planId,
        interval: input.interval,
        successUrl: `${appUrl}/dashboard/settings/billing?success=true`,
        cancelUrl: `${appUrl}/dashboard/settings/billing?canceled=true`,
        discount: resolvedDiscount,
        originalPriceCents,
        finalPriceCents,
        metadata: {
          userId: ctx.session.user.id,
          ...(input.discountCode && { discountCode: input.discountCode }),
          ...(discountUsageId && { discountUsageId }),
          ...(discountCodeId && { discountCodeId }),
        },
      });

      return { url: result.url, providerId: result.providerId };
    }),

  createPortalSession: protectedProcedure
    .input(
      z.object({
        providerId: z.string().min(1).max(50).default('stripe'),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const provider = await getProvider(input.providerId);
      if (!provider?.createPortalSession) {
        throw new TRPCError({
          code: 'PRECONDITION_FAILED',
          message: 'Portal session not supported for this provider',
        });
      }

      const orgId = requireOrg(ctx.activeOrganizationId);
      const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
      const url = await provider.createPortalSession(
        orgId,
        `${appUrl}/dashboard/settings/billing`
      );
      return { url };
    }),

  // ─── Discount Code mutations (customer-facing) ───────────────────────────

  applyDiscountCode: protectedProcedure
    .input(z.object({
      code: z.string().min(1).max(50),
      planId: z.string().min(1).max(50),
    }))
    .mutation(async ({ ctx, input }) => {
      const plan = getPlan(input.planId);
      if (!plan) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Plan not found' });
      }

      const validation = await validateCode(
        input.code,
        ctx.session.user.id,
        input.planId,
        plan.priceYearly,
      );

      if (!validation.valid) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: validation.message ?? 'Invalid discount code' });
      }

      const { discount } = await applyDiscount(input.code, ctx.session.user.id, input.planId);
      return { discount, finalPriceCents: validation.finalPriceCents };
    }),

  removeDiscountCode: protectedProcedure.mutation(async ({ ctx }) => {
    await removeDiscount(ctx.session.user.id);
    return { success: true };
  }),

  getActiveDiscount: protectedProcedure.query(async ({ ctx }) => {
    return await getActiveDiscount(ctx.session.user.id);
  }),

  // ─── Renewal ──────────────────────────────────────────────────────────────

  /** Renew an expired or past_due subscription — creates new checkout */
  renewSubscription: protectedProcedure
    .input(
      z.object({
        planId: z.string().min(1).max(50),
        interval: z.enum(['monthly', 'yearly']),
        providerId: z.string().min(1).max(50).default('stripe'),
      })
    )
    .mutation(async ({ ctx, input }) => {
      if (!isBillingEnabled()) {
        throw new TRPCError({
          code: 'PRECONDITION_FAILED',
          message: 'Billing is not configured',
        });
      }

      const orgId = requireOrg(ctx.activeOrganizationId);

      // Verify user is owner or admin of org
      const [memberRecord] = await ctx.db
        .select()
        .from(member)
        .where(
          and(eq(member.organizationId, orgId), eq(member.userId, ctx.session.user.id))
        )
        .limit(1);

      if (!memberRecord || !['owner', 'admin'].includes(memberRecord.role)) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Only org owners/admins can manage billing',
        });
      }

      const provider = await getProvider(input.providerId);
      if (!provider) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `Payment provider "${input.providerId}" is not available`,
        });
      }

      const plan = getPlan(input.planId);
      if (!plan) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Plan not found' });
      }

      const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';

      const result = await provider.createCheckout({
        organizationId: orgId,
        planId: input.planId,
        interval: input.interval,
        successUrl: `${appUrl}/dashboard/settings/billing?success=true`,
        cancelUrl: `${appUrl}/dashboard/settings/billing?canceled=true`,
        metadata: { userId: ctx.session.user.id, renewal: 'true' },
      });

      return { url: result.url, providerId: result.providerId };
    }),

  // ─── Admin billing stats ─────────────────────────────────────────────────

  getStats: billingAdminProcedure.query(async ({ ctx }) => {
    return getCachedStats('billing:stats', async () => {
      // Active subscriptions by plan
      const planDistribution = await ctx.db
        .select({
          planId: saasSubscriptions.planId,
          count: sql<number>`count(*)`.as('count'),
        })
        .from(saasSubscriptions)
        .where(eq(saasSubscriptions.status, 'active'))
        .groupBy(saasSubscriptions.planId);

      const totalActive = planDistribution.reduce((sum, p) => sum + Number(p.count), 0);

      // MRR calculation — query individual subs to determine monthly vs yearly
      const activeSubs = await ctx.db
        .select({
          planId: saasSubscriptions.planId,
          providerPriceId: saasSubscriptions.providerPriceId,
          providerId: saasSubscriptions.providerId,
        })
        .from(saasSubscriptions)
        .where(eq(saasSubscriptions.status, 'active'))
        .limit(10000);

      let mrr = 0;
      for (const sub of activeSubs) {
        const plan = getPlan(sub.planId);
        if (!plan) continue;

        // Determine if this is a yearly subscription by checking the price ID
        let isYearly = false;
        if (sub.providerPriceId && sub.providerId) {
          const prices = plan.providerPrices[sub.providerId];
          if (prices) {
            isYearly = prices.yearly === sub.providerPriceId;
          }
        }
        // Non-recurring providers (like nowpayments) are always yearly
        if (sub.providerId === 'nowpayments') isYearly = true;

        mrr += isYearly
          ? Math.round(plan.priceYearly / 12)
          : plan.priceMonthly;
      }

      // Churn: canceled in last 30 days
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const [churnResult] = await ctx.db
        .select({ count: sql<number>`count(*)`.as('count') })
        .from(saasSubscriptions)
        .where(
          and(
            eq(saasSubscriptions.status, 'canceled'),
            gte(saasSubscriptions.updatedAt, thirtyDaysAgo),
          )
        );

      // Recent transactions
      const recentTransactions = await ctx.db
        .select()
        .from(saasPaymentTransactions)
        .orderBy(desc(saasPaymentTransactions.createdAt))
        .limit(10);

      // Active discount codes count
      const [discountResult] = await ctx.db
        .select({ count: sql<number>`count(*)`.as('count') })
        .from(saasDiscountCodes)
        .where(eq(saasDiscountCodes.isActive, true));

      return {
        totalActiveSubscriptions: totalActive,
        mrr,
        planDistribution,
        churnLast30Days: Number(churnResult?.count ?? 0),
        recentTransactions,
        activeDiscountCodes: Number(discountResult?.count ?? 0),
      };
    });
  }),
});
