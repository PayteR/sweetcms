import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import Link from 'next/link';

import { CONTENT_TYPES } from '@/config/cms';
import { siteConfig } from '@/config/site';
import { serverTRPC } from '@/lib/trpc/server';
import { PostType, ContentStatus } from '@/types/cms';

interface Props {
  params: Promise<{ slug: string[] }>;
  searchParams: Promise<{ preview?: string; page?: string }>;
}

/**
 * Catch-all CMS route — resolves slugs to content types.
 *
 * URL patterns:
 *   /privacy-policy      → page with slug "privacy-policy"
 *   /blog/my-post        → blog post with slug "my-post"
 *   /category/tech       → category with slug "tech"
 */

function resolveSlug(segments: string[]): {
  contentType: (typeof CONTENT_TYPES)[number];
  slug: string;
} | null {
  if (segments.length === 0) return null;

  // Check if first segment matches a content type's listSegment
  for (const ct of CONTENT_TYPES) {
    if (ct.urlPrefix !== '/' && segments[0] === ct.listSegment) {
      if (segments.length === 2) {
        return { contentType: ct, slug: segments[1]! };
      }
      return null;
    }
  }

  // Root-level: try page content type
  const pageCt = CONTENT_TYPES.find((ct) => ct.id === 'page');
  if (pageCt && segments.length === 1) {
    return { contentType: pageCt, slug: segments[0]! };
  }

  return null;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const resolved = resolveSlug(slug);
  if (!resolved) return {};

  try {
    const api = await serverTRPC();
    if (resolved.contentType.postType != null) {
      const post = await api.cms.getBySlug({
        slug: resolved.slug,
        type: resolved.contentType.postType,
        lang: 'en',
      });

      const metadata: Metadata = {
        title: post.seoTitle ?? `${post.title} | ${siteConfig.name}`,
        description: post.metaDescription ?? undefined,
        robots: post.noindex ? { index: false, follow: false } : undefined,
      };

      if (post.featuredImage) {
        metadata.openGraph = {
          images: [{ url: post.featuredImage, alt: post.featuredImageAlt ?? post.title }],
        };
      }

      return metadata;
    }

    // Tag metadata
    if (resolved.contentType.id === 'tag') {
      const tag = await api.tags.getBySlug({
        slug: resolved.slug,
        lang: 'en',
      });
      return {
        title: `${tag.name} | ${siteConfig.name}`,
        description: `Browse all posts tagged with "${tag.name}".`,
      };
    }

    // Category metadata
    if (resolved.contentType.id === 'category') {
      const cat = await api.categories.getBySlug({
        slug: resolved.slug,
        lang: 'en',
      });
      return {
        title: cat.seoTitle ?? `${cat.title} | ${siteConfig.name}`,
        description: cat.metaDescription ?? undefined,
        robots: cat.noindex ? { index: false, follow: false } : undefined,
      };
    }
  } catch {
    return {};
  }

  return {};
}

export default async function CatchAllPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const { preview, page: pageParam } = await searchParams;
  const currentPage = Math.max(1, parseInt(pageParam ?? '1', 10) || 1);
  const resolved = resolveSlug(slug);

  if (!resolved) {
    notFound();
  }

  try {
    const api = await serverTRPC();

    // Post-backed content type
    if (resolved.contentType.postType != null) {
      const post = await api.cms.getBySlug({
        slug: resolved.slug,
        type: resolved.contentType.postType,
        lang: 'en',
        previewToken: preview,
      });

      return (
        <article className="mx-auto max-w-3xl px-4 py-12">
          {preview && (
            <div className="mb-6 rounded-md bg-yellow-50 border border-yellow-200 px-4 py-2 text-sm text-yellow-800">
              Preview mode — this content is not yet published.
            </div>
          )}

          {post.featuredImage && (
            <img
              src={post.featuredImage}
              alt={post.featuredImageAlt ?? post.title}
              className="mb-8 w-full rounded-lg object-cover"
              style={{ maxHeight: '400px' }}
            />
          )}

          <h1 className="text-3xl font-bold text-gray-900 sm:text-4xl">
            {post.title}
          </h1>

          {post.publishedAt && (
            <time className="mt-3 block text-sm text-gray-500">
              {new Date(post.publishedAt).toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
              })}
            </time>
          )}

          <div
            className="prose prose-gray mt-8 max-w-none"
            dangerouslySetInnerHTML={{ __html: post.content }}
          />

          {/* JSON-LD */}
          {post.jsonLd && (
            <script
              type="application/ld+json"
              dangerouslySetInnerHTML={{ __html: post.jsonLd }}
            />
          )}
        </article>
      );
    }

    // Tag detail — shows tag name + posts with this tag
    if (resolved.contentType.id === 'tag') {
      const tag = await api.tags.getBySlug({
        slug: resolved.slug,
        lang: 'en',
      });

      // Fetch blog posts and pages with this tag in parallel
      const [blogPosts, pagePosts] = await Promise.all([
        api.cms.listPublished({
          type: PostType.BLOG,
          lang: 'en',
          tagId: tag.id,
          page: currentPage,
          pageSize: 20,
        }),
        api.cms.listPublished({
          type: PostType.PAGE,
          lang: 'en',
          tagId: tag.id,
          pageSize: 50,
        }),
      ]);

      // Merge: blog posts paginated, pages appended (usually few)
      const allResults = [...blogPosts.results, ...pagePosts.results];
      const totalPages = blogPosts.totalPages;
      const basePath = `/tag/${resolved.slug}`;

      return (
        <div className="mx-auto max-w-3xl px-4 py-12">
          <h1 className="text-3xl font-bold text-gray-900 sm:text-4xl">
            Tag: {tag.name}
          </h1>

          {allResults.length > 0 ? (
            <div className="mt-10 space-y-6">
              {allResults.map((post) => {
                const isBlog = post.type === PostType.BLOG;
                const href = isBlog ? `/blog/${post.slug}` : `/${post.slug}`;
                return (
                  <article key={post.id} className="border-b border-gray-100 pb-4">
                    <Link
                      href={href}
                      className="text-lg font-semibold text-gray-900 hover:text-blue-600"
                    >
                      {post.title}
                    </Link>
                    {post.metaDescription && (
                      <p className="mt-1 text-sm text-gray-600">
                        {post.metaDescription}
                      </p>
                    )}
                    {post.publishedAt && (
                      <time className="mt-1 block text-xs text-gray-400">
                        {new Date(post.publishedAt).toLocaleDateString('en-US', {
                          year: 'numeric',
                          month: 'long',
                          day: 'numeric',
                        })}
                      </time>
                    )}
                  </article>
                );
              })}

              {/* Pagination */}
              {totalPages > 1 && (
                <nav className="flex items-center justify-between pt-4">
                  {currentPage > 1 ? (
                    <Link
                      href={`${basePath}?page=${currentPage - 1}`}
                      className="text-sm font-medium text-blue-600 hover:text-blue-700"
                    >
                      &larr; Previous
                    </Link>
                  ) : (
                    <span />
                  )}
                  <span className="text-sm text-gray-500">
                    Page {currentPage} of {totalPages}
                  </span>
                  {currentPage < totalPages ? (
                    <Link
                      href={`${basePath}?page=${currentPage + 1}`}
                      className="text-sm font-medium text-blue-600 hover:text-blue-700"
                    >
                      Next &rarr;
                    </Link>
                  ) : (
                    <span />
                  )}
                </nav>
              )}
            </div>
          ) : (
            <p className="mt-6 text-gray-500">No posts found with this tag.</p>
          )}
        </div>
      );
    }

    // Category detail — shows description + posts in this category
    if (resolved.contentType.id === 'category') {
      const cat = await api.categories.getBySlug({
        slug: resolved.slug,
        lang: 'en',
      });

      // Fetch blog posts in this category
      const posts = await api.cms.listPublished({
        type: PostType.BLOG,
        lang: 'en',
        categoryId: cat.id,
        pageSize: 20,
      });

      return (
        <div className="mx-auto max-w-3xl px-4 py-12">
          <h1 className="text-3xl font-bold text-gray-900 sm:text-4xl">
            {cat.title}
          </h1>

          {cat.text && (
            <div
              className="prose prose-gray mt-6 max-w-none"
              dangerouslySetInnerHTML={{ __html: cat.text }}
            />
          )}

          {posts.results.length > 0 && (
            <div className="mt-10">
              <h2 className="text-xl font-semibold text-gray-900">
                Posts in this category
              </h2>
              <div className="mt-4 space-y-6">
                {posts.results.map((post) => (
                  <article key={post.id} className="border-b border-gray-100 pb-4">
                    <Link
                      href={`/blog/${post.slug}`}
                      className="text-lg font-semibold text-gray-900 hover:text-blue-600"
                    >
                      {post.title}
                    </Link>
                    {post.metaDescription && (
                      <p className="mt-1 text-sm text-gray-600">
                        {post.metaDescription}
                      </p>
                    )}
                    {post.publishedAt && (
                      <time className="mt-1 block text-xs text-gray-400">
                        {new Date(post.publishedAt).toLocaleDateString('en-US', {
                          year: 'numeric',
                          month: 'long',
                          day: 'numeric',
                        })}
                      </time>
                    )}
                  </article>
                ))}
              </div>
            </div>
          )}
        </div>
      );
    }

    notFound();
  } catch {
    notFound();
  }
}
