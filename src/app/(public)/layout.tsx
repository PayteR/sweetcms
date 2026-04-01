import Link from 'next/link';
import { Rss, Search } from 'lucide-react';

import { siteConfig } from '@/config/site';
import { db } from '@/server/db';
import { cmsCategories, cmsMenus, cmsMenuItems } from '@/server/db/schema';
import { ContentStatus } from '@/engine/types/cms';
import { and, asc, eq, isNull } from 'drizzle-orm';
import { DynamicNav } from '@/components/public/DynamicNav';
import { ThemeToggle } from '@/components/public/ThemeToggle';
import { MobileMenu } from '@/components/public/MobileMenu';

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
      .limit(8);
  } catch {
    return [];
  }
}

/** Build serialized nav items for mobile menu — tries DB menu first, falls back to categories */
async function getMobileNavItems(
  categories: { name: string; slug: string }[]
) {
  try {
    const [menu] = await db
      .select()
      .from(cmsMenus)
      .where(eq(cmsMenus.slug, 'main'))
      .limit(1);

    if (menu) {
      const items = await db
        .select({ label: cmsMenuItems.label, url: cmsMenuItems.url })
        .from(cmsMenuItems)
        .where(eq(cmsMenuItems.menuId, menu.id))
        .orderBy(asc(cmsMenuItems.order))
        .limit(20);

      if (items.length > 0) {
        return items.map((i) => ({ label: i.label, url: i.url ?? '/' }));
      }
    }
  } catch {
    // fall through
  }

  // Fallback: Blog + categories
  return [
    { label: 'Blog', url: '/blog' },
    ...categories.map((c) => ({ label: c.name, url: `/category/${c.slug}` })),
    { label: 'Portfolio', url: '/portfolio' },
    { label: 'Search', url: '/search' },
  ];
}

export default async function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const categories = await getPublishedCategories();
  const mobileItems = await getMobileNavItems(categories);

  return (
    <>
      <link
        rel="alternate"
        type="application/rss+xml"
        title={`${siteConfig.name} — Blog RSS`}
        href="/api/feed/blog"
      />

      {/* ═══ Header ═══ */}
      <header className="cms-header">
        <div className="cms-header-inner">
          <Link href="/" className="cms-header-logo">
            {siteConfig.name}
          </Link>

          {/* Desktop nav */}
          <div className="cms-header-nav hidden sm:flex">
            <DynamicNav
              menuSlug="main"
              fallback={
                <>
                  <Link href="/blog" className="cms-header-link">
                    Blog
                  </Link>
                  {categories.map((cat) => (
                    <Link
                      key={cat.slug}
                      href={`/category/${cat.slug}`}
                      className="cms-header-link"
                    >
                      {cat.name}
                    </Link>
                  ))}
                </>
              }
            />
          </div>

          {/* Actions */}
          <div className="cms-header-actions">
            <Link href="/search" className="cms-header-icon-btn" title="Search">
              <Search className="h-4 w-4" />
            </Link>
            <ThemeToggle />
            <MobileMenu items={mobileItems} />
          </div>
        </div>
      </header>

      <main className="flex-1">{children}</main>

      {/* ═══ Footer ═══ */}
      <footer className="cms-footer">
        <div className="cms-container py-8">
          <div className="cms-footer-grid">
            {/* Col 1: About */}
            <div>
              <p className="text-sm font-semibold text-(--text-primary)">
                {siteConfig.name}
              </p>
              <p className="mt-2 text-sm text-(--text-muted)">
                {siteConfig.description}
              </p>
            </div>

            {/* Col 2: Categories */}
            {categories.length > 0 && (
              <div>
                <h4 className="cms-footer-col-title">Categories</h4>
                {categories.map((cat) => (
                  <Link
                    key={cat.slug}
                    href={`/category/${cat.slug}`}
                    className="cms-footer-link"
                  >
                    {cat.name}
                  </Link>
                ))}
              </div>
            )}

            {/* Col 3: Quick Links */}
            <div>
              <h4 className="cms-footer-col-title">Quick Links</h4>
              <Link href="/blog" className="cms-footer-link">Blog</Link>
              <Link href="/portfolio" className="cms-footer-link">Portfolio</Link>
              <Link href="/search" className="cms-footer-link">Search</Link>
            </div>

            {/* Col 4: More */}
            <div>
              <h4 className="cms-footer-col-title">More</h4>
              <Link href="/api/feed/blog" className="cms-footer-link inline-flex items-center gap-1">
                <Rss className="h-3.5 w-3.5" />
                RSS Feed
              </Link>
              <Link href="/dashboard" className="cms-footer-link">Admin</Link>
            </div>
          </div>

          <div className="cms-footer-bottom">
            <span>&copy; {new Date().getFullYear()} {siteConfig.name}</span>
            <span>Powered by SweetCMS</span>
          </div>
        </div>
      </footer>
    </>
  );
}
