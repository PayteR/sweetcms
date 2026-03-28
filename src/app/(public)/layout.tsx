import Link from 'next/link';

import { siteConfig } from '@/config/site';
import { db } from '@/server/db';
import { cmsCategories } from '@/server/db/schema';
import { ContentStatus } from '@/types/cms';
import { and, eq, isNull } from 'drizzle-orm';

async function getPublishedCategories() {
  try {
    return await db
      .select({ name: cmsCategories.name, slug: cmsCategories.slug })
      .from(cmsCategories)
      .where(
        and(
          eq(cmsCategories.status, ContentStatus.PUBLISHED),
          eq(cmsCategories.lang, 'en'),
          isNull(cmsCategories.deletedAt)
        )
      )
      .orderBy(cmsCategories.order)
      .limit(10);
  } catch {
    return [];
  }
}

export default async function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const categories = await getPublishedCategories();

  return (
    <>
      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4">
          <Link href="/" className="text-lg font-bold text-gray-900">
            {siteConfig.name}
          </Link>
          <nav className="flex items-center gap-6 text-sm">
            <Link href="/blog" className="text-gray-600 hover:text-gray-900">
              Blog
            </Link>
            {categories.map((cat) => (
              <Link
                key={cat.slug}
                href={`/category/${cat.slug}`}
                className="hidden text-gray-600 hover:text-gray-900 sm:block"
              >
                {cat.name}
              </Link>
            ))}
            <Link
              href="/dashboard"
              className="rounded-md bg-gray-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-gray-800"
            >
              Admin
            </Link>
          </nav>
        </div>
      </header>
      <main className="flex-1">{children}</main>
      <footer className="border-t border-gray-200 bg-gray-50">
        <div className="mx-auto max-w-5xl px-4 py-8">
          <div className="flex flex-col items-center gap-4 sm:flex-row sm:justify-between">
            <div>
              <p className="text-sm font-medium text-gray-900">{siteConfig.name}</p>
              <p className="mt-0.5 text-xs text-gray-500">{siteConfig.description}</p>
            </div>
            <nav className="flex gap-4 text-xs text-gray-400">
              <Link href="/blog" className="hover:text-gray-600">Blog</Link>
              <Link href="/about" className="hover:text-gray-600">About</Link>
              <Link href="/privacy-policy" className="hover:text-gray-600">Privacy</Link>
            </nav>
          </div>
          <p className="mt-6 text-center text-xs text-gray-400">
            Powered by SweetCMS &middot; MIT License
          </p>
        </div>
      </footer>
    </>
  );
}
