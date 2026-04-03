/**
 * Shared translation types and utilities.
 *
 * This file is safe for both client and server imports — it contains no
 * React hooks or server-only dependencies.
 */

import type { Formats } from 'next-intl';

export type TranslationFn = (
  key: string,
  values?: Record<string, string | number | Date>,
  formats?: Formats
) => string;

/**
 * Wraps a next-intl translation function to apply the dot→@@@ key transform.
 * The PO→JSON pipeline replaces dots with @@@ (because next-intl uses dots
 * for nested key access), so we do the same at lookup time.
 */
export const createTranslationFunction = (
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
