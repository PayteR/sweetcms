import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { eq, and } from 'drizzle-orm';
import { createTRPCRouter, protectedProcedure } from '../trpc';
import {
  getStripe,
  createCheckoutSession,
  createPortalSession,
  getActiveSubscription,
} from '@/server/lib/stripe';
import { PLANS, getPlan } from '@/config/plans';
import { member } from '@/server/db/schema';

function requireOrg(activeOrganizationId: string | null | undefined): string {
  if (!activeOrganizationId) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: 'No active organization selected',
    });
  }
  return activeOrganizationId;
}

export const billingRouter = createTRPCRouter({
  getPlans: protectedProcedure.query(() => {
    return PLANS.map(({ stripePriceIdMonthly, stripePriceIdYearly, ...plan }) => plan);
  }),

  getSubscription: protectedProcedure.query(async ({ ctx }) => {
    const orgId = requireOrg(ctx.activeOrganizationId);
    const sub = await getActiveSubscription(orgId);
    if (!sub) return { planId: 'free', status: 'active' as const };
    return sub;
  }),

  createCheckoutSession: protectedProcedure
    .input(
      z.object({
        planId: z.string().min(1).max(50),
        interval: z.enum(['monthly', 'yearly']),
      })
    )
    .mutation(async ({ ctx, input }) => {
      if (!getStripe()) {
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

      const plan = getPlan(input.planId);
      if (!plan) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Plan not found' });
      }

      const priceId =
        input.interval === 'yearly'
          ? plan.stripePriceIdYearly
          : plan.stripePriceIdMonthly;
      if (!priceId) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'No price configured for this plan',
        });
      }

      const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
      const url = await createCheckoutSession(orgId, priceId, {
        success: `${appUrl}/dashboard/settings/billing?success=true`,
        cancel: `${appUrl}/dashboard/settings/billing?canceled=true`,
      });

      return { url };
    }),

  createPortalSession: protectedProcedure.mutation(async ({ ctx }) => {
    if (!getStripe()) {
      throw new TRPCError({
        code: 'PRECONDITION_FAILED',
        message: 'Billing is not configured',
      });
    }

    const orgId = requireOrg(ctx.activeOrganizationId);
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
    const url = await createPortalSession(
      orgId,
      `${appUrl}/dashboard/settings/billing`
    );
    return { url };
  }),
});
