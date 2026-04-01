'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { FileText, Hash, FolderOpen, Briefcase, Search } from 'lucide-react';

import { cn } from '@/lib/utils';
import { useBlankTranslations } from '@/lib/translations';
import { trpc } from '@/lib/trpc/client';
import { useKeyboardShortcuts } from '@/engine/hooks/useKeyboardShortcuts';

export interface CommandPaletteNavItem {
  name: string;
  href: string;
  icon: React.ElementType;
  group?: string;
}

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
  /** Navigation items for the command palette search. If omitted, only content search is available. */
  navItems?: CommandPaletteNavItem[];
}

interface ResultItem {
  id: string;
  label: string;
  href: string;
  icon: React.ElementType;
  group: string;
}

const contentTypeIcons: Record<string, React.ElementType> = {
  page: FileText,
  blog: FileText,
  category: FolderOpen,
  tag: Hash,
  portfolio: Briefcase,
};

export function CommandPalette({ open, onClose, navItems: navItemsProp }: CommandPaletteProps) {
  const __ = useBlankTranslations();
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);

  // Nav items — static, filtered by query (only shown when typing)
  const navItems = useMemo(() => navItemsProp ?? [], [navItemsProp]);
  const filteredNav = useMemo(() => {
    if (!query) return [];
    const q = query.toLowerCase();
    return navItems.filter(
      (item) =>
        item.name.toLowerCase().includes(q) ||
        item.group?.toLowerCase().includes(q)
    );
  }, [navItems, query]);

  // Content search — debounced tRPC query
  const debouncedQuery = useDebounced(query, 200);
  const contentSearch = trpc.contentSearch.search.useQuery(
    { query: debouncedQuery, limit: 8 },
    { enabled: debouncedQuery.length >= 2 }
  );

  // Merge results
  const results = useMemo<ResultItem[]>(() => {
    const items: ResultItem[] = [];

    // Navigation results
    for (const nav of filteredNav) {
      items.push({
        id: `nav:${nav.href}`,
        label: nav.group ? `${nav.group} → ${nav.name}` : nav.name,
        href: nav.href,
        icon: nav.icon,
        group: __('Navigation'),
      });
    }

    // Content search results
    if (contentSearch.data) {
      for (const result of contentSearch.data) {
        items.push({
          id: `content:${result.type}:${result.id}`,
          label: result.title,
          href: result.url,
          icon: contentTypeIcons[result.type] ?? FileText,
          group: __('Content'),
        });
      }
    }

    return items;
  }, [filteredNav, contentSearch.data, __]);

  // Reset active index when results change
  useEffect(() => {
    setActiveIndex(0);
  }, [results.length]);

  // Open/close dialog
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
      inputRef.current?.focus();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  // Reset state on open
  useEffect(() => {
    if (open) {
      setQuery('');
      setActiveIndex(0);
      // Focus input after dialog opens
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  function handleSelect(item: ResultItem) {
    onClose();
    router.push(item.href);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setActiveIndex((i) => (i + 1) % Math.max(results.length, 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setActiveIndex((i) => (i - 1 + results.length) % Math.max(results.length, 1));
        break;
      case 'Enter':
        e.preventDefault();
        if (results[activeIndex]) handleSelect(results[activeIndex]);
        break;
      case 'Escape':
        e.preventDefault();
        onClose();
        break;
    }
  }

  // Scroll active item into view
  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const active = list.querySelector('[data-active="true"]');
    if (active) {
      active.scrollIntoView({ block: 'nearest' });
    }
  }, [activeIndex]);

  // Close on backdrop click
  function handleDialogClick(e: React.MouseEvent<HTMLDialogElement>) {
    if (e.target === dialogRef.current) {
      onClose();
    }
  }

  // Group results for display
  const grouped = useMemo(() => {
    const groups: { label: string; items: (ResultItem & { index: number })[] }[] = [];
    let idx = 0;
    let currentGroup = '';
    for (const item of results) {
      if (item.group !== currentGroup) {
        currentGroup = item.group;
        groups.push({ label: currentGroup, items: [] });
      }
      groups[groups.length - 1].items.push({ ...item, index: idx });
      idx++;
    }
    return groups;
  }, [results]);

  if (!open) return null;

  return (
    <dialog
      ref={dialogRef}
      className="admin-command-palette"
      onClick={handleDialogClick}
      onClose={onClose}
    >
      <div className="admin-command-panel" onKeyDown={handleKeyDown}>
        {/* Search input */}
        <div className="admin-command-input-wrapper">
          <Search className="h-4 w-4 shrink-0 text-(--text-muted)" />
          <input
            ref={inputRef}
            type="text"
            className="admin-command-input"
            placeholder={__('Search pages, content, settings...')}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <kbd className="admin-kbd">Esc</kbd>
        </div>

        {/* Results */}
        <div ref={listRef} className="admin-command-results">
          {grouped.map((group) => (
            <div key={group.label}>
              <div className="admin-command-group">{group.label}</div>
              {group.items.map((item) => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.id}
                    type="button"
                    data-active={item.index === activeIndex}
                    className={cn(
                      'admin-command-result',
                      item.index === activeIndex && 'active'
                    )}
                    onClick={() => handleSelect(item)}
                    onMouseEnter={() => setActiveIndex(item.index)}
                  >
                    <Icon className="h-4 w-4 shrink-0 text-(--text-muted)" />
                    <span className="flex-1 truncate text-left">{item.label}</span>
                    {item.group === __('Content') && (
                      <span className="admin-badge text-[0.625rem]">
                        {item.id.split(':')[1]}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          ))}

          {results.length === 0 && query.length > 0 && (
            <div className="admin-command-empty">
              {__('No results found')}
            </div>
          )}

          {results.length === 0 && query.length === 0 && (
            <div className="admin-command-empty">
              {__('Start typing to search...')}
            </div>
          )}
        </div>
      </div>
    </dialog>
  );
}

/** Global keyboard shortcut hook for opening the command palette */
export function useCommandPaletteShortcut(onOpen: () => void) {
  useKeyboardShortcuts(
    useMemo(() => [{ key: 'k', ctrl: true, handler: onOpen }], [onOpen])
  );
}

/** Simple debounce hook */
function useDebounced(value: string, delay: number): string {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}
