import { TRPCError } from '@trpc/server';
import { and, desc, eq, inArray, isNull, ne, sql } from 'drizzle-orm';
import { z } from 'zod';
import crypto from 'crypto';

import { env } from '@/lib/env';
import { createLogger } from '@/lib/logger';
import { cmsCategories } from '@/server/db/schema';
import { createFieldTranslator } from '@/server/translation/translate-fields';
import { ContentStatus } from '@/engine/types/cms';
import {
  buildAdminList,
  buildStatusCounts,
  ensureSlugUnique,
  softDelete,
  softRestore,
  permanentDelete,
} from '@/engine/crud/admin-crud';
import { updateWithRevision } from '@/engine/crud/cms-helpers';
import {
  deleteTermRelationshipsByTerm,
  getTermRelationships,
  syncTermRelationships,
} from '@/engine/crud/taxonomy-helpers';
import { logAudit } from '@/engine/lib/audit';
import {
  createTRPCRouter,
  publicProcedure,
  sectionProcedure,
} from '../trpc';

const logger = createLogger('categories-router');
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

      const rels = await getTermRelationships(ctx.db, category.id, 'tag');
      const tagIds = rels.map((r) => r.termId);

      return { ...category, tagIds };
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
        tagIds: z.array(z.string().uuid()).max(50).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { tagIds, ...catInput } = input;

      await ensureSlugUnique(
        ctx.db,
        {
          table: cmsCategories,
          slugCol: cmsCategories.slug,
          slug: catInput.slug,
          langCol: cmsCategories.lang,
          lang: catInput.lang,
          deletedAtCol: cmsCategories.deletedAt,
        },
        'Category'
      );

      const previewToken = crypto.randomBytes(32).toString('hex');

      const [category] = await ctx.db
        .insert(cmsCategories)
        .values({
          name: catInput.name,
          slug: catInput.slug,
          lang: catInput.lang,
          title: catInput.title,
          text: catInput.text,
          status: catInput.status,
          icon: catInput.icon ?? null,
          metaDescription: catInput.metaDescription ?? null,
          seoTitle: catInput.seoTitle ?? null,
          order: catInput.order,
          noindex: catInput.noindex,
          publishedAt: catInput.publishedAt ? new Date(catInput.publishedAt) : null,
          previewToken,
          translationGroup: catInput.translationGroup ?? null,
          fallbackToDefault: catInput.fallbackToDefault ?? null,
          jsonLd: catInput.jsonLd ?? null,
        })
        .returning();

      if (tagIds?.length && category) {
        await syncTermRelationships(ctx.db, category.id, 'tag', tagIds);
      }

      logAudit({
        db: ctx.db,
        userId: ctx.session.user.id,
        action: 'create',
        entityType: 'category',
        entityId: category!.id,
        entityTitle: category!.name,
      });

      return category!;
    }),

  /** Duplicate a category */
  duplicate: contentProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const [original] = await ctx.db
        .select()
        .from(cmsCategories)
        .where(eq(cmsCategories.id, input.id))
        .limit(1);

      if (!original) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Category not found' });
      }

      // Generate a unique slug for the copy
      let copySlug = original.slug + '-copy';
      let attempt = 0;
      while (attempt < 20) {
        const suffix = attempt === 0 ? '' : `-${attempt + 1}`;
        const candidate = original.slug + '-copy' + suffix;
        const [existing] = await ctx.db
          .select({ id: cmsCategories.id })
          .from(cmsCategories)
          .where(
            and(
              eq(cmsCategories.slug, candidate),
              eq(cmsCategories.lang, original.lang),
              isNull(cmsCategories.deletedAt)
            )
          )
          .limit(1);

        if (!existing) {
          copySlug = candidate;
          break;
        }
        attempt++;
      }

      if (attempt >= 20) {
        throw new TRPCError({
          code: 'CONFLICT',
          message: 'Could not generate a unique slug after 20 attempts',
        });
      }

      const previewToken = crypto.randomBytes(32).toString('hex');

      const [copy] = await ctx.db
        .insert(cmsCategories)
        .values({
          name: original.name + ' (Copy)',
          slug: copySlug,
          lang: original.lang,
          title: original.title + ' (Copy)',
          text: original.text,
          status: ContentStatus.DRAFT,
          icon: original.icon,
          metaDescription: original.metaDescription,
          seoTitle: original.seoTitle,
          order: original.order,
          noindex: original.noindex,
          publishedAt: null,
          previewToken,
          jsonLd: original.jsonLd,
        })
        .returning();

      // Copy taxonomy relationships (tags) from the original
      const originalRels = await getTermRelationships(ctx.db, input.id);
      const tagIds = originalRels
        .filter((r) => r.taxonomyId === 'tag')
        .map((r) => r.termId);
      if (tagIds.length > 0) {
        await syncTermRelationships(ctx.db, copy!.id, 'tag', tagIds);
      }

      logAudit({
        db: ctx.db,
        userId: ctx.session.user.id,
        action: 'duplicate',
        entityType: 'category',
        entityId: copy!.id,
        entityTitle: copy!.name,
        metadata: { originalId: input.id },
      });

      return copy!;
    }),

  /** Duplicate a category as a translation in another language */
  duplicateAsTranslation: contentProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        targetLang: z.string().min(2).max(5),
        autoTranslate: z.boolean().default(false),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const [source] = await ctx.db
        .select()
        .from(cmsCategories)
        .where(eq(cmsCategories.id, input.id))
        .limit(1);

      if (!source) throw new TRPCError({ code: 'NOT_FOUND', message: 'Category not found' });

      let name = source.name;
      let title = source.title;
      let text = source.text;
      let metaDescription = source.metaDescription;
      let seoTitle = source.seoTitle;

      if (input.autoTranslate && env.DEEPL_API_KEY) {
        const sl = source.lang ?? 'en';
        const tl = input.targetLang;
        const safe = createFieldTranslator(tl, sl, logger);
        [name, title, text, metaDescription, seoTitle] = await Promise.all([
          safe('name', name),
          safe('title', title),
          safe('text', text),
          safe('metaDescription', metaDescription),
          safe('seoTitle', seoTitle),
        ]);
      }

      // Create or reuse translation group
      const translationGroup = source.translationGroup ?? crypto.randomUUID();

      // If source had no group, update it
      if (!source.translationGroup) {
        await ctx.db
          .update(cmsCategories)
          .set({ translationGroup })
          .where(eq(cmsCategories.id, input.id));
      }

      // Generate unique slug
      let slug = `${source.slug}-${input.targetLang}`;
      const [existing] = await ctx.db
        .select({ slug: cmsCategories.slug })
        .from(cmsCategories)
        .where(
          and(
            eq(cmsCategories.slug, slug),
            eq(cmsCategories.lang, input.targetLang),
            isNull(cmsCategories.deletedAt)
          )
        )
        .limit(1);
      if (existing) {
        slug = `${slug}-${Date.now()}`;
      }

      const previewToken = crypto.randomBytes(32).toString('hex');

      const [newCategory] = await ctx.db
        .insert(cmsCategories)
        .values({
          name,
          slug,
          lang: input.targetLang,
          title,
          text,
          status: ContentStatus.DRAFT,
          icon: source.icon,
          metaDescription,
          seoTitle,
          order: source.order,
          noindex: source.noindex,
          publishedAt: null,
          previewToken,
          translationGroup,
          fallbackToDefault: source.fallbackToDefault,
          jsonLd: source.jsonLd,
        })
        .returning();

      logAudit({
        db: ctx.db,
        userId: ctx.session.user.id,
        action: 'duplicate',
        entityType: 'category',
        entityId: newCategory!.id,
        entityTitle: newCategory!.name,
        metadata: { originalId: input.id, targetLang: input.targetLang, autoTranslate: input.autoTranslate },
      });

      return { id: newCategory!.id, slug: newCategory!.slug };
    }),

  /** Get translation siblings for a category */
  getTranslationSiblings: contentProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const [cat] = await ctx.db
        .select({ translationGroup: cmsCategories.translationGroup })
        .from(cmsCategories)
        .where(eq(cmsCategories.id, input.id))
        .limit(1);

      if (!cat?.translationGroup) return [];

      const siblings = await ctx.db
        .select({ id: cmsCategories.id, lang: cmsCategories.lang, slug: cmsCategories.slug })
        .from(cmsCategories)
        .where(
          and(
            eq(cmsCategories.translationGroup, cat.translationGroup),
            ne(cmsCategories.id, input.id),
            isNull(cmsCategories.deletedAt)
          )
        )
        .limit(20);

      return siblings;
    }),

  /** Export specific categories by ID array */
  exportBulk: contentProcedure
    .input(z.object({
      ids: z.array(z.string().uuid()).min(1).max(500),
      format: z.enum(['json', 'csv']),
    }))
    .query(async ({ ctx, input }) => {
      const cats = await ctx.db
        .select({
          id: cmsCategories.id,
          name: cmsCategories.name,
          slug: cmsCategories.slug,
          title: cmsCategories.title,
          text: cmsCategories.text,
          status: cmsCategories.status,
          lang: cmsCategories.lang,
          metaDescription: cmsCategories.metaDescription,
          seoTitle: cmsCategories.seoTitle,
          publishedAt: cmsCategories.publishedAt,
          createdAt: cmsCategories.createdAt,
          updatedAt: cmsCategories.updatedAt,
        })
        .from(cmsCategories)
        .where(inArray(cmsCategories.id, input.ids));

      if (input.format === 'json') {
        return {
          data: JSON.stringify(cats, null, 2),
          contentType: 'application/json',
        };
      }

      const headers = ['id', 'name', 'slug', 'title', 'status', 'lang', 'metaDescription', 'seoTitle', 'publishedAt', 'createdAt', 'updatedAt', 'text'];
      const rows = cats.map(c =>
        headers.map(h => {
          const val = c[h as keyof typeof c];
          if (val == null) return '';
          if (val instanceof Date) return val.toISOString();
          return String(val).replace(/\t/g, ' ').replace(/\n/g, '\\n');
        }).join('\t')
      );

      return {
        data: [headers.join('\t'), ...rows].join('\n'),
        contentType: 'text/tab-separated-values',
      };
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
        tagIds: z.array(z.string().uuid()).max(50).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { id, tagIds, ...updates } = input;

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
        userId: ctx.session.user.id,
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

      if (tagIds !== undefined) {
        await syncTermRelationships(ctx.db, id, 'tag', tagIds);
      }

      logAudit({
        db: ctx.db,
        userId: ctx.session.user.id,
        action: 'update',
        entityType: 'category',
        entityId: id,
        entityTitle: updates.name ?? existing.name,
      });

      return { success: true };
    }),

  /** Update just the status of a category (for bulk actions) */
  updateStatus: contentProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        status: z.number().int().min(0).max(2),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const [existing] = await ctx.db
        .select({ id: cmsCategories.id, publishedAt: cmsCategories.publishedAt })
        .from(cmsCategories)
        .where(eq(cmsCategories.id, input.id))
        .limit(1);

      if (!existing) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Category not found',
        });
      }

      const updates: Record<string, unknown> = {
        status: input.status,
        updatedAt: new Date(),
      };

      if (input.status === ContentStatus.PUBLISHED && !existing.publishedAt) {
        updates.publishedAt = new Date();
      }

      await ctx.db
        .update(cmsCategories)
        .set(updates)
        .where(eq(cmsCategories.id, input.id));

      const action =
        input.status === ContentStatus.PUBLISHED ? 'publish' : 'unpublish';
      logAudit({
        db: ctx.db,
        userId: ctx.session.user.id,
        action,
        entityType: 'category',
        entityId: input.id,
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
      await permanentDelete(ctx.db, crudCols, input.id, 'category', async (tx) => {
        await deleteTermRelationshipsByTerm(tx, input.id, 'category');
      });
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
      const { previewToken: _pt, ...rest } = category;
      return rest;
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
        results: items.map(({ previewToken: _pt, ...rest }) => rest),
        total,
        page: input.page,
        pageSize: input.pageSize,
        totalPages: Math.ceil(total / input.pageSize),
      };
    }),
});
