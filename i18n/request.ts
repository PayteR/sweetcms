import { headers } from 'next/headers';
import { getRequestConfig } from 'next-intl/server';
import { DEFAULT_LOCALE, LOCALES, type Locale } from '@/lib/constants';

export default getRequestConfig(async () => {
  const h = await headers();
  const raw = h.get('x-locale') || DEFAULT_LOCALE;
  const locale: Locale = (LOCALES as readonly string[]).includes(raw)
    ? (raw as Locale)
    : DEFAULT_LOCALE;

  // Graceful import: if JSON hasn't been generated yet (fresh clone before
  // running `bun generate-po && bun transform:po`), fall back to empty messages.
  let messages = {};
  try {
    messages = (await import(`../locales/build/${locale}.json`)).default;
  } catch {
    // JSON not generated yet — translations will fall back to English keys.
  }

  return {
    locale,
    messages,

    // Graceful fallback: return the raw key instead of crashing on missing translations.
    // In dev this logs a warning; in prod it silently falls back to the key string.
    onError(error) {
      if (error.code === 'MISSING_MESSAGE') return;
      console.error('[next-intl]', error.message);
    },
    getMessageFallback({ key, namespace }) {
      // Reverse the dot→@@@ transform to return a human-readable fallback
      const fullKey = namespace ? `${namespace}.${key}` : key;
      return fullKey.replace(/@@@/g, '.');
    },
  };
});
