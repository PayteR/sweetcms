import type { Logger } from '@/lib/logger';

import { translate } from './translation-service';

/**
 * Creates a field translator that translates non-null strings
 * and falls back to the original value on failure.
 */
export function createFieldTranslator(
  targetLang: string,
  sourceLang: string,
  logger: Logger
) {
  async function safeTranslate(
    field: string,
    value: null
  ): Promise<null>;
  async function safeTranslate(
    field: string,
    value: string
  ): Promise<string>;
  async function safeTranslate(
    field: string,
    value: string | null
  ): Promise<string | null>;
  async function safeTranslate(
    field: string,
    value: string | null
  ): Promise<string | null> {
    if (!value) return value;
    try {
      return await translate(value, targetLang, sourceLang);
    } catch (e) {
      logger.warn(`Translation failed for "${field}"`, {
        error: String(e),
      });
      return value;
    }
  }

  return safeTranslate;
}
