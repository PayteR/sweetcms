'use client';

import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Menu, X } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface AppNavItem {
  label: string;
  href: string;
  icon?: React.ReactNode;
}

// ── Shared state via context ──────────────────────────────────
const SidebarContext = createContext<{
  open: boolean;
  toggle: () => void;
  close: () => void;
}>({ open: false, toggle: () => {}, close: () => {} });

/**
 * Provider — wrap the layout in this to share sidebar state
 * between the toggle button (in navbar) and the drawer (in layout body).
 */
export function AppSidebarProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  // Close on navigation
  useEffect(() => { setOpen(false); }, [pathname]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [open]);

  const toggle = useCallback(() => setOpen((v) => !v), []);
  const close = useCallback(() => setOpen(false), []);

  return (
    <SidebarContext.Provider value={{ open, toggle, close }}>
      {children}
    </SidebarContext.Provider>
  );
}

/**
 * Hamburger toggle button — place inside the navbar.
 */
export function AppSidebarToggle({ alwaysOpen = false }: { alwaysOpen?: boolean }) {
  const { open, toggle } = useContext(SidebarContext);

  return (
    <button
      type="button"
      onClick={toggle}
      className={cn(
        'rounded-lg p-2 text-(--text-muted) hover:bg-(--surface-secondary) hover:text-(--text-primary) transition-colors',
        alwaysOpen && 'xl:hidden',
      )}
      aria-label={open ? 'Close menu' : 'Open menu'}
    >
      {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
    </button>
  );
}

/**
 * Sidebar drawer + backdrop — place as a sibling of header and main in the layout.
 *
 * To convert to permanent sidebar: set alwaysOpen={true} and add xl:ml-64 to <main>.
 */
export function AppSidebarDrawer({
  items,
  alwaysOpen = false,
}: {
  items: AppNavItem[];
  alwaysOpen?: boolean;
}) {
  const { open, close } = useContext(SidebarContext);
  const pathname = usePathname();
  const isVisible = alwaysOpen || open;

  return (
    <>
      {/* Backdrop */}
      {open && (
        <div
          className={cn(
            'fixed inset-0 z-40 bg-black/30 backdrop-blur-sm',
            alwaysOpen && 'xl:hidden',
          )}
          onClick={close}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          'fixed left-0 top-14 bottom-0 z-40 w-64 border-r border-(--border-primary) bg-(--surface-primary) overflow-y-auto transition-transform duration-200 ease-in-out',
          isVisible ? 'translate-x-0' : '-translate-x-full',
          alwaysOpen && 'xl:translate-x-0 xl:transition-none',
        )}
      >
        <nav className="flex flex-col gap-1 p-3">
          {items.map((item) => {
            const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-(--surface-secondary) text-(--text-primary)'
                    : 'text-(--text-secondary) hover:bg-(--surface-secondary) hover:text-(--text-primary)',
                )}
              >
                {item.icon}
                {item.label}
              </Link>
            );
          })}
        </nav>
      </aside>
    </>
  );
}
