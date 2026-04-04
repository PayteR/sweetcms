'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Search, X, ArrowLeft } from 'lucide-react';
import { useLocale } from '@/engine/hooks/useLocale';
import { localePath } from '@/engine/lib/locale';
import { useTranslations } from '@/lib/translations';

/**
 * Expandable search — icon button that expands into a search input.
 *
 * Mobile: takes over the navbar as a full-width overlay.
 * Desktop: expands inline next to other navbar items.
 *
 * Press / to open from anywhere (skips inputs/textareas).
 * All styles from frontend.css (.app-search-*).
 */
export function ExpandableSearch() {
  const [expanded, setExpanded] = useState(false);
  const [query, setQuery] = useState('');
  const mobileInputRef = useRef<HTMLInputElement>(null);
  const desktopInputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const locale = useLocale();
  const __ = useTranslations();

  const open = useCallback(() => {
    setExpanded(true);
    requestAnimationFrame(() => {
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
      <button type="button" onClick={open} className="app-icon-btn" title={__('Search (/)')}>
        <Search className="h-4 w-4" />
      </button>
    );
  }

  return (
    <>
      {/* Mobile: full-width overlay */}
      <div className="app-search-overlay sm:hidden">
        <button type="button" onClick={close} className="app-icon-btn">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <form onSubmit={handleSubmit} className="flex-1">
          <input
            ref={mobileInputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={__('Search...')}
            className="app-search-input"
          />
        </form>
        {query && (
          <button type="button" onClick={() => setQuery('')} className="app-icon-btn">
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Desktop: inline input */}
      <form onSubmit={handleSubmit} className="hidden sm:flex items-center">
        <div className="app-search-inline">
          <Search className="h-4 w-4" />
          <input
            ref={desktopInputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={__('Search...')}
          />
          <button type="button" onClick={close} className="app-icon-btn">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </form>
    </>
  );
}
