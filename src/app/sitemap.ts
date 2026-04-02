import type { MetadataRoute } from 'next';
import { and, eq, isNull, desc } from 'drizzle-orm';

import { siteConfig } from '@/config/site';
import { db } from '@/server/db';
import { cmsPosts, cmsCategories, cmsPortfolio, cmsTerms } from '@/server/db/schema';
import { ContentStatus, PostType } from '@/engine/types/cms';
import { LOCALES, DEFAULT_LOCALE } from '@/lib/constants';
import type { Locale } from '@/lib/constants';

/** Build absolute URL with optional locale prefix */
function localeUrl(path: string, locale: Locale): string {
  if (locale === DEFAULT_LOCALE) return `${siteConfig.url}${path}`;
  return `${siteConfig.url}/${locale}${path}`;
}

/** Build hreflang alternates map for a given path across all locales */
function buildAlternates(path: string): Record<string, string> {
  const languages: Record<string, string> = {};
  for (const locale of LOCALES) {
    languages[locale] = localeUrl(path, locale);
  }
  return languages;
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const entries: MetadataRoute.Sitemap = [];

  // Static pages — per locale
  for (const locale of LOCALES) {
    entries.push({
      url: localeUrl('/', locale),
      lastModified: new Date(),
      changeFrequency: 'daily',
      priority: locale === DEFAULT_LOCALE ? 1 : 0.9,
      alternates: { languages: buildAlternates('/') },
    });

    entries.push({
      url: localeUrl('/blog', locale),
      lastModified: new Date(),
      changeFrequency: 'daily',
      priority: locale === DEFAULT_LOCALE ? 0.8 : 0.7,
      alternates: { languages: buildAlternates('/blog') },
    });

    entries.push({
      url: localeUrl('/portfolio', locale),
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: locale === DEFAULT_LOCALE ? 0.7 : 0.6,
      alternates: { languages: buildAlternates('/portfolio') },
    });

    entries.push({
      url: localeUrl('/pricing', locale),
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: locale === DEFAULT_LOCALE ? 0.8 : 0.7,
      alternates: { languages: buildAlternates('/pricing') },
    });
  }

  // Published pages — per locale
  for (const locale of LOCALES) {
    const pages = await db
      .select({ slug: cmsPosts.slug, updatedAt: cmsPosts.updatedAt })
      .from(cmsPosts)
      .where(
        and(
          eq(cmsPosts.type, PostType.PAGE),
          eq(cmsPosts.status, ContentStatus.PUBLISHED),
          eq(cmsPosts.lang, locale),
          isNull(cmsPosts.deletedAt)
        )
      )
      .orderBy(desc(cmsPosts.publishedAt))
      .limit(1000);

    for (const page of pages) {
      const path = `/${page.slug}`;
      entries.push({
        url: localeUrl(path, locale),
        lastModified: page.updatedAt,
        changeFrequency: 'weekly',
        priority: 0.7,
        alternates: { languages: buildAlternates(path) },
      });
    }
  }

  // Published blog posts — per locale
  for (const locale of LOCALES) {
    const posts = await db
      .select({ slug: cmsPosts.slug, updatedAt: cmsPosts.updatedAt })
      .from(cmsPosts)
      .where(
        and(
          eq(cmsPosts.type, PostType.BLOG),
          eq(cmsPosts.status, ContentStatus.PUBLISHED),
          eq(cmsPosts.lang, locale),
          isNull(cmsPosts.deletedAt)
        )
      )
      .orderBy(desc(cmsPosts.publishedAt))
      .limit(1000);

    for (const post of posts) {
      const path = `/blog/${post.slug}`;
      entries.push({
        url: localeUrl(path, locale),
        lastModified: post.updatedAt,
        changeFrequency: 'weekly',
        priority: 0.6,
        alternates: { languages: buildAlternates(path) },
      });
    }
  }

  // Published categories — per locale
  for (const locale of LOCALES) {
    const categories = await db
      .select({ slug: cmsCategories.slug, updatedAt: cmsCategories.updatedAt })
      .from(cmsCategories)
      .where(
        and(
          eq(cmsCategories.status, ContentStatus.PUBLISHED),
          eq(cmsCategories.lang, locale),
          isNull(cmsCategories.deletedAt)
        )
      )
      .orderBy(desc(cmsCategories.publishedAt))
      .limit(500);

    for (const cat of categories) {
      const path = `/category/${cat.slug}`;
      entries.push({
        url: localeUrl(path, locale),
        lastModified: cat.updatedAt,
        changeFrequency: 'monthly',
        priority: 0.5,
        alternates: { languages: buildAlternates(path) },
      });
    }
  }

  // Published portfolio items — per locale
  for (const locale of LOCALES) {
    const portfolioItems = await db
      .select({ slug: cmsPortfolio.slug, updatedAt: cmsPortfolio.updatedAt })
      .from(cmsPortfolio)
      .where(
        and(
          eq(cmsPortfolio.status, ContentStatus.PUBLISHED),
          eq(cmsPortfolio.lang, locale),
          isNull(cmsPortfolio.deletedAt)
        )
      )
      .orderBy(desc(cmsPortfolio.completedAt))
      .limit(500);

    for (const item of portfolioItems) {
      const path = `/portfolio/${item.slug}`;
      entries.push({
        url: localeUrl(path, locale),
        lastModified: item.updatedAt,
        changeFrequency: 'monthly',
        priority: 0.6,
        alternates: { languages: buildAlternates(path) },
      });
    }
  }

  // Published tags — per locale
  for (const locale of LOCALES) {
    const tags = await db
      .select({ slug: cmsTerms.slug, updatedAt: cmsTerms.updatedAt })
      .from(cmsTerms)
      .where(
        and(
          eq(cmsTerms.taxonomyId, 'tag'),
          eq(cmsTerms.status, ContentStatus.PUBLISHED),
          eq(cmsTerms.lang, locale),
          isNull(cmsTerms.deletedAt)
        )
      )
      .orderBy(desc(cmsTerms.createdAt))
      .limit(500);

    for (const tag of tags) {
      const path = `/tag/${tag.slug}`;
      entries.push({
        url: localeUrl(path, locale),
        lastModified: tag.updatedAt ?? undefined,
        changeFrequency: 'monthly',
        priority: 0.4,
        alternates: { languages: buildAlternates(path) },
      });
    }
  }

  return entries;
}
