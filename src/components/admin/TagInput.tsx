'use client';

import { useState, useRef, useEffect } from 'react';
import { X, Loader2 } from 'lucide-react';

import { trpc } from '@/lib/trpc/client';
import { useBlankTranslations } from '@/lib/translations';

interface Props {
  selectedTagIds: string[];
  onChange: (tagIds: string[]) => void;
  lang?: string;
}

interface TagOption {
  id: string;
  name: string;
  slug: string;
}

export function TagInput({ selectedTagIds, onChange, lang = 'en' }: Props) {
  const __ = useBlankTranslations();
  const [inputValue, setInputValue] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Track selected tags with full info
  const [selectedTags, setSelectedTags] = useState<TagOption[]>([]);

  // Debounce search input
  const [debouncedQuery, setDebouncedQuery] = useState('');
  useEffect(() => {
    if (inputValue.length < 1) {
      setDebouncedQuery('');
      return;
    }
    const timer = setTimeout(() => setDebouncedQuery(inputValue), 250);
    return () => clearTimeout(timer);
  }, [inputValue]);

  // Search for autocomplete
  const searchQuery = trpc.tags.search.useQuery(
    { query: debouncedQuery, lang, limit: 10 },
    { enabled: debouncedQuery.length >= 1 }
  );

  // Get or create mutation
  const getOrCreate = trpc.tags.getOrCreate.useMutation();

  // Resolve selected tag IDs to full info
  const resolvedTags = trpc.tags.getByIds.useQuery(
    { ids: selectedTagIds },
    { enabled: selectedTagIds.length > 0 }
  );

  // Sync selected tags when resolved data loads or selectedTagIds change
  useEffect(() => {
    if (resolvedTags.data) {
      // Preserve order of selectedTagIds
      const tagMap = new Map(resolvedTags.data.map((t) => [t.id, t]));
      const ordered = selectedTagIds
        .map((id) => tagMap.get(id))
        .filter((t): t is TagOption => !!t);
      setSelectedTags(ordered);
    }
  }, [resolvedTags.data, selectedTagIds]);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setShowDropdown(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  async function addTag(tag: TagOption) {
    if (!selectedTagIds.includes(tag.id)) {
      onChange([...selectedTagIds, tag.id]);
      setSelectedTags((prev) => [...prev, tag]);
    }
    setInputValue('');
    setShowDropdown(false);
    inputRef.current?.focus();
  }

  async function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && inputValue.trim()) {
      e.preventDefault();
      const result = await getOrCreate.mutateAsync({
        name: inputValue.trim(),
        lang,
      });
      addTag({ id: result.id, name: result.name, slug: result.slug });
    }
  }

  function removeTag(tagId: string) {
    onChange(selectedTagIds.filter((id) => id !== tagId));
    setSelectedTags((prev) => prev.filter((t) => t.id !== tagId));
  }

  const suggestions = (searchQuery.data ?? []).filter(
    (t) => !selectedTagIds.includes(t.id)
  );

  return (
    <div ref={containerRef} className="relative">
      {/* Selected tags */}
      {selectedTags.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {selectedTags.map((tag) => (
            <span
              key={tag.id}
              className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-medium text-blue-700"
            >
              {tag.name}
              <button
                type="button"
                onClick={() => removeTag(tag.id)}
                className="ml-0.5 rounded-full p-0.5 hover:bg-blue-200"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Input */}
      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          value={inputValue}
          onChange={(e) => {
            setInputValue(e.target.value);
            setShowDropdown(true);
          }}
          onFocus={() => inputValue.length >= 1 && setShowDropdown(true)}
          onKeyDown={handleKeyDown}
          placeholder={__('Type to add tags...')}
          className="block w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
        {getOrCreate.isPending && (
          <Loader2 className="absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-gray-400" />
        )}
      </div>

      {/* Autocomplete dropdown */}
      {showDropdown && inputValue.length >= 1 && (
        <div className="absolute z-10 mt-1 max-h-48 w-full overflow-auto rounded-md border border-gray-200 bg-white shadow-lg">
          {searchQuery.isLoading ? (
            <div className="flex items-center justify-center py-3">
              <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
            </div>
          ) : suggestions.length > 0 ? (
            suggestions.map((tag) => (
              <button
                key={tag.id}
                type="button"
                onClick={() => addTag(tag)}
                className="block w-full px-3 py-1.5 text-left text-sm hover:bg-gray-50"
              >
                {tag.name}
              </button>
            ))
          ) : (
            <div className="px-3 py-2 text-xs text-gray-400">
              {__('Press Enter to create "')}
              {inputValue}
              {__('"')}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
