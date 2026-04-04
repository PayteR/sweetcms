'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Search, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useLocale } from '@/engine/hooks/useLocale';
import { localePath } from '@/engine/lib/locale';

/**
 * Expandable search — icon button that expands into a full search input.
 * On submit, navigates to the search page with the query.
 */
export function ExpandableSearch() {
  const [expanded, setExpanded] = useState(false);
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const locale = useLocale();

  const open = useCallback(() => {
    setExpanded(true);
    // Focus after animation
    requestAnimationFrame(() => inputRef.current?.focus());
  }, []);

  const close = useCallback(() => {
    setExpanded(false);
    setQuery('');
  }, []);

  // Close on Escape
  useEffect(() => {
    if (!expanded) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [expanded, close]);

  // Keyboard shortcut: / to open search
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === '/' && !expanded && !(e.target instanceof HTMLInputElement) && !(e.target instanceof HTMLTextAreaElement)) {
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
    router.push(localePath(`/search?q=${encodeURIComponent(query.trim())}`, locale));
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

  return (
    <form onSubmit={handleSubmit} className="flex items-center">
      <div
        className={cn(
          'flex items-center gap-2 rounded-lg border border-(--border-primary) bg-(--surface-secondary) px-3 py-1.5',
          'animate-in slide-in-from-right-4 fade-in duration-150',
        )}
      >
        <Search className="h-4 w-4 shrink-0 text-(--text-muted)" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search..."
          className="w-40 border-none bg-transparent text-sm text-(--text-primary) placeholder:text-(--text-muted) outline-none sm:w-56"
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
  );
}
