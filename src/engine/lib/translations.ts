/**
 * Translation helpers.
 *
 * For now, SweetCMS uses blank translations (passthrough).
 * When i18n is enabled with next-intl, swap to the real implementations.
 */

type TranslationFn = (
  key: string,
  values?: Record<string, string | number | Date>
) => string;

const blankTranslator: TranslationFn = (key) => key;

/** Admin components use blank translations — returns key as-is */
export const useBlankTranslations = (): TranslationFn => blankTranslator;

/** Module-scope extraction marker — identity function at runtime */
export const dataTranslations = (_namespace: string): TranslationFn =>
  blankTranslator;
