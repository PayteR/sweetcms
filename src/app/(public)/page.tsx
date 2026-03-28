import Link from 'next/link';
import type { Metadata } from 'next';
import { ArrowRight } from 'lucide-react';

import { siteConfig } from '@/config/site';
import { serverTRPC } from '@/lib/trpc/server';
import { PostType } from '@/types/cms';

export const metadata: Metadata = {
  title: siteConfig.seo.title,
  description: siteConfig.seo.description,
};

export default async function HomePage() {
  let recentPosts: Array<{
    id: string;
    slug: string;
    title: string;
    metaDescription: string | null;
    publishedAt: Date | null;
  }> = [];

  try {
    const api = await serverTRPC();
    const data = await api.cms.listPublished({
      type: PostType.BLOG,
      lang: 'en',
      page: 1,
      pageSize: 3,
    });
    recentPosts = data.results;
  } catch {
    // DB may not be initialized yet
  }

  return (
    <div className="flex flex-col">
      {/* Hero */}
      <section className="bg-white">
        <div className="mx-auto max-w-5xl px-4 py-20 text-center">
          <h1 className="text-4xl font-bold tracking-tight text-gray-900 sm:text-5xl">
            {siteConfig.name}
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-lg text-gray-600">
            {siteConfig.description}
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-4">
            <Link
              href="/blog"
              className="rounded-lg bg-blue-600 px-6 py-3 text-sm font-medium text-white shadow-sm hover:bg-blue-700"
            >
              Read the Blog
            </Link>
            <Link
              href="/dashboard"
              className="rounded-lg border border-gray-300 bg-white px-6 py-3 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50"
            >
              Admin Dashboard
            </Link>
          </div>
        </div>
      </section>

      {/* Recent posts */}
      {recentPosts.length > 0 && (
        <section className="border-t border-gray-100 bg-gray-50">
          <div className="mx-auto max-w-5xl px-4 py-16">
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-bold text-gray-900">Recent Posts</h2>
              <Link
                href="/blog"
                className="flex items-center gap-1 text-sm font-medium text-blue-600 hover:text-blue-500"
              >
                View all
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
            <div className="mt-8 grid grid-cols-1 gap-6 sm:grid-cols-3">
              {recentPosts.map((post) => (
                <Link
                  key={post.id}
                  href={`/blog/${post.slug}`}
                  className="group rounded-lg border border-gray-200 bg-white p-6 shadow-sm transition-shadow hover:shadow-md"
                >
                  <h3 className="text-lg font-semibold text-gray-900 group-hover:text-blue-600">
                    {post.title}
                  </h3>
                  {post.metaDescription && (
                    <p className="mt-2 text-sm text-gray-600 line-clamp-2">
                      {post.metaDescription}
                    </p>
                  )}
                  {post.publishedAt && (
                    <time className="mt-3 block text-xs text-gray-400">
                      {new Date(post.publishedAt).toLocaleDateString('en-US', {
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric',
                      })}
                    </time>
                  )}
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Features */}
      <section className="border-t border-gray-100">
        <div className="mx-auto max-w-5xl px-4 py-16">
          <h2 className="text-center text-2xl font-bold text-gray-900">
            Built for the future
          </h2>
          <div className="mt-8 grid grid-cols-1 gap-8 sm:grid-cols-3">
            <div className="text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
                <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
              </div>
              <h3 className="mt-3 text-base font-semibold text-gray-900">Agent-Driven</h3>
              <p className="mt-1 text-sm text-gray-600">
                Designed for AI-assisted development with comprehensive CLAUDE.md documentation.
              </p>
            </div>
            <div className="text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-lg bg-green-50 text-green-600">
                <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </div>
              <h3 className="mt-3 text-base font-semibold text-gray-900">T3 Stack</h3>
              <p className="mt-1 text-sm text-gray-600">
                Next.js 16, tRPC, Drizzle ORM, Better Auth. Type-safe from database to UI.
              </p>
            </div>
            <div className="text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-lg bg-purple-50 text-purple-600">
                <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
              </div>
              <h3 className="mt-3 text-base font-semibold text-gray-900">Secure by Default</h3>
              <p className="mt-1 text-sm text-gray-600">
                Role-based access control, scrypt passwords, session management, and soft-delete.
              </p>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
