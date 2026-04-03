/**
 * Translation helpers — powered by next-intl.
 *
 * `useBlankTranslations(namespace?)` — client components (React hook).
 * `getServerTranslations(namespace?)` — server components / route handlers (async).
 * `dataTranslations(namespace)` — module-scope extraction marker (identity at runtime).
 *
 * The PO→JSON pipeline replaces dots with @@@ in keys, so we apply the same
 * transform at lookup time to match.
 */

// eslint-disable-next-line no-restricted-imports
import { useTranslations as useBaseTranslations, type Formats } from 'next-intl';
import { getTranslations as getBaseTranslations } from 'next-intl/server';

export type TranslationFn = (
  key: string,
  values?: Record<string, string | number | Date>,
  formats?: Formats
) => string;

const createTranslationFunction = (
  t: (
    key: string,
    values?: Record<string, string | number | Date>,
    formats?: Formats
  ) => string
): TranslationFn => {
  return (key, values, formats) => {
    const transformedKey = key.replace(/\./g, '@@@');
    return t(transformedKey, values, formats);
  };
};

/** Client-side translation hook — wraps next-intl's useTranslations */
export const useBlankTranslations = (
  namespace: string = 'General'
): TranslationFn => {
  const t = useBaseTranslations(namespace);
  return createTranslationFunction(t);
};

/** Alias for useBlankTranslations */
export const useTranslations = useBlankTranslations;

/** Server-side translation function — wraps next-intl's getTranslations */
export const getServerTranslations = async (
  namespace: string = 'General'
): Promise<TranslationFn> => {
  const t = await getBaseTranslations(namespace);
  return createTranslationFunction(t);
};

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
