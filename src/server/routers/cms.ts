import { TRPCError } from '@trpc/server';
import { and, asc, desc, eq, gte, inArray, isNotNull, isNull, lte, ne, sql } from 'drizzle-orm';
import { z } from 'zod';
import crypto from 'crypto';

import { getContentTypeByPostType } from '@/config/cms';
import { env } from '@/lib/env';
import { LOCALES } from '@/lib/constants';
import { createLogger } from '@/lib/logger';
import {
  SEO_OVERRIDE_ROUTES,
  SEO_OVERRIDE_SLUGS,
} from '@/server/utils/seo-routes';
import { cmsPosts, cmsCategories, cmsTerms, cmsTermRelationships, cmsPostAttachments } from '@/server/db/schema';
import { ContentStatus, PostType } from '@/engine/types/cms';
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
  syncTermRelationships,
  getTermRelationships,
  deleteAllTermRelationships,
  resolveTagsForPosts,
} from '@/engine/crud/taxonomy-helpers';
import { logAudit } from '@/engine/lib/audit';
import { createFieldTranslator } from '@/server/translation/translate-fields';
import { dispatchWebhook } from '@/engine/lib/webhooks';
import { getStorage } from '@/server/storage';
import {
  createTRPCRouter,
  publicProcedure,
  sectionProcedure,
} from '../trpc';

const logger = createLogger('cms-router');

const contentProcedure = sectionProcedure('content');

const POST_SNAPSHOT_KEYS = [
  'title',
  'slug',
  'content',
  'status',
  'metaDescription',
  'seoTitle',
  'featuredImage',
  'featuredImageAlt',
  'jsonLd',
  'noindex',
  'publishedAt',
  'lang',
] as const;

const crudCols = {
  table: cmsPosts,
  id: cmsPosts.id,
  deleted_at: cmsPosts.deletedAt,
};

export const cmsRouter = createTRPCRouter({
  /** List posts with search, pagination, status tabs */
  list: contentProcedure
    .input(
      z.object({
        type: z.number().int().min(1),
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
            table: cmsPosts,
            id: cmsPosts.id,
            deleted_at: cmsPosts.deletedAt,
            lang: cmsPosts.lang,
            translation_group: cmsPosts.translationGroup,
          },
          input,
          searchColumns: [cmsPosts.title, cmsPosts.slug],
          sortColumns: {
            title: cmsPosts.title,
            created_at: cmsPosts.createdAt,
            updated_at: cmsPosts.updatedAt,
            published_at: cmsPosts.publishedAt,
          },
          defaultSort: 'updated_at',
          extraConditions: [eq(cmsPosts.type, input.type)],
        },
        async ({ where, orderBy, offset, limit }) => {
          return ctx.db
            .select()
            .from(cmsPosts)
            .where(where)
            .orderBy(orderBy)
            .offset(offset)
            .limit(limit);
        }
      );
    }),

  /** Status tab counts */
  counts: contentProcedure
    .input(z.object({ type: z.number().int().min(1) }))
    .query(async ({ ctx, input }) => {
      return buildStatusCounts(
        ctx.db,
        {
          table: cmsPosts,
          status: cmsPosts.status,
          deleted_at: cmsPosts.deletedAt,
        },
        eq(cmsPosts.type, input.type)
      );
    }),

  /** Get single post by ID (with category + tag IDs) */
  get: contentProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const [post] = await ctx.db
        .select()
        .from(cmsPosts)
        .where(eq(cmsPosts.id, input.id))
        .limit(1);

      if (!post) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Post not found' });
      }

      const rels = await getTermRelationships(ctx.db, post.id);
      const categoryIds = rels
        .filter((r) => r.taxonomyId === 'category')
        .map((r) => r.termId);
      const tagIds = rels
        .filter((r) => r.taxonomyId === 'tag')
        .map((r) => r.termId);

      return { ...post, categoryIds, tagIds };
    }),

  /** Create a new post */
  create: contentProcedure
    .input(
      z.object({
        type: z.number().int().min(1),
        title: z.string().min(1).max(255),
        slug: z.string().max(255),
        lang: z.string().min(2).max(2),
        content: z.string().default(''),
        status: z.number().int().default(ContentStatus.DRAFT),
        metaDescription: z.string().max(500).optional(),
        seoTitle: z.string().max(100).optional(),
        featuredImage: z.string().max(1024).optional(),
        featuredImageAlt: z.string().max(500).optional(),
        jsonLd: z.string().optional(),
        noindex: z.boolean().default(false),
        publishedAt: z.string().datetime().optional(),
        translationGroup: z.string().uuid().optional(),
        fallbackToDefault: z.boolean().optional(),
        parentId: z.string().uuid().optional(),
        categoryIds: z.array(z.string().uuid()).max(20).optional(),
        tagIds: z.array(z.string().uuid()).max(50).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { categoryIds, tagIds, ...postInput } = input;
      const contentType = getContentTypeByPostType(postInput.type);

      await ensureSlugUnique(
        ctx.db,
        {
          table: cmsPosts,
          slugCol: cmsPosts.slug,
          slug: input.slug,
          langCol: cmsPosts.lang,
          lang: input.lang,
          deletedAtCol: cmsPosts.deletedAt,
          extraConditions: [eq(cmsPosts.type, input.type)],
        },
        contentType.label
      );

      const previewToken = crypto.randomBytes(32).toString('hex');

      const [post] = await ctx.db
        .insert(cmsPosts)
        .values({
          type: postInput.type,
          title: postInput.title,
          slug: postInput.slug,
          lang: postInput.lang,
          content: postInput.content,
          status: postInput.status,
          metaDescription: postInput.metaDescription ?? null,
          seoTitle: postInput.seoTitle ?? null,
          featuredImage: postInput.featuredImage ?? null,
          featuredImageAlt: postInput.featuredImageAlt ?? null,
          jsonLd: postInput.jsonLd ?? null,
          noindex: postInput.noindex,
          publishedAt: postInput.publishedAt ? new Date(postInput.publishedAt) : null,
          previewToken,
          translationGroup: postInput.translationGroup ?? null,
          fallbackToDefault: postInput.fallbackToDefault ?? null,
          parentId: postInput.parentId ?? null,
          authorId: ctx.session.user.id,
        })
        .returning();

      // Sync taxonomy relationships
      if (categoryIds?.length && post) {
        await syncTermRelationships(ctx.db, post.id, 'category', categoryIds);
      }
      if (tagIds?.length && post) {
        await syncTermRelationships(ctx.db, post.id, 'tag', tagIds);
      }

      logAudit({
        db: ctx.db,
        userId: ctx.session.user.id,
        action: 'create',
        entityType: 'post',
        entityId: post!.id,
        entityTitle: post!.title,
      });
      dispatchWebhook(ctx.db, 'post.created', { id: post!.id, title: post!.title, type: post!.type });

      return post!;
    }),

  /** Update a post */
  update: contentProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        title: z.string().min(1).max(255).optional(),
        slug: z.string().max(255).optional(),
        content: z.string().optional(),
        status: z.number().int().optional(),
        metaDescription: z.string().max(500).optional().nullable(),
        seoTitle: z.string().max(100).optional().nullable(),
        featuredImage: z.string().max(1024).optional().nullable(),
        featuredImageAlt: z.string().max(500).optional().nullable(),
        jsonLd: z.string().optional().nullable(),
        noindex: z.boolean().optional(),
        publishedAt: z.string().datetime().optional().nullable(),
        translationGroup: z.string().uuid().optional().nullable(),
        fallbackToDefault: z.boolean().optional().nullable(),
        parentId: z.string().uuid().optional().nullable(),
        categoryIds: z.array(z.string().uuid()).max(20).optional(),
        tagIds: z.array(z.string().uuid()).max(50).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { id, categoryIds, tagIds, ...updates } = input;

      const [existing] = await ctx.db
        .select()
        .from(cmsPosts)
        .where(eq(cmsPosts.id, id))
        .limit(1);

      if (!existing) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Post not found' });
      }

      const contentType = getContentTypeByPostType(existing.type);

      if (updates.slug && updates.slug !== existing.slug) {
        await ensureSlugUnique(
          ctx.db,
          {
            table: cmsPosts,
            slugCol: cmsPosts.slug,
            slug: updates.slug,
            idCol: cmsPosts.id,
            excludeId: id,
            langCol: cmsPosts.lang,
            lang: existing.lang,
            deletedAtCol: cmsPosts.deletedAt,
            extraConditions: [eq(cmsPosts.type, existing.type)],
          },
          contentType.label
        );
      }

      await updateWithRevision({
        db: ctx.db,
        contentType: contentType.id,
        contentId: id,
        oldRecord: existing,
        snapshotKeys: [...POST_SNAPSHOT_KEYS],
        userId: ctx.session.user.id,
        oldSlug: existing.slug,
        newSlug: updates.slug,
        urlPrefix: contentType.urlPrefix,
        doUpdate: async (db) => {
          await db
            .update(cmsPosts)
            .set({
              ...updates,
              publishedAt: updates.publishedAt !== undefined
                ? updates.publishedAt
                  ? new Date(updates.publishedAt)
                  : null
                : undefined,
              updatedAt: new Date(),
            })
            .where(eq(cmsPosts.id, id));
        },
      });

      // Sync taxonomy relationships if provided
      if (categoryIds !== undefined) {
        await syncTermRelationships(ctx.db, id, 'category', categoryIds);
      }
      if (tagIds !== undefined) {
        await syncTermRelationships(ctx.db, id, 'tag', tagIds);
      }

      logAudit({
        db: ctx.db,
        userId: ctx.session.user.id,
        action: 'update',
        entityType: 'post',
        entityId: id,
        entityTitle: updates.title ?? existing.title,
      });
      dispatchWebhook(ctx.db, 'post.updated', { id, title: updates.title ?? existing.title });

      return { success: true };
    }),

  /** Update just the status of a post (for bulk actions) */
  updateStatus: contentProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        status: z.number().int().min(0).max(2),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const [existing] = await ctx.db
        .select({ id: cmsPosts.id, publishedAt: cmsPosts.publishedAt })
        .from(cmsPosts)
        .where(eq(cmsPosts.id, input.id))
        .limit(1);

      if (!existing) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Post not found' });
      }

      const updates: Record<string, unknown> = {
        status: input.status,
        updatedAt: new Date(),
      };

      if (input.status === ContentStatus.PUBLISHED && !existing.publishedAt) {
        updates.publishedAt = new Date();
      }

      await ctx.db
        .update(cmsPosts)
        .set(updates)
        .where(eq(cmsPosts.id, input.id));

      const action =
        input.status === ContentStatus.PUBLISHED ? 'publish' : 'unpublish';
      logAudit({
        db: ctx.db,
        userId: ctx.session.user.id,
        action,
        entityType: 'post',
        entityId: input.id,
      });

      return { success: true };
    }),

  /** Soft-delete (trash) a post */
  delete: contentProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await softDelete(ctx.db, crudCols, input.id);
      return { success: true };
    }),

  /** Restore from trash */
  restore: contentProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await softRestore(ctx.db, crudCols, input.id);
      return { success: true };
    }),

  /** Permanently delete a trashed post */
  permanentDelete: contentProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const [post] = await ctx.db
        .select({ type: cmsPosts.type })
        .from(cmsPosts)
        .where(eq(cmsPosts.id, input.id))
        .limit(1);

      if (!post) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Post not found' });
      }

      const contentType = getContentTypeByPostType(post.type);
      await permanentDelete(ctx.db, crudCols, input.id, contentType.id, async (tx) => {
        await deleteAllTermRelationships(tx, input.id);
      });
      return { success: true };
    }),

  /** Duplicate a post */
  duplicate: contentProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const [original] = await ctx.db
        .select()
        .from(cmsPosts)
        .where(eq(cmsPosts.id, input.id))
        .limit(1);

      if (!original) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Post not found' });
      }

      // Generate a unique slug for the copy
      let copySlug = original.slug + '-copy';
      let attempt = 0;
      while (attempt < 20) {
        const suffix = attempt === 0 ? '' : `-${attempt + 1}`;
        const candidate = original.slug + '-copy' + suffix;
        const [existing] = await ctx.db
          .select({ id: cmsPosts.id })
          .from(cmsPosts)
          .where(
            and(
              eq(cmsPosts.slug, candidate),
              eq(cmsPosts.type, original.type),
              eq(cmsPosts.lang, original.lang),
              isNull(cmsPosts.deletedAt)
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
        .insert(cmsPosts)
        .values({
          type: original.type,
          title: original.title + ' (Copy)',
          slug: copySlug,
          lang: original.lang,
          content: original.content,
          status: ContentStatus.DRAFT,
          metaDescription: original.metaDescription,
          seoTitle: original.seoTitle,
          featuredImage: original.featuredImage,
          featuredImageAlt: original.featuredImageAlt,
          jsonLd: original.jsonLd,
          noindex: original.noindex,
          publishedAt: null,
          previewToken,
          parentId: original.parentId,
          authorId: ctx.session.user.id,
        })
        .returning();

      // Copy taxonomy relationships (categories + tags) from the original
      const originalRels = await getTermRelationships(ctx.db, input.id);
      const categoryIds = originalRels
        .filter((r) => r.taxonomyId === 'category')
        .map((r) => r.termId);
      const tagIds = originalRels
        .filter((r) => r.taxonomyId === 'tag')
        .map((r) => r.termId);
      if (categoryIds.length > 0) {
        await syncTermRelationships(ctx.db, copy!.id, 'category', categoryIds);
      }
      if (tagIds.length > 0) {
        await syncTermRelationships(ctx.db, copy!.id, 'tag', tagIds);
      }

      logAudit({
        db: ctx.db,
        userId: ctx.session.user.id,
        action: 'duplicate',
        entityType: 'post',
        entityId: copy!.id,
        entityTitle: copy!.title,
        metadata: { originalId: input.id },
      });

      return copy!;
    }),

  /** Validate a list of internal URLs against published CMS content */
  validateLinks: contentProcedure
    .input(z.object({ urls: z.array(z.string().max(500)).max(100) }))
    .query(async ({ ctx, input }) => {
      const results: { url: string; valid: boolean }[] = [];

      for (const url of input.urls) {
        // Normalize: strip leading slash, split segments
        const clean = url.startsWith('/') ? url.slice(1) : url;
        const parts = clean.split('/').filter(Boolean);

        let valid = false;

        if (parts.length === 0) {
          // Root URL — always valid
          valid = true;
        } else if (parts.length === 1) {
          // Single segment — check cmsPosts (pages) by slug
          const [row] = await ctx.db
            .select({ id: cmsPosts.id })
            .from(cmsPosts)
            .where(
              and(
                eq(cmsPosts.slug, parts[0]!),
                eq(cmsPosts.status, ContentStatus.PUBLISHED),
                isNull(cmsPosts.deletedAt)
              )
            )
            .limit(1);
          valid = !!row;
        } else if (parts[0] === 'blog' && parts.length === 2) {
          // /blog/slug — check cmsPosts with blog type
          const [row] = await ctx.db
            .select({ id: cmsPosts.id })
            .from(cmsPosts)
            .where(
              and(
                eq(cmsPosts.slug, parts[1]!),
                eq(cmsPosts.status, ContentStatus.PUBLISHED),
                isNull(cmsPosts.deletedAt)
              )
            )
            .limit(1);
          valid = !!row;
        } else if (parts[0] === 'category' && parts.length === 2) {
          // /category/slug — check cmsCategories
          const [row] = await ctx.db
            .select({ id: cmsCategories.id })
            .from(cmsCategories)
            .where(
              and(
                eq(cmsCategories.slug, parts[1]!),
                eq(cmsCategories.status, ContentStatus.PUBLISHED),
                isNull(cmsCategories.deletedAt)
              )
            )
            .limit(1);
          valid = !!row;
        } else if (parts[0] === 'tag' && parts.length === 2) {
          // /tag/slug — check cmsTerms
          const [row] = await ctx.db
            .select({ id: cmsTerms.id })
            .from(cmsTerms)
            .where(
              and(
                eq(cmsTerms.slug, parts[1]!),
                eq(cmsTerms.taxonomyId, 'tag'),
                isNull(cmsTerms.deletedAt)
              )
            )
            .limit(1);
          valid = !!row;
        }

        results.push({ url, valid });
      }

      return results;
    }),

  /** Duplicate a post as a translation in another language */
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
        .from(cmsPosts)
        .where(eq(cmsPosts.id, input.id))
        .limit(1);

      if (!source) throw new TRPCError({ code: 'NOT_FOUND', message: 'Post not found' });

      // Translate fields if requested and DeepL is configured
      let title = source.title;
      let content = source.content;
      let metaDescription = source.metaDescription;
      let seoTitle = source.seoTitle;
      let featuredImageAlt = source.featuredImageAlt;

      if (input.autoTranslate && env.DEEPL_API_KEY) {
        const sl = source.lang ?? 'en';
        const tl = input.targetLang;
        const safe = createFieldTranslator(tl, sl, logger);
        [title, content, metaDescription, seoTitle, featuredImageAlt] = await Promise.all([
          safe('title', title),
          safe('content', content),
          safe('metaDescription', metaDescription),
          safe('seoTitle', seoTitle),
          safe('featuredImageAlt', featuredImageAlt),
        ]);
      }

      // Create or reuse translation group
      const translationGroup = source.translationGroup ?? crypto.randomUUID();

      // If source had no group, update it
      if (!source.translationGroup) {
        await ctx.db
          .update(cmsPosts)
          .set({ translationGroup })
          .where(eq(cmsPosts.id, input.id));
      }

      // Generate unique slug
      let slug = `${source.slug}-${input.targetLang}`;
      const [existing] = await ctx.db
        .select({ slug: cmsPosts.slug })
        .from(cmsPosts)
        .where(
          and(
            eq(cmsPosts.slug, slug),
            eq(cmsPosts.lang, input.targetLang),
            isNull(cmsPosts.deletedAt)
          )
        )
        .limit(1);
      if (existing) {
        slug = `${slug}-${Date.now()}`;
      }

      const previewToken = crypto.randomBytes(32).toString('hex');

      const [newPost] = await ctx.db
        .insert(cmsPosts)
        .values({
          type: source.type,
          title,
          slug,
          lang: input.targetLang,
          content,
          status: ContentStatus.DRAFT,
          metaDescription,
          seoTitle,
          featuredImage: source.featuredImage,
          featuredImageAlt,
          jsonLd: source.jsonLd,
          noindex: source.noindex,
          publishedAt: null,
          previewToken,
          translationGroup,
          fallbackToDefault: source.fallbackToDefault,
          parentId: source.parentId,
          authorId: ctx.session.user.id,
        })
        .returning();

      logAudit({
        db: ctx.db,
        userId: ctx.session.user.id,
        action: 'duplicate',
        entityType: 'post',
        entityId: newPost!.id,
        entityTitle: newPost!.title,
        metadata: { originalId: input.id, targetLang: input.targetLang, autoTranslate: input.autoTranslate },
      });

      return { id: newPost!.id, slug: newPost!.slug };
    }),

  /** Get translation siblings for a post (other posts in the same translation group) */
  getTranslationSiblings: contentProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const [post] = await ctx.db
        .select({ translationGroup: cmsPosts.translationGroup })
        .from(cmsPosts)
        .where(eq(cmsPosts.id, input.id))
        .limit(1);

      if (!post?.translationGroup) return [];

      const siblings = await ctx.db
        .select({ id: cmsPosts.id, lang: cmsPosts.lang, slug: cmsPosts.slug })
        .from(cmsPosts)
        .where(
          and(
            eq(cmsPosts.translationGroup, post.translationGroup),
            ne(cmsPosts.id, input.id),
            isNull(cmsPosts.deletedAt)
          )
        )
        .limit(20);

      return siblings;
    }),

  /** Export specific posts by ID array */
  exportBulk: contentProcedure
    .input(z.object({
      ids: z.array(z.string().uuid()).min(1).max(500),
      format: z.enum(['json', 'csv']),
    }))
    .query(async ({ ctx, input }) => {
      const posts = await ctx.db
        .select({
          id: cmsPosts.id,
          title: cmsPosts.title,
          slug: cmsPosts.slug,
          content: cmsPosts.content,
          status: cmsPosts.status,
          lang: cmsPosts.lang,
          metaDescription: cmsPosts.metaDescription,
          seoTitle: cmsPosts.seoTitle,
          publishedAt: cmsPosts.publishedAt,
          createdAt: cmsPosts.createdAt,
          updatedAt: cmsPosts.updatedAt,
        })
        .from(cmsPosts)
        .where(inArray(cmsPosts.id, input.ids));

      if (input.format === 'json') {
        return {
          data: JSON.stringify(posts, null, 2),
          contentType: 'application/json',
        };
      }

      // CSV with tab delimiter for content fields
      const headers = ['id', 'title', 'slug', 'status', 'lang', 'metaDescription', 'seoTitle', 'publishedAt', 'createdAt', 'updatedAt', 'content'];
      const rows = posts.map(p =>
        headers.map(h => {
          const val = p[h as keyof typeof p];
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

  /** Export posts as JSON or CSV */
  exportPosts: contentProcedure
    .input(
      z.object({
        type: z.number().int().min(1),
        format: z.enum(['json', 'csv']),
      })
    )
    .query(async ({ ctx, input }) => {
      const posts = await ctx.db
        .select({
          title: cmsPosts.title,
          slug: cmsPosts.slug,
          content: cmsPosts.content,
          metaDescription: cmsPosts.metaDescription,
          publishedAt: cmsPosts.publishedAt,
          status: cmsPosts.status,
        })
        .from(cmsPosts)
        .where(
          and(
            eq(cmsPosts.type, input.type),
            eq(cmsPosts.status, ContentStatus.PUBLISHED),
            isNull(cmsPosts.deletedAt)
          )
        )
        .orderBy(desc(cmsPosts.publishedAt))
        .limit(5000);

      if (input.format === 'json') {
        return { data: JSON.stringify(posts, null, 2), contentType: 'application/json' };
      }

      // CSV serialization
      const escape = (v: string | null | undefined) => {
        if (v == null) return '';
        const s = String(v).replace(/"/g, '""');
        return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s}"` : s;
      };
      const header = 'title,slug,content,metaDescription,publishedAt,status';
      const rows = posts.map(
        (p) =>
          `${escape(p.title)},${escape(p.slug)},${escape(p.content)},${escape(p.metaDescription)},${escape(p.publishedAt?.toISOString())},${p.status}`
      );
      return { data: [header, ...rows].join('\n'), contentType: 'text/csv' };
    }),

  /** Get page tree (hierarchical pages) */
  getPageTree: contentProcedure
    .input(z.object({ lang: z.string().max(2).default('en') }))
    .query(async ({ ctx, input }) => {
      const pages = await ctx.db
        .select({
          id: cmsPosts.id,
          title: cmsPosts.title,
          slug: cmsPosts.slug,
          parentId: cmsPosts.parentId,
          status: cmsPosts.status,
        })
        .from(cmsPosts)
        .where(
          and(
            eq(cmsPosts.type, PostType.PAGE),
            eq(cmsPosts.lang, input.lang),
            isNull(cmsPosts.deletedAt)
          )
        )
        .orderBy(asc(cmsPosts.title))
        .limit(500);

      // Compute depth for each page
      const parentMap = new Map(pages.map((p) => [p.id, p.parentId]));
      function getDepth(id: string, seen = new Set<string>()): number {
        if (seen.has(id)) return 0; // prevent cycles
        seen.add(id);
        const pid = parentMap.get(id);
        if (!pid) return 0;
        return 1 + getDepth(pid, seen);
      }

      return pages.map((p) => ({
        ...p,
        depth: getDepth(p.id),
      }));
    }),

  /** Public: get a published post by slug (supports preview token) */
  getBySlug: publicProcedure
    .input(
      z.object({
        slug: z.string().max(255),
        type: z.number().int().min(1),
        lang: z.string().max(2).default('en'),
        previewToken: z.string().max(64).optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      if (input.previewToken) {
        const [post] = await ctx.db
          .select()
          .from(cmsPosts)
          .where(
            and(
              eq(cmsPosts.slug, input.slug),
              eq(cmsPosts.type, input.type),
              eq(cmsPosts.lang, input.lang),
              eq(cmsPosts.previewToken, input.previewToken),
              isNull(cmsPosts.deletedAt)
            )
          )
          .limit(1);

        if (!post) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Post not found' });
        }
        const { previewToken: _pt, ...rest } = post;
        return rest;
      }

      const [post] = await ctx.db
        .select()
        .from(cmsPosts)
        .where(
          and(
            eq(cmsPosts.slug, input.slug),
            eq(cmsPosts.type, input.type),
            eq(cmsPosts.lang, input.lang),
            eq(cmsPosts.status, ContentStatus.PUBLISHED),
            isNull(cmsPosts.deletedAt)
          )
        )
        .limit(1);

      if (!post) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Post not found' });
      }
      const { previewToken: _pt, ...rest } = post;
      return rest;
    }),

  /** Public: list published posts (optional category or tag filter) */
  listPublished: publicProcedure
    .input(
      z.object({
        type: z.number().int().min(1),
        lang: z.string().max(2).default('en'),
        categoryId: z.string().uuid().optional(),
        tagId: z.string().uuid().optional(),
        page: z.number().int().min(1).default(1),
        pageSize: z.number().int().min(1).max(50).default(10),
      })
    )
    .query(async ({ ctx, input }) => {
      const offset = (input.page - 1) * input.pageSize;

      const baseConditions = and(
        eq(cmsPosts.type, input.type),
        eq(cmsPosts.lang, input.lang),
        eq(cmsPosts.status, ContentStatus.PUBLISHED),
        isNull(cmsPosts.deletedAt)
      );

      // Filter by taxonomy term (category or tag)
      const termFilter = input.categoryId
        ? { taxonomyId: 'category', termId: input.categoryId }
        : input.tagId
          ? { taxonomyId: 'tag', termId: input.tagId }
          : null;

      if (termFilter) {
        const allColumns = {
          id: cmsPosts.id,
          type: cmsPosts.type,
          status: cmsPosts.status,
          lang: cmsPosts.lang,
          slug: cmsPosts.slug,
          title: cmsPosts.title,
          content: cmsPosts.content,
          metaDescription: cmsPosts.metaDescription,
          seoTitle: cmsPosts.seoTitle,
          featuredImage: cmsPosts.featuredImage,
          featuredImageAlt: cmsPosts.featuredImageAlt,
          jsonLd: cmsPosts.jsonLd,
          noindex: cmsPosts.noindex,
          publishedAt: cmsPosts.publishedAt,
          translationGroup: cmsPosts.translationGroup,
          fallbackToDefault: cmsPosts.fallbackToDefault,
          authorId: cmsPosts.authorId,
          createdAt: cmsPosts.createdAt,
          updatedAt: cmsPosts.updatedAt,
          deletedAt: cmsPosts.deletedAt,
        };

        const joinCondition = and(
          eq(cmsPosts.id, cmsTermRelationships.objectId),
          eq(cmsTermRelationships.taxonomyId, termFilter.taxonomyId),
          eq(cmsTermRelationships.termId, termFilter.termId)
        );

        const [items, countResult] = await Promise.all([
          ctx.db
            .select(allColumns)
            .from(cmsPosts)
            .innerJoin(cmsTermRelationships, joinCondition)
            .where(baseConditions)
            .orderBy(desc(cmsPosts.publishedAt))
            .offset(offset)
            .limit(input.pageSize),
          ctx.db
            .select({ count: sql<number>`count(*)` })
            .from(cmsPosts)
            .innerJoin(cmsTermRelationships, joinCondition)
            .where(baseConditions),
        ]);

        const total = Number(countResult[0]?.count ?? 0);
        const resultsWithTags = await resolveTagsForPosts(ctx.db, items);
        return {
          results: resultsWithTags,
          total,
          page: input.page,
          pageSize: input.pageSize,
          totalPages: Math.ceil(total / input.pageSize),
        };
      }

      const [items, countResult] = await Promise.all([
        ctx.db
          .select({
            id: cmsPosts.id,
            type: cmsPosts.type,
            status: cmsPosts.status,
            lang: cmsPosts.lang,
            slug: cmsPosts.slug,
            title: cmsPosts.title,
            content: cmsPosts.content,
            metaDescription: cmsPosts.metaDescription,
            seoTitle: cmsPosts.seoTitle,
            featuredImage: cmsPosts.featuredImage,
            featuredImageAlt: cmsPosts.featuredImageAlt,
            jsonLd: cmsPosts.jsonLd,
            noindex: cmsPosts.noindex,
            publishedAt: cmsPosts.publishedAt,
            translationGroup: cmsPosts.translationGroup,
            fallbackToDefault: cmsPosts.fallbackToDefault,
            authorId: cmsPosts.authorId,
            createdAt: cmsPosts.createdAt,
            updatedAt: cmsPosts.updatedAt,
            deletedAt: cmsPosts.deletedAt,
          })
          .from(cmsPosts)
          .where(baseConditions)
          .orderBy(desc(cmsPosts.publishedAt))
          .offset(offset)
          .limit(input.pageSize),
        ctx.db
          .select({ count: sql<number>`count(*)` })
          .from(cmsPosts)
          .where(baseConditions),
      ]);

      const total = Number(countResult[0]?.count ?? 0);
      const resultsWithTags = await resolveTagsForPosts(ctx.db, items);
      return {
        results: resultsWithTags,
        total,
        page: input.page,
        pageSize: input.pageSize,
        totalPages: Math.ceil(total / input.pageSize),
      };
    }),

  /** Status of all SEO override routes × locales (exists or missing) */
  getSeoOverrideStatus: contentProcedure.query(async ({ ctx }) => {
    const existing = await ctx.db
      .select({ slug: cmsPosts.slug, lang: cmsPosts.lang })
      .from(cmsPosts)
      .where(eq(cmsPosts.type, PostType.PAGE));

    const existingKeys = new Set(existing.map((p) => `${p.lang}:${p.slug}`));

    const result: { slug: string; label: string; lang: string; exists: boolean }[] = [];
    for (const route of SEO_OVERRIDE_ROUTES) {
      for (const lang of LOCALES) {
        result.push({
          slug: route.slug,
          label: route.label,
          lang,
          exists: existingKeys.has(`${lang}:${route.slug}`),
        });
      }
    }
    return result;
  }),

  /** Create SEO override pages for selected coded routes × locales */
  createMissingSeoOverrides: contentProcedure
    .input(
      z.object({
        routes: z
          .array(
            z.object({
              slug: z.string().max(255),
              label: z.string().max(255),
              lang: z.string().max(2),
            })
          )
          .min(1)
          .max(50),
      })
    )
    .mutation(async ({ ctx, input }) => {
      let created = 0;

      for (const route of input.routes) {
        if (!SEO_OVERRIDE_SLUGS.has(route.slug)) continue;

        // Check if row exists (include soft-deleted to avoid re-creating trashed overrides)
        const [existing] = await ctx.db
          .select({ id: cmsPosts.id })
          .from(cmsPosts)
          .where(
            and(
              eq(cmsPosts.type, PostType.PAGE),
              eq(cmsPosts.slug, route.slug),
              eq(cmsPosts.lang, route.lang)
            )
          )
          .limit(1);

        if (existing) continue;

        const previewToken = crypto.randomBytes(32).toString('hex');
        await ctx.db.insert(cmsPosts).values({
          type: PostType.PAGE,
          status: ContentStatus.DRAFT,
          title: route.label,
          slug: route.slug,
          lang: route.lang,
          content: '',
          noindex: false,
          previewToken,
          authorId: ctx.session.user.id,
        });
        created++;
      }

      return { created };
    }),

  /** Public: get related posts by shared tags */
  getRelatedPosts: publicProcedure
    .input(
      z.object({
        postId: z.string().uuid(),
        lang: z.string().max(2).default('en'),
        limit: z.number().int().min(1).max(10).default(4),
      })
    )
    .query(async ({ ctx, input }) => {
      // Get this post's tag IDs
      const tagRels = await getTermRelationships(ctx.db, input.postId, 'tag');
      const tagIds = tagRels.map((r) => r.termId);

      if (tagIds.length === 0) return [];

      // Find posts sharing these tags, ordered by shared tag count
      const related = await ctx.db
        .select({
          id: cmsPosts.id,
          title: cmsPosts.title,
          slug: cmsPosts.slug,
          type: cmsPosts.type,
          metaDescription: cmsPosts.metaDescription,
          publishedAt: cmsPosts.publishedAt,
          sharedTagCount:
            sql<number>`count(${cmsTermRelationships.termId})`.as('shared_tag_count'),
        })
        .from(cmsPosts)
        .innerJoin(
          cmsTermRelationships,
          and(
            eq(cmsPosts.id, cmsTermRelationships.objectId),
            eq(cmsTermRelationships.taxonomyId, 'tag'),
            inArray(cmsTermRelationships.termId, tagIds)
          )
        )
        .where(
          and(
            ne(cmsPosts.id, input.postId),
            eq(cmsPosts.lang, input.lang),
            eq(cmsPosts.status, ContentStatus.PUBLISHED),
            isNull(cmsPosts.deletedAt)
          )
        )
        .groupBy(
          cmsPosts.id,
          cmsPosts.title,
          cmsPosts.slug,
          cmsPosts.type,
          cmsPosts.metaDescription,
          cmsPosts.publishedAt
        )
        .orderBy(desc(sql`count(${cmsTermRelationships.termId})`))
        .limit(input.limit);

      return related;
    }),

  /** Calendar events: posts + categories with publishedAt in a given month */
  calendarEvents: contentProcedure
    .input(z.object({
      month: z.number().int().min(1).max(12),
      year: z.number().int().min(2000).max(2100),
      lang: z.string().max(10).optional(),
    }))
    .query(async ({ ctx, input }) => {
      const startDate = new Date(input.year, input.month - 1, 1);
      const endDate = new Date(input.year, input.month, 0, 23, 59, 59);

      const conditions = [
        isNotNull(cmsPosts.publishedAt),
        gte(cmsPosts.publishedAt, startDate),
        lte(cmsPosts.publishedAt, endDate),
        isNull(cmsPosts.deletedAt),
      ];
      if (input.lang) conditions.push(eq(cmsPosts.lang, input.lang));

      const posts = await ctx.db
        .select({
          id: cmsPosts.id,
          title: cmsPosts.title,
          type: cmsPosts.type,
          status: cmsPosts.status,
          slug: cmsPosts.slug,
          publishedAt: cmsPosts.publishedAt,
        })
        .from(cmsPosts)
        .where(and(...conditions))
        .limit(500);

      // Also get categories
      const catConditions = [
        isNotNull(cmsCategories.publishedAt),
        gte(cmsCategories.publishedAt, startDate),
        lte(cmsCategories.publishedAt, endDate),
        isNull(cmsCategories.deletedAt),
      ];
      if (input.lang) catConditions.push(eq(cmsCategories.lang, input.lang));

      const cats = await ctx.db
        .select({
          id: cmsCategories.id,
          title: cmsCategories.name,
          status: cmsCategories.status,
          slug: cmsCategories.slug,
          publishedAt: cmsCategories.publishedAt,
        })
        .from(cmsCategories)
        .where(and(...catConditions))
        .limit(200);

      return [
        ...posts.map(p => ({ ...p, contentType: 'post' as const })),
        ...cats.map(c => ({ ...c, type: null, contentType: 'category' as const })),
      ];
    }),

  // ─── Attachments ─────────────────────────────────────────────────────────────

  /** List attachments for a post */
  listAttachments: contentProcedure
    .input(z.object({ postId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const storage = getStorage();
      const items = await ctx.db
        .select()
        .from(cmsPostAttachments)
        .where(
          and(
            eq(cmsPostAttachments.postId, input.postId),
            isNull(cmsPostAttachments.deletedAt)
          )
        )
        .orderBy(desc(cmsPostAttachments.createdAt))
        .limit(100);

      return items.map((a) => ({
        ...a,
        url: storage.url(a.filepath),
      }));
    }),

  /** Add an attachment to a post */
  addAttachment: contentProcedure
    .input(
      z.object({
        postId: z.string().uuid(),
        filepath: z.string().max(1024),
        filename: z.string().max(255),
        mimeType: z.string().max(100),
        fileSize: z.number().int().min(0),
        fileType: z.number().int().min(1).max(4),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const [attachment] = await ctx.db
        .insert(cmsPostAttachments)
        .values({
          postId: input.postId,
          filepath: input.filepath,
          filename: input.filename,
          mimeType: input.mimeType,
          fileSize: input.fileSize,
          fileType: input.fileType,
          uploadedById: ctx.session.user.id,
        })
        .returning();

      return attachment;
    }),

  /** Update attachment alt text */
  updateAttachment: contentProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        altText: z.string().max(255).nullable(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const [updated] = await ctx.db
        .update(cmsPostAttachments)
        .set({ altText: input.altText })
        .where(eq(cmsPostAttachments.id, input.id))
        .returning({ id: cmsPostAttachments.id });

      if (!updated) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Attachment not found' });
      }
      return { success: true };
    }),

  /** Soft-delete an attachment */
  deleteAttachment: contentProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const [updated] = await ctx.db
        .update(cmsPostAttachments)
        .set({ deletedAt: new Date() })
        .where(
          and(
            eq(cmsPostAttachments.id, input.id),
            isNull(cmsPostAttachments.deletedAt)
          )
        )
        .returning({ id: cmsPostAttachments.id });

      if (!updated) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Attachment not found' });
      }
      return { success: true };
    }),
});
