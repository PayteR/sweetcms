/**
 * Translation helpers — client-safe, powered by next-intl.
 *
 * `useBlankTranslations(namespace?)` — client components (React hook).
 * `dataTranslations(namespace)` — module-scope extraction marker (identity at runtime).
 *
 * For server components, use `getServerTranslations` from
 * `@/engine/lib/translations-server` (or the re-export at `@/lib/translations-server`).
 *
 * The PO→JSON pipeline replaces dots with @@@ in keys, so we apply the same
 * transform at lookup time to match.
 */

// eslint-disable-next-line no-restricted-imports
import { useTranslations as useBaseTranslations } from 'next-intl';
import { createTranslationFunction, type TranslationFn } from './translation-utils';

export type { TranslationFn } from './translation-utils';

/** Client-side translation hook — wraps next-intl's useTranslations with safe fallback */
export const useAdminTranslations = (
  namespace: string = 'General'
): TranslationFn => {
  const t = useBaseTranslations(namespace);
  const wrapped = createTranslationFunction(t);
  return (key, values, formats) => {
    try {
      return wrapped(key, values, formats);
    } catch {
      // Missing key — return the raw key (reverse @@@ transform if present)
      return key.replace(/@@@/g, '.');
    }
  };
};

/**
 * No-op translation hook — returns the key as-is without lookup.
 * Useful for system messages, debug UI, or components that should
 * not go through the translation pipeline.
 */
export const useBlankTranslations = (): TranslationFn => blankTranslator;

/** Alias */
export const useTranslations = useAdminTranslations;

const blankTranslator: TranslationFn = (key) => key;

/**
 * Module-scope extraction marker — identity function at runtime.
 *
 * Use for translatable strings in data constants outside components/handlers.
 * The generate-po script extracts these keys under the given namespace.
 * At render time, translate via `useBlankTranslations(sameNamespace)`.
 */
export const dataTranslations = (_namespace: string): TranslationFn =>
  blankTranslator;
