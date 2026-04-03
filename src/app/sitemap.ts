import type { MetadataRoute } from 'next';
import { and, desc, eq, isNull } from 'drizzle-orm';

import { siteConfig } from '@/config/site';
import { CONTENT_TYPES } from '@/config/cms';
import { LOCALES, DEFAULT_LOCALE } from '@/lib/constants';
import type { Locale } from '@/lib/constants';
import { PostType, ContentStatus } from '@/engine/types/cms';
import { db } from '@/server/db';
import { cmsPosts, cmsCategories, cmsPortfolio, cmsTerms } from '@/server/db/schema';

export const dynamic = 'force-dynamic';

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

type SitemapEntry = { slug: string; updatedAt: Date | null | undefined };
type SitemapFetcher = (locale: string) => Promise<SitemapEntry[]>;

interface SitemapContentConfig {
  contentTypeId: string;
  priority: number;
  changeFrequency: 'always' | 'hourly' | 'daily' | 'weekly' | 'monthly' | 'yearly' | 'never';
  fetchEntries: SitemapFetcher;
}

/**
 * Sitemap fetcher registry — maps content type IDs to their DB queries.
 * Adding a new content type only requires adding an entry here.
 */
const SITEMAP_FETCHERS: SitemapContentConfig[] = [
  {
    contentTypeId: 'page',
    priority: 0.7,
    changeFrequency: 'weekly',
    fetchEntries: (locale) =>
      db
        .select({ slug: cmsPosts.slug, updatedAt: cmsPosts.updatedAt })
        .from(cmsPosts)
        .where(and(eq(cmsPosts.type, PostType.PAGE), eq(cmsPosts.status, ContentStatus.PUBLISHED), eq(cmsPosts.lang, locale), isNull(cmsPosts.deletedAt)))
        .orderBy(desc(cmsPosts.publishedAt))
        .limit(1000),
  },
  {
    contentTypeId: 'blog',
    priority: 0.6,
    changeFrequency: 'weekly',
    fetchEntries: (locale) =>
      db
        .select({ slug: cmsPosts.slug, updatedAt: cmsPosts.updatedAt })
        .from(cmsPosts)
        .where(and(eq(cmsPosts.type, PostType.BLOG), eq(cmsPosts.status, ContentStatus.PUBLISHED), eq(cmsPosts.lang, locale), isNull(cmsPosts.deletedAt)))
        .orderBy(desc(cmsPosts.publishedAt))
        .limit(1000),
  },
  {
    contentTypeId: 'category',
    priority: 0.5,
    changeFrequency: 'monthly',
    fetchEntries: (locale) =>
      db
        .select({ slug: cmsCategories.slug, updatedAt: cmsCategories.updatedAt })
        .from(cmsCategories)
        .where(and(eq(cmsCategories.status, ContentStatus.PUBLISHED), eq(cmsCategories.lang, locale), isNull(cmsCategories.deletedAt)))
        .orderBy(desc(cmsCategories.publishedAt))
        .limit(500),
  },
  {
    contentTypeId: 'tag',
    priority: 0.4,
    changeFrequency: 'monthly',
    fetchEntries: (locale) =>
      db
        .select({ slug: cmsTerms.slug, updatedAt: cmsTerms.updatedAt })
        .from(cmsTerms)
        .where(and(eq(cmsTerms.taxonomyId, 'tag'), eq(cmsTerms.status, ContentStatus.PUBLISHED), eq(cmsTerms.lang, locale), isNull(cmsTerms.deletedAt)))
        .orderBy(desc(cmsTerms.createdAt))
        .limit(500),
  },
  {
    contentTypeId: 'portfolio',
    priority: 0.6,
    changeFrequency: 'monthly',
    fetchEntries: (locale) =>
      db
        .select({ slug: cmsPortfolio.slug, updatedAt: cmsPortfolio.updatedAt })
        .from(cmsPortfolio)
        .where(and(eq(cmsPortfolio.status, ContentStatus.PUBLISHED), eq(cmsPortfolio.lang, locale), isNull(cmsPortfolio.deletedAt)))
        .orderBy(desc(cmsPortfolio.completedAt))
        .limit(500),
  },
];

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

  // Dynamic content — driven by fetcher registry
  for (const config of SITEMAP_FETCHERS) {
    const ct = CONTENT_TYPES.find((c) => c.id === config.contentTypeId);
    if (!ct) continue;

    for (const locale of LOCALES) {
      const dbEntries = await config.fetchEntries(locale);

      for (const entry of dbEntries) {
        const path = ct.urlPrefix === '/' ? `/${entry.slug}` : `${ct.urlPrefix}${entry.slug}`;

        entries.push({
          url: localeUrl(path, locale),
          lastModified: entry.updatedAt ?? undefined,
          changeFrequency: config.changeFrequency,
          priority: config.priority,
          alternates: { languages: buildAlternates(path) },
        });
      }
    }
  }

  return entries;
}
