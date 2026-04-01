'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { ChevronsLeft, ChevronsRight, ExternalLink, LogOut, Menu, Monitor, Moon, Search, Sun, User } from 'lucide-react';

import { cn } from '@/lib/utils';
import { useBlankTranslations } from '@/lib/translations';
import { signOut, useSession } from '@/lib/auth-client';
import { useSidebarStore } from '@/store/sidebar-store';
import { useThemeStore } from '@/store/theme-store';
import { siteConfig } from '@/config/site';
import { navigation, isNavGroup, getActiveSectionId, flatNavItems } from '@/config/admin-nav';
import type { NavChild } from '@/config/admin-nav';
import { CommandPalette, useCommandPaletteShortcut } from '@/engine/components/CommandPalette';

/* ── Helpers ── */

function isChildActive(child: NavChild, siblings: NavChild[], pathname: string): boolean {
  if (pathname === child.href) return true;
  if (pathname.startsWith(child.href + '/')) {
    const hasBetterMatch = siblings.some(
      (s) => s.href !== child.href && pathname.startsWith(s.href)
    );
    return !hasBetterMatch;
  }
  return false;
}

function RoleBadge({ role }: { role: string }) {
  const classMap: Record<string, string> = {
    superadmin: 'admin-role-badge admin-role-superadmin',
    admin: 'admin-role-badge admin-role-admin',
    editor: 'admin-role-badge admin-role-editor',
    user: 'admin-role-badge admin-role-user',
  };
  return <span className={classMap[role] ?? classMap.user}>{role}</span>;
}

const themeOrder = ['light', 'dark', 'system'] as const;
const themeIcons = { light: Sun, dark: Moon, system: Monitor } as const;
const themeLabels = { light: 'Light', dark: 'Dark', system: 'System' } as const;

/* ── Main Component ── */

export function AdminSidebar() {
  const __ = useBlankTranslations();
  const pathname = usePathname();
  const router = useRouter();
  const { isOpen, closeSidebar, toggleSidebar, isL2Collapsed, toggleL2Collapsed } = useSidebarStore();
  const { data: session } = useSession();
  const { theme, setTheme, initTheme } = useThemeStore();

  // Command palette state
  const paletteNavItems = useMemo(() => flatNavItems(), []);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const openPalette = useCallback(() => setCommandPaletteOpen(true), []);
  const closePalette = useCallback(() => setCommandPaletteOpen(false), []);
  useCommandPaletteShortcut(openPalette);

  // User popover state
  const [userPopoverOpen, setUserPopoverOpen] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);
  const avatarBtnRef = useRef<HTMLButtonElement>(null);

  // Theme init
  useEffect(() => {
    return initTheme();
  }, [initTheme]);

  // Close popover on outside click
  useEffect(() => {
    if (!userPopoverOpen) return;
    function handleMouseDown(e: MouseEvent) {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(e.target as Node) &&
        avatarBtnRef.current &&
        !avatarBtnRef.current.contains(e.target as Node)
      ) {
        setUserPopoverOpen(false);
      }
    }
    document.addEventListener('mousedown', handleMouseDown);
    return () => document.removeEventListener('mousedown', handleMouseDown);
  }, [userPopoverOpen]);

  // Close popover when mobile overlay state changes (prevents stale refs)
  useEffect(() => {
    setUserPopoverOpen(false);
  }, [isOpen]);

  // Active section
  const activeSectionId = getActiveSectionId(pathname);
  const activeItem = useMemo(
    () => navigation.find((item) => item.id === activeSectionId),
    [activeSectionId]
  );
  const hasLevel2 = activeItem && isNavGroup(activeItem);

  // Theme cycling
  function cycleTheme() {
    const idx = themeOrder.indexOf(theme);
    const next = themeOrder[(idx + 1) % themeOrder.length];
    setTheme(next);
  }

  async function handleSignOut() {
    await signOut();
    router.push('/login');
  }

  const userRole = (session?.user as Record<string, unknown> | undefined)?.role as string | undefined;
  const ThemeIcon = themeIcons[theme];
  const logoLetter = siteConfig.name.charAt(0).toUpperCase();

  /* ── Rail content (shared between desktop and mobile) ── */
  function renderRailNav() {
    return navigation.map((item) => {
      const Icon = item.icon;
      const isActive = item.id === activeSectionId;

      if (isNavGroup(item)) {
        const firstChild = item.children[0];
        return (
          <button
            key={item.id}
            type="button"
            title={item.name}
            onClick={() => {
              if (firstChild) router.push(firstChild.href);
              closeSidebar();
            }}
            className={cn('admin-rail-btn', isActive && 'active')}
          >
            <Icon className="h-5 w-5" />
          </button>
        );
      }

      return (
        <Link
          key={item.id}
          href={item.href}
          title={item.name}
          onClick={closeSidebar}
          className={cn('admin-rail-btn', isActive && 'active')}
        >
          <Icon className="h-5 w-5" />
        </Link>
      );
    });
  }

  function renderRailBottom() {
    return (
      <>
        <button
          type="button"
          title={__('Search')}
          onClick={openPalette}
          className="admin-rail-btn"
        >
          <Search className="h-5 w-5" />
        </button>
        <button
          type="button"
          title={`${__('Theme')}: ${themeLabels[theme]}`}
          onClick={cycleTheme}
          className="admin-rail-btn"
        >
          <ThemeIcon className="h-5 w-5" />
        </button>
        <div className="relative">
          <button
            ref={avatarBtnRef}
            type="button"
            title={session?.user?.name ?? __('User')}
            onClick={() => setUserPopoverOpen((v) => !v)}
            className="admin-rail-btn"
          >
            <User className="h-5 w-5" />
          </button>
          {userPopoverOpen && (
            <div ref={popoverRef} className="admin-user-popover">
              {session?.user && (
                <div className="px-3 py-2">
                  <div className="text-sm font-medium text-(--text-primary) truncate">
                    {session.user.name ?? session.user.email}
                  </div>
                  <div className="text-xs text-(--text-muted) truncate mt-0.5">
                    {session.user.email}
                  </div>
                  {userRole && (
                    <div className="mt-1.5">
                      <RoleBadge role={userRole} />
                    </div>
                  )}
                </div>
              )}
              <div className="border-t border-(--border-secondary) mt-1 pt-1">
                <button
                  type="button"
                  onClick={handleSignOut}
                  className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-(--text-secondary) hover:bg-(--surface-inset) hover:text-(--text-primary)"
                >
                  <LogOut className="h-4 w-4" />
                  {__('Sign Out')}
                </button>
              </div>
            </div>
          )}
        </div>
      </>
    );
  }

  function renderLevel2() {
    if (!activeItem || !isNavGroup(activeItem)) return null;
    const CollapseIcon = isL2Collapsed ? ChevronsRight : ChevronsLeft;
    return (
      <>
        <div className="flex items-center justify-between mb-1">
          <div className={cn('admin-l2-title', isL2Collapsed && 'sr-only')}>
            {activeItem.name}
          </div>
          <button
            type="button"
            onClick={toggleL2Collapsed}
            className="admin-rail-btn !w-7 !h-7"
            title={isL2Collapsed ? __('Expand panel') : __('Collapse panel')}
          >
            <CollapseIcon className="h-3.5 w-3.5" />
          </button>
        </div>
        <nav className="flex flex-col gap-0.5">
          {activeItem.children.map((child) => {
            const Icon = child.icon;
            const active = isChildActive(child, activeItem.children, pathname);
            return (
              <Link
                key={child.href}
                href={child.href}
                onClick={closeSidebar}
                title={isL2Collapsed ? child.name : undefined}
                className={cn('admin-sidebar-link', active && 'active')}
              >
                <Icon className="h-4 w-4 shrink-0" />
                {!isL2Collapsed && <span>{child.name}</span>}
              </Link>
            );
          })}
        </nav>
      </>
    );
  }

  return (
    <>
      {/* ── Desktop Rail ── */}
      <aside className="admin-rail hidden xl:flex">
        <Link href="/dashboard" className="admin-rail-logo">
          {logoLetter}
        </Link>
        <div className="admin-rail-nav">
          {renderRailNav()}
        </div>
        <div className="admin-rail-bottom">
          <a
            href="/"
            target="_blank"
            rel="noopener noreferrer"
            className="admin-rail-btn"
            title={__('View site')}
          >
            <ExternalLink size={16} />
          </a>
          {renderRailBottom()}
        </div>
      </aside>

      {/* ── Desktop Level 2 Panel (always mounted for transition) ── */}
      <aside
        className={cn(
          'admin-l2-panel hidden xl:block transition-[translate,opacity,width] duration-300 ease-in-out',
          hasLevel2
            ? 'translate-x-0 opacity-100'
            : '-translate-x-full opacity-0 pointer-events-none',
          hasLevel2 && isL2Collapsed && 'admin-l2-collapsed'
        )}
      >
        {hasLevel2 && renderLevel2()}
      </aside>

      {/* ── Mobile Top Bar ── */}
      <div className="admin-mobile-topbar xl:hidden">
        <button
          type="button"
          onClick={toggleSidebar}
          className="admin-rail-btn"
        >
          <Menu className="h-5 w-5" />
        </button>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={openPalette}
            className="admin-rail-btn"
          >
            <Search className="h-5 w-5" />
          </button>
        </div>
      </div>

      {/* ── Mobile Overlay ── */}
      {isOpen && (
        <>
          <div
            className="fixed inset-0 z-[55] bg-(--surface-overlay) xl:hidden"
            onClick={closeSidebar}
          />
          <div className="fixed inset-y-0 left-0 z-[60] flex xl:hidden">
            {/* Mobile Rail — inline layout instead of reusing .admin-rail (which is position:fixed) */}
            <aside className="admin-mobile-rail">
              <Link href="/dashboard" onClick={closeSidebar} className="admin-rail-logo">
                {logoLetter}
              </Link>
              <div className="admin-rail-nav">
                {renderRailNav()}
              </div>
              <div className="admin-rail-bottom">
                <a
                  href="/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="admin-rail-btn"
                  title={__('View site')}
                >
                  <ExternalLink size={16} />
                </a>
                {renderRailBottom()}
              </div>
            </aside>
            {/* Mobile Level 2 */}
            {hasLevel2 && (
              <aside className="w-[220px] bg-(--surface-secondary) border-r border-(--border-primary) overflow-y-auto p-4 pt-4">
                {renderLevel2()}
              </aside>
            )}
          </div>
        </>
      )}

      {/* ── Command Palette ── */}
      <CommandPalette open={commandPaletteOpen} onClose={closePalette} navItems={paletteNavItems} />
    </>
  );
}
