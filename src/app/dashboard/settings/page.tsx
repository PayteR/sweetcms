'use client';

import { useEffect, useState } from 'react';
import { Save, Loader2, CheckCircle2, XCircle, Globe } from 'lucide-react';

import { trpc } from '@/lib/trpc/client';
import { useBlankTranslations } from '@/lib/translations';
import { toast } from '@/store/toast-store';
import { SeoOverridesDialog } from '@/components/admin/SeoOverridesDialog';

interface SiteSettings {
  'site.name': string;
  'site.tagline': string;
  'site.description': string;
  'site.url': string;
  'site.logo': string;
  'site.favicon': string;
  'site.social.twitter': string;
  'site.social.github': string;
  'site.analytics.ga_id': string;
  'site.posts_per_page': number;
  'site.allow_registration': boolean;
  'ga4.propertyId': string;
  'ga4.serviceAccountJson': string;
}

const DEFAULT_SETTINGS: SiteSettings = {
  'site.name': '',
  'site.tagline': '',
  'site.description': '',
  'site.url': '',
  'site.logo': '',
  'site.favicon': '',
  'site.social.twitter': '',
  'site.social.github': '',
  'site.analytics.ga_id': '',
  'site.posts_per_page': 10,
  'site.allow_registration': true,
  'ga4.propertyId': '',
  'ga4.serviceAccountJson': '',
};

export default function SettingsPage() {
  const __ = useBlankTranslations();
  const utils = trpc.useUtils();

  const [settings, setSettings] = useState<SiteSettings>(DEFAULT_SETTINGS);
  const [loaded, setLoaded] = useState(false);

  const allOptions = trpc.options.getAll.useQuery();
  const setMany = trpc.options.setMany.useMutation({
    onSuccess: () => {
      toast.success(__('Settings saved'));
      utils.options.getAll.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const testGA4 = trpc.analytics.testConnection.useMutation({
    onSuccess: () => toast.success(__('GA4 connection successful')),
    onError: (err) => toast.error(err.message),
  });

  const [seoDialogOpen, setSeoDialogOpen] = useState(false);
  const createSeoOverrides = trpc.cms.createMissingSeoOverrides.useMutation({
    onSuccess: (data) => {
      toast.success(__(`Created ${data.created} SEO override page(s)`));
      setSeoDialogOpen(false);
    },
    onError: (err) => toast.error(err.message),
  });

  useEffect(() => {
    if (allOptions.data && !loaded) {
      const data = allOptions.data as Record<string, unknown>;
      setSettings((prev) => {
        const next = { ...prev };
        for (const key of Object.keys(DEFAULT_SETTINGS) as (keyof SiteSettings)[]) {
          if (key in data) {
            (next as Record<string, unknown>)[key] = data[key];
          }
        }
        return next;
      });
      setLoaded(true);
    }
  }, [allOptions.data, loaded]);

  function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setMany.mutate({ options: settings as unknown as Record<string, unknown> });
  }

  function updateField(key: keyof SiteSettings, value: string | number | boolean) {
    setSettings((prev) => ({ ...prev, [key]: value }));
  }

  if (allOptions.isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-(--text-muted)" />
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-(--text-primary)">{__('Settings')}</h1>
        <button
          type="submit"
          form="settings-form"
          disabled={setMany.isPending}
          className="admin-btn admin-btn-primary disabled:opacity-50"
        >
          {setMany.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Save className="h-4 w-4" />
          )}
          {__('Save')}
        </button>
      </div>

      <form id="settings-form" onSubmit={handleSave} className="mt-6 space-y-6">
        {/* General */}
        <div className="admin-card p-6">
          <h2 className="admin-h2">{__('General')}</h2>
          <div className="mt-4 space-y-4">
            <div>
              <label className="block text-sm font-medium text-(--text-secondary)">
                {__('Site Name')}
              </label>
              <input
                type="text"
                value={settings['site.name']}
                onChange={(e) => updateField('site.name', e.target.value)}
                className="mt-1 block w-full rounded-md border border-(--border-primary) px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                placeholder="My Website"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-(--text-secondary)">
                {__('Tagline')}
              </label>
              <input
                type="text"
                value={settings['site.tagline']}
                onChange={(e) => updateField('site.tagline', e.target.value)}
                className="mt-1 block w-full rounded-md border border-(--border-primary) px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                placeholder={__('A brief description of your site')}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-(--text-secondary)">
                {__('Description')}
              </label>
              <textarea
                value={settings['site.description']}
                onChange={(e) => updateField('site.description', e.target.value)}
                rows={3}
                className="mt-1 block w-full rounded-md border border-(--border-primary) px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-(--text-secondary)">
                {__('Site URL')}
              </label>
              <input
                type="url"
                value={settings['site.url']}
                onChange={(e) => updateField('site.url', e.target.value)}
                className="mt-1 block w-full rounded-md border border-(--border-primary) px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                placeholder="https://example.com"
              />
            </div>
          </div>
        </div>

        {/* Branding */}
        <div className="admin-card p-6">
          <h2 className="admin-h2">{__('Branding')}</h2>
          <div className="mt-4 space-y-4">
            <div>
              <label className="block text-sm font-medium text-(--text-secondary)">
                {__('Logo URL')}
              </label>
              <input
                type="text"
                value={settings['site.logo']}
                onChange={(e) => updateField('site.logo', e.target.value)}
                className="mt-1 block w-full rounded-md border border-(--border-primary) px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                placeholder="https://..."
              />
              {settings['site.logo'] && (
                <img
                  src={settings['site.logo']}
                  alt="Logo preview"
                  className="mt-2 h-12 object-contain"
                />
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-(--text-secondary)">
                {__('Favicon URL')}
              </label>
              <input
                type="text"
                value={settings['site.favicon']}
                onChange={(e) => updateField('site.favicon', e.target.value)}
                className="mt-1 block w-full rounded-md border border-(--border-primary) px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                placeholder="https://..."
              />
            </div>
          </div>
        </div>

        {/* Social & Analytics */}
        <div className="admin-card p-6">
          <h2 className="admin-h2">{__('Social & Analytics')}</h2>
          <div className="mt-4 space-y-4">
            <div>
              <label className="block text-sm font-medium text-(--text-secondary)">
                {__('Twitter / X Handle')}
              </label>
              <input
                type="text"
                value={settings['site.social.twitter']}
                onChange={(e) => updateField('site.social.twitter', e.target.value)}
                className="mt-1 block w-full rounded-md border border-(--border-primary) px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                placeholder="@yourhandle"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-(--text-secondary)">
                {__('GitHub URL')}
              </label>
              <input
                type="text"
                value={settings['site.social.github']}
                onChange={(e) => updateField('site.social.github', e.target.value)}
                className="mt-1 block w-full rounded-md border border-(--border-primary) px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                placeholder="https://github.com/..."
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-(--text-secondary)">
                {__('Google Analytics ID')}
              </label>
              <input
                type="text"
                value={settings['site.analytics.ga_id']}
                onChange={(e) => updateField('site.analytics.ga_id', e.target.value)}
                className="mt-1 block w-full rounded-md border border-(--border-primary) px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                placeholder="G-XXXXXXXXXX"
              />
            </div>
          </div>
        </div>

        {/* Google Analytics 4 */}
        <div className="admin-card p-6">
          <h2 className="admin-h2">{__('Google Analytics 4 (Dashboard)')}</h2>
          <p className="mt-1 text-xs text-(--text-muted)">
            {__('Connect a GA4 property to display analytics on the dashboard. Requires a service account with Analytics read access.')}
          </p>
          <div className="mt-4 space-y-4">
            <div>
              <label className="block text-sm font-medium text-(--text-secondary)">
                {__('GA4 Property ID')}
              </label>
              <input
                type="text"
                value={settings['ga4.propertyId']}
                onChange={(e) => updateField('ga4.propertyId', e.target.value)}
                className="mt-1 block w-full rounded-md border border-(--border-primary) px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                placeholder="123456789"
              />
              <p className="mt-1 text-xs text-(--text-muted)">
                {__('Found in GA4 Admin > Property Settings > Property ID')}
              </p>
            </div>
            <div>
              <label className="block text-sm font-medium text-(--text-secondary)">
                {__('Service Account JSON')}
              </label>
              <textarea
                value={settings['ga4.serviceAccountJson']}
                onChange={(e) =>
                  updateField('ga4.serviceAccountJson', e.target.value)
                }
                rows={4}
                className="mt-1 block w-full rounded-md border border-(--border-primary) px-3 py-2 font-mono text-xs focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                placeholder='{"type":"service_account","project_id":"...","private_key":"...","client_email":"..."}'
              />
              <p className="mt-1 text-xs text-(--text-muted)">
                {__('Paste the full JSON key file contents from Google Cloud Console.')}
              </p>
            </div>
            <div>
              <button
                type="button"
                disabled={testGA4.isPending || !settings['ga4.propertyId'] || !settings['ga4.serviceAccountJson']}
                onClick={() => testGA4.mutate()}
                className="admin-btn admin-btn-secondary disabled:opacity-50"
              >
                {testGA4.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : testGA4.isSuccess ? (
                  <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400" />
                ) : testGA4.isError ? (
                  <XCircle className="h-4 w-4 text-red-600 dark:text-red-400" />
                ) : null}
                {__('Test Connection')}
              </button>
            </div>
          </div>
        </div>

        {/* Reading */}
        <div className="admin-card p-6">
          <h2 className="admin-h2">{__('Reading')}</h2>
          <div className="mt-4 space-y-4">
            <div>
              <label className="block text-sm font-medium text-(--text-secondary)">
                {__('Posts per page')}
              </label>
              <input
                type="number"
                min={1}
                max={100}
                value={settings['site.posts_per_page']}
                onChange={(e) =>
                  updateField('site.posts_per_page', Number(e.target.value))
                }
                className="mt-1 block w-32 rounded-md border border-(--border-primary) px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={settings['site.allow_registration']}
                onChange={(e) =>
                  updateField('site.allow_registration', e.target.checked)
                }
                className="rounded border-(--border-primary)"
              />
              {__('Allow user registration')}
            </label>
          </div>
        </div>
        {/* SEO Overrides */}
        <div className="admin-card p-6">
          <h2 className="admin-h2">{__('SEO Overrides')}</h2>
          <p className="mt-1 text-sm text-(--text-muted)">
            {__('Create CMS pages to override SEO metadata for coded routes (homepage, login, etc.).')}
          </p>
          <div className="mt-4">
            <button
              type="button"
              onClick={() => setSeoDialogOpen(true)}
              className="admin-btn admin-btn-secondary"
            >
              <Globe className="h-4 w-4" />
              {__('Manage SEO Overrides')}
            </button>
          </div>
        </div>
      </form>

      <SeoOverridesDialog
        open={seoDialogOpen}
        onClose={() => setSeoDialogOpen(false)}
        onConfirm={(selected) => createSeoOverrides.mutate({ routes: selected })}
        isPending={createSeoOverrides.isPending}
      />
    </div>
  );
}
