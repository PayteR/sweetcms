'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  Activity,
  ArrowRightLeft,
  Calendar,
  ChevronDown,
  ClipboardList,
  FileText,
  FolderOpen,
  Hash,
  Home,
  Image,
  Layers,
  Briefcase,
  ListChecks,
  Mail,
  Menu,
  Settings,
  Upload,
  Users,
  Webhook,
} from 'lucide-react';

import { cn } from '@/lib/utils';
import { useSidebarStore } from '@/store/sidebar-store';

interface NavChild {
  name: string;
  href: string;
  icon: React.ElementType;
}

interface NavLink {
  name: string;
  href: string;
  icon: React.ElementType;
}

interface NavGroup {
  name: string;
  icon: React.ElementType;
  children: NavChild[];
}

type NavItem = NavLink | NavGroup;

function isNavGroup(item: NavItem): item is NavGroup {
  return 'children' in item;
}

const navigation: NavItem[] = [
  { name: 'Dashboard', href: '/dashboard', icon: Home },
  {
    name: 'Content',
    icon: FileText,
    children: [
      { name: 'Pages', href: '/dashboard/cms/pages', icon: FileText },
      { name: 'Blog', href: '/dashboard/cms/blog', icon: Layers },
      { name: 'Portfolio', href: '/dashboard/cms/portfolio', icon: Briefcase },
      { name: 'Categories', href: '/dashboard/cms/categories', icon: FolderOpen },
      { name: 'Tags', href: '/dashboard/cms/tags', icon: Hash },
      { name: 'Menus', href: '/dashboard/cms/menus', icon: Menu },
      { name: 'Redirects', href: '/dashboard/cms/redirects', icon: ArrowRightLeft },
      { name: 'Calendar', href: '/dashboard/cms/calendar', icon: Calendar },
    ],
  },
  { name: 'Forms', href: '/dashboard/forms', icon: ClipboardList },
  { name: 'Media', href: '/dashboard/media', icon: Image },
  { name: 'Users', href: '/dashboard/users', icon: Users },
  { name: 'Activity', href: '/dashboard/cms/activity', icon: Activity },
  {
    name: 'Settings',
    icon: Settings,
    children: [
      { name: 'General', href: '/dashboard/settings', icon: Settings },
      { name: 'Custom Fields', href: '/dashboard/settings/custom-fields', icon: Layers },
      { name: 'Import', href: '/dashboard/settings/import', icon: Upload },
      { name: 'Webhooks', href: '/dashboard/settings/webhooks', icon: Webhook },
      { name: 'Job Queue', href: '/dashboard/settings/job-queue', icon: ListChecks },
      { name: 'Email Templates', href: '/dashboard/settings/email-templates', icon: Mail },
    ],
  },
];

/** Check if a child link should be active, with fallback logic for group catch-alls */
function isChildActive(
  child: NavChild,
  siblings: NavChild[],
  pathname: string
): boolean {
  if (pathname === child.href) return true;
  if (pathname.startsWith(child.href + '/')) {
    const hasBetterMatch = siblings.some(
      (s) => s.href !== child.href && pathname.startsWith(s.href)
    );
    return !hasBetterMatch;
  }
  return false;
}

/** Check if any child in a group is active */
function isGroupActive(children: NavChild[], pathname: string): boolean {
  return children.some((child) => isChildActive(child, children, pathname));
}

export function AdminSidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { isOpen, closeSidebar } = useSidebarStore();

  // Compute which groups should be initially open (those with active children)
  const initialOpen = useMemo(() => {
    const open: Record<string, boolean> = {};
    for (const item of navigation) {
      if (isNavGroup(item)) {
        open[item.name] = isGroupActive(item.children, pathname);
      }
    }
    return open;
  }, []); // eslint-disable-line react-hooks/exhaustive-deps -- only on mount

  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(
    () => initialOpen
  );

  // Auto-expand groups when navigating to a child route
  useEffect(() => {
    setOpenGroups((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const item of navigation) {
        if (
          isNavGroup(item) &&
          isGroupActive(item.children, pathname) &&
          !prev[item.name]
        ) {
          next[item.name] = true;
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [pathname]);

  const toggleGroup = useCallback((name: string) => {
    setOpenGroups((prev) => ({ ...prev, [name]: !prev[name] }));
  }, []);

  return (
    <aside
      className={cn(
        'fixed bottom-0 left-0 top-14 z-[60] w-60 overflow-y-auto border-r border-(--border-primary) bg-(--surface-primary) transition-transform duration-300 ease-in-out xl:translate-x-0',
        isOpen ? 'translate-x-0' : '-translate-x-full'
      )}
    >
      <nav className="flex flex-col gap-1 p-3">
        {navigation.map((item) => {
          if (isNavGroup(item)) {
            const groupOpen = openGroups[item.name] ?? false;
            const GroupIcon = item.icon;
            const firstChild = item.children[0];

            return (
              <div key={item.name} className="mt-2">
                {/* Group header — split button: label navigates, chevron toggles */}
                <div className="flex items-center">
                  <button
                    type="button"
                    onClick={() => {
                      setOpenGroups((prev) => ({ ...prev, [item.name]: true }));
                      if (firstChild) {
                        router.push(firstChild.href);
                        closeSidebar();
                      }
                    }}
                    className="flex flex-1 items-center gap-2 rounded-l-md px-3 py-2 text-xs font-semibold uppercase tracking-wider text-(--text-muted) hover:bg-(--surface-secondary) hover:text-(--text-primary)"
                  >
                    <GroupIcon className="h-4 w-4" />
                    <span className="flex-1 text-left">{item.name}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => toggleGroup(item.name)}
                    className="rounded-r-md px-2 py-2 text-(--text-muted) hover:bg-(--surface-secondary) hover:text-(--text-primary)"
                  >
                    <ChevronDown
                      className={cn(
                        'h-4 w-4 transition-transform duration-200',
                        groupOpen ? 'rotate-0' : '-rotate-90'
                      )}
                    />
                  </button>
                </div>

                {/* Collapsible children */}
                {groupOpen && (
                  <div className="ml-3 mt-1 space-y-0.5 border-l border-(--border-primary) pl-3">
                    {item.children.map((child) => {
                      const Icon = child.icon;
                      const active = isChildActive(child, item.children, pathname);
                      return (
                        <Link
                          key={child.href}
                          href={child.href}
                          onClick={closeSidebar}
                          className={cn('admin-sidebar-link', active && 'active')}
                        >
                          <Icon className="h-4 w-4" />
                          {child.name}
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          }

          const Icon = item.icon;
          const active =
            item.href === '/dashboard'
              ? pathname === '/dashboard'
              : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={closeSidebar}
              className={cn('admin-sidebar-link', active && 'active')}
            >
              <Icon className="h-4 w-4" />
              {item.name}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
