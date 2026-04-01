import Link from 'next/link';
import type { Metadata } from 'next';

import { siteConfig } from '@/config/site';
import { serverTRPC } from '@/lib/trpc/server';
import { PostType } from '@/engine/types/cms';
import { PostCard } from '@/components/public/PostCard';
import { BlogSidebar } from '@/components/public/BlogSidebar';
import { db } from '@/server/db';
import { getCodedRouteSEO } from '@/server/utils/page-seo';

export async function generateMetadata(): Promise<Metadata> {
  const seo = await getCodedRouteSEO(db, 'blog', 'en').catch(() => null);

  return {
    title: seo?.seoTitle || `Blog | ${siteConfig.name}`,
    description: seo?.metaDescription || 'Latest blog posts',
    ...(seo?.noindex && { robots: { index: false, follow: false } }),
  };
}

interface Props {
  searchParams: Promise<{ page?: string }>;
}

export default async function BlogListPage({ searchParams }: Props) {
  const params = await searchParams;
  const page = Math.max(1, parseInt(params.page ?? '1', 10) || 1);

  let data;
  try {
    const api = await serverTRPC();
    data = await api.cms.listPublished({
      type: PostType.BLOG,
      lang: 'en',
      page,
      pageSize: 10,
    });
  } catch {
    data = null;
  }

  return (
    <div className="cms-container py-12">
      <div className="grid grid-cols-1 gap-12 lg:grid-cols-[1fr_280px]">
        {/* Main column */}
        <div>
          <h1 className="text-3xl font-bold text-(--text-primary)">Blog</h1>

          {data && data.results.length > 0 ? (
            <div className="mt-8 space-y-8">
              {data.results.map((post) => (
                <PostCard
                  key={post.id}
                  title={post.title}
                  href={`/blog/${post.slug}`}
                  metaDescription={post.metaDescription}
                  publishedAt={post.publishedAt}
                  tags={post.tags}
                />
              ))}

              {/* Pagination */}
              {data.totalPages > 1 && (
                <div className="cms-pagination">
                  {page > 1 && (
                    <Link
                      href={`/blog?page=${page - 1}`}
                      className="cms-pagination-btn"
                    >
                      Previous
                    </Link>
                  )}
                  <span className="cms-pagination-info">
                    Page {page} of {data.totalPages}
                  </span>
                  {page < data.totalPages && (
                    <Link
                      href={`/blog?page=${page + 1}`}
                      className="cms-pagination-btn"
                    >
                      Next
                    </Link>
                  )}
                </div>
              )}
            </div>
          ) : (
            <p className="mt-8 text-(--text-muted)">No blog posts yet.</p>
          )}
        </div>

        {/* Sidebar — hidden on mobile */}
        <div className="hidden lg:block">
          <BlogSidebar />
        </div>
      </div>
    </div>
  );
}
