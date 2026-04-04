import '@/engine/styles/tokens-public.css';
import '@/engine/styles/frontend/index.css';
import '@/engine/styles/frontend/app-layout.css';

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
import { getServerTranslations } from '@/lib/translations-server';

/**
 * App-like layout for the showcase route group.
 *
 * Structure mirrors the dashboard's page-* pattern:
 *   .app-container > .app-header > .app-toolbar
 *                  > .app-sidebar
 *                  > .app-main
 *
 * To convert to permanent-sidebar dashboard:
 *   1. Set alwaysOpen on AppSidebarToggle and AppSidebarDrawer
 *   2. Add margin-left matching .app-sidebar width to .app-main
 *
 * To reuse for your whole app:
 *   1. Rename (showcase) to (app) and move your routes here
 *   2. Customize sidebarItems and nav links below
 *   3. Add auth guards as needed
 */
export default async function ShowcaseLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const locale = await getLocale();
  const __ = await getServerTranslations();

  const sidebarItems = [
    { label: __('Home'), href: localePath('/', locale), icon: <Home className="h-4 w-4" /> },
    { label: __('Feed'), href: localePath(contentRoutes.showcase, locale), icon: <Compass className="h-4 w-4" /> },
    { label: __('Blog'), href: localePath(contentRoutes.blog, locale), icon: <BookOpen className="h-4 w-4" /> },
    { label: __('Portfolio'), href: localePath(contentRoutes.portfolio, locale), icon: <Briefcase className="h-4 w-4" /> },
  ];

  return (
    <AppSidebarProvider>
      <div className="app-container">
        <header className="app-header">
          <div className="app-toolbar">
            <AppSidebarToggle />

            <Link href={localePath('/', locale)} className="app-logo">
              {siteConfig.name}
            </Link>

            <nav className="app-nav hidden lg:flex">
              <Link href={localePath(contentRoutes.showcase, locale)} className="app-nav-link">
                {__('Feed')}
              </Link>
              <Link href={localePath(contentRoutes.blog, locale)} className="app-nav-link">
                {__('Blog')}
              </Link>
              <Link href={localePath(contentRoutes.portfolio, locale)} className="app-nav-link">
                {__('Portfolio')}
              </Link>
            </nav>

            <div className="app-spacer" />

            <div className="app-actions">
              <SubscribeOrTokens />
              <ExpandableSearch />
              <LanguageSwitcher />
              <ThemeToggle />
              <UserMenu />
            </div>
          </div>
        </header>

        <AuthDialogs />

        <AppSidebarDrawer items={sidebarItems} />

        <main className="app-main">
          {children}
        </main>
      </div>
    </AppSidebarProvider>
  );
}
