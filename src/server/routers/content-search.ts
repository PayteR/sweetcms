import { z } from 'zod';
import { and, eq, ilike, isNull, or } from 'drizzle-orm';

import { cmsPosts } from '@/server/db/schema/cms';
import { cmsCategories } from '@/server/db/schema/categories';
import { ContentStatus } from '@/types/cms';
import { CONTENT_TYPES } from '@/config/cms';
import { createTRPCRouter, sectionProcedure } from '../trpc';

/**
 * Content search router — search across all content types for internal linking.
 * Used by the rich text editor's link picker to find pages/posts/categories.
 */
export const contentSearchRouter = createTRPCRouter({
  /**
   * Search across all published content types.
   * Returns a unified list of { type, id, title, url } results.
   */
  search: sectionProcedure('content')
    .input(
      z.object({
        query: z.string().min(1).max(200),
        limit: z.number().int().min(1).max(50).default(20),
      })
    )
    .query(async ({ ctx, input }) => {
      const { query, limit } = input;
      const pattern = `%${query}%`;

      type SearchResult = {
        type: string;
        id: string;
        title: string;
        url: string;
      };

      const results: SearchResult[] = [];

      // Search posts (pages + blogs)
      const posts = await ctx.db
        .select({
          id: cmsPosts.id,
          type: cmsPosts.type,
          slug: cmsPosts.slug,
          title: cmsPosts.title,
        })
        .from(cmsPosts)
        .where(
          and(
            eq(cmsPosts.status, ContentStatus.PUBLISHED),
            isNull(cmsPosts.deletedAt),
            or(
              ilike(cmsPosts.title, pattern),
              ilike(cmsPosts.slug, pattern)
            )
          )
        )
        .limit(limit);

      for (const post of posts) {
        const ct = CONTENT_TYPES.find((c) => c.postType === post.type);
        if (!ct) continue;
        const url =
          ct.urlPrefix === '/'
            ? `/${post.slug}`
            : `${ct.urlPrefix}${post.slug}`;
        results.push({
          type: ct.id,
          id: post.id,
          title: post.title,
          url,
        });
      }

      // Search categories
      const categories = await ctx.db
        .select({
          id: cmsCategories.id,
          slug: cmsCategories.slug,
          name: cmsCategories.name,
        })
        .from(cmsCategories)
        .where(
          and(
            eq(cmsCategories.status, ContentStatus.PUBLISHED),
            isNull(cmsCategories.deletedAt),
            or(
              ilike(cmsCategories.name, pattern),
              ilike(cmsCategories.slug, pattern)
            )
          )
        )
        .limit(limit);

      for (const cat of categories) {
        results.push({
          type: 'category',
          id: cat.id,
          title: cat.name,
          url: `/category/${cat.slug}`,
        });
      }

      // Sort by relevance (exact title match first, then alphabetical)
      const lowerQuery = query.toLowerCase();
      results.sort((a, b) => {
        const aExact = a.title.toLowerCase() === lowerQuery ? 0 : 1;
        const bExact = b.title.toLowerCase() === lowerQuery ? 0 : 1;
        if (aExact !== bExact) return aExact - bExact;
        return a.title.localeCompare(b.title);
      });

      return results.slice(0, limit);
    }),
});
