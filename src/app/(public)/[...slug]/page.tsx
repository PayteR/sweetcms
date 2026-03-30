import { notFound, permanentRedirect } from 'next/navigation';
import type { Metadata } from 'next';
import Link from 'next/link';
import { Rss } from 'lucide-react';

import { CONTENT_TYPES } from '@/config/cms';
import { siteConfig } from '@/config/site';
import { serverTRPC } from '@/lib/trpc/server';
import { PostType, ContentStatus } from '@/types/cms';
import { PostCard } from '@/components/public/PostCard';
import { TagCloud } from '@/components/public/TagCloud';
import { resolveSlugRedirect } from '@/server/utils/slug-redirects';
import { ShortcodeRenderer } from '@/components/public/ShortcodeRenderer';
import { db } from '@/server/db';
import { cmsPosts } from '@/server/db/schema';
import { eq, and, isNull } from 'drizzle-orm';

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

async function getAncestors(postId: string): Promise<{ title: string; slug: string }[]> {
  const ancestors: { title: string; slug: string }[] = [];
  let currentId: string | null = postId;
  const seen = new Set<string>();

  while (currentId && ancestors.length < 10) {
    if (seen.has(currentId)) break;
    seen.add(currentId);

    const [row] = await db
      .select({
        parentId: cmsPosts.parentId,
        title: cmsPosts.title,
        slug: cmsPosts.slug,
      })
      .from(cmsPosts)
      .where(
        and(
          eq(cmsPosts.id, currentId),
          eq(cmsPosts.status, ContentStatus.PUBLISHED),
          isNull(cmsPosts.deletedAt)
        )
      )
      .limit(1);

    if (!row?.parentId) break;

    const [parent] = await db
      .select({ id: cmsPosts.id, title: cmsPosts.title, slug: cmsPosts.slug })
      .from(cmsPosts)
      .where(
        and(
          eq(cmsPosts.id, row.parentId),
          eq(cmsPosts.status, ContentStatus.PUBLISHED),
          isNull(cmsPosts.deletedAt)
        )
      )
      .limit(1);

    if (!parent) break;
    ancestors.unshift({ title: parent.title, slug: parent.slug });
    currentId = parent.id;
  }

  return ancestors;
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

    // Portfolio metadata
    if (resolved.contentType.id === 'portfolio') {
      const item = await api.portfolio.getBySlug({
        slug: resolved.slug,
        lang: 'en',
      });
      return {
        title: item.seoTitle ?? `${item.title} | ${siteConfig.name}`,
        description: item.metaDescription ?? undefined,
        robots: item.noindex ? { index: false, follow: false } : undefined,
        ...(item.featuredImage
          ? {
              openGraph: {
                images: [{ url: item.featuredImage, alt: item.featuredImageAlt ?? item.title }],
              },
            }
          : {}),
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
    const api = await serverTRPC();

    // Post-backed content type
    if (resolved.contentType.postType != null) {
      const post = await api.cms.getBySlug({
        slug: resolved.slug,
        type: resolved.contentType.postType,
        lang: 'en',
        previewToken: preview,
      });

      // Fetch tags for this post
      let postTags: { id: string; name: string; slug: string }[] = [];
      try {
        postTags = await api.tags.getForObject({ objectId: post.id });
      } catch {
        // Tags are optional
      }

      // Fetch related posts (only for blog posts)
      let relatedPosts: Awaited<ReturnType<typeof api.cms.getRelatedPosts>> = [];
      if (resolved.contentType.id === 'blog') {
        try {
          relatedPosts = await api.cms.getRelatedPosts({
            postId: post.id,
            lang: 'en',
            limit: 4,
          });
        } catch {
          // Related posts are optional
        }
      }

      // Fetch ancestors for breadcrumb (pages only)
      let ancestors: { title: string; slug: string }[] = [];
      if (resolved.contentType.id === 'page' && post.parentId) {
        try {
          ancestors = await getAncestors(post.id);
        } catch {
          // Breadcrumbs are optional
        }
      }

      return (
        <article className="mx-auto max-w-3xl px-4 py-12">
          {preview && (
            <div className="mb-6 rounded-md bg-yellow-50 dark:bg-yellow-500/15 border border-yellow-200 dark:border-yellow-500/30 px-4 py-2 text-sm text-yellow-800 dark:text-yellow-300">
              Preview mode — this content is not yet published.
            </div>
          )}

          {/* Breadcrumb for hierarchical pages */}
          {ancestors.length > 0 && (
            <nav className="mb-6 text-sm text-(--text-muted)">
              {ancestors.map((a, i) => (
                <span key={a.slug}>
                  <Link href={`/${a.slug}`} className="hover:text-(--text-secondary) hover:underline">
                    {a.title}
                  </Link>
                  {i < ancestors.length && <span className="mx-1.5">/</span>}
                </span>
              ))}
              <span className="text-(--text-secondary)">{post.title}</span>
            </nav>
          )}

          {post.featuredImage && (
            <img
              src={post.featuredImage}
              alt={post.featuredImageAlt ?? post.title}
              className="mb-8 w-full rounded-lg object-cover"
              style={{ maxHeight: '400px' }}
            />
          )}

          <h1 className="text-3xl font-bold text-(--text-primary) sm:text-4xl">
            {post.title}
          </h1>

          {post.publishedAt && (
            <time className="mt-3 block text-sm text-(--text-muted)">
              {new Date(post.publishedAt).toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
              })}
            </time>
          )}

          {/* Tags */}
          {postTags.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-1.5">
              {postTags.map((tag) => (
                <Link
                  key={tag.slug}
                  href={`/tag/${tag.slug}`}
                  className="inline-block rounded-full bg-blue-50 dark:bg-blue-500/15 px-2.5 py-0.5 text-xs font-medium text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-500/20"
                >
                  {tag.name}
                </Link>
              ))}
            </div>
          )}

          <div className="prose prose-gray dark:prose-invert mt-8 max-w-none">
            <ShortcodeRenderer content={post.content} />
          </div>

          {/* Related Posts */}
          {relatedPosts.length > 0 && (
            <section className="mt-12 border-t border-(--border-secondary) pt-8">
              <h2 className="text-xl font-semibold text-(--text-primary)">
                Related Posts
              </h2>
              <div className="mt-4 space-y-4">
                {relatedPosts.map((related) => {
                  const isBlog = related.type === PostType.BLOG;
                  const relHref = isBlog
                    ? `/blog/${related.slug}`
                    : `/${related.slug}`;
                  return (
                    <PostCard
                      key={related.id}
                      title={related.title}
                      href={relHref}
                      metaDescription={related.metaDescription}
                      publishedAt={related.publishedAt}
                    />
                  );
                })}
              </div>
            </section>
          )}

          {/* JSON-LD */}
          {post.jsonLd && (
            <script
              type="application/ld+json"
              dangerouslySetInnerHTML={{
                __html: post.jsonLd.replace(/<\//g, '<\\/'),
              }}
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
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-bold text-(--text-primary) sm:text-4xl">
              Tag: {tag.name}
            </h1>
            <Link
              href={`/api/feed/tag/${tag.slug}`}
              className="rounded-full p-1.5 text-(--text-muted) transition-colors hover:bg-orange-50 dark:hover:bg-orange-500/15 hover:text-orange-500"
              title="RSS Feed"
            >
              <Rss className="h-5 w-5" />
            </Link>
          </div>

          {allResults.length > 0 ? (
            <div className="mt-10 space-y-6">
              {allResults.map((post) => {
                const isBlog = post.type === PostType.BLOG;
                const href = isBlog ? `/blog/${post.slug}` : `/${post.slug}`;
                return (
                  <PostCard
                    key={post.id}
                    title={post.title}
                    href={href}
                    metaDescription={post.metaDescription}
                    publishedAt={post.publishedAt}
                    tags={post.tags}
                  />
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
                  <span className="text-sm text-(--text-muted)">
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
            <p className="mt-6 text-(--text-muted)">No posts found with this tag.</p>
          )}

          {/* Tag Cloud */}
          <TagCloud
            sectionTitle="Browse More Tags"
            sectionClassName="mt-12 border-t border-(--border-secondary) pt-8"
          />
        </div>
      );
    }

    // Portfolio detail — shows project info + description
    if (resolved.contentType.id === 'portfolio') {
      const item = await api.portfolio.getBySlug({
        slug: resolved.slug,
        lang: 'en',
        previewToken: preview,
      });

      return (
        <article className="mx-auto max-w-3xl px-4 py-12">
          {preview && (
            <div className="mb-6 rounded-md bg-yellow-50 dark:bg-yellow-500/15 border border-yellow-200 dark:border-yellow-500/30 px-4 py-2 text-sm text-yellow-800 dark:text-yellow-300">
              Preview mode — this content is not yet published.
            </div>
          )}

          {item.featuredImage && (
            <img
              src={item.featuredImage}
              alt={item.featuredImageAlt ?? item.title}
              className="mb-8 w-full rounded-lg object-cover"
              style={{ maxHeight: '400px' }}
            />
          )}

          <h1 className="text-3xl font-bold text-(--text-primary) sm:text-4xl">
            {item.title}
          </h1>

          {/* Project metadata bar */}
          <div className="mt-4 flex flex-wrap items-center gap-4 text-sm text-(--text-muted)">
            {item.clientName && (
              <span>
                <span className="font-medium text-(--text-secondary)">{item.clientName}</span>
              </span>
            )}
            {item.completedAt && (
              <time>
                {new Date(item.completedAt).toLocaleDateString('en-US', {
                  year: 'numeric',
                  month: 'long',
                })}
              </time>
            )}
            {item.projectUrl && (
              <a
                href={item.projectUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 hover:text-blue-700 hover:underline"
              >
                Visit Project
              </a>
            )}
          </div>

          {/* Tech stack chips */}
          {item.techStack && item.techStack.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-1.5">
              {item.techStack.map((tech) => (
                <span
                  key={tech}
                  className="inline-block rounded-full bg-blue-50 dark:bg-blue-500/15 px-2.5 py-0.5 text-xs font-medium text-blue-600 dark:text-blue-400"
                >
                  {tech}
                </span>
              ))}
            </div>
          )}

          {item.text && (
            <div className="prose prose-gray dark:prose-invert mt-8 max-w-none">
              <ShortcodeRenderer content={item.text} />
            </div>
          )}
        </article>
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
          <h1 className="text-3xl font-bold text-(--text-primary) sm:text-4xl">
            {cat.title}
          </h1>

          {cat.text && (
            <div className="prose prose-gray dark:prose-invert mt-6 max-w-none">
              <ShortcodeRenderer content={cat.text} />
            </div>
          )}

          {posts.results.length > 0 && (
            <div className="mt-10">
              <h2 className="text-xl font-semibold text-(--text-primary)">
                Posts in this category
              </h2>
              <div className="mt-4 space-y-6">
                {posts.results.map((post) => (
                  <PostCard
                    key={post.id}
                    title={post.title}
                    href={`/blog/${post.slug}`}
                    metaDescription={post.metaDescription}
                    publishedAt={post.publishedAt}
                    tags={post.tags}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      );
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
