'use client';

import { memo, useCallback, useEffect, useRef, useState } from 'react';

import { FileText, FolderOpen, Search, Tag } from 'lucide-react';

import { useBlankTranslations } from '@/lib/translations';
import { trpc } from '@/lib/trpc/client';
import { cn } from '@/lib/utils';

const TYPE_CONFIG: Record<string, { label: string; icon: typeof FileText; color: string }> = {
  page: { label: 'Page', icon: FileText, color: 'bg-blue-600' },
  blog: { label: 'Blog', icon: FileText, color: 'bg-purple-600' },
  category: { label: 'Category', icon: FolderOpen, color: 'bg-yellow-600' },
  tag: { label: 'Tag', icon: Tag, color: 'bg-green-600' },
};

const DEFAULT_TYPE_CONFIG = { label: 'Content', icon: FileText, color: 'bg-gray-600' };

interface InternalLinkDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (title: string, url: string) => void;
}

function InternalLinkDialog({ isOpen, onClose, onSelect }: InternalLinkDialogProps) {
  const __ = useBlankTranslations();
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const dialogRef = useRef<HTMLDialogElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (isOpen && !dialog.open) {
      dialog.showModal();
      setQuery('');
      setDebouncedQuery('');
      setTimeout(() => inputRef.current?.focus(), 100);
    } else if (!isOpen && dialog.open) {
      dialog.close();
    }
  }, [isOpen]);

  const handleDialogClick = useCallback(
    (e: React.MouseEvent<HTMLDialogElement>) => {
      if (e.target === dialogRef.current) onClose();
    },
    [onClose]
  );

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (query.length < 2) { setDebouncedQuery(''); return; }
    debounceRef.current = setTimeout(() => setDebouncedQuery(query), 400);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query]);

  const { data: results, isLoading } = trpc.contentSearch.search.useQuery(
    { query: debouncedQuery },
    { enabled: debouncedQuery.length >= 2 }
  );

  return (
    <dialog
      ref={dialogRef}
      onClick={handleDialogClick}
      onClose={onClose}
      className="w-full max-w-lg rounded-xl border border-(--border-primary) bg-(--surface-primary) p-0 text-(--text-primary) shadow-xl backdrop:bg-black/50"
    >
      <div className="p-4">
        <h2 className="mb-4 text-lg font-semibold">{__('Insert Internal Link')}</h2>

        <div className="relative">
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-(--text-muted)" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={__('Search pages, blog posts, categories...')}
            className="w-full rounded-lg border border-(--border-primary) bg-(--surface-secondary) py-2 pl-10 pr-4 text-(--text-primary) placeholder:text-(--text-muted) focus:border-blue-500 focus:outline-none"
          />
        </div>

        <div className="mt-4 max-h-80 min-h-[120px] overflow-y-auto">
          {isLoading && debouncedQuery.length >= 2 && (
            <div className="flex items-center justify-center py-8 text-(--text-muted)">
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-(--border-primary) border-t-blue-400" />
              <span className="ml-2">{__('Searching...')}</span>
            </div>
          )}

          {!isLoading && debouncedQuery.length >= 2 && results?.length === 0 && (
            <div className="py-8 text-center text-(--text-muted)">{__('No results found')}</div>
          )}

          {!isLoading && debouncedQuery.length < 2 && (
            <div className="py-8 text-center text-(--text-muted)">{__('Type at least 2 characters to search')}</div>
          )}

          {results && results.length > 0 && (
            <div className="space-y-1">
              {results.map((result, idx) => {
                const config = TYPE_CONFIG[result.type] ?? DEFAULT_TYPE_CONFIG;
                const Icon = config.icon;
                return (
                  <button
                    key={`${result.type}-${result.id}-${idx}`}
                    type="button"
                    onClick={() => onSelect(result.title, result.url)}
                    className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors hover:bg-(--surface-secondary)"
                  >
                    <Icon size={16} className="shrink-0 text-(--text-muted)" />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm text-(--text-primary)">{result.title}</div>
                      <div className="truncate text-xs text-(--text-muted)">{result.url}</div>
                    </div>
                    <span className={cn('shrink-0 rounded px-1.5 py-0.5 text-xs text-white', config.color)}>
                      {__(config.label)}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="mt-4 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-(--border-primary) px-4 py-2 text-sm text-(--text-secondary) transition-colors hover:bg-(--surface-secondary)"
          >
            {__('Cancel')}
          </button>
        </div>
      </div>
    </dialog>
  );
}

export default memo(InternalLinkDialog);
