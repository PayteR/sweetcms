'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Search, X, ArrowLeft } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useLocale } from '@/engine/hooks/useLocale';
import { localePath } from '@/engine/lib/locale';

/**
 * Expandable search — icon button that expands into a search input.
 *
 * Mobile: takes over the full navbar width (overlay mode).
 * Desktop: expands inline next to other navbar items.
 *
 * Press / to open from anywhere (skips inputs/textareas).
 */
export function ExpandableSearch() {
  const [expanded, setExpanded] = useState(false);
  const [query, setQuery] = useState('');
  const mobileInputRef = useRef<HTMLInputElement>(null);
  const desktopInputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const locale = useLocale();

  const open = useCallback(() => {
    setExpanded(true);
    requestAnimationFrame(() => {
      // Focus whichever input is visible
      desktopInputRef.current?.focus();
      mobileInputRef.current?.focus();
    });
  }, []);

  const close = useCallback(() => {
    setExpanded(false);
    setQuery('');
  }, []);

  useEffect(() => {
    if (!expanded) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [expanded, close]);

  // / to open
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (
        e.key === '/' &&
        !expanded &&
        !(e.target instanceof HTMLInputElement) &&
        !(e.target instanceof HTMLTextAreaElement)
      ) {
        e.preventDefault();
        open();
      }
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [expanded, open]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!query.trim()) return;
    router.push(localePath(`/showcase/search?q=${encodeURIComponent(query.trim())}`, locale));
    close();
  }

  if (!expanded) {
    return (
      <button
        type="button"
        onClick={open}
        className="rounded-lg p-2 text-(--text-muted) hover:bg-(--surface-secondary) hover:text-(--text-primary) transition-colors"
        title="Search (/)"
      >
        <Search className="h-4 w-4" />
      </button>
    );
  }

  // Expanded: mobile overlay + desktop inline
  return (
    <>
      {/* Mobile: full-width overlay on the navbar */}
      <div className="fixed inset-x-0 top-0 z-50 flex h-14 items-center gap-2 border-b border-(--border-primary) bg-(--surface-primary) px-4 sm:hidden">
        <button
          type="button"
          onClick={close}
          className="rounded-lg p-2 text-(--text-muted) hover:text-(--text-primary)"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <form onSubmit={handleSubmit} className="flex-1">
          <input
            ref={mobileInputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search..."
            className="w-full border-none bg-transparent text-sm text-(--text-primary) placeholder:text-(--text-muted) outline-none"
          />
        </form>
        {query && (
          <button type="button" onClick={() => setQuery('')} className="text-(--text-muted)">
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Desktop: inline expanding input */}
      <form onSubmit={handleSubmit} className="hidden sm:flex items-center">
        <div className="flex items-center gap-2 rounded-lg border border-(--border-primary) bg-(--surface-secondary) px-3 py-1.5 transition-all duration-150">
          <Search className="h-4 w-4 shrink-0 text-(--text-muted)" />
          <input
            ref={desktopInputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search..."
            className="w-48 border-none bg-transparent text-sm text-(--text-primary) placeholder:text-(--text-muted) outline-none"
          />
          <button
            type="button"
            onClick={close}
            className="shrink-0 text-(--text-muted) hover:text-(--text-primary)"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </form>
    </>
  );
}
