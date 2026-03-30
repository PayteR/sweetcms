import { TRPCError } from '@trpc/server';
import { and, desc, eq, inArray, isNull, ne, sql } from 'drizzle-orm';
import { z } from 'zod';
import crypto from 'crypto';

import { env } from '@/lib/env';
import { createLogger } from '@/lib/logger';
import { cmsPortfolio } from '@/server/db/schema';
import { translate } from '@/server/translation/translation-service';
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
  deleteAllTermRelationships,
  getTermRelationships,
  syncTermRelationships,
} from '@/server/utils/taxonomy-helpers';
import { logAudit } from '@/server/utils/audit';
import {
  createTRPCRouter,
  publicProcedure,
  sectionProcedure,
} from '../trpc';

const logger = createLogger('portfolio-router');
const contentProcedure = sectionProcedure('content');

const PORTFOLIO_SNAPSHOT_KEYS = [
  'name',
  'slug',
  'title',
  'text',
  'status',
  'metaDescription',
  'seoTitle',
  'noindex',
  'publishedAt',
  'lang',
  'clientName',
  'projectUrl',
  'techStack',
  'completedAt',
  'featuredImage',
  'featuredImageAlt',
] as const;

const crudCols = {
  table: cmsPortfolio,
  id: cmsPortfolio.id,
  deleted_at: cmsPortfolio.deletedAt,
};

export const portfolioRouter = createTRPCRouter({
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
            table: cmsPortfolio,
            id: cmsPortfolio.id,
            deleted_at: cmsPortfolio.deletedAt,
            lang: cmsPortfolio.lang,
            translation_group: cmsPortfolio.translationGroup,
          },
          input,
          searchColumns: [cmsPortfolio.name, cmsPortfolio.slug],
          sortColumns: {
            title: cmsPortfolio.name,
            name: cmsPortfolio.name,
            created_at: cmsPortfolio.createdAt,
            updated_at: cmsPortfolio.updatedAt,
          },
          defaultSort: 'updated_at',
        },
        async ({ where, orderBy, offset, limit }) => {
          return ctx.db
            .select()
            .from(cmsPortfolio)
            .where(where)
            .orderBy(orderBy)
            .offset(offset)
            .limit(limit);
        }
      );
    }),

  counts: contentProcedure.query(async ({ ctx }) => {
    return buildStatusCounts(ctx.db, {
      table: cmsPortfolio,
      status: cmsPortfolio.status,
      deleted_at: cmsPortfolio.deletedAt,
    });
  }),

  get: contentProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const [item] = await ctx.db
        .select()
        .from(cmsPortfolio)
        .where(eq(cmsPortfolio.id, input.id))
        .limit(1);

      if (!item) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Portfolio item not found',
        });
      }

      const rels = await getTermRelationships(ctx.db, item.id, 'tag');
      const tagIds = rels.map((r) => r.termId);

      return { ...item, tagIds };
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
        metaDescription: z.string().max(500).optional(),
        seoTitle: z.string().max(255).optional(),
        noindex: z.boolean().default(false),
        publishedAt: z.string().datetime().optional(),
        translationGroup: z.string().uuid().optional(),
        fallbackToDefault: z.boolean().optional(),
        featuredImage: z.string().optional(),
        featuredImageAlt: z.string().max(255).optional(),
        clientName: z.string().max(255).optional(),
        projectUrl: z.string().max(1024).optional(),
        techStack: z.array(z.string().max(100)).max(20).optional(),
        completedAt: z.string().datetime().optional(),
        tagIds: z.array(z.string().uuid()).max(50).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { tagIds, ...itemInput } = input;

      await ensureSlugUnique(
        ctx.db,
        {
          table: cmsPortfolio,
          slugCol: cmsPortfolio.slug,
          slug: itemInput.slug,
          langCol: cmsPortfolio.lang,
          lang: itemInput.lang,
          deletedAtCol: cmsPortfolio.deletedAt,
        },
        'Portfolio item'
      );

      const previewToken = crypto.randomBytes(32).toString('hex');

      const [item] = await ctx.db
        .insert(cmsPortfolio)
        .values({
          name: itemInput.name,
          slug: itemInput.slug,
          lang: itemInput.lang,
          title: itemInput.title,
          text: itemInput.text,
          status: itemInput.status,
          metaDescription: itemInput.metaDescription ?? null,
          seoTitle: itemInput.seoTitle ?? null,
          noindex: itemInput.noindex,
          publishedAt: itemInput.publishedAt ? new Date(itemInput.publishedAt) : null,
          previewToken,
          translationGroup: itemInput.translationGroup ?? null,
          fallbackToDefault: itemInput.fallbackToDefault ?? null,
          featuredImage: itemInput.featuredImage ?? null,
          featuredImageAlt: itemInput.featuredImageAlt ?? null,
          clientName: itemInput.clientName ?? null,
          projectUrl: itemInput.projectUrl ?? null,
          techStack: itemInput.techStack ?? [],
          completedAt: itemInput.completedAt ? new Date(itemInput.completedAt) : null,
        })
        .returning();

      if (tagIds?.length && item) {
        await syncTermRelationships(ctx.db, item.id, 'tag', tagIds);
      }

      logAudit({
        db: ctx.db,
        userId: ctx.session.user.id as string,
        action: 'create',
        entityType: 'portfolio',
        entityId: item!.id,
        entityTitle: item!.name,
      });

      return item!;
    }),

  duplicate: contentProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const [original] = await ctx.db
        .select()
        .from(cmsPortfolio)
        .where(eq(cmsPortfolio.id, input.id))
        .limit(1);

      if (!original) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Portfolio item not found' });
      }

      let copySlug = original.slug + '-copy';
      let attempt = 0;
      while (attempt < 20) {
        const suffix = attempt === 0 ? '' : `-${attempt + 1}`;
        const candidate = original.slug + '-copy' + suffix;
        const [existing] = await ctx.db
          .select({ id: cmsPortfolio.id })
          .from(cmsPortfolio)
          .where(
            and(
              eq(cmsPortfolio.slug, candidate),
              eq(cmsPortfolio.lang, original.lang),
              isNull(cmsPortfolio.deletedAt)
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
        .insert(cmsPortfolio)
        .values({
          name: original.name + ' (Copy)',
          slug: copySlug,
          lang: original.lang,
          title: original.title + ' (Copy)',
          text: original.text,
          status: ContentStatus.DRAFT,
          metaDescription: original.metaDescription,
          seoTitle: original.seoTitle,
          noindex: original.noindex,
          publishedAt: null,
          previewToken,
          featuredImage: original.featuredImage,
          featuredImageAlt: original.featuredImageAlt,
          clientName: original.clientName,
          projectUrl: original.projectUrl,
          techStack: original.techStack,
          completedAt: original.completedAt,
        })
        .returning();

      // Copy taxonomy relationships (tags)
      const originalRels = await getTermRelationships(ctx.db, input.id);
      const tagIds = originalRels
        .filter((r) => r.taxonomyId === 'tag')
        .map((r) => r.termId);
      if (tagIds.length > 0) {
        await syncTermRelationships(ctx.db, copy!.id, 'tag', tagIds);
      }

      logAudit({
        db: ctx.db,
        userId: ctx.session.user.id as string,
        action: 'duplicate',
        entityType: 'portfolio',
        entityId: copy!.id,
        entityTitle: copy!.name,
        metadata: { originalId: input.id },
      });

      return copy!;
    }),

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
        .from(cmsPortfolio)
        .where(eq(cmsPortfolio.id, input.id))
        .limit(1);

      if (!source) throw new TRPCError({ code: 'NOT_FOUND', message: 'Portfolio item not found' });

      let name = source.name;
      let title = source.title;
      let text = source.text;
      let metaDescription = source.metaDescription;
      let seoTitle = source.seoTitle;
      let featuredImageAlt = source.featuredImageAlt;

      if (input.autoTranslate && env.DEEPL_API_KEY) {
        const sl = source.lang ?? 'en';
        const tl = input.targetLang;
        async function safe(field: string, value: null): Promise<null>;
        async function safe(field: string, value: string): Promise<string>;
        async function safe(field: string, value: string | null): Promise<string | null>;
        async function safe(field: string, value: string | null): Promise<string | null> {
          if (!value) return value;
          try { return await translate(value, tl, sl); }
          catch (e) { logger.warn(`Translation failed for "${field}"`, { error: String(e) }); return value; }
        }
        [name, title, text, metaDescription, seoTitle, featuredImageAlt] = await Promise.all([
          safe('name', name),
          safe('title', title),
          safe('text', text),
          safe('metaDescription', metaDescription),
          safe('seoTitle', seoTitle),
          safe('featuredImageAlt', featuredImageAlt),
        ]);
      }

      const translationGroup = source.translationGroup ?? crypto.randomUUID();

      if (!source.translationGroup) {
        await ctx.db
          .update(cmsPortfolio)
          .set({ translationGroup })
          .where(eq(cmsPortfolio.id, input.id));
      }

      let slug = `${source.slug}-${input.targetLang}`;
      const [existing] = await ctx.db
        .select({ slug: cmsPortfolio.slug })
        .from(cmsPortfolio)
        .where(
          and(
            eq(cmsPortfolio.slug, slug),
            eq(cmsPortfolio.lang, input.targetLang),
            isNull(cmsPortfolio.deletedAt)
          )
        )
        .limit(1);
      if (existing) {
        slug = `${slug}-${Date.now()}`;
      }

      const previewToken = crypto.randomBytes(32).toString('hex');

      const [newItem] = await ctx.db
        .insert(cmsPortfolio)
        .values({
          name,
          slug,
          lang: input.targetLang,
          title,
          text,
          status: ContentStatus.DRAFT,
          metaDescription,
          seoTitle,
          noindex: source.noindex,
          publishedAt: null,
          previewToken,
          translationGroup,
          fallbackToDefault: source.fallbackToDefault,
          featuredImage: source.featuredImage,
          featuredImageAlt,
          clientName: source.clientName,
          projectUrl: source.projectUrl,
          techStack: source.techStack,
          completedAt: source.completedAt,
        })
        .returning();

      logAudit({
        db: ctx.db,
        userId: ctx.session.user.id as string,
        action: 'duplicate',
        entityType: 'portfolio',
        entityId: newItem!.id,
        entityTitle: newItem!.name,
        metadata: { originalId: input.id, targetLang: input.targetLang, autoTranslate: input.autoTranslate },
      });

      return { id: newItem!.id, slug: newItem!.slug };
    }),

  getTranslationSiblings: contentProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const [item] = await ctx.db
        .select({ translationGroup: cmsPortfolio.translationGroup })
        .from(cmsPortfolio)
        .where(eq(cmsPortfolio.id, input.id))
        .limit(1);

      if (!item?.translationGroup) return [];

      const siblings = await ctx.db
        .select({ id: cmsPortfolio.id, lang: cmsPortfolio.lang, slug: cmsPortfolio.slug })
        .from(cmsPortfolio)
        .where(
          and(
            eq(cmsPortfolio.translationGroup, item.translationGroup),
            ne(cmsPortfolio.id, input.id),
            isNull(cmsPortfolio.deletedAt)
          )
        )
        .limit(20);

      return siblings;
    }),

  exportBulk: contentProcedure
    .input(z.object({
      ids: z.array(z.string().uuid()).min(1).max(500),
      format: z.enum(['json', 'csv']),
    }))
    .query(async ({ ctx, input }) => {
      const items = await ctx.db
        .select({
          id: cmsPortfolio.id,
          name: cmsPortfolio.name,
          slug: cmsPortfolio.slug,
          title: cmsPortfolio.title,
          text: cmsPortfolio.text,
          status: cmsPortfolio.status,
          lang: cmsPortfolio.lang,
          metaDescription: cmsPortfolio.metaDescription,
          seoTitle: cmsPortfolio.seoTitle,
          clientName: cmsPortfolio.clientName,
          projectUrl: cmsPortfolio.projectUrl,
          techStack: cmsPortfolio.techStack,
          completedAt: cmsPortfolio.completedAt,
          publishedAt: cmsPortfolio.publishedAt,
          createdAt: cmsPortfolio.createdAt,
          updatedAt: cmsPortfolio.updatedAt,
        })
        .from(cmsPortfolio)
        .where(inArray(cmsPortfolio.id, input.ids));

      if (input.format === 'json') {
        return {
          data: JSON.stringify(items, null, 2),
          contentType: 'application/json',
        };
      }

      const headers = ['id', 'name', 'slug', 'title', 'status', 'lang', 'clientName', 'projectUrl', 'techStack', 'completedAt', 'metaDescription', 'seoTitle', 'publishedAt', 'createdAt', 'updatedAt', 'text'];
      const rows = items.map(c =>
        headers.map(h => {
          const val = c[h as keyof typeof c];
          if (val == null) return '';
          if (val instanceof Date) return val.toISOString();
          if (Array.isArray(val)) return val.join(', ');
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
        metaDescription: z.string().max(500).optional().nullable(),
        seoTitle: z.string().max(255).optional().nullable(),
        noindex: z.boolean().optional(),
        publishedAt: z.string().datetime().optional().nullable(),
        translationGroup: z.string().uuid().optional().nullable(),
        fallbackToDefault: z.boolean().optional().nullable(),
        featuredImage: z.string().optional().nullable(),
        featuredImageAlt: z.string().max(255).optional().nullable(),
        clientName: z.string().max(255).optional().nullable(),
        projectUrl: z.string().max(1024).optional().nullable(),
        techStack: z.array(z.string().max(100)).max(20).optional(),
        completedAt: z.string().datetime().optional().nullable(),
        tagIds: z.array(z.string().uuid()).max(50).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { id, tagIds, ...updates } = input;

      const [existing] = await ctx.db
        .select()
        .from(cmsPortfolio)
        .where(eq(cmsPortfolio.id, id))
        .limit(1);

      if (!existing) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Portfolio item not found',
        });
      }

      if (updates.slug && updates.slug !== existing.slug) {
        await ensureSlugUnique(
          ctx.db,
          {
            table: cmsPortfolio,
            slugCol: cmsPortfolio.slug,
            slug: updates.slug,
            idCol: cmsPortfolio.id,
            excludeId: id,
            langCol: cmsPortfolio.lang,
            lang: existing.lang,
            deletedAtCol: cmsPortfolio.deletedAt,
          },
          'Portfolio item'
        );
      }

      await updateWithRevision({
        db: ctx.db,
        contentType: 'portfolio',
        contentId: id,
        oldRecord: existing,
        snapshotKeys: [...PORTFOLIO_SNAPSHOT_KEYS],
        userId: ctx.session.user.id as string,
        oldSlug: existing.slug,
        newSlug: updates.slug,
        urlPrefix: '/portfolio/',
        doUpdate: async (db) => {
          await db
            .update(cmsPortfolio)
            .set({
              ...updates,
              publishedAt:
                updates.publishedAt !== undefined
                  ? updates.publishedAt
                    ? new Date(updates.publishedAt)
                    : null
                  : undefined,
              completedAt:
                updates.completedAt !== undefined
                  ? updates.completedAt
                    ? new Date(updates.completedAt)
                    : null
                  : undefined,
              updatedAt: new Date(),
            })
            .where(eq(cmsPortfolio.id, id));
        },
      });

      if (tagIds !== undefined) {
        await syncTermRelationships(ctx.db, id, 'tag', tagIds);
      }

      logAudit({
        db: ctx.db,
        userId: ctx.session.user.id as string,
        action: 'update',
        entityType: 'portfolio',
        entityId: id,
        entityTitle: updates.name ?? existing.name,
      });

      return { success: true };
    }),

  updateStatus: contentProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        status: z.number().int().min(0).max(2),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const [existing] = await ctx.db
        .select({ id: cmsPortfolio.id, publishedAt: cmsPortfolio.publishedAt })
        .from(cmsPortfolio)
        .where(eq(cmsPortfolio.id, input.id))
        .limit(1);

      if (!existing) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Portfolio item not found',
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
        .update(cmsPortfolio)
        .set(updates)
        .where(eq(cmsPortfolio.id, input.id));

      const action =
        input.status === ContentStatus.PUBLISHED ? 'publish' : 'unpublish';
      logAudit({
        db: ctx.db,
        userId: ctx.session.user.id as string,
        action,
        entityType: 'portfolio',
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
      await permanentDelete(ctx.db, crudCols, input.id, 'portfolio', async (tx) => {
        await deleteAllTermRelationships(tx, input.id);
      });
      return { success: true };
    }),

  /** Public: get a published portfolio item by slug */
  getBySlug: publicProcedure
    .input(
      z.object({
        slug: z.string().max(255),
        lang: z.string().max(2).default('en'),
        previewToken: z.string().max(64).optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      // If preview token provided, find by slug + token (any status)
      if (input.previewToken) {
        const [item] = await ctx.db
          .select()
          .from(cmsPortfolio)
          .where(
            and(
              eq(cmsPortfolio.slug, input.slug),
              eq(cmsPortfolio.lang, input.lang),
              eq(cmsPortfolio.previewToken, input.previewToken),
              isNull(cmsPortfolio.deletedAt)
            )
          )
          .limit(1);

        if (item) {
          const { previewToken: _pt, ...rest } = item;
          return rest;
        }
      }

      const [item] = await ctx.db
        .select()
        .from(cmsPortfolio)
        .where(
          and(
            eq(cmsPortfolio.slug, input.slug),
            eq(cmsPortfolio.lang, input.lang),
            eq(cmsPortfolio.status, ContentStatus.PUBLISHED),
            isNull(cmsPortfolio.deletedAt)
          )
        )
        .limit(1);

      if (!item) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Portfolio item not found',
        });
      }
      const { previewToken: _pt, ...rest } = item;
      return rest;
    }),

  /** Public: list published portfolio items */
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
          .from(cmsPortfolio)
          .where(
            and(
              eq(cmsPortfolio.lang, input.lang),
              eq(cmsPortfolio.status, ContentStatus.PUBLISHED),
              isNull(cmsPortfolio.deletedAt)
            )
          )
          .orderBy(desc(cmsPortfolio.completedAt))
          .offset(offset)
          .limit(input.pageSize),
        ctx.db
          .select({ count: sql<number>`count(*)` })
          .from(cmsPortfolio)
          .where(
            and(
              eq(cmsPortfolio.lang, input.lang),
              eq(cmsPortfolio.status, ContentStatus.PUBLISHED),
              isNull(cmsPortfolio.deletedAt)
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
