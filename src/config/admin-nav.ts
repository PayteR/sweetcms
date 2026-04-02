/**
 * Admin navigation configuration.
 * Single source of truth — imported by AdminSidebar and CommandPalette.
 *
 * Interfaces and pure helpers live in @/engine/config/admin-nav.
 * This file provides the project-specific navigation data array
 * and convenience wrappers that bind the array to the engine helpers.
 */
import {
  Activity,
  ArrowRightLeft,
  Briefcase,
  Calendar,
  ClipboardList,
  FileText,
  FolderKanban,
  FolderOpen,
  Hash,
  Home,
  Image,
  Layers,
  ListChecks,
  Mail,
  Menu,
  Settings,
  Upload,
  Users,
  Webhook,
} from 'lucide-react';

// Re-export interfaces and type guard from engine (keeps existing imports working)
export { isNavGroup } from '@/engine/config/admin-nav';
export type { NavChild, NavLink, NavGroup, NavItem } from '@/engine/config/admin-nav';

import {
  flatNavItems as _flatNavItems,
  getActiveSectionId as _getActiveSectionId,
  getNavItem as _getNavItem,
} from '@/engine/config/admin-nav';
import type { NavItem } from '@/engine/config/admin-nav';

export const navigation: NavItem[] = [
  { id: 'dashboard', name: 'Dashboard', href: '/dashboard', icon: Home },
  {
    id: 'content',
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
  { id: 'forms', name: 'Forms', href: '/dashboard/forms', icon: ClipboardList },
  { id: 'media', name: 'Media', href: '/dashboard/media', icon: Image },
  { id: 'users', name: 'Users', href: '/dashboard/users', icon: Users },
  { id: 'projects', name: 'Projects', href: '/dashboard/projects', icon: FolderKanban },
  { id: 'activity', name: 'Activity', href: '/dashboard/cms/activity', icon: Activity },
  {
    id: 'settings',
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

/** Flatten navigation into a flat list for search/command palette */
export function flatNavItems() {
  return _flatNavItems(navigation);
}

/**
 * Determine the active section ID from the current pathname.
 * Checks top-level links first, then groups (match child hrefs).
 */
export function getActiveSectionId(pathname: string): string | null {
  return _getActiveSectionId(navigation, pathname);
}

/** Get a nav item by its ID */
export function getNavItem(id: string): NavItem | undefined {
  return _getNavItem(navigation, id);
}
