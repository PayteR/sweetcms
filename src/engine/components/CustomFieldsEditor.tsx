'use client';

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import { Loader2 } from 'lucide-react';

import { trpc } from '@/lib/trpc/client';
import { useBlankTranslations } from '@/lib/translations';
import { useSession } from '@/lib/auth-client';

export interface CustomFieldsEditorHandle {
  save: (contentId: string) => Promise<void>;
}

interface CustomFieldsEditorProps {
  contentType: string;
  contentId?: string;
}

export const CustomFieldsEditor = forwardRef<
  CustomFieldsEditorHandle,
  CustomFieldsEditorProps
>(function CustomFieldsEditor({ contentType, contentId }, ref) {
  const __ = useBlankTranslations();
  const { data: session } = useSession();

  const [values, setValues] = useState<Record<string, unknown>>({});
  const [loaded, setLoaded] = useState(false);
  const prevContentIdRef = useRef(contentId);

  const definitions = trpc.customFields.listForContentType.useQuery(
    { contentType },
    { enabled: !!session }
  );

  const existingValues = trpc.customFields.getValues.useQuery(
    { contentType, contentId: contentId! },
    { enabled: !!contentId && !!session }
  );

  const saveValues = trpc.customFields.saveValues.useMutation();

  // Initialize values from server when data arrives or contentId changes
  useEffect(() => {
    if (existingValues.data && (!loaded || prevContentIdRef.current !== contentId)) {
      setValues(existingValues.data);
      setLoaded(true);
      prevContentIdRef.current = contentId;
    }
  }, [existingValues.data, loaded, contentId]);

  // Reset loaded state when contentId changes (e.g. navigating to new form)
  useEffect(() => {
    if (!contentId) {
      setValues({});
      setLoaded(false);
    }
  }, [contentId]);

  const handleFieldChange = useCallback(
    (slug: string, value: unknown) => {
      setValues((prev) => ({ ...prev, [slug]: value }));
    },
    []
  );

  // Stable ref to current values to avoid useCallback dependency on `values`
  const valuesRef = useRef(values);
  valuesRef.current = values;

  const saveValuesRef = useRef(saveValues.mutateAsync);
  saveValuesRef.current = saveValues.mutateAsync;

  const save = useCallback(
    async (targetContentId: string) => {
      if (!definitions.data || definitions.data.length === 0) return;
      await saveValuesRef.current({
        contentType,
        contentId: targetContentId,
        values: valuesRef.current,
      });
    },
    [contentType, definitions.data]
  );

  // Expose save method to parent via ref
  useImperativeHandle(ref, () => ({ save }), [save]);

  if (definitions.isLoading) {
    return (
      <div className="admin-card p-6">
        <div className="flex items-center gap-2 text-(--text-muted)">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span className="text-sm">{__('Loading custom fields...')}</span>
        </div>
      </div>
    );
  }

  if (!definitions.data || definitions.data.length === 0) {
    return null;
  }

  return (
    <div className="admin-card p-6">
      <h3 className="admin-h2">{__('Custom Fields')}</h3>
      <div className="mt-4 space-y-4">
        {definitions.data.map((def) => {
          const slug = def.slug;
          const fieldValue = values[slug];
          const opts = def.options as Record<string, unknown> | null;

          return (
            <div key={def.id}>
              <label className="block text-sm font-medium text-(--text-secondary)">
                {def.name}
              </label>
              {renderInput(def.fieldType, fieldValue, opts, slug, handleFieldChange, __)}
            </div>
          );
        })}
      </div>

      {saveValues.isPending && (
        <div className="mt-3 flex items-center gap-2 text-xs text-(--text-muted)">
          <Loader2 className="h-3 w-3 animate-spin" />
          {__('Saving custom fields...')}
        </div>
      )}
    </div>
  );
});

const INPUT_CLASS =
  'mt-1 block w-full rounded-md border border-(--border-primary) px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500';

function renderInput(
  fieldType: string,
  value: unknown,
  options: Record<string, unknown> | null,
  slug: string,
  onChange: (slug: string, value: unknown) => void,
  __: (key: string) => string
) {
  switch (fieldType) {
    case 'text':
      return (
        <input
          type="text"
          value={(value as string) ?? ''}
          onChange={(e) => onChange(slug, e.target.value)}
          className={INPUT_CLASS}
        />
      );

    case 'textarea':
      return (
        <textarea
          value={(value as string) ?? ''}
          onChange={(e) => onChange(slug, e.target.value)}
          rows={3}
          className={INPUT_CLASS}
        />
      );

    case 'number':
      return (
        <input
          type="number"
          value={(value as number) ?? ''}
          onChange={(e) =>
            onChange(slug, e.target.value === '' ? null : Number(e.target.value))
          }
          className={INPUT_CLASS + ' w-48'}
        />
      );

    case 'boolean':
      return (
        <label className="mt-1 flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={!!value}
            onChange={(e) => onChange(slug, e.target.checked)}
            className="rounded border-(--border-primary)"
          />
          {__('Enabled')}
        </label>
      );

    case 'select': {
      const choices = (options?.choices as string[]) ?? [];
      return (
        <select
          value={(value as string) ?? ''}
          onChange={(e) => onChange(slug, e.target.value || null)}
          className={INPUT_CLASS}
        >
          <option value="">{__('-- Select --')}</option>
          {choices.map((choice) => (
            <option key={choice} value={choice}>
              {choice}
            </option>
          ))}
        </select>
      );
    }

    case 'date':
      return (
        <input
          type="date"
          value={(value as string) ?? ''}
          onChange={(e) => onChange(slug, e.target.value || null)}
          className={INPUT_CLASS + ' w-48'}
        />
      );

    case 'url':
      return (
        <input
          type="url"
          value={(value as string) ?? ''}
          onChange={(e) => onChange(slug, e.target.value)}
          className={INPUT_CLASS}
          placeholder="https://"
        />
      );

    case 'color':
      return (
        <div className="mt-1 flex items-center gap-2">
          <input
            type="color"
            value={(value as string) || '#000000'}
            onChange={(e) => onChange(slug, e.target.value)}
            className="h-9 w-12 cursor-pointer rounded border border-(--border-primary)"
          />
          <input
            type="text"
            value={(value as string) ?? ''}
            onChange={(e) => onChange(slug, e.target.value)}
            className={INPUT_CLASS + ' w-32'}
            placeholder="#000000"
          />
        </div>
      );

    default:
      return (
        <input
          type="text"
          value={(value as string) ?? ''}
          onChange={(e) => onChange(slug, e.target.value)}
          className={INPUT_CLASS}
        />
      );
  }
}
