import { TRPCError } from '@trpc/server';
import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import { z } from 'zod';
import crypto from 'crypto';

import { cmsCategories } from '@/server/db/schema';
import { ContentStatus } from '@/types/cms';
import {
  buildAdminList,
  buildStatusCounts,
  ensureSlugUnique,
  softDelete,
  softRestore,
  permanentDelete,
} from '@/server/utils/admin-crud';
import { updateWithRevision } from '@/server/utils/cms-helpers';
import {
  createTRPCRouter,
  publicProcedure,
  sectionProcedure,
} from '../trpc';

const contentProcedure = sectionProcedure('content');

const CATEGORY_SNAPSHOT_KEYS = [
  'name',
  'slug',
  'title',
  'text',
  'status',
  'metaDescription',
  'seoTitle',
  'icon',
  'order',
  'noindex',
  'publishedAt',
  'lang',
] as const;

const crudCols = {
  table: cmsCategories,
  id: cmsCategories.id,
  deleted_at: cmsCategories.deletedAt,
};

export const categoriesRouter = createTRPCRouter({
  list: contentProcedure
    .input(
      z.object({
        search: z.string().max(200).optional(),
        trashed: z.boolean().optional(),
        lang: z.string().max(2).optional(),
        sortBy: z.string().optional(),
        sortDir: z.enum(['asc', 'desc']).optional(),
        page: z.number().int().min(1).optional(),
        pageSize: z.number().int().min(1).max(100).optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      return buildAdminList(
        {
          db: ctx.db,
          cols: {
            table: cmsCategories,
            id: cmsCategories.id,
            deleted_at: cmsCategories.deletedAt,
            lang: cmsCategories.lang,
            translation_group: cmsCategories.translationGroup,
          },
          input,
          searchColumns: [cmsCategories.name, cmsCategories.slug],
          sortColumns: {
            name: cmsCategories.name,
            order: cmsCategories.order,
            created_at: cmsCategories.createdAt,
            updated_at: cmsCategories.updatedAt,
          },
          defaultSort: 'updated_at',
        },
        async ({ where, orderBy, offset, limit }) => {
          return ctx.db
            .select()
            .from(cmsCategories)
            .where(where)
            .orderBy(orderBy)
            .offset(offset)
            .limit(limit);
        }
      );
    }),

  counts: contentProcedure.query(async ({ ctx }) => {
    return buildStatusCounts(ctx.db, {
      table: cmsCategories,
      status: cmsCategories.status,
      deleted_at: cmsCategories.deletedAt,
    });
  }),

  get: contentProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const [category] = await ctx.db
        .select()
        .from(cmsCategories)
        .where(eq(cmsCategories.id, input.id))
        .limit(1);

      if (!category) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Category not found',
        });
      }
      return category;
    }),

  create: contentProcedure
    .input(
      z.object({
        name: z.string().min(1).max(255),
        slug: z.string().min(1).max(255),
        lang: z.string().min(2).max(2),
        title: z.string().min(1).max(255),
        text: z.string().default(''),
        status: z.number().int().default(ContentStatus.DRAFT),
        icon: z.string().max(255).optional(),
        metaDescription: z.string().max(500).optional(),
        seoTitle: z.string().max(255).optional(),
        order: z.number().int().default(0),
        noindex: z.boolean().default(false),
        publishedAt: z.string().datetime().optional(),
        translationGroup: z.string().uuid().optional(),
        fallbackToDefault: z.boolean().optional(),
        jsonLd: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await ensureSlugUnique(
        ctx.db,
        {
          table: cmsCategories,
          slugCol: cmsCategories.slug,
          slug: input.slug,
          langCol: cmsCategories.lang,
          lang: input.lang,
          deletedAtCol: cmsCategories.deletedAt,
        },
        'Category'
      );

      const previewToken = crypto.randomBytes(32).toString('hex');

      const [category] = await ctx.db
        .insert(cmsCategories)
        .values({
          name: input.name,
          slug: input.slug,
          lang: input.lang,
          title: input.title,
          text: input.text,
          status: input.status,
          icon: input.icon ?? null,
          metaDescription: input.metaDescription ?? null,
          seoTitle: input.seoTitle ?? null,
          order: input.order,
          noindex: input.noindex,
          publishedAt: input.publishedAt ? new Date(input.publishedAt) : null,
          previewToken,
          translationGroup: input.translationGroup ?? null,
          fallbackToDefault: input.fallbackToDefault ?? null,
          jsonLd: input.jsonLd ?? null,
        })
        .returning();

      return category!;
    }),

  update: contentProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        name: z.string().min(1).max(255).optional(),
        slug: z.string().min(1).max(255).optional(),
        title: z.string().min(1).max(255).optional(),
        text: z.string().optional(),
        status: z.number().int().optional(),
        icon: z.string().max(255).optional().nullable(),
        metaDescription: z.string().max(500).optional().nullable(),
        seoTitle: z.string().max(255).optional().nullable(),
        order: z.number().int().optional(),
        noindex: z.boolean().optional(),
        publishedAt: z.string().datetime().optional().nullable(),
        translationGroup: z.string().uuid().optional().nullable(),
        fallbackToDefault: z.boolean().optional().nullable(),
        jsonLd: z.string().optional().nullable(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...updates } = input;

      const [existing] = await ctx.db
        .select()
        .from(cmsCategories)
        .where(eq(cmsCategories.id, id))
        .limit(1);

      if (!existing) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Category not found',
        });
      }

      if (updates.slug && updates.slug !== existing.slug) {
        await ensureSlugUnique(
          ctx.db,
          {
            table: cmsCategories,
            slugCol: cmsCategories.slug,
            slug: updates.slug,
            idCol: cmsCategories.id,
            excludeId: id,
            langCol: cmsCategories.lang,
            lang: existing.lang,
            deletedAtCol: cmsCategories.deletedAt,
          },
          'Category'
        );
      }

      await updateWithRevision({
        db: ctx.db,
        contentType: 'category',
        contentId: id,
        oldRecord: existing,
        snapshotKeys: [...CATEGORY_SNAPSHOT_KEYS],
        userId: ctx.session.user.id as string,
        oldSlug: existing.slug,
        newSlug: updates.slug,
        urlPrefix: '/category/',
        doUpdate: async (db) => {
          await db
            .update(cmsCategories)
            .set({
              ...updates,
              publishedAt:
                updates.publishedAt !== undefined
                  ? updates.publishedAt
                    ? new Date(updates.publishedAt)
                    : null
                  : undefined,
              updatedAt: new Date(),
            })
            .where(eq(cmsCategories.id, id));
        },
      });

      return { success: true };
    }),

  delete: contentProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await softDelete(ctx.db, crudCols, input.id);
      return { success: true };
    }),

  restore: contentProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await softRestore(ctx.db, crudCols, input.id);
      return { success: true };
    }),

  permanentDelete: contentProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await permanentDelete(ctx.db, crudCols, input.id, 'category');
      return { success: true };
    }),

  /** Public: get a published category by slug */
  getBySlug: publicProcedure
    .input(
      z.object({
        slug: z.string().max(255),
        lang: z.string().max(2).default('en'),
      })
    )
    .query(async ({ ctx, input }) => {
      const [category] = await ctx.db
        .select()
        .from(cmsCategories)
        .where(
          and(
            eq(cmsCategories.slug, input.slug),
            eq(cmsCategories.lang, input.lang),
            eq(cmsCategories.status, ContentStatus.PUBLISHED),
            isNull(cmsCategories.deletedAt)
          )
        )
        .limit(1);

      if (!category) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Category not found',
        });
      }
      return category;
    }),

  /** Public: list published categories */
  listPublished: publicProcedure
    .input(
      z.object({
        lang: z.string().max(2).default('en'),
        page: z.number().int().min(1).default(1),
        pageSize: z.number().int().min(1).max(100).default(100),
      })
    )
    .query(async ({ ctx, input }) => {
      const offset = (input.page - 1) * input.pageSize;

      const [items, countResult] = await Promise.all([
        ctx.db
          .select()
          .from(cmsCategories)
          .where(
            and(
              eq(cmsCategories.lang, input.lang),
              eq(cmsCategories.status, ContentStatus.PUBLISHED),
              isNull(cmsCategories.deletedAt)
            )
          )
          .orderBy(cmsCategories.order)
          .offset(offset)
          .limit(input.pageSize),
        ctx.db
          .select({ count: sql<number>`count(*)` })
          .from(cmsCategories)
          .where(
            and(
              eq(cmsCategories.lang, input.lang),
              eq(cmsCategories.status, ContentStatus.PUBLISHED),
              isNull(cmsCategories.deletedAt)
            )
          ),
      ]);

      const total = Number(countResult[0]?.count ?? 0);
      return {
        results: items,
        total,
        page: input.page,
        pageSize: input.pageSize,
        totalPages: Math.ceil(total / input.pageSize),
      };
    }),
});
