/**
 * User preference keys and their value types.
 * Extensible — add new keys as needed.
 */

export type PreferenceKey =
  | 'dashboard.widgetOrder'
  | 'dashboard.hiddenWidgets'
  | 'dashboard.widgetSpans'
  | 'theme.admin'
  | `listView.columns.${string}`;

/** Value types mapped per preference key */
export type PreferenceValueMap = {
  'dashboard.widgetOrder': string[];
  'dashboard.hiddenWidgets': string[];
  'dashboard.widgetSpans': Record<string, number>;
  'theme.admin': string;
  [key: `listView.columns.${string}`]: string[];
};

/** Generic preference data bag */
export type PreferenceData = Record<string, unknown>;
