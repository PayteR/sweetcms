import { headers } from 'next/headers';
import { getRequestConfig } from 'next-intl/server';
import { DEFAULT_LOCALE, LOCALES, type Locale } from '@/lib/constants';

export default getRequestConfig(async () => {
  const h = await headers();
  const raw = h.get('x-locale') || DEFAULT_LOCALE;
  const locale: Locale = (LOCALES as readonly string[]).includes(raw)
    ? (raw as Locale)
    : DEFAULT_LOCALE;

  return {
    locale,
    messages: (await import(`../locales/build/${locale}.json`)).default,

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
