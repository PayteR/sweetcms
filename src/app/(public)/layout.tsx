import '@/engine/styles/tokens-public.css';
import '@/engine/styles/content.css';

import { Suspense } from 'react';
import Link from 'next/link';
import { Rss, Search } from 'lucide-react';

import { siteConfig } from '@/config/site';
import { db } from '@/server/db';
import { cmsCategories, cmsMenus, cmsMenuItems } from '@/server/db/schema';
import { ContentStatus } from '@/engine/types/cms';
import { and, asc, eq, isNull } from 'drizzle-orm';
import { DynamicNav } from '@/engine/components/DynamicNav';
import { ThemeToggle } from '@/engine/components/ThemeToggle';
import { MobileMenu } from '@/engine/components/MobileMenu';
import { LanguageSwitcher } from '@/engine/components/LanguageSwitcher';
import { UserMenu } from '@/components/public/UserMenu';
import { getLocale } from '@/lib/locale-server';
import { localePath } from '@/lib/locale';
import type { Locale } from '@/lib/constants';
import { adminRoutes, contentRoutes, apiRoutes } from '@/config/routes';
import { RefCookieCapture } from '@/components/public/RefCookieCapture';
import { AuthDialogs } from '@/components/public/AuthDialogs';

async function getPublishedCategories(locale: Locale) {
  try {
    return await db
      .select({ name: cmsCategories.name, slug: cmsCategories.slug })
      .from(cmsCategories)
      .where(
        and(
          eq(cmsCategories.status, ContentStatus.PUBLISHED),
          eq(cmsCategories.lang, locale),
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
  categories: { name: string; slug: string }[],
  locale: Locale
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
        return items.map((i) => ({
          label: i.label,
          url: localePath(i.url ?? '/', locale),
        }));
      }
    }
  } catch {
    // fall through
  }

  // Fallback: Blog + categories
  return [
    { label: 'Blog', url: localePath(contentRoutes.blog, locale) },
    ...categories.map((c) => ({
      label: c.name,
      url: localePath(`/category/${c.slug}`, locale),
    })),
    { label: 'Portfolio', url: localePath(contentRoutes.portfolio, locale) },
    { label: 'Showcase', url: localePath(contentRoutes.showcase, locale) },
    { label: 'Search', url: localePath(contentRoutes.search, locale) },
  ];
}

export default async function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const locale = await getLocale();
  const categories = await getPublishedCategories(locale);
  const mobileItems = await getMobileNavItems(categories, locale);

  return (
    <>
      <Suspense fallback={null}>
        <RefCookieCapture />
      </Suspense>
      <link
        rel="alternate"
        type="application/rss+xml"
        title={`${siteConfig.name} — Blog RSS`}
        href={`${apiRoutes.feedBlog}?lang=${locale}`}
      />

      {/* ═══ Header ═══ */}
      <header className="header">
        <div className="header-inner">
          <Link href={localePath('/', locale)} className="header-logo">
            {siteConfig.name}
          </Link>

          {/* Desktop nav */}
          <div className="header-nav hidden sm:flex">
            <DynamicNav
              menuSlug="main"
              fallback={
                <>
                  <Link href={localePath(contentRoutes.blog, locale)} className="header-link">
                    Blog
                  </Link>
                  {categories.map((cat) => (
                    <Link
                      key={cat.slug}
                      href={localePath(`/category/${cat.slug}`, locale)}
                      className="header-link"
                    >
                      {cat.name}
                    </Link>
                  ))}
                  <Link href={localePath(contentRoutes.showcase, locale)} className="header-link">
                    Showcase
                  </Link>
                </>
              }
            />
          </div>

          {/* Actions */}
          <div className="header-actions">
            <Link href={localePath(contentRoutes.search, locale)} className="header-icon-btn" title="Search">
              <Search className="h-4 w-4" />
            </Link>
            <LanguageSwitcher />
            <ThemeToggle />
            <UserMenu />
            <MobileMenu items={mobileItems} />
          </div>
        </div>
      </header>

      <AuthDialogs />
      <main className="flex-1">{children}</main>

      {/* ═══ Footer ═══ */}
      <footer className="footer">
        <div className="container py-8">
          <div className="footer-grid">
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
                <h4 className="footer-col-title">Categories</h4>
                {categories.map((cat) => (
                  <Link
                    key={cat.slug}
                    href={localePath(`/category/${cat.slug}`, locale)}
                    className="footer-link"
                  >
                    {cat.name}
                  </Link>
                ))}
              </div>
            )}

            {/* Col 3: Quick Links */}
            <div>
              <h4 className="footer-col-title">Quick Links</h4>
              <Link href={localePath(contentRoutes.blog, locale)} className="footer-link">Blog</Link>
              <Link href={localePath(contentRoutes.portfolio, locale)} className="footer-link">Portfolio</Link>
              <Link href={localePath(contentRoutes.showcase, locale)} className="footer-link">Showcase</Link>
              <Link href={localePath(contentRoutes.search, locale)} className="footer-link">Search</Link>
            </div>

            {/* Col 4: More */}
            <div>
              <h4 className="footer-col-title">More</h4>
              <Link href={apiRoutes.feedBlog} className="footer-link inline-flex items-center gap-1">
                <Rss className="h-3.5 w-3.5" />
                RSS Feed
              </Link>
              <Link href={adminRoutes.home} className="footer-link">Admin</Link>
            </div>
          </div>

          <div className="footer-bottom">
            <span>&copy; {new Date().getFullYear()} {siteConfig.name}</span>
            <span>Powered by SweetCMS</span>
          </div>
        </div>
      </footer>
    </>
  );
}
