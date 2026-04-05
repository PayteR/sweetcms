import { and, count, desc, eq, gte, isNotNull, lte, sql } from 'drizzle-orm';
import { z } from 'zod';

import { parsePagination, paginatedResult } from '@/engine/crud/admin-crud';
import { saasAttributions } from '@/server/db/schema/attributions';
import { user } from '@/server/db/schema/auth';
import { saasPaymentTransactions } from '@/server/db/schema/billing';

import { createTRPCRouter, sectionProcedure } from '../trpc';

const billingProcedure = sectionProcedure('billing');

export const attributionsRouter = createTRPCRouter({
  // ─── Distinct values for filter dropdowns ─────────────────────────
  distinctValues: billingProcedure.query(async ({ ctx }) => {
    const [sources, mediums, campaigns, refCodes] = await Promise.all([
      ctx.db
        .selectDistinct({ value: saasAttributions.utmSource })
        .from(saasAttributions)
        .where(isNotNull(saasAttributions.utmSource))
        .orderBy(saasAttributions.utmSource)
        .limit(200),
      ctx.db
        .selectDistinct({ value: saasAttributions.utmMedium })
        .from(saasAttributions)
        .where(isNotNull(saasAttributions.utmMedium))
        .orderBy(saasAttributions.utmMedium)
        .limit(200),
      ctx.db
        .selectDistinct({ value: saasAttributions.utmCampaign })
        .from(saasAttributions)
        .where(isNotNull(saasAttributions.utmCampaign))
        .orderBy(saasAttributions.utmCampaign)
        .limit(200),
      ctx.db
        .selectDistinct({ value: saasAttributions.refCode })
        .from(saasAttributions)
        .where(isNotNull(saasAttributions.refCode))
        .orderBy(saasAttributions.refCode)
        .limit(200),
    ]);
    return {
      sources: sources.map((r) => r.value!),
      mediums: mediums.map((r) => r.value!),
      campaigns: campaigns.map((r) => r.value!),
      refCodes: refCodes.map((r) => r.value!),
    };
  }),

  // ─── Attribution breakdown by dimension ───────────────────────────
  breakdown: billingProcedure
    .input(
      z.object({
        groupBy: z
          .enum(['utm_source', 'utm_medium', 'utm_campaign', 'ref_code'])
          .default('utm_source'),
        startDate: z.string().max(10).optional(),
        endDate: z.string().max(10).optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const groupByCol =
        input.groupBy === 'utm_medium'
          ? saasAttributions.utmMedium
          : input.groupBy === 'utm_campaign'
            ? saasAttributions.utmCampaign
            : input.groupBy === 'ref_code'
              ? saasAttributions.refCode
              : saasAttributions.utmSource;

      const conditions = [isNotNull(groupByCol)];
      if (input.startDate) {
        conditions.push(gte(saasAttributions.capturedAt, new Date(input.startDate)));
      }
      if (input.endDate) {
        conditions.push(lte(saasAttributions.capturedAt, new Date(input.endDate + 'T23:59:59')));
      }

      const rows = await ctx.db
        .select({
          label: groupByCol,
          signups: sql<number>`COUNT(DISTINCT ${saasAttributions.userId})`,
          paidUsers: sql<number>`COUNT(DISTINCT CASE WHEN ${saasPaymentTransactions.status} = 'succeeded' THEN ${saasAttributions.userId} END)`,
          totalRevenueCents: sql<number>`COALESCE(SUM(CASE WHEN ${saasPaymentTransactions.status} = 'succeeded' THEN ${saasPaymentTransactions.amountCents} ELSE 0 END), 0)`,
        })
        .from(saasAttributions)
        .leftJoin(
          saasPaymentTransactions,
          eq(saasPaymentTransactions.userId, saasAttributions.userId)
        )
        .where(and(...conditions))
        .groupBy(groupByCol)
        .orderBy(desc(sql`COUNT(DISTINCT ${saasAttributions.userId})`))
        .limit(100);

      return rows.map((r) => {
        const signups = Number(r.signups);
        const paidUsers = Number(r.paidUsers);
        return {
          label: r.label ?? '(unknown)',
          signups,
          paidUsers,
          conversionRate: signups > 0 ? Math.round((paidUsers / signups) * 1000) / 10 : 0,
          totalRevenueCents: Number(r.totalRevenueCents),
        };
      });
    }),

  // ─── Paginated attribution list (for admin user list integration) ──
  list: billingProcedure
    .input(
      z.object({
        utmSource: z.string().max(255).optional(),
        utmMedium: z.string().max(255).optional(),
        utmCampaign: z.string().max(500).optional(),
        refCode: z.string().max(255).optional(),
        startDate: z.string().max(10).optional(),
        endDate: z.string().max(10).optional(),
        page: z.number().int().min(1).default(1),
        pageSize: z.number().int().min(1).max(100).default(25),
      })
    )
    .query(async ({ ctx, input }) => {
      const { page, pageSize, offset } = parsePagination(input);

      const conditions = [];
      if (input.utmSource) conditions.push(eq(saasAttributions.utmSource, input.utmSource));
      if (input.utmMedium) conditions.push(eq(saasAttributions.utmMedium, input.utmMedium));
      if (input.utmCampaign) conditions.push(eq(saasAttributions.utmCampaign, input.utmCampaign));
      if (input.refCode) conditions.push(eq(saasAttributions.refCode, input.refCode));
      if (input.startDate) conditions.push(gte(saasAttributions.capturedAt, new Date(input.startDate)));
      if (input.endDate) conditions.push(lte(saasAttributions.capturedAt, new Date(input.endDate + 'T23:59:59')));

      const where = conditions.length > 0 ? and(...conditions) : undefined;

      const [items, [countRow]] = await Promise.all([
        ctx.db
          .select({
            id: saasAttributions.id,
            userId: saasAttributions.userId,
            userName: user.name,
            userEmail: user.email,
            refCode: saasAttributions.refCode,
            utmSource: saasAttributions.utmSource,
            utmMedium: saasAttributions.utmMedium,
            utmCampaign: saasAttributions.utmCampaign,
            extra: saasAttributions.extra,
            capturedAt: saasAttributions.capturedAt,
          })
          .from(saasAttributions)
          .leftJoin(user, eq(user.id, saasAttributions.userId))
          .where(where)
          .orderBy(desc(saasAttributions.capturedAt))
          .offset(offset)
          .limit(pageSize),
        ctx.db.select({ count: count() }).from(saasAttributions).where(where),
      ]);

      return paginatedResult(items, countRow?.count ?? 0, page, pageSize);
    }),
});
