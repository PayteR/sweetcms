'use client';

import { useState } from 'react';

import Link from 'next/link';
import { Loader2, Plus } from 'lucide-react';

import { type Locale, LOCALES, LOCALE_LABELS } from '@/lib/constants';
import { useBlankTranslations } from '@/lib/translations';
import { toast } from '@/store/toast-store';
import { cn } from '@/lib/utils';

interface Translation {
  id: string;
  lang: string;
  slug: string;
}

interface TranslationBarProps {
  currentLang: string;
  translations: Translation[];
  adminSlug: string;
  onDuplicate: (targetLang: Locale) => Promise<void>;
}

export function TranslationBar({
  currentLang, translations, adminSlug, onDuplicate,
}: TranslationBarProps) {
  const __ = useBlankTranslations();
  const [duplicating, setDuplicating] = useState<string | null>(null);

  const existingLangs = new Set([currentLang, ...translations.map((t) => t.lang)]);
  const missingLangs = LOCALES.filter((l) => !existingLangs.has(l));

  const handleDuplicate = async (lang: Locale) => {
    setDuplicating(lang);
    try {
      await onDuplicate(lang);
    } catch (error) {
      setDuplicating(null);
      const msg = error instanceof Error ? error.message : __('Failed to create translation');
      toast.error(msg);
    }
  };

  return (
    <div>
      <label className="mb-2 block text-sm font-medium text-(--text-secondary)">
        {__('Language')}
      </label>
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-md bg-blue-600 px-3 py-1 text-sm font-medium text-white">
          {LOCALE_LABELS[currentLang as Locale] ?? currentLang}
        </span>

        {translations.map((t) => (
          <Link
            key={t.lang}
            href={`/dashboard/content/${adminSlug}/${t.id}`}
            className="rounded-md border border-(--border-primary) px-3 py-1 text-sm text-(--text-secondary) transition-colors hover:border-blue-500 hover:text-(--text-primary)"
          >
            {LOCALE_LABELS[t.lang as Locale] ?? t.lang}
          </Link>
        ))}

        {missingLangs.map((lang) => (
          <button
            key={lang}
            type="button"
            disabled={duplicating !== null}
            onClick={() => handleDuplicate(lang)}
            className={cn(
              'flex items-center gap-1 rounded-md border border-dashed border-(--border-primary) px-3 py-1 text-sm text-(--text-muted) transition-colors',
              duplicating === lang
                ? 'cursor-wait'
                : 'hover:border-blue-500 hover:text-(--text-secondary)'
            )}
          >
            {duplicating === lang ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <Plus size={14} />
            )}
            {LOCALE_LABELS[lang]}
          </button>
        ))}
      </div>
    </div>
  );
}
