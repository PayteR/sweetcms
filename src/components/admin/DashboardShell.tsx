'use client';

import { usePathname } from 'next/navigation';

import { cn } from '@/lib/utils';
import { getActiveSectionId, getNavItem, isNavGroup } from '@/config/admin-nav';
import { useSidebarStore } from '@/store/sidebar-store';

export function DashboardShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isL2Collapsed = useSidebarStore((s) => s.isL2Collapsed);
  const activeSectionId = getActiveSectionId(pathname);
  const activeItem = activeSectionId ? getNavItem(activeSectionId) : undefined;
  const hasLevel2 = activeItem && isNavGroup(activeItem);

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
      <div className="admin-dashboard-shell-content p-6">{children}</div>
    </main>
  );
}
