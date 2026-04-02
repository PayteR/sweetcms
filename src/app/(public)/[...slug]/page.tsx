import { notFound, permanentRedirect } from 'next/navigation';
import type { Metadata } from 'next';

import { CONTENT_TYPES } from '@/config/cms';
import { siteConfig } from '@/config/site';
import { getLocale } from '@/lib/locale-server';
import { resolveSlugRedirect } from '@/engine/crud/slug-redirects';
import { resolveSlug, buildAlternates } from './resolve';
import {
  getPostTranslationSiblings,
  getCategoryTranslationSiblings,
  getPortfolioTranslationSiblings,
} from './queries';
import {
  getCachedPost,
  getCachedTag,
  getCachedPortfolio,
  getCachedCategory,
} from './data';
import { PostDetail } from './renderers/PostDetail';
import { TagDetail } from './renderers/TagDetail';
import { PortfolioDetail } from './renderers/PortfolioDetail';
import { CategoryDetail } from './renderers/CategoryDetail';

interface Props {
  params: Promise<{ slug: string[] }>;
  searchParams: Promise<{ preview?: string; page?: string }>;
}

// ── Metadata ──
// Uses React.cache()-wrapped fetchers from data.ts so the same DB row
// is shared with the renderer below — no double query per request.

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const resolved = resolveSlug(slug);
  if (!resolved) return {};

  const locale = await getLocale();
  const baseUrl = siteConfig.url;

  try {
    // Post-backed content types (page, blog)
    if (resolved.contentType.postType != null) {
      const post = await getCachedPost(
        resolved.slug, resolved.contentType.postType, locale
      );

      const siblings = await getPostTranslationSiblings(post.id);
      const languages = buildAlternates(
        baseUrl, siblings, locale, resolved.slug, resolved.contentType.urlPrefix
      );

      const metadata: Metadata = {
        title: post.seoTitle ?? `${post.title} | ${siteConfig.name}`,
        description: post.metaDescription ?? undefined,
        robots: post.noindex ? { index: false, follow: false } : undefined,
        ...(languages && { alternates: { languages } }),
      };

      if (post.featuredImage) {
        metadata.openGraph = {
          images: [{ url: post.featuredImage, alt: post.featuredImageAlt ?? post.title }],
        };
      }

      return metadata;
    }

    // Tag
    if (resolved.contentType.id === 'tag') {
      const tag = await getCachedTag(resolved.slug, locale);
      return {
        title: `${tag.name} | ${siteConfig.name}`,
        description: `Browse all posts tagged with "${tag.name}".`,
      };
    }

    // Portfolio
    if (resolved.contentType.id === 'portfolio') {
      const item = await getCachedPortfolio(resolved.slug, locale);
      const siblings = await getPortfolioTranslationSiblings(item.id);
      const languages = buildAlternates(
        baseUrl, siblings, locale, resolved.slug, '/portfolio/'
      );
      return {
        title: item.seoTitle ?? `${item.title} | ${siteConfig.name}`,
        description: item.metaDescription ?? undefined,
        robots: item.noindex ? { index: false, follow: false } : undefined,
        ...(languages && { alternates: { languages } }),
        ...(item.featuredImage && {
          openGraph: {
            images: [{ url: item.featuredImage, alt: item.featuredImageAlt ?? item.title }],
          },
        }),
      };
    }

    // Category
    if (resolved.contentType.id === 'category') {
      const cat = await getCachedCategory(resolved.slug, locale);
      const siblings = await getCategoryTranslationSiblings(cat.id);
      const languages = buildAlternates(
        baseUrl, siblings, locale, resolved.slug, '/category/'
      );
      return {
        title: cat.seoTitle ?? `${cat.title} | ${siteConfig.name}`,
        description: cat.metaDescription ?? undefined,
        robots: cat.noindex ? { index: false, follow: false } : undefined,
        ...(languages && { alternates: { languages } }),
      };
    }
  } catch {
    return {};
  }

  return {};
}

// ── Page Component ──

export default async function CatchAllPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const { preview, page: pageParam } = await searchParams;
  const currentPage = Math.max(1, parseInt(pageParam ?? '1', 10) || 1);
  const resolved = resolveSlug(slug);

  if (!resolved) {
    // Try slug redirect before 404-ing
    for (const ct of CONTENT_TYPES) {
      const slugStr = slug.length === 2 && ct.listSegment === slug[0]
        ? slug[1]!
        : slug.length === 1 && ct.urlPrefix === '/'
          ? slug[0]!
          : null;
      if (!slugStr) continue;
      const redirectPath = await resolveSlugRedirect(slugStr, ct.urlPrefix);
      if (redirectPath) permanentRedirect(redirectPath);
    }
    notFound();
  }

  try {
    // Post-backed content types (page, blog)
    if (resolved.contentType.postType != null) {
      return (
        <PostDetail
          slug={resolved.slug}
          postType={resolved.contentType.postType}
          preview={preview}
        />
      );
    }

    // Tag detail
    if (resolved.contentType.id === 'tag') {
      return <TagDetail slug={resolved.slug} currentPage={currentPage} />;
    }

    // Portfolio detail
    if (resolved.contentType.id === 'portfolio') {
      return <PortfolioDetail slug={resolved.slug} preview={preview} />;
    }

    // Category detail
    if (resolved.contentType.id === 'category') {
      return <CategoryDetail slug={resolved.slug} />;
    }

    notFound();
  } catch {
    // Try slug redirect before 404-ing
    const redirectPath = await resolveSlugRedirect(
      resolved.slug,
      resolved.contentType.urlPrefix
    );
    if (redirectPath) permanentRedirect(redirectPath);
    notFound();
  }
}
