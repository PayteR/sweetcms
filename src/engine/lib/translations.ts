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

/** Client-side translation hook — wraps next-intl's useTranslations */
export const useBlankTranslations = (
  namespace: string = 'General'
): TranslationFn => {
  const t = useBaseTranslations(namespace);
  return createTranslationFunction(t);
};

/** Alias for useBlankTranslations */
export const useTranslations = useBlankTranslations;

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
