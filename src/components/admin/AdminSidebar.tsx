'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Activity,
  FileText,
  FolderOpen,
  Hash,
  Home,
  Image,
  Layers,
  Menu,
  Settings,
  Users,
} from 'lucide-react';

import { cn } from '@/lib/utils';
import { useSidebarStore } from '@/store/sidebar-store';

const navigation = [
  { name: 'Dashboard', href: '/dashboard', icon: Home },
  {
    name: 'Content',
    children: [
      { name: 'Pages', href: '/dashboard/cms/pages', icon: FileText },
      { name: 'Blog', href: '/dashboard/cms/blog', icon: Layers },
      { name: 'Categories', href: '/dashboard/cms/categories', icon: FolderOpen },
      { name: 'Tags', href: '/dashboard/cms/tags', icon: Hash },
      { name: 'Menus', href: '/dashboard/cms/menus', icon: Menu },
    ],
  },
  { name: 'Media', href: '/dashboard/media', icon: Image },
  { name: 'Users', href: '/dashboard/users', icon: Users },
  { name: 'Activity', href: '/dashboard/cms/activity', icon: Activity },
  { name: 'Settings', href: '/dashboard/settings', icon: Settings },
];

export function AdminSidebar() {
  const pathname = usePathname();
  const { isOpen, closeSidebar } = useSidebarStore();

  return (
    <aside
      className={cn(
        'fixed bottom-0 left-0 top-14 z-[60] w-60 overflow-y-auto border-r border-(--border-primary) bg-(--surface-primary) transition-transform duration-300 ease-in-out xl:translate-x-0',
        isOpen ? 'translate-x-0' : '-translate-x-full'
      )}
    >
      <nav className="flex flex-col gap-1 p-3">
        {navigation.map((item) => {
          if ('children' in item && item.children) {
            return (
              <div key={item.name} className="mt-3">
                <p className="mb-1 px-3 text-xs font-semibold uppercase tracking-wider text-(--text-muted)">
                  {item.name}
                </p>
                {item.children.map((child) => {
                  const Icon = child.icon;
                  const active = pathname.startsWith(child.href);
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
