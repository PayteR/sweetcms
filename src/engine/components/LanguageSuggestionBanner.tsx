'use client';

import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { useLocale } from '@/engine/hooks/useLocale';
import { localePath } from '@/engine/lib/locale';
import { usePathname } from 'next/navigation';

const STORAGE_KEY = 'lang-suggestion-dismissed';

/** "View in [language]" in each language — shown in the SUGGESTED locale */
const VIEW_IN: Record<string, string> = {
  en: 'View in English',
  es: 'Ver en Español',
  de: 'Auf Deutsch ansehen',
  fr: 'Voir en Français',
  it: 'Vedi in Italiano',
  pt: 'Ver em Português',
  nl: 'Bekijk in het Nederlands',
  pl: 'Zobacz po polsku',
  cs: 'Zobrazit česky',
  sk: 'Zobraziť po slovensky',
  ja: '日本語で表示',
  ko: '한국어로 보기',
  zh: '查看中文版',
  ru: 'Смотреть на русском',
  uk: 'Переглянути українською',
  tr: 'Türkçe görüntüle',
};

/** Flag emoji for locale codes */
const LOCALE_FLAGS: Record<string, string> = {
  en: '🇬🇧',
  es: '🇪🇸',
  de: '🇩🇪',
  fr: '🇫🇷',
  it: '🇮🇹',
  pt: '🇵🇹',
  nl: '🇳🇱',
  pl: '🇵🇱',
  cs: '🇨🇿',
  sk: '🇸🇰',
  da: '🇩🇰',
  sv: '🇸🇪',
  fi: '🇫🇮',
  no: '🇳🇴',
  hu: '🇭🇺',
  ro: '🇷🇴',
  bg: '🇧🇬',
  el: '🇬🇷',
  tr: '🇹🇷',
  ja: '🇯🇵',
  ko: '🇰🇷',
  zh: '🇨🇳',
  ar: '🇸🇦',
  ru: '🇷🇺',
  uk: '🇺🇦',
};

interface Props {
  /** Available locales in this project */
  locales: readonly string[];
  /** Human-readable labels keyed by locale */
  localeLabels: Record<string, string>;
  /** Default locale (e.g., 'en') */
  defaultLocale: string;
}

/**
 * Detects browser language preference and suggests switching if:
 * - Browser language differs from current page locale
 * - The browser language is available in the project
 * - User hasn't dismissed the suggestion before
 *
 * Shows a slim non-blocking banner below the header with a flag and switch button.
 */
export function LanguageSuggestionBanner({ locales, localeLabels, defaultLocale }: Props) {
  const currentLocale = useLocale();
  const pathname = usePathname();
  const [suggestedLocale, setSuggestedLocale] = useState<string | null>(null);

  useEffect(() => {
    // Already dismissed?
    try {
      const dismissed = localStorage.getItem(STORAGE_KEY);
      if (dismissed) return;
    } catch {
      return;
    }

    // Detect browser language
    const browserLangs = navigator.languages ?? [navigator.language];
    for (const lang of browserLangs) {
      // Try exact match first (e.g., 'de-DE' → 'de'), then base language
      const code = lang.toLowerCase().split('-')[0];
      if (code && code !== currentLocale && locales.includes(code)) {
        setSuggestedLocale(code);
        break;
      }
    }
  }, [currentLocale, locales]);

  function dismiss() {
    setSuggestedLocale(null);
    try {
      localStorage.setItem(STORAGE_KEY, '1');
    } catch { /* quota */ }
  }

  function switchLocale() {
    dismiss();
    // Strip current locale prefix to get base path
    const basePath = currentLocale !== defaultLocale
      ? '/' + pathname.split('/').slice(2).join('/') || '/'
      : pathname;
    window.location.href = localePath(basePath, suggestedLocale as never);
  }

  if (!suggestedLocale) return null;

  const flag = LOCALE_FLAGS[suggestedLocale] ?? '🌐';
  const label = localeLabels[suggestedLocale] ?? suggestedLocale;

  return (
    <div className="lang-suggestion-banner flex items-center justify-center gap-2.5 border-b border-(--border-primary) bg-(--surface-secondary) px-4 py-2 text-sm">
      <span className="text-base leading-none">{flag}</span>
      <span className="font-medium text-(--text-primary)">{label}</span>
      <button
        onClick={switchLocale}
        className="rounded-md bg-brand-500 px-3 py-1 text-xs font-medium text-white transition-colors hover:bg-brand-600"
      >
        {label}
      </button>
      <button
        onClick={dismiss}
        className="rounded p-0.5 text-(--text-muted) transition-colors hover:text-(--text-secondary)"
        aria-label="Dismiss"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
