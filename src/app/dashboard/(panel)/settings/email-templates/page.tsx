'use client';

import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Loader2, RotateCcw, Save } from 'lucide-react';

import { trpc } from '@/lib/trpc/client';
import { useAdminTranslations } from '@/lib/translations';
import { toast } from '@/store/toast-store';
import { cn } from '@/lib/utils';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import type { TemplateName } from '@/server/jobs/email';

const TEMPLATES: { name: TemplateName; label: string; variables: string[] }[] = [
  {
    name: 'welcome',
    label: 'Welcome',
    variables: ['name', 'email', 'siteName', 'loginUrl'],
  },
  {
    name: 'password-reset',
    label: 'Password Reset',
    variables: ['name', 'resetUrl', 'siteName'],
  },
  {
    name: 'invitation',
    label: 'Organization Invitation',
    variables: ['organizationName', 'inviteUrl', 'appUrl'],
  },
  {
    name: 'payment-failed',
    label: 'Payment Failed',
    variables: ['planName', 'billingUrl', 'appUrl'],
  },
  {
    name: 'subscription-activated',
    label: 'Subscription Activated',
    variables: ['planName', 'billingUrl', 'appUrl'],
  },
];

export default function EmailTemplatesPage() {
  const __ = useAdminTranslations();
  const utils = trpc.useUtils();
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const [editing, setEditing] = useState<TemplateName | null>(null);
  const [subject, setSubject] = useState('');
  const [html, setHtml] = useState('');
  const [resetTarget, setResetTarget] = useState<TemplateName | null>(null);

  const templateOptions = trpc.options.getByPrefix.useQuery(
    { prefix: 'email.template.' },
    { enabled: true }
  );

  const setOption = trpc.options.set.useMutation({
    onSuccess: () => {
      toast.success(__('Template saved'));
      utils.options.getByPrefix.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const deleteOption = trpc.options.delete.useMutation({
    onSuccess: () => {
      toast.success(__('Template reset to default'));
      utils.options.getByPrefix.invalidate();
      setEditing(null);
    },
    onError: (err) => toast.error(err.message),
  });

  // Load template data when editing changes
  useEffect(() => {
    if (!editing || !templateOptions.data) return;

    const key = `email.template.${editing}`;
    const existing = templateOptions.data as Record<string, unknown>;
    const override = existing[key] as
      | { subject?: string; html?: string }
      | undefined;

    // eslint-disable-next-line react-hooks/set-state-in-effect -- populate form from server data
    setSubject(override?.subject ?? '');
    setHtml(override?.html ?? '');
  }, [editing, templateOptions.data]);

  // Update preview iframe when html changes
  useEffect(() => {
    if (iframeRef.current && html) {
      const doc = iframeRef.current.contentDocument;
      if (doc) {
        doc.open();
        doc.write(html);
        doc.close();
      }
    }
  }, [html]);

  function getOverrideStatus(name: TemplateName): boolean {
    if (!templateOptions.data) return false;
    const data = templateOptions.data as Record<string, unknown>;
    return !!data[`email.template.${name}`];
  }

  function handleSave() {
    if (!editing) return;
    setOption.mutate({
      key: `email.template.${editing}`,
      value: { subject, html },
    });
  }

  function handleReset() {
    if (!resetTarget) return;
    deleteOption.mutate({ key: `email.template.${resetTarget}` });
    setResetTarget(null);
  }

  if (templateOptions.isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-(--text-muted)" />
      </div>
    );
  }

  if (editing) {
    const template = TEMPLATES.find((t) => t.name === editing)!;
    return (
      <main className="dash-main"><div className="dash-inner email-editor-page">
        <div className="email-templates-header flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setEditing(null)}
              className="btn btn-secondary"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
            <h1 className="text-2xl font-bold text-(--text-primary)">
              {__('Edit: {label}', { label: template.label })}
            </h1>
          </div>
          <div className="flex gap-2">
            {getOverrideStatus(editing) && (
              <button
                onClick={() => setResetTarget(editing)}
                className="btn btn-secondary"
              >
                <RotateCcw className="h-4 w-4" />
                {__('Reset to Default')}
              </button>
            )}
            <button
              onClick={handleSave}
              disabled={setOption.isPending}
              className="btn btn-primary disabled:opacity-50"
            >
              {setOption.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              {__('Save')}
            </button>
          </div>
        </div>

        <div className="mt-6 space-y-4">
          <div className="card p-4">
            <label className="block text-sm font-medium text-(--text-secondary)">
              {__('Subject')}
            </label>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="input mt-1"
              placeholder={__('Email subject line')}
            />
          </div>

          <div className="card p-4">
            <label className="block text-sm font-medium text-(--text-secondary)">
              {__('HTML Body')}
            </label>
            <textarea
              value={html}
              onChange={(e) => setHtml(e.target.value)}
              rows={16}
              className="textarea mt-1 font-mono text-xs"
              placeholder="<html>...</html>"
            />
          </div>

          <div className="card p-4">
            <p className="text-sm font-medium text-(--text-secondary)">
              {__('Available Variables')}
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {template.variables.map((v) => (
                <code
                  key={v}
                  className="rounded bg-(--surface-secondary) px-2 py-0.5 text-xs text-(--text-secondary)"
                >
                  {`{{${v}}}`}
                </code>
              ))}
            </div>
          </div>

          {html && (
            <div className="card p-4">
              <p className="text-sm font-medium text-(--text-secondary)">
                {__('Preview')}
              </p>
              <iframe
                ref={iframeRef}
                title="Email preview"
                className="mt-2 h-80 w-full rounded border border-(--border-primary) bg-white"
                sandbox=""
              />
            </div>
          )}
        </div>

        <ConfirmDialog
          open={!!resetTarget}
          title={__('Reset to default?')}
          message={__('This will remove your customizations and revert to the file-based template.')}
          confirmLabel={__('Reset')}
          variant="danger"
          onConfirm={handleReset}
          onCancel={() => setResetTarget(null)}
        />
      </div></main>
    );
  }

  return (
    <main className="dash-main"><div className="dash-inner email-templates-page">
      <h1 className="text-2xl font-bold text-(--text-primary)">
        {__('Email Templates')}
      </h1>
      <p className="mt-1 text-sm text-(--text-muted)">
        {__('Customize email templates. Overrides are stored in the database; unmodified templates use the default file.')}
      </p>

      <div className="email-templates-cards mt-6 grid gap-4 sm:grid-cols-2">
        {TEMPLATES.map((t) => {
          const hasOverride = getOverrideStatus(t.name);
          return (
            <button
              key={t.name}
              onClick={() => setEditing(t.name)}
              className="card p-4 text-left transition-shadow hover:ring-1 hover:ring-(--color-brand-400)"
            >
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-(--text-primary)">
                  {__(t.label)}
                </h3>
                <span
                  className={cn(
                    'rounded-full px-2 py-0.5 text-xs font-medium',
                    hasOverride
                      ? 'bg-(--color-brand-100) dark:bg-[oklch(0.65_0.17_var(--brand-hue)_/_0.15)] text-(--color-brand-700) dark:text-(--color-brand-400)'
                      : 'bg-(--surface-secondary) text-(--text-muted)'
                  )}
                >
                  {hasOverride ? __('Custom') : __('Default')}
                </span>
              </div>
              <p className="mt-1 text-xs text-(--text-muted)">
                {__('Variables: {vars}', { vars: t.variables.map((v) => `{{${v}}}`).join(', ') })}
              </p>
            </button>
          );
        })}
      </div>
    </div></main>
  );
}
