/** Milliseconds in one day */
export const DAY_MS = 24 * 60 * 60 * 1000;

/** Default locale */
export const DEFAULT_LOCALE = 'en';

/** Supported locales */
export const LOCALES = ['en', 'es', 'de'] as const;
export type Locale = (typeof LOCALES)[number];

/** Human-readable labels for each locale */
export const LOCALE_LABELS: Record<Locale, string> = {
  en: 'English',
  es: 'Español',
  de: 'Deutsch',
};

/**
 * Whether multi-org UI is visible to users (OrgSwitcher, org management).
 * When false, a personal org is still created automatically under the hood
 * so billing/tokens work — the user just never sees org-related UI.
 */
export const ORGANIZATIONS_VISIBLE = process.env.NEXT_PUBLIC_ORGANIZATIONS_VISIBLE !== 'false';
