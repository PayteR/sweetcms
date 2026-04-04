import '@/engine/styles/tokens-public.css';
import '@/engine/styles/content.css';

import Link from 'next/link';
import { Compass, BookOpen, Briefcase, Home } from 'lucide-react';

import { siteConfig } from '@/config/site';
import { ThemeToggle } from '@/engine/components/ThemeToggle';
import { LanguageSwitcher } from '@/engine/components/LanguageSwitcher';
import { UserMenu } from '@/components/public/UserMenu';
import { SubscribeOrTokens } from '@/components/public/SubscribeOrTokens';
import { ExpandableSearch } from '@/components/public/ExpandableSearch';
import {
  AppSidebarProvider,
  AppSidebarToggle,
  AppSidebarDrawer,
} from '@/components/public/AppSidebar';
import { getLocale } from '@/lib/locale-server';
import { localePath } from '@/lib/locale';
import { contentRoutes } from '@/config/routes';
import { AuthDialogs } from '@/components/public/AuthDialogs';

/**
 * App-like layout for the showcase route group.
 *
 * YouTube-style: top navbar with hamburger → slide-out sidebar + content area.
 * Sidebar is a layout-level sibling of header and main (not nested inside header).
 *
 * To convert to a permanent-sidebar dashboard layout:
 *   1. Set alwaysOpen on AppSidebarToggle and AppSidebarDrawer
 *   2. Add xl:ml-64 to the <main> element
 *
 * To reuse for your whole app:
 *   1. Rename (showcase) to (app) and move your routes here
 *   2. Customize the sidebarItems and navLinks below
 *   3. Add auth guards as needed
 */
export default async function ShowcaseLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const locale = await getLocale();

  const sidebarItems = [
    { label: 'Home', href: localePath('/', locale), icon: <Home className="h-4 w-4" /> },
    { label: 'Feed', href: localePath(contentRoutes.showcase, locale), icon: <Compass className="h-4 w-4" /> },
    { label: 'Blog', href: localePath(contentRoutes.blog, locale), icon: <BookOpen className="h-4 w-4" /> },
    { label: 'Portfolio', href: localePath(contentRoutes.portfolio, locale), icon: <Briefcase className="h-4 w-4" /> },
  ];

  return (
    <AppSidebarProvider>
      <div className="app-layout flex min-h-dvh flex-col">
        {/* ═══ Top Navbar ═══ */}
        <header className="app-navbar sticky top-0 z-50 border-b border-(--border-primary) bg-(--surface-primary)/95 backdrop-blur-md">
          <div className="flex h-14 items-center gap-3 px-4 sm:px-6">
            {/* Left: Hamburger + Logo */}
            <AppSidebarToggle />

            <Link
              href={localePath('/', locale)}
              className="text-lg font-bold text-(--text-primary) hover:text-(--color-brand-500) transition-colors"
            >
              {siteConfig.name}
            </Link>

            {/* Center: Nav links (desktop) */}
            <nav className="ml-4 hidden items-center gap-1 md:flex">
              <Link
                href={localePath(contentRoutes.showcase, locale)}
                className="rounded-lg px-3 py-1.5 text-sm font-medium text-(--text-secondary) hover:bg-(--surface-secondary) hover:text-(--text-primary) transition-colors"
              >
                Feed
              </Link>
              <Link
                href={localePath(contentRoutes.blog, locale)}
                className="rounded-lg px-3 py-1.5 text-sm font-medium text-(--text-secondary) hover:bg-(--surface-secondary) hover:text-(--text-primary) transition-colors"
              >
                Blog
              </Link>
              <Link
                href={localePath(contentRoutes.portfolio, locale)}
                className="rounded-lg px-3 py-1.5 text-sm font-medium text-(--text-secondary) hover:bg-(--surface-secondary) hover:text-(--text-primary) transition-colors"
              >
                Portfolio
              </Link>
            </nav>

            {/* Spacer */}
            <div className="flex-1" />

            {/* Right: Subscribe/Tokens + Search + Language + Theme + User */}
            <div className="flex items-center gap-2">
              <SubscribeOrTokens />
              <ExpandableSearch />
              <LanguageSwitcher />
              <ThemeToggle />
              <UserMenu />
            </div>
          </div>
        </header>

        <AuthDialogs />

        {/* ═══ Sidebar (layout-level, not inside header) ═══ */}
        <AppSidebarDrawer items={sidebarItems} />

        {/* ═══ Content ═══ */}
        <main className="flex-1">
          {children}
        </main>
      </div>
    </AppSidebarProvider>
  );
}
