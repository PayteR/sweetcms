'use client';

import { usePathname } from 'next/navigation';

import { cn } from '@/lib/utils';
import { getActiveSectionId, getNavItem, isNavGroup } from '@/engine/config/admin-nav';
import type { NavItem } from '@/engine/config/admin-nav';
import { useSidebarStore } from '@/engine/store/sidebar-store';

interface DashboardShellProps {
  navigation: NavItem[];
  children: React.ReactNode;
}

function deriveSectionSlug(pathname: string): string {
  // Strip /dashboard prefix, take first two meaningful segments, join with dash
  // /dashboard → "home"
  // /dashboard/cms/pages → "cms-pages"
  // /dashboard/cms/blog/edit/123 → "cms-blog"
  // /dashboard/users → "users"
  const stripped = pathname.replace(/^\/dashboard\/?/, '');
  if (!stripped) return 'home';
  const segments = stripped.split('/').filter(Boolean).slice(0, 2);
  // Skip UUID-like segments (edit IDs etc.)
  const meaningful = segments.filter(
    (s) => !/^[0-9a-f]{8}-[0-9a-f]{4}-/.test(s)
  );
  return meaningful.join('-') || 'home';
}

export function DashboardShell({ navigation, children }: DashboardShellProps) {
  const pathname = usePathname();
  const isL2Collapsed = useSidebarStore((s) => s.isL2Collapsed);
  const activeSectionId = getActiveSectionId(navigation, pathname);
  const activeItem = activeSectionId ? getNavItem(navigation, activeSectionId) : undefined;
  const hasLevel2 = activeItem && isNavGroup(activeItem);
  const sectionSlug = deriveSectionSlug(pathname);

  return (
    <main
      className={cn(
        'min-h-dvh pt-12 xl:pt-0 transition-[margin-left] duration-300 ease-in-out',
        hasLevel2
          ? isL2Collapsed
            ? 'xl:ml-[calc(48px+48px)]'
            : 'xl:ml-[268px]'
          : 'xl:ml-[48px]'
      )}
    >
      <div className="dashboard-shell-content p-6" data-section={sectionSlug}>
        {children}
      </div>
    </main>
  );
}
