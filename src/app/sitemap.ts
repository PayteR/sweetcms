import type { MetadataRoute } from 'next';
import { and, eq, isNull, desc } from 'drizzle-orm';

import { siteConfig } from '@/config/site';
import { db } from '@/server/db';
import { cmsPosts, cmsCategories, cmsPortfolio, cmsTerms } from '@/server/db/schema';
import { ContentStatus, PostType } from '@/types/cms';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = siteConfig.url;
  const entries: MetadataRoute.Sitemap = [];

  // Static pages
  entries.push({
    url: baseUrl,
    lastModified: new Date(),
    changeFrequency: 'daily',
    priority: 1,
  });

  entries.push({
    url: `${baseUrl}/blog`,
    lastModified: new Date(),
    changeFrequency: 'daily',
    priority: 0.8,
  });

  // Published pages
  const pages = await db
    .select({
      slug: cmsPosts.slug,
      updatedAt: cmsPosts.updatedAt,
    })
    .from(cmsPosts)
    .where(
      and(
        eq(cmsPosts.type, PostType.PAGE),
        eq(cmsPosts.status, ContentStatus.PUBLISHED),
        isNull(cmsPosts.deletedAt)
      )
    )
    .orderBy(desc(cmsPosts.publishedAt))
    .limit(1000);

  for (const page of pages) {
    entries.push({
      url: `${baseUrl}/${page.slug}`,
      lastModified: page.updatedAt,
      changeFrequency: 'weekly',
      priority: 0.7,
    });
  }

  // Published blog posts
  const posts = await db
    .select({
      slug: cmsPosts.slug,
      updatedAt: cmsPosts.updatedAt,
    })
    .from(cmsPosts)
    .where(
      and(
        eq(cmsPosts.type, PostType.BLOG),
        eq(cmsPosts.status, ContentStatus.PUBLISHED),
        isNull(cmsPosts.deletedAt)
      )
    )
    .orderBy(desc(cmsPosts.publishedAt))
    .limit(1000);

  for (const post of posts) {
    entries.push({
      url: `${baseUrl}/blog/${post.slug}`,
      lastModified: post.updatedAt,
      changeFrequency: 'weekly',
      priority: 0.6,
    });
  }

  // Published categories
  const categories = await db
    .select({
      slug: cmsCategories.slug,
      updatedAt: cmsCategories.updatedAt,
    })
    .from(cmsCategories)
    .where(
      and(
        eq(cmsCategories.status, ContentStatus.PUBLISHED),
        isNull(cmsCategories.deletedAt)
      )
    )
    .orderBy(desc(cmsCategories.publishedAt))
    .limit(500);

  for (const cat of categories) {
    entries.push({
      url: `${baseUrl}/category/${cat.slug}`,
      lastModified: cat.updatedAt,
      changeFrequency: 'monthly',
      priority: 0.5,
    });
  }

  // Portfolio list page
  entries.push({
    url: `${baseUrl}/portfolio`,
    lastModified: new Date(),
    changeFrequency: 'weekly',
    priority: 0.7,
  });

  // Published portfolio items
  const portfolioItems = await db
    .select({
      slug: cmsPortfolio.slug,
      updatedAt: cmsPortfolio.updatedAt,
    })
    .from(cmsPortfolio)
    .where(
      and(
        eq(cmsPortfolio.status, ContentStatus.PUBLISHED),
        isNull(cmsPortfolio.deletedAt)
      )
    )
    .orderBy(desc(cmsPortfolio.completedAt))
    .limit(500);

  for (const item of portfolioItems) {
    entries.push({
      url: `${baseUrl}/portfolio/${item.slug}`,
      lastModified: item.updatedAt,
      changeFrequency: 'monthly',
      priority: 0.6,
    });
  }

  // Published tags
  const tags = await db
    .select({
      slug: cmsTerms.slug,
      updatedAt: cmsTerms.updatedAt,
    })
    .from(cmsTerms)
    .where(
      and(
        eq(cmsTerms.taxonomyId, 'tag'),
        eq(cmsTerms.status, ContentStatus.PUBLISHED),
        isNull(cmsTerms.deletedAt)
      )
    )
    .orderBy(desc(cmsTerms.createdAt))
    .limit(500);

  for (const tag of tags) {
    entries.push({
      url: `${baseUrl}/tag/${tag.slug}`,
      lastModified: tag.updatedAt ?? undefined,
      changeFrequency: 'monthly',
      priority: 0.4,
    });
  }

  return entries;
}
