import type { OptionDefinition } from '@/engine/config/options';

export type { OptionDefinition } from '@/engine/config/options';

export const GROUP_LABELS: Record<string, string> = {
  general: 'General',
  branding: 'Branding',
  social: 'Social & Analytics',
  ga4: 'Google Analytics 4 (Dashboard)',
  reading: 'Reading',
};

export const OPTION_REGISTRY: OptionDefinition[] = [
  // ─── General ────────────────────────────────────────────────────────────────
  { key: 'site.name', label: 'Site Name', group: 'general', type: 'text', defaultValue: '' },
  { key: 'site.tagline', label: 'Tagline', group: 'general', type: 'text', defaultValue: '' },
  { key: 'site.description', label: 'Description', group: 'general', type: 'textarea', defaultValue: '' },
  { key: 'site.url', label: 'Site URL', group: 'general', type: 'url', defaultValue: '' },

  // ─── Branding ───────────────────────────────────────────────────────────────
  { key: 'site.logo', label: 'Logo URL', group: 'branding', type: 'url', defaultValue: '' },
  { key: 'site.favicon', label: 'Favicon URL', group: 'branding', type: 'url', defaultValue: '' },

  // ─── Social & Analytics ─────────────────────────────────────────────────────
  { key: 'site.social.twitter', label: 'Twitter / X Handle', group: 'social', type: 'text', defaultValue: '' },
  { key: 'site.social.github', label: 'GitHub URL', group: 'social', type: 'url', defaultValue: '' },
  { key: 'site.analytics.ga_id', label: 'Google Analytics ID', group: 'social', type: 'text', defaultValue: '' },

  // ─── GA4 (Dashboard) ───────────────────────────────────────────────────────
  {
    key: 'ga4.propertyId',
    label: 'GA4 Property ID',
    description: 'Found in GA4 Admin > Property Settings > Property ID',
    group: 'ga4',
    type: 'text',
    defaultValue: '',
  },
  {
    key: 'ga4.serviceAccountJson',
    label: 'Service Account JSON',
    description: 'Paste the full JSON key file contents from Google Cloud Console.',
    group: 'ga4',
    type: 'json',
    defaultValue: '',
  },

  // ─── Reading ────────────────────────────────────────────────────────────────
  { key: 'site.posts_per_page', label: 'Posts per page', group: 'reading', type: 'number', defaultValue: 10 },
  { key: 'site.allow_registration', label: 'Allow user registration', group: 'reading', type: 'boolean', defaultValue: true },
];
