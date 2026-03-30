'use client';

import { useBlankTranslations } from '@/lib/translations';
import { cn } from '@/lib/utils';

interface SEOFieldsProps {
  seoTitle: string;
  metaDescription: string;
  noindex: boolean;
  onSeoTitleChange: (value: string) => void;
  onMetaDescriptionChange: (value: string) => void;
  onNoindexChange: (value: boolean) => void;
  fieldErrors?: Record<string, string[]>;
  focusBorderClass?: string;
}

export function SEOFields({
  seoTitle, metaDescription, noindex,
  onSeoTitleChange, onMetaDescriptionChange, onNoindexChange,
  fieldErrors, focusBorderClass = 'focus:border-blue-500',
}: SEOFieldsProps) {
  const __ = useBlankTranslations();

  return (
    <>
      <div>
        <label className="mb-2 block text-sm font-medium text-(--text-secondary)">
          {__('SEO Title')}
        </label>
        <input
          type="text"
          value={seoTitle}
          onChange={(e) => onSeoTitleChange(e.target.value)}
          placeholder={__('Optional SEO title for <title> tag')}
          maxLength={255}
          className={cn(
            'w-full rounded-lg border bg-(--surface-primary) px-4 py-2 text-(--text-primary) placeholder:text-(--text-muted) focus:outline-none',
            fieldErrors?.seoTitle
              ? 'border-red-500 focus:border-red-500'
              : ['border-(--border-primary)', focusBorderClass]
          )}
        />
        {fieldErrors?.seoTitle ? (
          <p className="mt-1 text-sm text-red-400">{fieldErrors.seoTitle[0]}</p>
        ) : (
          <p className="mt-1 text-xs text-(--text-muted)">{__('Falls back to Title if empty')}</p>
        )}
      </div>

      <div>
        <label className="mb-2 block text-sm font-medium text-(--text-secondary)">
          {__('Meta Description')}
        </label>
        <textarea
          value={metaDescription}
          onChange={(e) => onMetaDescriptionChange(e.target.value)}
          placeholder={__('SEO meta description (max 160 chars)')}
          maxLength={160}
          rows={3}
          className={cn(
            'w-full rounded-lg border bg-(--surface-primary) px-4 py-2 text-(--text-primary) placeholder:text-(--text-muted) focus:outline-none',
            fieldErrors?.metaDescription
              ? 'border-red-500 focus:border-red-500'
              : ['border-(--border-primary)', focusBorderClass]
          )}
        />
        {fieldErrors?.metaDescription ? (
          <p className="mt-1 text-sm text-red-400">{fieldErrors.metaDescription[0]}</p>
        ) : (
          <p className="mt-1 text-xs text-(--text-muted)">{metaDescription.length}/160</p>
        )}
      </div>

      <div>
        <label className="flex items-center gap-2 text-sm font-medium text-(--text-secondary)">
          <input
            type="checkbox"
            checked={noindex}
            onChange={(e) => onNoindexChange(e.target.checked)}
            className="h-4 w-4 rounded border-(--border-primary) bg-(--surface-primary)"
          />
          {__('Noindex')}
        </label>
        <p className="mt-1 text-xs text-(--text-muted)">
          {__('Exclude from search engine indexing (adds noindex meta tag)')}
        </p>
      </div>
    </>
  );
}
